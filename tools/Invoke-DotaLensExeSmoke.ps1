[CmdletBinding()]
param(
    [string]$Installer = (Join-Path (Split-Path -Parent $PSScriptRoot) 'release\Dota-Lens-Setup-0.4.5-x64.exe'),
    [string]$SmokeRoot = (Join-Path $PSScriptRoot 'runtime\exe-smoke-0.4.5'),
    [string]$FixtureData = (Join-Path $PSScriptRoot 'runtime\dota-lens-data'),
    [long]$MatchId = 8894766243,
    [long]$AccountId = 137129583,
    [int]$StartupTimeoutSeconds = 45,
    [int]$ParseTimeoutSeconds = 180,
    [switch]$RestoreDevelopmentParser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'This script requires PowerShell 7 or newer.'
}

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runtime'))
$installerPath = [IO.Path]::GetFullPath($Installer)
$smokePath = [IO.Path]::GetFullPath($SmokeRoot)
$fixturePath = [IO.Path]::GetFullPath($FixtureData)
$installPath = Join-Path $smokePath 'install'
$appDataPath = Join-Path $smokePath 'appdata'
$localAppDataPath = Join-Path $smokePath 'localappdata'
$userDataPath = Join-Path $smokePath 'user-data'
$parserDataPath = Join-Path $smokePath 'parser-data'
$reportPath = Join-Path $smokePath 'smoke-report.json'
$apiBase = 'http://127.0.0.1:5600/api'

$runtimePrefix = $runtimeRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $smokePath.StartsWith($runtimePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "SmokeRoot must stay inside $runtimeRoot"
}
if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
    throw "Installer was not found at $installerPath"
}

$results = [ordered]@{
    schema = 'dota-lens-exe-smoke/1.0'
    version = '0.4.5'
    started_at = [DateTimeOffset]::Now.ToString('o')
    completed_at = $null
    status = 'running'
    installer = [ordered]@{
        path = $installerPath
        bytes = (Get-Item -LiteralPath $installerPath).Length
        sha256 = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash
    }
    fixture = [ordered]@{
        match_id = $MatchId
        account_id = $AccountId
        file_name = $null
    }
    checks = [ordered]@{}
    parser = $null
    canceled_job = $null
    completed_job = $null
    subject = $null
    patch_resolution = $null
    restart = $null
    error = $null
}

function Add-SmokeCheck {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][bool]$Passed,
        [Parameter(Mandatory)][string]$Detail
    )
    $results.checks[$Name] = [ordered]@{
        passed = $Passed
        detail = $Detail
    }
    if (-not $Passed) {
        throw "Smoke check failed: $Name - $Detail"
    }
}

function Get-ParserStatus {
    try {
        return Invoke-RestMethod -Uri "$apiBase/status" -TimeoutSec 2
    } catch {
        return $null
    }
}

