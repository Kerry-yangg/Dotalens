[CmdletBinding()]
param(
    [string] $PatchName,
    [string] $OutputDirectory = (Join-Path $PSScriptRoot 'replay-parser\src\main\resources\dota\ability-metadata'),
    [ValidateRange(1, 16)]
    [int] $ThrottleLimit = 6
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'This script requires PowerShell 7 or newer.'
}

$patches = Invoke-RestMethod -Uri 'https://www.dota2.com/datafeed/patchnoteslist' -Method Get
$latestPatch = [string]$patches.patches[-1].patch_number
if ([string]::IsNullOrWhiteSpace($PatchName)) {
    $PatchName = $latestPatch
}
if ($PatchName -ne $latestPatch) {
    throw "Valve's live datafeed describes $latestPatch, not $PatchName. Refusing to create a falsely versioned snapshot."
}

$heroList = Invoke-RestMethod -Uri 'https://www.dota2.com/datafeed/herolist?language=english' -Method Get
$heroes = @($heroList.result.data.heroes | Sort-Object id)

$heroDetails = $heroes | ForEach-Object -Parallel {
    $heroId = [int]$_.id
    $uri = "https://www.dota2.com/datafeed/herodata?language=english&hero_id=$heroId"
    for ($attempt = 1; $attempt -le 4; $attempt++) {
        try {
            $response = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 30
            $hero = @($response.result.data.heroes)[0]
            if ($null -eq $hero) {
                throw "Valve returned no hero payload for id $heroId"
            }
            [pscustomobject]@{ id = $heroId; hero = $hero }
            break
        } catch {
            if ($attempt -eq 4) { throw }
            Start-Sleep -Milliseconds (300 * [Math]::Pow(2, $attempt - 1))
        }
    }
} -ThrottleLimit $ThrottleLimit

$abilityRows = [ordered]@{}
$heroCount = 0
foreach ($entry in ($heroDetails | Sort-Object id)) {
    $heroCount++
    $hero = $entry.hero
    foreach ($ability in @($hero.abilities)) {
        $name = [string]$ability.name
        if ([string]::IsNullOrWhiteSpace($name)) { continue }

        $effectValues = @()
        foreach ($special in @($ability.special_values)) {
            $specialName = ([string]$special.name).ToLowerInvariant()
            if ($specialName -in @('radius', 'aoe', 'area_of_effect', 'effect_radius')) {
                $effectValues = @($special.values_float | ForEach-Object { [double]$_ })
                break
            }
        }

        $abilityRows[$name] = [ordered]@{
            id = [int]$ability.id
            hero_id = [int]$hero.id
            behavior = [string]$ability.behavior
            target_team = [int]$ability.target_team
            target_type = [int]$ability.target_type
            flags = [int64]$ability.flags
            max_level = [int]$ability.max_level
            cast_ranges = @($ability.cast_ranges | ForEach-Object { [double]$_ })
            effect_radii = $effectValues
        }
    }
}

$orderedAbilities = [ordered]@{}
foreach ($key in ($abilityRows.Keys | Sort-Object)) {
    $orderedAbilities[$key] = $abilityRows[$key]
}

$document = [ordered]@{
    schema = 'dota-ability-metadata/1.0'
    patch = $PatchName
    generated_at = [DateTimeOffset]::UtcNow.ToString('O')
    source = 'Valve Dota 2 datafeed'
    source_urls = @(
        'https://www.dota2.com/datafeed/patchnoteslist',
        'https://www.dota2.com/datafeed/herolist?language=english',
        'https://www.dota2.com/datafeed/herodata?language=english&hero_id={id}'
    )
    hero_count = $heroCount
    ability_count = $orderedAbilities.Count
    abilities = $orderedAbilities
}

$resolvedDirectory = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($resolvedDirectory) | Out-Null
$outputPath = Join-Path $resolvedDirectory "$PatchName.json"
$json = $document | ConvertTo-Json -Depth 12 -Compress
[IO.File]::WriteAllText($outputPath, $json, [Text.UTF8Encoding]::new($false))

Write-Host "Wrote $($orderedAbilities.Count) abilities for Dota $PatchName to $outputPath"
