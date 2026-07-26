[CmdletBinding()]
param(
    [ValidateSet('ValidateExisting', 'ReparseChanged', 'ReparseAll')]
    [string]$Mode = 'ValidateExisting',

    [string]$ManifestPath = (
        Join-Path (Split-Path -Parent $PSScriptRoot) `
            'tests\player-report-regression\manifest.json'
    ),

    [int]$TimeoutSeconds = 1200,

    [switch]$KeepParser,

    [switch]$IncludeCandidates
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'This script requires PowerShell 7 or newer.'
}

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$runtimeRoot = Join-Path $projectRoot 'tools\runtime\player-report-regression'
$checkpointDirectory = Join-Path $runtimeRoot 'checkpoints'
$runsDirectory = Join-Path $runtimeRoot 'runs'
$apiBase = 'http://127.0.0.1:5600/api'
$parserDataDirectory = Join-Path $projectRoot 'tools\runtime\dota-lens-data'
$java = Join-Path $PSScriptRoot 'runtime\jdk-21\bin\java.exe'
$jar = Join-Path $PSScriptRoot 'replay-parser\target\stats-0.1.0.jar'
$baseComponentModel = 'player-report-base-components/1.0'
$parserProcess = $null
$ownsParser = $false
$parserStatus = $null
$parserStartupError = $null

function Get-RelativeProjectPath {
    param([Parameter(Mandatory)][string]$Path)

    $relative = [IO.Path]::GetRelativePath($projectRoot, $Path)
    if ($relative -eq '..' -or $relative.StartsWith("..$([IO.Path]::DirectorySeparatorChar)")) {
        throw 'Path escapes the project root.'
    }
    return $relative.Replace('\', '/')
}

function Resolve-ManifestReplayPath {
    param([Parameter(Mandatory)][string]$ReplayPath)

    if ([IO.Path]::IsPathRooted($ReplayPath)) {
        throw 'Manifest replay paths must be project-relative.'
    }

    $candidate = [IO.Path]::GetFullPath((Join-Path $projectRoot $ReplayPath))
    $relative = Get-RelativeProjectPath -Path $candidate
    $paths = @($candidate)
    if ($candidate.EndsWith('.dem.bz2', [StringComparison]::OrdinalIgnoreCase)) {
        $paths += $candidate.Substring(0, $candidate.Length - 4)
    } elseif ($candidate.EndsWith('.dem', [StringComparison]::OrdinalIgnoreCase)) {
        $paths += "$candidate.bz2"
    }

    foreach ($path in $paths) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            return [pscustomobject]@{
                absolute_path = $path
                relative_path = Get-RelativeProjectPath -Path $path
            }
        }
    }

    throw "Replay was not found: $relative"
}

function Read-JsonFile {
    param([Parameter(Mandatory)][string]$Path)
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Write-AtomicJson {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][object]$Value
    )

    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $temporaryPath = Join-Path $directory ".$(Split-Path -Leaf $Path).$([guid]::NewGuid().ToString('N')).tmp"
    try {
        $Value | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $temporaryPath -Encoding utf8
        Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
}

function Get-ParserStatus {
    try {
        return Invoke-RestMethod -Uri "$apiBase/status" -TimeoutSec 2
    } catch {
        return $null
    }
}

function Ensure-ParserReady {
    if ($parserStartupError) {
        throw $parserStartupError
    }
    if ($parserStatus -and $parserStatus.status -eq 'ready') {
        return $parserStatus
    }

    $existing = Get-ParserStatus
    if ($existing) {
        if ($existing.status -ne 'ready') {
            throw "Parser status is '$($existing.status)', not ready."
        }
        if ([int]$existing.active_jobs -ne 0) {
            throw "Parser already has $($existing.active_jobs) active job(s)."
        }
        $script:parserStatus = $existing
        return $existing
    }

    if (-not (Test-Path -LiteralPath $java -PathType Leaf)) {
        $script:parserStartupError = "Java 21 runtime was not found at $(Get-RelativeProjectPath -Path $java)"
        throw $script:parserStartupError
    }
    if (-not (Test-Path -LiteralPath $jar -PathType Leaf)) {
        $script:parserStartupError = "Parser JAR was not found at $(Get-RelativeProjectPath -Path $jar)"
        throw $script:parserStartupError
    }

    $parserLogs = Join-Path $runtimeRoot 'parser'
    New-Item -ItemType Directory -Force -Path $parserLogs | Out-Null
    $previousDataDirectory = $env:DOTA_LENS_DATA_DIR
    $previousPython = $env:DOTA_LENS_PYTHON
    try {
        $env:DOTA_LENS_DATA_DIR = $parserDataDirectory
        $python = Get-Command python -ErrorAction SilentlyContinue
        $env:DOTA_LENS_PYTHON = if ($python) { $python.Source } else { $null }
        $script:parserProcess = Start-Process -FilePath $java `
            -ArgumentList @('-Xmx2g', '-jar', $jar) `
            -PassThru `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $parserLogs 'parser.stdout.log') `
            -RedirectStandardError (Join-Path $parserLogs 'parser.stderr.log')
        $script:ownsParser = $true
    } finally {
        $env:DOTA_LENS_DATA_DIR = $previousDataDirectory
        $env:DOTA_LENS_PYTHON = $previousPython
    }

    $deadline = [DateTimeOffset]::Now.AddSeconds(30)
    do {
        $ready = Get-ParserStatus
        if ($ready -and $ready.status -eq 'ready') {
            if ([int]$ready.active_jobs -ne 0) {
                throw "Parser already has $($ready.active_jobs) active job(s)."
            }
            $script:parserStatus = $ready
            return $ready
        }
        if ($parserProcess -and $parserProcess.HasExited) {
            $script:parserStartupError = "Parser exited with code $($parserProcess.ExitCode)."
            throw $script:parserStartupError
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::Now -lt $deadline)

    $script:parserStartupError = 'Parser did not become ready within 30 seconds.'
    throw $script:parserStartupError
}

function Test-AnalysisPackage {
    param([Parameter(Mandatory)][string]$MatchId)

    $analysisDirectory = Join-Path $parserDataDirectory "analyses\$MatchId"
    $summaryPath = Join-Path $analysisDirectory 'summary.json'
    if (-not (Test-Path -LiteralPath $summaryPath -PathType Leaf)) {
        return $false
    }
    try {
        $summary = Read-JsonFile -Path $summaryPath
        $moduleBase = [string]$summary.analysis_storage.module_base
        return -not [string]::IsNullOrWhiteSpace($moduleBase) `
            -and (Test-Path -LiteralPath (Join-Path $analysisDirectory "$moduleBase\players.json.gz") -PathType Leaf)
    } catch {
        return $false
    }
}

