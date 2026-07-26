[CmdletBinding()]
param(
    [string]$Executable = (Join-Path (Split-Path -Parent $PSScriptRoot) 'release\win-unpacked\Dota Lens.exe'),
    [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'qa\0.4.5-exe-layout'),
    [long]$MatchId = 8909845275
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'This script requires PowerShell 7 or newer.'
}

$executablePath = [IO.Path]::GetFullPath($Executable)
$outputPath = [IO.Path]::GetFullPath($OutputDirectory)
if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
    throw "Candidate executable was not found at $executablePath"
}
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$cases = @(
    @{ Name = 'player-score-1024x720'; View = 'player-score'; Width = 1024; Height = 720 },
    @{ Name = 'player-score-1280x800'; View = 'player-score'; Width = 1280; Height = 800 },
    @{ Name = 'player-score-1460x920'; View = 'player-score'; Width = 1460; Height = 920 },
    @{ Name = 'player-score-1920x1080'; View = 'player-score'; Width = 1920; Height = 1080 },
    @{ Name = 'development-1024x720'; View = 'development'; Width = 1024; Height = 720 },
    @{ Name = 'farm-1024x720'; View = 'farm'; Width = 1024; Height = 720 },
    @{ Name = 'combat-1024x720'; View = 'combat'; Width = 1024; Height = 720 },
    @{ Name = 'vision-1024x720'; View = 'vision'; Width = 1024; Height = 720 },
    @{ Name = 'settings-1024x720'; View = 'settings'; Width = 1024; Height = 720; SettingsPanel = 'diagnostics' }
)

$previous = @{
    Capture = $env:DOTA_LENS_QA_CAPTURE
    View = $env:DOTA_LENS_QA_VIEW
    Match = $env:DOTA_LENS_QA_MATCH_ID
    Width = $env:DOTA_LENS_QA_WIDTH
    Height = $env:DOTA_LENS_QA_HEIGHT
    Settings = $env:DOTA_LENS_QA_SETTINGS_PANEL
}
$results = @()

try {
    foreach ($case in $cases) {
        $capture = Join-Path $outputPath "$($case.Name).png"
        $env:DOTA_LENS_QA_CAPTURE = $capture
        $env:DOTA_LENS_QA_VIEW = $case.View
        $env:DOTA_LENS_QA_MATCH_ID = [string]$MatchId
        $env:DOTA_LENS_QA_WIDTH = [string]$case.Width
        $env:DOTA_LENS_QA_HEIGHT = [string]$case.Height
        $env:DOTA_LENS_QA_SETTINGS_PANEL = if ($case.ContainsKey('SettingsPanel')) {
            $case.SettingsPanel
        } else {
            'dota'
        }

        $process = Start-Process -FilePath $executablePath -PassThru -Wait -WindowStyle Hidden
        if ($process.ExitCode -ne 0) {
            throw "$($case.Name) exited with code $($process.ExitCode)"
        }
        $metricsPath = "$capture.json"
        if (-not (Test-Path -LiteralPath $capture -PathType Leaf) -or
            -not (Test-Path -LiteralPath $metricsPath -PathType Leaf)) {
            throw "$($case.Name) did not create its screenshot and metrics"
        }

        $metrics = Get-Content -LiteralPath $metricsPath -Raw | ConvertFrom-Json
        $actualWidth = [int]$metrics.viewport[0]
        $actualHeight = [int]$metrics.viewport[1]
        $widthChrome = [int]$case.Width - $actualWidth
        $heightChrome = [int]$case.Height - $actualHeight
        $windowClamped = $widthChrome -gt 32 -or $heightChrome -gt 80
        $viewportUsable = $actualWidth -ge 1000 -and $actualHeight -ge 680
        if (-not $viewportUsable) {
            throw "$($case.Name) rendered at $($metrics.viewport -join 'x')"
        }
        if ([int]$metrics.assets.brokenHeroImages -ne 0) {
            throw "$($case.Name) has $($metrics.assets.brokenHeroImages) broken hero images"
        }

        $visibleOverflow = @(
            $metrics.rows.PSObject.Properties |
                Where-Object {
                    $_.Value.visible -and $_.Value.overflowX -and
                    $_.Name -notlike '*scroll*' -and
                    $_.Name -notin @('.farm-map-canvas', '.combat-map-canvas')
                } |
                ForEach-Object { $_.Name }
        )
        $farmMapWidth = if ($case.View -eq 'farm') {
            [int]$metrics.rows.'.farm-map-canvas'.width
        } else {
            0
        }
        $farmMapUsable = $case.View -ne 'farm' -or $farmMapWidth -ge 220
        $results += [pscustomobject]@{
            name = $case.Name
            view = $case.View
            window = "$($case.Width)x$($case.Height)"
            viewport = "${actualWidth}x${actualHeight}"
            window_clamped_by_display = $windowClamped
            exit_code = $process.ExitCode
            loaded_hero_images = [int]$metrics.assets.loadedHeroImages
            broken_hero_images = [int]$metrics.assets.brokenHeroImages
            visible_overflow = $visibleOverflow
            farm_map_width = $farmMapWidth
            farm_map_usable = $farmMapUsable
            screenshot = $capture
        }
    }
} finally {
    $env:DOTA_LENS_QA_CAPTURE = $previous.Capture
    $env:DOTA_LENS_QA_VIEW = $previous.View
    $env:DOTA_LENS_QA_MATCH_ID = $previous.Match
    $env:DOTA_LENS_QA_WIDTH = $previous.Width
    $env:DOTA_LENS_QA_HEIGHT = $previous.Height
    $env:DOTA_LENS_QA_SETTINGS_PANEL = $previous.Settings
}

$failedCases = @($results | Where-Object {
        $_.broken_hero_images -ne 0 -or
        @($_.visible_overflow).Count -gt 0 -or
        -not $_.farm_map_usable
    })
$summary = [ordered]@{
    schema = 'dota-lens-exe-layout-smoke/1.0'
    generated_at = [DateTimeOffset]::Now.ToString('o')
    executable = $executablePath
    match_id = $MatchId
    status = if ($failedCases.Count -eq 0) { 'passed' } else { 'failed' }
    cases = $results
}
$summaryPath = Join-Path $outputPath 'layout-smoke-report.json'
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryPath -Encoding utf8
Write-Host "Layout smoke report: $summaryPath"
if ($summary.status -ne 'passed') {
    throw "Layout smoke failed for: $($failedCases.name -join ', ')"
}
