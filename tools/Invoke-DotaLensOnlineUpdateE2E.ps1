[CmdletBinding()]
param(
    [string]$OldInstaller = (Join-Path (Split-Path -Parent $PSScriptRoot) 'release\Dota-Lens-Setup-0.4.5-x64.exe'),
    [string]$NewInstaller = (Join-Path (Split-Path -Parent $PSScriptRoot) 'release\Dota-Lens-Setup-0.5.0-x64.exe'),
    [string]$FixtureData = (Join-Path $PSScriptRoot 'runtime\dota-lens-data'),
    [string]$E2ERoot = (Join-Path $PSScriptRoot "runtime\online-update-e2e-0.5.0\$([DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmss'))"),
    [string]$NodeExecutable = 'C:\Users\44238\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe',
    [string]$NodeModules = 'C:\Users\44238\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules',
    [long]$MatchId = 8894766243,
    [long]$AccountId = 137129583,
    [int]$StartupTimeoutSeconds = 60,
    [int]$ParseTimeoutSeconds = 240,
    [int]$UpdateTimeoutSeconds = 1200,
    [switch]$RestoreDevelopmentParser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'This script requires PowerShell 7 or newer.'
}

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runtime'))
$oldInstallerPath = [IO.Path]::GetFullPath($OldInstaller)
$newInstallerPath = [IO.Path]::GetFullPath($NewInstaller)
$fixturePath = [IO.Path]::GetFullPath($FixtureData)
$e2ePath = [IO.Path]::GetFullPath($E2ERoot)
$installPath = Join-Path $e2ePath 'install'
$appDataPath = Join-Path $e2ePath 'appdata'
$localAppDataPath = Join-Path $e2ePath 'localappdata'
$userDataPath = Join-Path $e2ePath 'user-data'
$parserDataPath = Join-Path $e2ePath 'parser-data'
$screenshotsPath = Join-Path $e2ePath 'screenshots'
$uiReportPath = Join-Path $e2ePath 'update-ui-report.json'
$uiStdoutPath = Join-Path $e2ePath 'update-ui.stdout.log'
$uiStderrPath = Join-Path $e2ePath 'update-ui.stderr.log'
$reportPath = Join-Path $e2ePath 'online-update-e2e-report.json'
$markerPath = Join-Path $userDataPath 'online-update-e2e-marker.json'
$apiBase = 'http://127.0.0.1:5600/api'
$expectedOldVersion = '0.4.5'
$expectedNewVersion = '0.5.0'
$expectedParserVersion = '1.7.0'
$updaterScript = Join-Path $PSScriptRoot 'Run-DotaLensOnlineUpdateUi.cjs'

$runtimePrefix = $runtimeRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $e2ePath.StartsWith($runtimePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "E2ERoot must stay inside $runtimeRoot"
}
foreach ($requiredFile in @($oldInstallerPath, $newInstallerPath, $updaterScript)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required file was not found: $requiredFile"
    }
}
if (-not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf)) {
    throw "Node executable was not found: $NodeExecutable"
}
if (-not (Test-Path -LiteralPath (Join-Path $NodeModules 'playwright') -PathType Container)) {
    throw "Playwright module was not found under: $NodeModules"
}

$results = [ordered]@{
    schema = 'dota-lens-online-update-e2e/1.0'
    started_at = [DateTimeOffset]::Now.ToString('o')
    completed_at = $null
    status = 'running'
    versions = [ordered]@{
        before = $expectedOldVersion
        after = $expectedNewVersion
        parser_expected = $expectedParserVersion
    }
    installers = [ordered]@{
        old = [ordered]@{
            path = $oldInstallerPath
            bytes = (Get-Item -LiteralPath $oldInstallerPath).Length
            sha256 = (Get-FileHash -LiteralPath $oldInstallerPath -Algorithm SHA256).Hash
        }
        new = [ordered]@{
            path = $newInstallerPath
            bytes = (Get-Item -LiteralPath $newInstallerPath).Length
            sha256 = (Get-FileHash -LiteralPath $newInstallerPath -Algorithm SHA256).Hash
        }
    }
    paths = [ordered]@{
        root = $e2ePath
        install = $installPath
        app_data = $appDataPath
        local_app_data = $localAppDataPath
        user_data = $userDataPath
        parser_data = $parserDataPath
        ui_report = $uiReportPath
        screenshots = $screenshotsPath
    }
    fixture = [ordered]@{
        match_id = $MatchId
        account_id = $AccountId
        file_name = $null
    }
    checks = [ordered]@{}
    before = $null
    after = $null
    timings = [ordered]@{}
    update_ui = $null
    error = $null
}

