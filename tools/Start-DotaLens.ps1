[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$FrontendPort = 4173,

    [string]$DataDirectory = (Join-Path $PSScriptRoot "runtime\dota-lens-data"),

    [switch]$BuildParser,

    [switch]$Background,

    [switch]$Foreground
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$java = Join-Path $PSScriptRoot "runtime\jdk-21\bin\java.exe"
$jar = Join-Path $PSScriptRoot "replay-parser\target\stats-0.1.0.jar"
$logs = Join-Path $DataDirectory "logs"
$expectedParserVersion = "1.7.0"
$parserProcess = $null
$ownsParser = $false

if ($Background -and $Foreground) {
    throw "Use either -Background or -Foreground, not both."
}

$launchDetached = $Background -or -not $Foreground
if ($launchDetached) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $pwshCommand = Get-Command pwsh.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) {
        throw "node.exe was not found on PATH"
    }
    if (-not $pwshCommand) {
        throw "pwsh.exe was not found on PATH"
    }

    New-Item -ItemType Directory -Force -Path $DataDirectory, $logs | Out-Null
    $backgroundLauncher = Join-Path $PSScriptRoot "Start-DotaLensBackground.cjs"
    $launcherStdout = Join-Path $logs "launcher.stdout.log"
    $launcherStderr = Join-Path $logs "launcher.stderr.log"
    $buildParserValue = if ($BuildParser) { "true" } else { "false" }
    $launcherPid = & $nodeCommand.Source `
        $backgroundLauncher `
        $pwshCommand.Source `
        $PSCommandPath `
        $FrontendPort `
        $DataDirectory `
        $launcherStdout `
        $launcherStderr `
        $buildParserValue
    if ($LASTEXITCODE -ne 0 -or -not $launcherPid) {
        throw "Dota Lens background launcher failed. Check $launcherStderr"
    }

    Write-Host "Background launcher PID: $launcherPid"
    Write-Host "Dota Lens parser: http://127.0.0.1:5600/api/status"
    Write-Host "Dota Lens app:    http://127.0.0.1:$FrontendPort/"
    return
}

function Get-LocalParserStatus {
    try {
        return Invoke-RestMethod -Uri "http://127.0.0.1:5600/api/status" -TimeoutSec 1
    } catch {
        return $null
    }
}

function Test-LocalEndpoint {
    param([string]$Uri)
    try {
        Invoke-RestMethod -Uri $Uri -TimeoutSec 1 | Out-Null
        return $true
    } catch {
        return $false
    }
}

if ($BuildParser -or -not (Test-Path -LiteralPath $jar)) {
    & (Join-Path $PSScriptRoot "Build-DotaLensParser.ps1")
}

if (-not (Test-Path -LiteralPath $java)) {
    throw "Java 21 runtime not found at $java"
}

New-Item -ItemType Directory -Force -Path $DataDirectory, $logs | Out-Null

$parserStatus = Get-LocalParserStatus
if ($parserStatus) {
    try {
        $parserStartedAt = [DateTimeOffset]::Parse([string]$parserStatus.started_at)
    } catch {
        $parserStartedAt = $null
    }
    $jarModifiedAt = (Get-Item -LiteralPath $jar).LastWriteTimeUtc
    $parserCurrent = [string]$parserStatus.version -eq $expectedParserVersion -and (
        -not $parserStartedAt -or $jarModifiedAt -le $parserStartedAt.UtcDateTime.AddSeconds(2)
    )
    if (-not $parserCurrent -and $parserStatus.graceful_restart -and [int]$parserStatus.active_jobs -eq 0) {
        Write-Host "Stopping stale Dota Lens parser v$($parserStatus.version)..."
        try {
            Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5600/api/shutdown" -TimeoutSec 3 | Out-Null
            for ($attempt = 0; $attempt -lt 30; $attempt++) {
                Start-Sleep -Milliseconds 100
                if (-not (Get-LocalParserStatus)) {
                    $parserStatus = $null
                    break
                }
            }
        } catch {
            Write-Warning "The stale parser could not be restarted; this session will reuse it."
        }
    }
}

if (-not $parserStatus) {
    $previousDataDirectory = $env:DOTA_LENS_DATA_DIR
    $previousPython = $env:DOTA_LENS_PYTHON
    try {
        $env:DOTA_LENS_DATA_DIR = (Resolve-Path -LiteralPath $DataDirectory).Path
        $python = Get-Command python -ErrorAction SilentlyContinue
        $env:DOTA_LENS_PYTHON = if ($python) { $python.Source } else { $null }
        $parserProcess = Start-Process -FilePath $java `
            -ArgumentList @("-Xmx2g", "-jar", $jar) `
            -PassThru `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $logs "parser.stdout.log") `
            -RedirectStandardError (Join-Path $logs "parser.stderr.log")
        $ownsParser = $true
    } finally {
        $env:DOTA_LENS_DATA_DIR = $previousDataDirectory
        $env:DOTA_LENS_PYTHON = $previousPython
    }

    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if (Test-LocalEndpoint "http://127.0.0.1:5600/api/status") {
            $ready = $true
            break
        }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) {
        if ($parserProcess -and -not $parserProcess.HasExited) {
            Stop-Process -Id $parserProcess.Id -Force
        }
        throw "Dota Lens parser did not become ready. Check $logs\parser.stderr.log"
    }
}

$url = "http://127.0.0.1:$FrontendPort/"
Write-Host "Dota Lens parser: http://127.0.0.1:5600/api/status"
Write-Host "Dota Lens app:    $url"

$frontendAlreadyRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port $FrontendPort `
    -InformationLevel Quiet -WarningAction SilentlyContinue
if ($frontendAlreadyRunning) {
    Write-Host "Frontend port is already active; reusing the existing server."
    return
}

Push-Location $root
try {
    npm run dev -- --port $FrontendPort
} finally {
    Pop-Location
    if ($ownsParser -and $parserProcess -and -not $parserProcess.HasExited) {
        Stop-Process -Id $parserProcess.Id -Force
        $parserProcess.WaitForExit()
    }
}
