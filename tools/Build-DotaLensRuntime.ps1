[CmdletBinding()]
param(
    [string]$JavaHome = (Join-Path $PSScriptRoot 'runtime\jdk-21'),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'runtime\jre-dota-lens')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'This script requires PowerShell 7 or newer.'
}

$javaHomePath = [IO.Path]::GetFullPath($JavaHome)
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runtime'))
$outputPath = [IO.Path]::GetFullPath($OutputDirectory)
$jlink = Join-Path $javaHomePath 'bin\jlink.exe'

if (-not (Test-Path -LiteralPath $jlink -PathType Leaf)) {
    throw "jlink was not found at $jlink"
}

$runtimePrefix = $runtimeRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $outputPath.StartsWith($runtimePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Output directory must stay inside $runtimeRoot"
}

if (Test-Path -LiteralPath $outputPath) {
    Remove-Item -LiteralPath $outputPath -Recurse -Force
}

$modules = @(
    'java.base',
    'java.logging',
    'java.management',
    'java.naming',
    'java.net.http',
    'java.security.jgss',
    'jdk.crypto.ec',
    'jdk.httpserver',
    'jdk.unsupported'
) -join ','

& $jlink `
    --add-modules $modules `
    --strip-debug `
    --no-man-pages `
    --no-header-files `
    --compress=2 `
    --output $outputPath

if ($LASTEXITCODE -ne 0) {
    throw "jlink failed with exit code $LASTEXITCODE"
}

$java = Join-Path $outputPath 'bin\java.exe'
if (-not (Test-Path -LiteralPath $java -PathType Leaf)) {
    throw "Runtime build did not produce $java"
}

$size = (Get-ChildItem -LiteralPath $outputPath -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host ("Dota Lens runtime: {0} ({1:N1} MB)" -f $outputPath, ($size / 1MB))
