# Globals and script vars
$ErrorActionPreference = "Stop"
$APIKEY = Get-Content apiKey
$BASEURL = "https://infinibattle.infi.nl"
$zipPath = "$($PSScriptRoot)\publish.zip"

# Remove old zip file, if any
if (Test-Path $zipPath) { Remove-Item ($zipPath) }

Write-Host $PSScriptRoot
Get-ChildItem -Path $PSScriptRoot | Where-Object { $_.Name -ne $zipFileName -and $_.Name -ne 'node_modules' } | Compress-Archive -DestinationPath $zipPath

# Upload new zip file
$uploadUrl = "$($BASEURL)/api/uploadBot/$($APIKEY)"
$response = (New-Object Net.WebClient).UploadFile($uploadUrl, $zipPath)
[System.Text.Encoding]::UTF8.GetString($response)