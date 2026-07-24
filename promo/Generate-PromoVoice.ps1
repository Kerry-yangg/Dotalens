[CmdletBinding()]
param(
    [string]$Storyboard = (Join-Path $PSScriptRoot 'storyboard.json'),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'audio')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'This script requires PowerShell 7 or newer.'
}

$storyboardPath = [IO.Path]::GetFullPath($Storyboard)
$outputPath = [IO.Path]::GetFullPath($OutputDirectory)
$data = Get-Content -LiteralPath $storyboardPath -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$voice = New-Object -ComObject SAPI.SpVoice
$voices = @($voice.GetVoices())
$chineseVoice = $voices | Where-Object { $_.GetDescription() -like '*Chinese*' } | Select-Object -First 1
if (-not $chineseVoice) {
    throw 'No Simplified Chinese SAPI voice is installed.'
}

$voice.Voice = $chineseVoice
$voice.Rate = [int]$data.voice_rate
$voice.Volume = 100

try {
    foreach ($scene in $data.scenes) {
        $file = Join-Path $outputPath ($scene.id + '.wav')
        if (Test-Path -LiteralPath $file) {
            Remove-Item -LiteralPath $file -Force
        }
        $stream = New-Object -ComObject SAPI.SpFileStream
        try {
            $stream.Open($file, 3, $false)
            $voice.AudioOutputStream = $stream
            [void]$voice.Speak([string]$scene.narration)
            $voice.AudioOutputStream = $null
            $stream.Close()
        } finally {
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($stream)
        }
        Write-Host "Generated voice: $file"
    }
} finally {
    $voice.AudioOutputStream = $null
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($voice)
}
