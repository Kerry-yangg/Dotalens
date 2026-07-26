[CmdletBinding()]
param(
    [string]$ReplayPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'release\8894766243.dem'),
    [long]$AccountId = 139766850,
    [int]$TimeoutSeconds = 900,
    [string]$OutputPath = '',
    [switch]$KeepParser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'This script requires PowerShell 7 or newer.'
}

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$replay = [IO.Path]::GetFullPath($ReplayPath)
$java = Join-Path $PSScriptRoot 'runtime\jdk-21\bin\java.exe'
$jar = Join-Path $PSScriptRoot 'replay-parser\target\stats-0.1.0.jar'
$dataDirectory = Join-Path $PSScriptRoot 'runtime\dota-lens-data'
$logs = Join-Path $dataDirectory 'logs'
$apiBase = 'http://127.0.0.1:5600/api'
$ownsParser = $false
$parserProcess = $null

if (-not (Test-Path -LiteralPath $replay -PathType Leaf)) {
    throw "Replay was not found at $replay"
}
if (-not (Test-Path -LiteralPath $java -PathType Leaf)) {
    throw "Java 21 runtime was not found at $java"
}
if (-not (Test-Path -LiteralPath $jar -PathType Leaf)) {
    throw "Parser JAR was not found at $jar"
}

$matchIdText = [IO.Path]::GetFileName($replay).Split('.')[0]
if ($matchIdText -notmatch '^\d+$') {
    throw 'Replay file name must begin with its numeric match ID.'
}
$matchId = [long]$matchIdText
if (-not $OutputPath) {
    $OutputPath = Join-Path $dataDirectory "combat-timing-regression-$matchId.json"
}
$output = [IO.Path]::GetFullPath($OutputPath)

function Get-ParserStatus {
    try {
        return Invoke-RestMethod -Uri "$apiBase/status" -TimeoutSec 2
    } catch {
        return $null
    }
}

