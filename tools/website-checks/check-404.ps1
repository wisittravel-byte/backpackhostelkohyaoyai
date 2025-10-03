param(
  [string]$BaseUrl = 'http://127.0.0.1:8080/',
  [string]$StaticRoot = ''
)

# Resolve static root (default to repo src/main/resources/static)
if (-not $StaticRoot -or $StaticRoot.Trim().Length -eq 0) {
  $repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) # ..\..
  $StaticRoot = Join-Path $repo 'src/main/resources/static'
}

Write-Host "Checking assets for 404 under $BaseUrl" -ForegroundColor Cyan
Write-Host "Static root: $StaticRoot" -ForegroundColor Cyan

# Scan public subtree (pages + assets)
$patterns = @(
  'public/**/*.html',
  'public/assets/**/*.css','public/assets/**/*.js',
  'public/assets/**/*.png','public/assets/**/*.jpg','public/assets/**/*.jpeg','public/assets/**/*.svg','public/assets/**/*.webp','public/assets/**/*.woff2'
)
$files = @()
foreach($pat in $patterns){
  $files += Get-ChildItem -Path $StaticRoot -Recurse -File -Include $pat
}

$urls = $files | ForEach-Object {
  $rel = $_.FullName.Substring($StaticRoot.Length).TrimStart('\\','/') -replace '\\','/'
  '/' + $rel
} | Sort-Object -Unique

$fail = @()
foreach($u in $urls){
  try{
    $resp = Invoke-WebRequest -Uri ($BaseUrl.TrimEnd('/') + $u) -UseBasicParsing -Method Head -TimeoutSec 10 -ErrorAction Stop
    if($resp.StatusCode -ge 400){ $fail += [pscustomobject]@{Url=$u; Code=$resp.StatusCode} }
  }catch{
    $fail += [pscustomobject]@{Url=$u; Code='ERR'}
  }
}

if($fail.Count -gt 0){
  Write-Host "Broken URLs (non-200):" -ForegroundColor Red
  $fail | Format-Table -AutoSize
  exit 1
}else{
  Write-Host "All checked assets returned 2xx" -ForegroundColor Green
}