function Add-E2ECheck {
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
        throw "Online update E2E check failed: $Name - $Detail"
    }
    Write-Host "[update-e2e] Passed ${Name}: $Detail"
}

function Get-NormalizedProductVersion {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }
    $value = [string](Get-Item -LiteralPath $Path).VersionInfo.ProductVersion
    if ($value -match '^(\d+\.\d+\.\d+)') {
        return $Matches[1]
    }
    return $value
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
        [int]$TimeoutSeconds = 60
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

function Stop-ParserIfIdle {
    $status = Get-ParserStatus
    if (-not $status) {
        return
    }
    if ([int]$status.active_jobs -ne 0) {
        throw "Parser PID $($status.pid) has active jobs and cannot be stopped for update testing"
    }
    Invoke-RestMethod -Method Post -Uri "$apiBase/shutdown" -TimeoutSec 5 | Out-Null
    Wait-ParserStatus -Online $false -TimeoutSeconds 20 | Out-Null
}

function Wait-ProcessWithTimeout {
    param(
        [Parameter(Mandatory)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory)][int]$TimeoutSeconds,
        [Parameter(Mandatory)][string]$Label
    )
    if (-not $Process.WaitForExit($TimeoutSeconds * 1000)) {
        try {
            Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        } catch {
            # The process may have exited while the timeout was being handled.
        }
        throw "$Label timed out after $TimeoutSeconds seconds"
    }
    return $Process.ExitCode
}

function Invoke-TestProcess {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [int]$TimeoutSeconds = 120,
        [string]$Label = 'Process',
        [hashtable]$Environment = @{},
        [string]$StandardOutputPath,
        [string]$StandardErrorPath
    )
    $parameters = @{
        FilePath = $FilePath
        ArgumentList = $ArgumentList
        PassThru = $true
        WindowStyle = 'Hidden'
    }
    if ($Environment.Count -gt 0) {
        $parameters.Environment = $Environment
    }
    if ($StandardOutputPath) {
        $parameters.RedirectStandardOutput = $StandardOutputPath
    }
    if ($StandardErrorPath) {
        $parameters.RedirectStandardError = $StandardErrorPath
    }
    $process = Start-Process @parameters
    $exitCode = Wait-ProcessWithTimeout -Process $process -TimeoutSeconds $TimeoutSeconds -Label $Label
    return [ordered]@{
        process = $process
        exit_code = $exitCode
    }
}

function Start-IsolatedApp {
    param([Parameter(Mandatory)][string]$Executable)
    return Start-Process -FilePath $Executable -PassThru -WindowStyle Hidden -Environment @{
        APPDATA = $appDataPath
        LOCALAPPDATA = $localAppDataPath
        DOTA_LENS_USER_DATA_DIR = $userDataPath
        DOTA_LENS_DATA_DIR = $parserDataPath
    }
}

function Stop-AppProcess {
    param([System.Diagnostics.Process]$Process)
    if (-not $Process) {
        return
    }
    try {
        $Process.Refresh()
        if (-not $Process.HasExited -and $Process.CloseMainWindow()) {
            $null = $Process.WaitForExit(15000)
        }
    } catch {
        # The process may exit while it is being inspected.
    }
    try {
        $Process.Refresh()
        if (-not $Process.HasExited) {
            Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
            $null = $Process.WaitForExit(10000)
        }
    } catch {
        # The process has already exited.
    }
}

