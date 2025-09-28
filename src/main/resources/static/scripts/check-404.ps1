param(
  [string]$BaseUrl = 'http://127.0.0.1:8080/'
)

Write-Host "Checking assets for 404 under $BaseUrl" -ForegroundColor Cyan

# Gather candidate files (html, css, js, images) under assets and root
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$static = $root

$patterns = @('*.html','assets/**/*.css','assets/**/*.js','assets/**/*.png','assets/**/*.jpg','assets/**/*.jpeg','assets/**/*.svg','assets/**/*.webp','assets/**/*.woff2')
$files = @()
foreach($pat in $patterns){
  $files += Get-ChildItem -Path $static -Recurse -File -Include $pat
}

# Convert to URL paths relative to root
$urls = $files | ForEach-Object {
  $rel = $_.FullName.Substring($static.Length).TrimStart('\\','/') -replace '\\','/'
  if($rel -eq 'index.html') { '/'} else { '/' + $rel }
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
