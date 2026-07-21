[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string] $JarPath,

    [string] $JavaPath = (Join-Path $PSScriptRoot '..\runtime\jdk-21\bin\java.exe'),

    [ValidatePattern('^\d+[kKmMgG]?$')]
    [string] $MaxHeap = '2g',

    [switch] $SchemaProbe,

    [switch] $DisableUnitEvents
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'This script requires PowerShell 7 or newer.'
}

$jar = (Resolve-Path -LiteralPath $JarPath).Path
Write-Host 'Starting OpenDota parser at http://127.0.0.1:5600'
Write-Host 'Keep this terminal open while posting replays. Press Ctrl+C to stop.'

$previousSchemaProbe = $env:DOTA_LENS_SCHEMA_PROBE
$previousUnitEvents = $env:DOTA_LENS_UNIT_EVENTS
try {
    $env:DOTA_LENS_SCHEMA_PROBE = if ($SchemaProbe) { '1' } else { '0' }
    $env:DOTA_LENS_UNIT_EVENTS = if ($DisableUnitEvents) { '0' } else { '1' }
    & $JavaPath "-Xmx$MaxHeap" -jar $jar
} finally {
    $env:DOTA_LENS_SCHEMA_PROBE = $previousSchemaProbe
    $env:DOTA_LENS_UNIT_EVENTS = $previousUnitEvents
}