function Read-Checkpoint {
    param([Parameter(Mandatory)][string]$MatchId)

    $path = Join-Path $checkpointDirectory "$MatchId.json"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        return $null
    }
    try {
        return Read-JsonFile -Path $path
    } catch {
        return $null
    }
}

function Test-ReparseChanged {
    param(
        [Parameter(Mandatory)][object]$Checkpoint,
        [Parameter(Mandatory)][string]$ReplaySha256,
        [Parameter(Mandatory)][string]$ParserVersion,
        [Parameter(Mandatory)][string]$MatchId
    )

    if (-not $Checkpoint -or $Checkpoint.status -ne 'validated') { return $true }
    if ([string]$Checkpoint.replay_sha256 -ne $ReplaySha256) { return $true }
    if ([string]$Checkpoint.parser_version -ne $ParserVersion) { return $true }
    if ([string]$Checkpoint.base_component_model -ne $baseComponentModel) { return $true }
    return -not (Test-AnalysisPackage -MatchId $MatchId)
}

function Invoke-ReplayParse {
    param(
        [Parameter(Mandatory)][string]$MatchId,
        [Parameter(Mandatory)][string]$ReplayPath,
        [Parameter(Mandatory)][int]$TimeoutSeconds
    )

    $status = Ensure-ParserReady
    $headers = @{
        'X-Dota-Lens-File-Name' = [IO.Path]::GetFileName($ReplayPath)
        'X-Dota-Lens-Account-Id' = '139766850'
    }
    $job = Invoke-RestMethod `
        -Method Post `
        -Uri "$apiBase/replays/$MatchId/import" `
        -InFile $ReplayPath `
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
    $script:parserStatus = $status
}

function Invoke-Task8Validation {
    param([Parameter(Mandatory)][string]$MatchId)

    $output = & node (Join-Path $PSScriptRoot 'Validate-PlayerReportV4.mjs') $MatchId $projectRoot 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
    try {
        $validation = $text | ConvertFrom-Json
    } catch {
        throw "Task 8 validator did not return JSON (exit $exitCode)."
    }
    return [pscustomobject]@{
        result = $validation
        exit_code = $exitCode
    }
}

function ConvertTo-SafeError {
    param([Parameter(Mandatory)][object]$ErrorRecord)

    return ([string]$ErrorRecord.Exception.Message).Replace($projectRoot, '<project>')
}