function Wait-ParserReady {
    $deadline = [DateTimeOffset]::Now.AddSeconds(30)
    do {
        $status = Get-ParserStatus
        if ($status -and $status.status -eq 'ready') {
            return $status
        }
        if ($parserProcess -and $parserProcess.HasExited) {
            throw "Parser exited with code $($parserProcess.ExitCode). Check $logs\regression-parser.stderr.log"
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::Now -lt $deadline)
    throw 'Parser did not become ready within 30 seconds.'
}

function Test-JumpTarget {
    param([object]$Target)
    if (-not $Target) { return $false }
    $rangeValid = $null -ne $Target.range_start -and $null -ne $Target.range_end `
        -and [double]$Target.range_end -ge [double]$Target.range_start
    $entityValid = -not [string]::IsNullOrWhiteSpace([string]$Target.entity_type) `
        -and -not [string]::IsNullOrWhiteSpace([string]$Target.entity_id)
    $map = $Target.map_focus
    $locationValid = $map -and (
        $map.coordinate_valid -eq $true `
        -or (-not [string]::IsNullOrWhiteSpace([string]$map.region) -and [string]$map.region -ne 'unknown')
    )
    return $rangeValid -and $entityValid -and $locationValid
}

function Get-OptionalProperty {
    param(
        [object]$InputObject,
        [Parameter(Mandatory)][string]$Name
    )
    if (-not $InputObject) { return $null }
    $property = $InputObject.PSObject.Properties[$Name]
    if ($property) {
        return $property.Value
    }
    return $null
}

try {
    New-Item -ItemType Directory -Force -Path $dataDirectory, $logs | Out-Null
    $status = Get-ParserStatus
    if ($status -and [int]$status.active_jobs -gt 0) {
        throw "Parser already has $($status.active_jobs) active job(s)."
    }
    if (-not $status) {
        $previousDataDirectory = $env:DOTA_LENS_DATA_DIR
        $previousPython = $env:DOTA_LENS_PYTHON
        try {
            $env:DOTA_LENS_DATA_DIR = $dataDirectory
            $python = Get-Command python -ErrorAction SilentlyContinue
            $env:DOTA_LENS_PYTHON = if ($python) { $python.Source } else { $null }
            $parserProcess = Start-Process -FilePath $java `
                -ArgumentList @('-Xmx2g', '-jar', $jar) `
                -PassThru `
                -WindowStyle Hidden `
                -RedirectStandardOutput (Join-Path $logs 'regression-parser.stdout.log') `
                -RedirectStandardError (Join-Path $logs 'regression-parser.stderr.log')
            $ownsParser = $true
        } finally {
            $env:DOTA_LENS_DATA_DIR = $previousDataDirectory
            $env:DOTA_LENS_PYTHON = $previousPython
        }
        $status = Wait-ParserReady
    }

    $headers = @{
        'X-Dota-Lens-File-Name' = [IO.Path]::GetFileName($replay)
        'X-Dota-Lens-Account-Id' = [string]$AccountId
    }
    $job = Invoke-RestMethod `
        -Method Post `
        -Uri "$apiBase/replays/$matchId/import" `
        -InFile $replay `
        -ContentType 'application/octet-stream' `
        -Headers $headers `
        -TimeoutSec 180

    $deadline = [DateTimeOffset]::Now.AddSeconds($TimeoutSeconds)
    do {
        $job = Invoke-RestMethod -Uri "$apiBase/jobs/$($job.id)" -TimeoutSec 5
        if ($job.status -in @('completed', 'failed', 'canceled')) {
            break
        }
        Start-Sleep -Seconds 1
    } while ([DateTimeOffset]::Now -lt $deadline)
    if ($job.status -ne 'completed') {
        throw "Replay job ended as '$($job.status)': $($job.error)"
    }

    $analysis = Invoke-RestMethod -Uri "$apiBase/matches/$matchId/analysis" -TimeoutSec 30
    $players = Invoke-RestMethod -Uri "$apiBase/matches/$matchId/analysis/modules/players" -TimeoutSec 60
    $playerRows = @($players.by_slot.PSObject.Properties | Sort-Object { [int]$_.Name })
    $slotSummaries = @()
    $totalFacts = 0
    $totalPatterns = 0
    $ordinaryPatterns = 0
    $suppressedFacts = 0
    $remoteBeforeArrivalFacts = 0
    $invalidOccurrenceTargets = 0

    foreach ($property in $playerRows) {
        $slot = [int]$property.Name
        $report = $property.Value.report
        $timing = $report.combat_timing
        $facts = @($timing.fight_facts)
        $patterns = @($timing.patterns)
        $ordinary = @($patterns | Where-Object { $_.ordinary_eligible -eq $true })
        $suppressed = @($facts | Where-Object { @($_.suppressed_reasons).Count -gt 0 })
        $remoteBeforeArrival = @($facts | Where-Object {
            $firstAction = Get-OptionalProperty $_ 'first_combat_action_time'
            $arrival = Get-OptionalProperty $_ 'player_spatial_arrival_time'
            $arrivalDelta = Get-OptionalProperty $_ 'arrival_delta_seconds'
            $null -ne $firstAction `
                -and $null -ne $arrival `
                -and $null -ne $arrivalDelta `
                -and [double]$firstAction -lt [double]$arrival `
                -and [double]$arrivalDelta -gt 0
        })
        $occurrences = @($ordinary | ForEach-Object { @($_.occurrences) })
        $invalidTargets = @($occurrences | Where-Object { -not (Test-JumpTarget $_.jump_target) })

        $totalFacts += $facts.Count
        $totalPatterns += $patterns.Count
        $ordinaryPatterns += $ordinary.Count
        $suppressedFacts += $suppressed.Count
        $remoteBeforeArrivalFacts += $remoteBeforeArrival.Count
        $invalidOccurrenceTargets += $invalidTargets.Count
        $slotSummaries += [ordered]@{
            slot = $slot
            position = [int]$report.position
            role_confidence = [int]$report.role_confidence
            timing_facts = $facts.Count
            patterns = $patterns.Count
            ordinary_patterns = $ordinary.Count
            suppressed_facts = $suppressed.Count
            remote_action_before_arrival = $remoteBeforeArrival.Count
            ordinary_pattern_types = @($ordinary | ForEach-Object { [string]$_.pattern_type })
        }
    }

    $analysisVersion = [string](Get-OptionalProperty $analysis 'analysis_version')
    if ([string]::IsNullOrWhiteSpace($analysisVersion)) {
        $analysisVersion = [string](Get-OptionalProperty $analysis 'schema')
    }

    $result = [ordered]@{
        schema = 'dota-lens-combat-timing-regression/1.0'
        generated_at = [DateTimeOffset]::Now.ToString('o')
        match_id = $matchId
        account_id = $AccountId
        parser_version = [string]$status.version
        job_id = [string]$job.id
        elapsed_ms = [long](Get-OptionalProperty $job 'elapsed_ms')
        player_reports = $playerRows.Count
        timing_facts = $totalFacts
        patterns = $totalPatterns
        ordinary_patterns = $ordinaryPatterns
        suppressed_facts = $suppressedFacts
        remote_action_before_arrival = $remoteBeforeArrivalFacts
        invalid_occurrence_targets = $invalidOccurrenceTargets
        analysis_version = $analysisVersion
        slots = $slotSummaries
    }
    $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $output -Encoding utf8
    $result | ConvertTo-Json -Depth 8
} finally {
    if ($ownsParser -and -not $KeepParser) {
        try {
            Invoke-RestMethod -Method Post -Uri "$apiBase/shutdown" -TimeoutSec 5 | Out-Null
        } catch {
            if ($parserProcess -and -not $parserProcess.HasExited) {
                Stop-Process -Id $parserProcess.Id -Force
            }
        }
        if ($parserProcess) {
            $parserProcess.WaitForExit(5000) | Out-Null
        }
    }
}