function Wait-ParserStatus {
    param(
        [Parameter(Mandatory)][bool]$Online,
        [int]$TimeoutSeconds = 30
    )
    $deadline = [DateTimeOffset]::Now.AddSeconds($TimeoutSeconds)
    do {
        $status = Get-ParserStatus
        if ($Online -and $status -and $status.status -eq 'ready') {
            return $status
        }
        if (-not $Online -and -not $status) {
            return $null
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::Now -lt $deadline)
    throw "Parser online=$Online was not observed within $TimeoutSeconds seconds"
}

function Invoke-JsonPost {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][hashtable]$Body
    )
    return Invoke-RestMethod -Method Post -Uri $Uri -ContentType 'application/json' `
        -Body ($Body | ConvertTo-Json -Compress) -TimeoutSec 20
}

function Wait-JobTerminal {
    param(
        [Parameter(Mandatory)][string]$JobId,
        [int]$TimeoutSeconds = 180
    )
    $deadline = [DateTimeOffset]::Now.AddSeconds($TimeoutSeconds)
    do {
        $job = Invoke-RestMethod -Uri "$apiBase/jobs/$JobId" -TimeoutSec 5
        if ($job.status -in @('completed', 'failed', 'canceled')) {
            return $job
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::Now -lt $deadline)
    throw "Job $JobId did not finish within $TimeoutSeconds seconds"
}

function Wait-JobStage {
    param(
        [Parameter(Mandatory)][string]$JobId,
        [Parameter(Mandatory)][string[]]$Stages,
        [int]$TimeoutSeconds = 45
    )
    $deadline = [DateTimeOffset]::Now.AddSeconds($TimeoutSeconds)
    do {
        $job = Invoke-RestMethod -Uri "$apiBase/jobs/$JobId" -TimeoutSec 5
        if ($job.stage -in $Stages -or $job.status -in @('completed', 'failed', 'canceled')) {
            return $job
        }
        Start-Sleep -Milliseconds 100
    } while ([DateTimeOffset]::Now -lt $deadline)
    throw "Job $JobId did not enter $($Stages -join ', ') within $TimeoutSeconds seconds"
}

function Stop-ParserIfIdle {
    $status = Get-ParserStatus
    if (-not $status) {
        return
    }
    if ([int]$status.active_jobs -ne 0) {
        throw "Parser PID $($status.pid) has active jobs and cannot be stopped for isolated smoke testing"
    }
    Invoke-RestMethod -Method Post -Uri "$apiBase/shutdown" -TimeoutSec 5 | Out-Null
    Wait-ParserStatus -Online $false -TimeoutSeconds 15 | Out-Null
}

function Start-IsolatedApp {
    param([Parameter(Mandatory)][string]$Executable)
    $previousAppData = $env:APPDATA
    $previousLocalAppData = $env:LOCALAPPDATA
    $previousUserData = $env:DOTA_LENS_USER_DATA_DIR
    $previousParserData = $env:DOTA_LENS_DATA_DIR
    try {
        $env:APPDATA = $appDataPath
        $env:LOCALAPPDATA = $localAppDataPath
        $env:DOTA_LENS_USER_DATA_DIR = $userDataPath
        $env:DOTA_LENS_DATA_DIR = $parserDataPath
        return Start-Process -FilePath $Executable -PassThru -WindowStyle Hidden
    } finally {
        $env:APPDATA = $previousAppData
        $env:LOCALAPPDATA = $previousLocalAppData
        $env:DOTA_LENS_USER_DATA_DIR = $previousUserData
        $env:DOTA_LENS_DATA_DIR = $previousParserData
    }
}

function Stop-AppProcess {
    param([System.Diagnostics.Process]$Process)
    if (-not $Process) {
        return
    }
    try {
        $Process.Refresh()
        if (-not $Process.HasExited) {
            $closed = $Process.CloseMainWindow()
            if ($closed) {
                $null = $Process.WaitForExit(15000)
            }
        }
    } catch {
        # A process may exit while its state is being refreshed.
    }
    try {
        $Process.Refresh()
        if (-not $Process.HasExited) {
            Stop-Process -Id $Process.Id -Force
            $null = $Process.WaitForExit(10000)
        }
    } catch {
        # The process has already exited.
    }
}

function Start-DevelopmentParser {
    $java = Join-Path $PSScriptRoot 'runtime\jdk-21\bin\java.exe'
    $jar = Join-Path $PSScriptRoot 'replay-parser\target\stats-0.1.0.jar'
    $data = Join-Path $PSScriptRoot 'runtime\dota-lens-data'
    $logs = Join-Path $data 'logs'
    if (-not (Test-Path -LiteralPath $java -PathType Leaf) -or
        -not (Test-Path -LiteralPath $jar -PathType Leaf)) {
        return
    }
    New-Item -ItemType Directory -Force -Path $logs | Out-Null
    $previousDataDirectory = $env:DOTA_LENS_DATA_DIR
    try {
        $env:DOTA_LENS_DATA_DIR = $data
        Start-Process -FilePath $java `
            -ArgumentList @('-Djava.net.preferIPv4Stack=true', '-Xmx2g', '-jar', $jar) `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $logs 'parser.stdout.log') `
            -RedirectStandardError (Join-Path $logs 'parser.stderr.log') | Out-Null
    } finally {
        $env:DOTA_LENS_DATA_DIR = $previousDataDirectory
    }
    Wait-ParserStatus -Online $true -TimeoutSeconds 30 | Out-Null
}

