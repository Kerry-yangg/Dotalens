param(
    [string]$OutputPath = (Join-Path $PSScriptRoot "..\dota-localization.generated.js")
)

$ErrorActionPreference = "Stop"

$itemUrl = "https://www.dota2.com/datafeed/itemlist?language=schinese&item_level=all"
$abilityUrl = "https://www.dota2.com/datafeed/abilitylist?language=schinese"

function ConvertTo-LocalizationMap {
    param(
        [Parameter(Mandatory)]$Rows,
        [string]$Prefix = ""
    )

    $result = [ordered]@{}
    foreach ($row in ($Rows | Sort-Object name)) {
        $key = [string]$row.name
        $label = [string]$row.name_loc
        if ($Prefix -and $key.StartsWith($Prefix, [System.StringComparison]::Ordinal)) {
            $key = $key.Substring($Prefix.Length)
        }
        if (-not [string]::IsNullOrWhiteSpace($key) -and -not [string]::IsNullOrWhiteSpace($label)) {
            $result[$key] = $label.Trim()
        }
    }
    return $result
}

$itemResponse = Invoke-RestMethod -Uri $itemUrl -Method Get
$abilityResponse = Invoke-RestMethod -Uri $abilityUrl -Method Get

$items = ConvertTo-LocalizationMap -Rows $itemResponse.result.data.itemabilities -Prefix "item_"
$abilities = ConvertTo-LocalizationMap -Rows $abilityResponse.result.data.itemabilities

$itemJson = $items | ConvertTo-Json -Depth 3 -Compress
$abilityJson = $abilities | ConvertTo-Json -Depth 3 -Compress
$generatedAt = [DateTimeOffset]::UtcNow.ToString("O")

$content = @"
// Generated from Valve's official Dota 2 datafeed. Do not edit by hand.
// Generated at: $generatedAt
export const OFFICIAL_ITEM_NAMES_ZH = Object.freeze($itemJson);
export const OFFICIAL_ABILITY_NAMES_ZH = Object.freeze($abilityJson);
"@

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.File]::WriteAllText($resolvedOutput, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote $($items.Count) items and $($abilities.Count) abilities to $resolvedOutput"