function Stop-IsolatedAppProcesses {
    $installPrefix = $installPath.TrimEnd([IO.Path]::DirectorySeparatorChar) +
        [IO.Path]::DirectorySeparatorChar
    Get-Process -Name 'Dota Lens' -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $processPath = [IO.Path]::GetFullPath($_.Path)
            if ($processPath.StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase)) {
                Stop-AppProcess -Process $_
            }
        } catch {
            # Ignore processes that exit or deny their path while enumerating.
        }
    }
}

function Wait-JobTerminal {
    param(
        [Parameter(Mandatory)][string]$JobId,
        [int]$TimeoutSeconds = 240
    )
    $deadline = [DateTimeOffset]::Now.AddSeconds($TimeoutSeconds)
    $lastProgressAt = [DateTimeOffset]::MinValue
    do {
        $job = Invoke-RestMethod -Uri "$apiBase/jobs/$JobId" -TimeoutSec 5
        if ($job.status -in @('completed', 'failed', 'canceled')) {
            return $job
        }
        if (([DateTimeOffset]::Now - $lastProgressAt).TotalSeconds -ge 5) {
            Write-Host "[update-e2e] Parse job $JobId status=$($job.status) stage=$($job.stage)"
            $lastProgressAt = [DateTimeOffset]::Now
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::Now -lt $deadline)
    throw "Job $JobId did not finish within $TimeoutSeconds seconds"
}

function Wait-InstalledVersion {
    param(
        [Parameter(Mandatory)][string]$Executable,
        [Parameter(Mandatory)][string]$Version,
        [int]$TimeoutSeconds = 180
    )
    $deadline = [DateTimeOffset]::Now.AddSeconds($TimeoutSeconds)
    do {
        $observed = Get-NormalizedProductVersion -Path $Executable
        if ($observed -eq $Version) {
            return $observed
        }
        Start-Sleep -Milliseconds 500
    } while ([DateTimeOffset]::Now -lt $deadline)
    throw "Installed version $Version was not observed within $TimeoutSeconds seconds"
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
    Start-Process -FilePath $java `
        -ArgumentList @('-Djava.net.preferIPv4Stack=true', '-Xmx2g', '-jar', $jar) `
        -WindowStyle Hidden `
        -Environment @{ DOTA_LENS_DATA_DIR = $data } `
        -RedirectStandardOutput (Join-Path $logs 'parser.stdout.log') `
        -RedirectStandardError (Join-Path $logs 'parser.stderr.log') | Out-Null
    Wait-ParserStatus -Online $true -TimeoutSeconds 30 | Out-Null
}

$oldAppProcess = $null
$newAppProcess = $null
$appExecutable = Join-Path $installPath 'Dota Lens.exe'
$uninstaller = Join-Path $installPath 'Uninstall Dota Lens.exe'

try {
    Stop-ParserIfIdle

    $preflightInstall = Join-Path $runtimeRoot 'update-e2e-preflight\worktree'
    $preflightUninstaller = Join-Path $preflightInstall 'Uninstall Dota Lens.exe'
    if (Test-Path -LiteralPath $preflightUninstaller -PathType Leaf) {
        $preflightResult = Invoke-TestProcess -FilePath $preflightUninstaller `
            -ArgumentList @('/S') -TimeoutSeconds 120 -Label 'Preflight uninstall'
        Add-E2ECheck 'preflight_cleanup' ($preflightResult.exit_code -eq 0) `
            "exit=$($preflightResult.exit_code)"
    }

    if (Test-Path -LiteralPath $e2ePath) {
        throw "E2E root already exists; choose a fresh path: $e2ePath"
    }
    New-Item -ItemType Directory -Force `
        -Path $e2ePath, $appDataPath, $localAppDataPath, $userDataPath,
        $parserDataPath, $screenshotsPath | Out-Null

    $installStartedAt = [DateTimeOffset]::Now
    $installResult = Invoke-TestProcess -FilePath $oldInstallerPath `
        -ArgumentList @('/S', "/D=$installPath") -TimeoutSeconds 180 -Label '0.4.5 install'
    $results.timings.old_install_ms = [math]::Round(
        ([DateTimeOffset]::Now - $installStartedAt).TotalMilliseconds
    )
    Add-E2ECheck 'old_installer_exit' ($installResult.exit_code -eq 0) `
        "exit=$($installResult.exit_code)"
    Add-E2ECheck 'old_version_installed' `
        ((Get-NormalizedProductVersion -Path $appExecutable) -eq $expectedOldVersion) `
        "version=$(Get-NormalizedProductVersion -Path $appExecutable)"

    $oldAppProcess = Start-IsolatedApp -Executable $appExecutable
    $oldStatus = Wait-ParserStatus -Online $true -TimeoutSeconds $StartupTimeoutSeconds
    Add-E2ECheck 'old_app_started' (-not $oldAppProcess.HasExited) "pid=$($oldAppProcess.Id)"
    $oldParserData = [IO.Path]::GetFullPath([string]$oldStatus.data_directory)
    $expectedParserData = [IO.Path]::GetFullPath($parserDataPath)
    Add-E2ECheck 'old_parser_isolated' `
        ($oldParserData.Equals($expectedParserData, [StringComparison]::OrdinalIgnoreCase)) `
        $oldParserData

    $fixtureReplay = @(
        (Join-Path $fixturePath "replays\$MatchId.dem"),
        (Join-Path $fixturePath "replays\$MatchId.dem.bz2")
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    Add-E2ECheck 'fixture_replay' ($null -ne $fixtureReplay) `
        "match=$MatchId formats=.dem,.dem.bz2"
    $fixtureFileName = (Get-Item -LiteralPath $fixtureReplay).Name
    $results.fixture.file_name = $fixtureFileName

    $parseStartedAt = [DateTimeOffset]::Now
    $importStart = Invoke-RestMethod -Method Post -Uri "$apiBase/replays/$MatchId/import" `
        -Headers @{
            'X-Dota-Lens-File-Name' = $fixtureFileName
            'X-Dota-Lens-Account-Id' = [string]$AccountId
        } `
        -ContentType 'application/octet-stream' -InFile $fixtureReplay -TimeoutSec 600
    $completed = Wait-JobTerminal -JobId $importStart.id -TimeoutSeconds $ParseTimeoutSeconds
    $results.timings.seed_parse_ms = [math]::Round(
        ([DateTimeOffset]::Now - $parseStartedAt).TotalMilliseconds
    )
    Add-E2ECheck 'seed_parse_completed' ($completed.status -eq 'completed') `
        "status=$($completed.status) events=$($completed.result.event_count)"

    $beforeAnalysis = Invoke-RestMethod -Uri "$apiBase/matches/$MatchId/analysis" -TimeoutSec 60
    Add-E2ECheck 'seed_analysis_readable' ($beforeAnalysis.complete -eq $true) `
        "schema=$($beforeAnalysis.schema) events=$($beforeAnalysis.valid_json_objects)"
    $initialSlot = [int]$beforeAnalysis.match.subject.selected_player_slot
    $alternatePlayer = @($beforeAnalysis.match.players | Where-Object {
            [int]$_.player_slot -ne $initialSlot
        } | Select-Object -First 1)
    Add-E2ECheck 'alternate_subject_available' ($alternatePlayer.Count -eq 1) `
        "initial_slot=$initialSlot"
    $manualSubject = Invoke-RestMethod -Method Put -Uri "$apiBase/matches/$MatchId/subject" `
        -ContentType 'application/json' `
        -Body (@{ player_slot = [int]$alternatePlayer[0].player_slot } | ConvertTo-Json -Compress) `
        -TimeoutSec 20
    Add-E2ECheck 'manual_subject_seeded' ($manualSubject.status -eq 'manual_selected') `
        "slot=$($manualSubject.selected_player_slot)"

    [ordered]@{
        schema = 'dota-lens-online-update-marker/1.0'
        created_at = [DateTimeOffset]::Now.ToString('o')
        match_id = $MatchId
        selected_player_slot = [int]$manualSubject.selected_player_slot
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $markerPath -Encoding utf8
    $results.before = [ordered]@{
        app_version = Get-NormalizedProductVersion -Path $appExecutable
        parser_version = $oldStatus.version
        event_count = [long]$beforeAnalysis.valid_json_objects
        subject_status = $manualSubject.status
        selected_player_slot = [int]$manualSubject.selected_player_slot
        marker_sha256 = (Get-FileHash -LiteralPath $markerPath -Algorithm SHA256).Hash
    }

    Stop-ParserIfIdle
    Stop-AppProcess -Process $oldAppProcess
    $oldAppProcess = $null

    $updateStartedAt = [DateTimeOffset]::Now
    $nodeResult = Invoke-TestProcess -FilePath $NodeExecutable `
        -ArgumentList @($updaterScript) `
        -TimeoutSeconds $UpdateTimeoutSeconds `
        -Label '0.4.5 to 0.5.0 updater UI' `
        -Environment @{
            APPDATA = $appDataPath
            LOCALAPPDATA = $localAppDataPath
            DOTA_LENS_USER_DATA_DIR = $userDataPath
            DOTA_LENS_DATA_DIR = $parserDataPath
            DOTA_LENS_UPDATE_E2E_EXECUTABLE = $appExecutable
            DOTA_LENS_UPDATE_E2E_UI_REPORT = $uiReportPath
            DOTA_LENS_UPDATE_E2E_SCREENSHOTS = $screenshotsPath
            DOTA_LENS_UPDATE_E2E_EXPECTED_VERSION = $expectedNewVersion
            DOTA_LENS_UPDATE_E2E_MODE = 'full'
            NODE_PATH = $NodeModules
        } `
        -StandardOutputPath $uiStdoutPath `
        -StandardErrorPath $uiStderrPath
    $results.timings.update_ui_ms = [math]::Round(
        ([DateTimeOffset]::Now - $updateStartedAt).TotalMilliseconds
    )
    Add-E2ECheck 'updater_ui_exit' ($nodeResult.exit_code -eq 0) `
        "exit=$($nodeResult.exit_code)"
    Add-E2ECheck 'updater_ui_report' (Test-Path -LiteralPath $uiReportPath -PathType Leaf) `
        $uiReportPath

    $uiReport = Get-Content -LiteralPath $uiReportPath -Raw | ConvertFrom-Json
    $results.update_ui = $uiReport
    $observedStates = @($uiReport.states | ForEach-Object status)
    foreach ($requiredState in @('available', 'downloading', 'downloaded')) {
        Add-E2ECheck "update_state_$requiredState" ($observedStates -contains $requiredState) `
            "states=$($observedStates -join ',')"
    }
    Add-E2ECheck 'install_started' ($uiReport.status -eq 'install_started') `
        "status=$($uiReport.status)"
    Add-E2ECheck 'update_screenshots' (@($uiReport.screenshots).Count -ge 3) `
        "count=$(@($uiReport.screenshots).Count)"

    $versionObservedAt = [DateTimeOffset]::Now
    $installedVersion = Wait-InstalledVersion -Executable $appExecutable `
        -Version $expectedNewVersion -TimeoutSeconds 180
    $results.timings.install_replace_ms = [math]::Round(
        ([DateTimeOffset]::Now - $versionObservedAt).TotalMilliseconds
    )
    Add-E2ECheck 'new_version_installed' ($installedVersion -eq $expectedNewVersion) `
        "version=$installedVersion"

    $newStatus = Wait-ParserStatus -Online $true -TimeoutSeconds $StartupTimeoutSeconds
    $newParserData = [IO.Path]::GetFullPath([string]$newStatus.data_directory)
    Add-E2ECheck 'updated_app_auto_restarted' ($newStatus.status -eq 'ready') `
        "parser_pid=$($newStatus.pid)"
    Add-E2ECheck 'new_parser_version' ($newStatus.version -eq $expectedParserVersion) `
        "version=$($newStatus.version)"
    Add-E2ECheck 'new_parser_same_data' `
        ($newParserData.Equals($expectedParserData, [StringComparison]::OrdinalIgnoreCase)) `
        $newParserData

    $afterAnalysis = Invoke-RestMethod -Uri "$apiBase/matches/$MatchId/analysis" -TimeoutSec 60
    Add-E2ECheck 'historical_analysis_survived' ($afterAnalysis.complete -eq $true) `
        "events=$($afterAnalysis.valid_json_objects)"
    Add-E2ECheck 'historical_event_count_stable' `
        ([long]$afterAnalysis.valid_json_objects -eq [long]$beforeAnalysis.valid_json_objects) `
        "before=$($beforeAnalysis.valid_json_objects) after=$($afterAnalysis.valid_json_objects)"
    Add-E2ECheck 'historical_subject_survived' `
        ($afterAnalysis.match.subject.status -eq 'manual_selected' -and
            [int]$afterAnalysis.match.subject.selected_player_slot -eq
                [int]$manualSubject.selected_player_slot) `
        "status=$($afterAnalysis.match.subject.status) slot=$($afterAnalysis.match.subject.selected_player_slot)"
    Add-E2ECheck 'user_data_marker_survived' `
        ((Test-Path -LiteralPath $markerPath -PathType Leaf) -and
            (Get-FileHash -LiteralPath $markerPath -Algorithm SHA256).Hash -eq
                $results.before.marker_sha256) `
        $markerPath

    $appUpdateYaml = Join-Path $installPath 'resources\app-update.yml'
    $feedText = if (Test-Path -LiteralPath $appUpdateYaml) {
        Get-Content -LiteralPath $appUpdateYaml -Raw
    } else {
        ''
    }
    Add-E2ECheck 'updated_feed_configuration' `
        ($feedText -match 'owner:\s*Kerry-yangg' -and $feedText -match 'repo:\s*Dotalens') `
        $appUpdateYaml
    $updateCache = Join-Path $localAppDataPath 'dota-lens-desktop-ui-updater'
    Add-E2ECheck 'download_cache_created' (Test-Path -LiteralPath $updateCache -PathType Container) `
        $updateCache

    $results.after = [ordered]@{
        app_version = $installedVersion
        parser_version = $newStatus.version
        parser_pid = $newStatus.pid
        event_count = [long]$afterAnalysis.valid_json_objects
        subject_status = $afterAnalysis.match.subject.status
        selected_player_slot = [int]$afterAnalysis.match.subject.selected_player_slot
        marker_sha256 = (Get-FileHash -LiteralPath $markerPath -Algorithm SHA256).Hash
    }
    $results.status = 'passed'
} catch {
    $results.status = 'failed'
    $results.error = [ordered]@{
        message = $_.Exception.Message
        script_stack = $_.ScriptStackTrace
    }
    throw
} finally {
    try {
        Stop-ParserIfIdle
    } catch {
        if (-not $results.error) {
            $results.error = "Cleanup parser: $($_.Exception.Message)"
        }
    }
    Stop-AppProcess -Process $oldAppProcess
    Stop-AppProcess -Process $newAppProcess
    Stop-IsolatedAppProcesses

    if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
        try {
            $uninstallResult = Invoke-TestProcess -FilePath $uninstaller `
                -ArgumentList @('/S') -TimeoutSeconds 180 -Label 'Updated app uninstall'
            $results.checks.uninstaller_exit = [ordered]@{
                passed = $uninstallResult.exit_code -eq 0
                detail = "exit=$($uninstallResult.exit_code)"
            }
        } catch {
            $results.checks.uninstaller_exit = [ordered]@{
                passed = $false
                detail = $_.Exception.Message
            }
        }
    }

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
    New-Item -ItemType Directory -Force -Path $e2ePath | Out-Null
    $results | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $reportPath -Encoding utf8
    Write-Host "Online update E2E report: $reportPath"
}