$appProcess = $null
$restartProcess = $null
$uninstaller = $null

try {
    Stop-ParserIfIdle

    $existingUninstaller = Join-Path $installPath 'Uninstall Dota Lens.exe'
    if (Test-Path -LiteralPath $existingUninstaller -PathType Leaf) {
        Start-Process -FilePath $existingUninstaller -ArgumentList @('/S') -Wait | Out-Null
    }
    if (Test-Path -LiteralPath $smokePath) {
        Remove-Item -LiteralPath $smokePath -Recurse -Force
    }
    New-Item -ItemType Directory -Force `
        -Path $smokePath, $appDataPath, $localAppDataPath, $userDataPath, $parserDataPath | Out-Null

    $installerProcess = Start-Process -FilePath $installerPath `
        -ArgumentList @('/S', "/D=$installPath") -PassThru -Wait
    Add-SmokeCheck 'installer_exit' ($installerProcess.ExitCode -eq 0) "exit=$($installerProcess.ExitCode)"

    $appExecutable = Join-Path $installPath 'Dota Lens.exe'
    $bundledJava = Join-Path $installPath 'resources\jre\bin\java.exe'
    $bundledParser = Join-Path $installPath 'resources\parser\stats-0.1.0.jar'
    $uninstaller = Join-Path $installPath 'Uninstall Dota Lens.exe'
    Add-SmokeCheck 'installed_executable' (Test-Path -LiteralPath $appExecutable -PathType Leaf) $appExecutable
    Add-SmokeCheck 'bundled_jre' (Test-Path -LiteralPath $bundledJava -PathType Leaf) $bundledJava
    Add-SmokeCheck 'bundled_parser' (Test-Path -LiteralPath $bundledParser -PathType Leaf) $bundledParser
    Add-SmokeCheck 'uninstaller' (Test-Path -LiteralPath $uninstaller -PathType Leaf) $uninstaller

    $appProcess = Start-IsolatedApp -Executable $appExecutable
    $status = Wait-ParserStatus -Online $true -TimeoutSeconds $StartupTimeoutSeconds
    $results.parser = $status
    Add-SmokeCheck 'app_process_alive' (-not $appProcess.HasExited) "pid=$($appProcess.Id)"
    Add-SmokeCheck 'parser_api_version' ($status.version -eq '1.6.0') "version=$($status.version)"
    Add-SmokeCheck 'bundled_java_runtime' ([string]$status.java_version -like '21*') "java=$($status.java_version)"

    $parserData = [IO.Path]::GetFullPath([string]$status.data_directory)
    $expectedParserData = [IO.Path]::GetFullPath($parserDataPath)
    Add-SmokeCheck 'isolated_app_data' `
        ($parserData.Equals($expectedParserData, [StringComparison]::OrdinalIgnoreCase)) $parserData

    $fixtureReplay = @(
        (Join-Path $fixturePath "replays\$MatchId.dem"),
        (Join-Path $fixturePath "replays\$MatchId.dem.bz2")
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    Add-SmokeCheck 'fixture_replay' ($null -ne $fixtureReplay) `
        "match=$MatchId formats=.dem,.dem.bz2"
    $fixtureFileName = (Get-Item -LiteralPath $fixtureReplay).Name
    $results.fixture.file_name = $fixtureFileName

    $importHeaders = @{
        'X-Dota-Lens-File-Name' = $fixtureFileName
        'X-Dota-Lens-Account-Id' = [string]$AccountId
    }
    $cancelStart = Invoke-RestMethod -Method Post -Uri "$apiBase/replays/$MatchId/import" `
        -Headers $importHeaders -ContentType 'application/octet-stream' -InFile $fixtureReplay -TimeoutSec 600
    Add-SmokeCheck 'participant_replay_import' ($cancelStart.imported_replay -eq $true) `
        "job=$($cancelStart.id) status=$($cancelStart.status)"
    $importedReplay = Join-Path $parserData "replays\$fixtureFileName"
    Add-SmokeCheck 'participant_replay_cached' `
        ((Test-Path -LiteralPath $importedReplay -PathType Leaf) -and
            (Get-Item -LiteralPath $importedReplay).Length -eq (Get-Item -LiteralPath $fixtureReplay).Length) `
        $importedReplay
    $cancelReady = Wait-JobStage -JobId $cancelStart.id -Stages @('parsing', 'summarizing')
    Add-SmokeCheck 'cancel_reached_work' ($cancelReady.status -notin @('completed', 'failed')) `
        "status=$($cancelReady.status) stage=$($cancelReady.stage)"
    Invoke-RestMethod -Method Delete -Uri "$apiBase/jobs/$($cancelStart.id)" -TimeoutSec 10 | Out-Null
    $canceled = Wait-JobTerminal -JobId $cancelStart.id -TimeoutSeconds 30
    $results.canceled_job = $canceled
    Add-SmokeCheck 'cancel_job' ($canceled.status -eq 'canceled') `
        "status=$($canceled.status) stage=$($canceled.stage)"
    $partialFiles = @(Get-ChildItem -LiteralPath $parserData -Recurse -File -Filter '*.part' -ErrorAction SilentlyContinue)
    Add-SmokeCheck 'cancel_cleanup' ($partialFiles.Count -eq 0) "partial_files=$($partialFiles.Count)"

    $parseStartedAt = [DateTimeOffset]::Now
    $parseStart = Invoke-JsonPost -Uri "$apiBase/matches/$MatchId/parse" `
        -Body @{ account_id = $AccountId; force = $true }
    $completed = Wait-JobTerminal -JobId $parseStart.id -TimeoutSeconds $ParseTimeoutSeconds
    $results.completed_job = $completed
    $parseElapsed = [DateTimeOffset]::Now - $parseStartedAt
    Add-SmokeCheck 'complete_parse' ($completed.status -eq 'completed') `
        "status=$($completed.status) elapsed_ms=$([math]::Round($parseElapsed.TotalMilliseconds))"
    Add-SmokeCheck 'event_count' ([long]$completed.result.event_count -gt 100000) `
        "events=$($completed.result.event_count)"
    $analysis = Invoke-RestMethod -Uri "$apiBase/matches/$MatchId/analysis" -TimeoutSec 30
    Add-SmokeCheck 'analysis_readable' ($analysis.complete -eq $true) `
        "schema=$($analysis.schema) events=$($analysis.valid_json_objects)"
    $subject = $analysis.match.subject
    Add-SmokeCheck 'subject_auto_matched' `
        ($subject.status -eq 'matched' -and [long]$subject.selected_account_id -eq $AccountId) `
        "status=$($subject.status) account=$($subject.selected_account_id) slot=$($subject.selected_player_slot)"
    $patchResolution = $analysis.match.patch_resolution
    $patchStatuses = @('exact', 'inferred', 'ambiguous', 'unknown')
    $patchGateNames = @($patchResolution.gates.PSObject.Properties.Name)
    Add-SmokeCheck 'patch_resolution_present' `
        ($null -ne $patchResolution -and $patchResolution.status -in $patchStatuses -and
            $patchGateNames -contains 'map_profile' -and
            $patchGateNames -contains 'ability_metadata' -and
            $patchGateNames -contains 'negative_scoring') `
        "status=$($patchResolution.status) patch=$($patchResolution.patch_name)"

    $selectedSlot = [int]$subject.selected_player_slot
    $alternatePlayer = @($analysis.match.players | Where-Object {
            [int]$_.player_slot -ne $selectedSlot
        } | Select-Object -First 1)
    Add-SmokeCheck 'alternate_subject_available' ($alternatePlayer.Count -eq 1) `
        "selected_slot=$selectedSlot"
    $manualSubject = Invoke-RestMethod -Method Put -Uri "$apiBase/matches/$MatchId/subject" `
        -ContentType 'application/json' `
        -Body (@{ player_slot = [int]$alternatePlayer[0].player_slot } | ConvertTo-Json -Compress) `
        -TimeoutSec 20
    Add-SmokeCheck 'subject_manual_selected' `
        ($manualSubject.status -eq 'manual_selected' -and
            [int]$manualSubject.selected_player_slot -eq [int]$alternatePlayer[0].player_slot) `
        "status=$($manualSubject.status) slot=$($manualSubject.selected_player_slot)"
    $results.subject = $manualSubject
    $results.patch_resolution = $patchResolution

    Stop-ParserIfIdle
    Stop-AppProcess -Process $appProcess
    $appProcess = $null

    $restartProcess = Start-IsolatedApp -Executable $appExecutable
    $restartStatus = Wait-ParserStatus -Online $true -TimeoutSeconds $StartupTimeoutSeconds
    $restartAnalysis = Invoke-RestMethod -Uri "$apiBase/matches/$MatchId/analysis" -TimeoutSec 30
    $results.restart = [ordered]@{
        parser_pid = $restartStatus.pid
        data_directory = $restartStatus.data_directory
        analysis_complete = $restartAnalysis.complete
        event_count = $restartAnalysis.valid_json_objects
        subject_status = $restartAnalysis.match.subject.status
        selected_player_slot = $restartAnalysis.match.subject.selected_player_slot
    }
    Add-SmokeCheck 'cold_restart' ($restartAnalysis.complete -eq $true) `
        "pid=$($restartStatus.pid) events=$($restartAnalysis.valid_json_objects)"
    Add-SmokeCheck 'subject_selection_persisted' `
        ($restartAnalysis.match.subject.status -eq 'manual_selected' -and
            [int]$restartAnalysis.match.subject.selected_player_slot -eq
                [int]$manualSubject.selected_player_slot) `
        "status=$($restartAnalysis.match.subject.status) slot=$($restartAnalysis.match.subject.selected_player_slot)"

    Stop-ParserIfIdle
    Stop-AppProcess -Process $restartProcess
    $restartProcess = $null

    $uninstallProcess = Start-Process -FilePath $uninstaller -ArgumentList @('/S') -PassThru -Wait
    Add-SmokeCheck 'uninstaller_exit' ($uninstallProcess.ExitCode -eq 0) "exit=$($uninstallProcess.ExitCode)"
    Start-Sleep -Milliseconds 750
    Add-SmokeCheck 'application_removed' (-not (Test-Path -LiteralPath $appExecutable -PathType Leaf)) $appExecutable

    $results.status = 'passed'
} catch {
    $results.status = 'failed'
    $results.error = $_.Exception.Message
    throw
} finally {
    try {
        Stop-ParserIfIdle
    } catch {
        if (-not $results.error) {
            $results.error = "Cleanup: $($_.Exception.Message)"
        }
    }
    Stop-AppProcess -Process $appProcess
    Stop-AppProcess -Process $restartProcess
    if ($RestoreDevelopmentParser) {
        try {
            Start-DevelopmentParser
        } catch {
            if (-not $results.error) {
                $results.error = "Development parser restore: $($_.Exception.Message)"
            }
        }
    }
    $results.completed_at = [DateTimeOffset]::Now.ToString('o')
    New-Item -ItemType Directory -Force -Path $smokePath | Out-Null
    $results | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $reportPath -Encoding utf8
    Write-Host "Smoke report: $reportPath"
}