function Stop-OwnedParser {
    if (-not $ownsParser -or $KeepParser) { return }
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

$manifest = Read-JsonFile -Path $ManifestPath
if ($manifest.schema -ne 'player-report-regression-manifest/1.0') {
    throw 'Unsupported player report regression manifest schema.'
}
$allMatches = @($manifest.matches)
if ($IncludeCandidates) {
    $selectedMatches = $allMatches
} else {
    $selectedMatches = @($allMatches | Where-Object { $_.matrix_enabled -eq $true })
}

New-Item -ItemType Directory -Force -Path $checkpointDirectory, $runsDirectory | Out-Null
$runDirectory = Join-Path $runsDirectory ([DateTimeOffset]::Now.ToString('yyyyMMddTHHmmssfffffffZ'))
New-Item -ItemType Directory -Force -Path $runDirectory | Out-Null
$matchResults = @()
$positionCounts = @{}

try {
    foreach ($match in $selectedMatches) {
        $matchId = [string]$match.match_id
        $checkpointPath = Join-Path $checkpointDirectory "$matchId.json"
        $result = [ordered]@{
            match_id = $matchId
            status = 'failed'
            reports_total = 0
            reports_valid = 0
            error = $null
        }
        $checkpoint = $null
        $replay = $null
        $replaySha256 = $null
        $currentParserVersion = $null

        try {
            if ($matchId -notmatch '^\d+$') {
                throw 'Manifest match_id must be numeric.'
            }
            $replay = Resolve-ManifestReplayPath -ReplayPath ([string]$match.replay_path)
            $replaySha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $replay.absolute_path).Hash.ToLowerInvariant()
            $checkpoint = Read-Checkpoint -MatchId $matchId

            $shouldReparse = $false
            if ($Mode -eq 'ReparseAll') {
                $status = Ensure-ParserReady
                $currentParserVersion = [string]$status.version
                $shouldReparse = $true
            } elseif ($Mode -eq 'ReparseChanged') {
                $status = Ensure-ParserReady
                $currentParserVersion = [string]$status.version
                $shouldReparse = Test-ReparseChanged `
                    -Checkpoint $checkpoint `
                    -ReplaySha256 $replaySha256 `
                    -ParserVersion $currentParserVersion `
                    -MatchId $matchId
            } elseif ($checkpoint) {
                $currentParserVersion = [string]$checkpoint.parser_version
            }

            if ($shouldReparse) {
                Invoke-ReplayParse `
                    -MatchId $matchId `
                    -ReplayPath $replay.absolute_path `
                    -TimeoutSeconds $TimeoutSeconds
            }

            $validation = Invoke-Task8Validation -MatchId $matchId
            $result.reports_total = [int]$validation.result.player_reports
            $result.reports_valid = [int]$validation.result.valid_reports
            if ($validation.exit_code -ne 0 -or -not $validation.result.valid) {
                $errors = @($validation.result.errors | ForEach-Object { [string]$_ })
                throw "Task 8 validation failed: $($errors -join '; ')"
            }

            foreach ($report in @($validation.result.reports)) {
                $position = [string]$report.position
                if ($position -match '^[1-5]$') {
                    if (-not $positionCounts.ContainsKey($position)) { $positionCounts[$position] = 0 }
                    $positionCounts[$position] += 1
                }
            }
            $result.status = 'validated'
        } catch {
            $result.error = ConvertTo-SafeError -ErrorRecord $_
        }

        $checkpointValue = [ordered]@{
            schema = 'player-report-regression-checkpoint/1.0'
            match_id = $matchId
            replay_path = if ($replay) { $replay.relative_path } else { $null }
            replay_sha256 = $replaySha256
            parser_version = $currentParserVersion
            base_component_model = $baseComponentModel
            status = $result.status
            reports_total = $result.reports_total
            reports_valid = $result.reports_valid
            error = $result.error
            completed_at = [DateTimeOffset]::Now.ToString('o')
        }
        Write-AtomicJson -Path $checkpointPath -Value $checkpointValue
        $matchResults += [pscustomobject]$result
    }
} finally {
    Stop-OwnedParser
}

$failures = @($matchResults | Where-Object { $_.status -ne 'validated' } | ForEach-Object {
    [ordered]@{ match_id = $_.match_id; error = $_.error }
})
$aggregate = [ordered]@{
    schema = 'player-report-regression-run/1.0'
    generated_at = [DateTimeOffset]::Now.ToString('o')
    mode = $Mode
    matches_total = $selectedMatches.Count
    matches_passed = @($matchResults | Where-Object { $_.status -eq 'validated' }).Count
    reports_total = [int](@($matchResults | Measure-Object -Property reports_total -Sum).Sum)
    reports_valid = [int](@($matchResults | Measure-Object -Property reports_valid -Sum).Sum)
    position_counts = [ordered]@{
        '1' = [int]($positionCounts['1'] ?? 0)
        '2' = [int]($positionCounts['2'] ?? 0)
        '3' = [int]($positionCounts['3'] ?? 0)
        '4' = [int]($positionCounts['4'] ?? 0)
        '5' = [int]($positionCounts['5'] ?? 0)
    }
    failures = $failures
}
$aggregateJsonPath = Join-Path $runDirectory 'aggregate.json'
$aggregateMarkdownPath = Join-Path $runDirectory 'aggregate.md'
Write-AtomicJson -Path $aggregateJsonPath -Value $aggregate
$markdown = @(
    '# Player Report Regression Run'
    ''
    "- Mode: $Mode"
    "- Matches: $($aggregate.matches_passed)/$($aggregate.matches_total)"
    "- Reports: $($aggregate.reports_valid)/$($aggregate.reports_total)"
    "- Failures: $($aggregate.failures.Count)"
)
if ($aggregate.failures.Count -gt 0) {
    $markdown += ''
    $markdown += '## Failures'
    foreach ($failure in $aggregate.failures) {
        $markdown += "- $($failure.match_id): $($failure.error)"
    }
}
$markdown -join [Environment]::NewLine | Set-Content -LiteralPath $aggregateMarkdownPath -Encoding utf8

Write-Host "Player report regression aggregate: $(Get-RelativeProjectPath -Path $aggregateJsonPath)"
if ($aggregate.failures.Count -gt 0) {
    exit 1
}
