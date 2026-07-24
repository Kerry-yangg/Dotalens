[CmdletBinding()]
param(
    [string] $SourcePatch = '7.41d',
    [string] $TargetPatch = '7.41',
    [string] $OverridePath = (Join-Path $PSScriptRoot 'dota-ability-overrides\7.41-from-7.41d.json'),
    [string] $ResourceRoot = (Join-Path $PSScriptRoot 'replay-parser\src\main\resources\dota\ability-metadata')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'This script requires PowerShell 7 or newer.'
}

$sourcePath = Join-Path $ResourceRoot "$SourcePatch.json"
$outputPath = Join-Path $ResourceRoot "$TargetPatch.json"
$source = Get-Content -LiteralPath $sourcePath -Raw | ConvertFrom-Json -Depth 100
$overrides = Get-Content -LiteralPath $OverridePath -Raw | ConvertFrom-Json -Depth 100

if (($source.patch -ne $SourcePatch) `
        -or ($overrides.source_patch -ne $SourcePatch) `
        -or ($overrides.target_patch -ne $TargetPatch)) {
    throw 'Source, target, and override patch identifiers must agree.'
}

foreach ($entry in $overrides.changes.PSObject.Properties) {
    $ability = $source.abilities.PSObject.Properties[$entry.Name]
    if ($null -eq $ability) {
        throw "Ability '$($entry.Name)' does not exist in the $SourcePatch snapshot."
    }
    foreach ($field in $entry.Value.PSObject.Properties) {
        $ability.Value.$($field.Name) = $field.Value
    }
}

$source.patch = $TargetPatch
$source.generated_at = $overrides.generated_at
$source.source = $overrides.source
$source.source_urls = @($source.source_urls) + @($overrides.patch_note_urls)
$source | Add-Member -NotePropertyName provenance -NotePropertyValue ([ordered]@{
    mode = 'reverse_official_patch_notes'
    source_patch = $SourcePatch
    target_patch = $TargetPatch
    verified_scope = @($overrides.verified_scope)
    limitations = @($overrides.limitations)
    override_count = @($overrides.changes.PSObject.Properties).Count
}) -Force

$json = $source | ConvertTo-Json -Depth 100 -Compress
[IO.File]::WriteAllText($outputPath, $json, [Text.UTF8Encoding]::new($false))
Write-Host "Ability metadata snapshot: $outputPath"
