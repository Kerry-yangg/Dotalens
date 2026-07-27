function Invoke-PlayerReportStagedUpload {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$ReplayPath,
        [Parameter(Mandatory)][string]$CachedReplay,
        [Parameter(Mandatory)][string]$UploadDirectory,
        [Parameter(Mandatory)][string]$StagedFileName,
        [Parameter(Mandatory)][scriptblock]$UploadAction,
        [scriptblock]$CopyAction = {
            param($Source, $Destination)
            Copy-Item -LiteralPath $Source -Destination $Destination -ErrorAction Stop
        }
    )

    $uploadPath = $ReplayPath
    $stagedUpload = $null
    try {
        if ([IO.Path]::GetFullPath($ReplayPath).Equals(
                [IO.Path]::GetFullPath($CachedReplay),
                [StringComparison]::OrdinalIgnoreCase
            )) {
            New-Item -ItemType Directory -Force -Path $UploadDirectory | Out-Null
            $stagedUpload = Join-Path $UploadDirectory $StagedFileName
            & $CopyAction $ReplayPath $stagedUpload
            $uploadPath = $stagedUpload
        }

        & $UploadAction $uploadPath
    } finally {
        if ($stagedUpload -and (Test-Path -LiteralPath $stagedUpload)) {
            Remove-Item -LiteralPath $stagedUpload -Force
        }
    }
}
