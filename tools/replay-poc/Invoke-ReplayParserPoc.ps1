[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string] $ReplayPath,

    [string] $Endpoint = 'http://127.0.0.1:5600',

    [string] $OutputDirectory = (Join-Path $PSScriptRoot 'output'),

    [string] $PythonPath = 'python'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'This script requires PowerShell 7 or newer.'
}

if ($Endpoint -match '/blob(?:[/?#]|$)' -or $Endpoint -match '[?&]blob(?:[=&]|$)') {
    throw 'Use the ordinary parser endpoint. The /blob path and ?blob query discard raw interval detail.'
}

$replay = (Resolve-Path -LiteralPath $ReplayPath).Path
$baseUri = $Endpoint.TrimEnd('/')
$healthUri = "$baseUri/healthz"
$parseUri = "$baseUri/"
$outputRoot = New-Item -ItemType Directory -Path $OutputDirectory -Force
$baseName = [IO.Path]::GetFileNameWithoutExtension($replay)
$jsonlPath = Join-Path $outputRoot.FullName "$baseName.raw.jsonl"
$summaryPath = Join-Path $outputRoot.FullName "$baseName.summary.json"
$analyzerPath = Join-Path $PSScriptRoot 'analyze_jsonl.py'

$health = Invoke-WebRequest -Uri $healthUri -TimeoutSec 5
$healthContent = if ($health.Content -is [byte[]]) {
    [Text.Encoding]::UTF8.GetString($health.Content)
} else {
    [string] $health.Content
}
if ($health.StatusCode -ne 200 -or $healthContent.Trim() -ne 'ok') {
    throw "Parser health check failed at $healthUri"
}

$curlArguments = @(
    '--fail'
    '--show-error'
    '--data-binary'
    "@$replay"
    $parseUri
    '--output'
    $jsonlPath
    '--write-out'
    "HTTP %{http_code}`nUploaded %{size_upload} bytes`nReceived %{size_download} bytes`nElapsed %{time_total} s`n"
)

Write-Host "POST $replay -> $parseUri"
& curl.exe @curlArguments
if ($LASTEXITCODE -ne 0) {
    throw "Replay parser POST failed with curl exit code $LASTEXITCODE"
}

& $PythonPath $analyzerPath $jsonlPath --output $summaryPath --quiet
if ($LASTEXITCODE -ne 0) {
    throw "JSONL validation failed with exit code $LASTEXITCODE"
}

$summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
$brokenSlots = @(
    $summary.interval.slots.PSObject.Properties |
        Where-Object { -not $_.Value.continuous_game_timeline }
)
Write-Host "Validated $($summary.valid_json_objects) JSON objects; invalid lines: $($summary.invalid_lines)"
Write-Host "Intervals: $($summary.interval.records) rows across $($summary.interval.slot_count) player slots"
Write-Host "Game timeline: 0-$($summary.interval.slots.'0'.last_game_second)s; discontinuous slots: $($brokenSlots.Count)"
Write-Host "Raw JSONL: $jsonlPath"
Write-Host "Summary:   $summaryPath"
