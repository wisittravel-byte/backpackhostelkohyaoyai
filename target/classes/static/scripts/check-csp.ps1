param(
  [string]$BaseUrl = 'http://127.0.0.1:8080/'
)

$pages = @('/', '/index.html', '/booking.html', '/checkout.html')
$bad = @()

foreach($p in $pages){
  try{
    $resp = Invoke-WebRequest -Uri ($BaseUrl.TrimEnd('/') + $p) -UseBasicParsing -Method Get -TimeoutSec 10 -ErrorAction Stop
    $csp = $resp.Headers['Content-Security-Policy']
    if(-not $csp){
      # Fallback: check meta tag content
      if($resp.Content -match '<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"'){
        $csp = $matches[1]
      }
    }
    if(-not $csp){ $bad += [pscustomobject]@{Page=$p; Issue='No CSP found'}; continue }

    if($csp -match "unsafe-inline" -and $csp -match "style-src"){
      $bad += [pscustomobject]@{Page=$p; Issue='style-src allows unsafe-inline'}
    }
    if($csp -notmatch "script-src 'self'" -or $csp -notmatch "style-src 'self'"){
      $bad += [pscustomobject]@{Page=$p; Issue='Missing required directives'}
    }
  }catch{
    $bad += [pscustomobject]@{Page=$p; Issue='Request failed'}
  }
}

if($bad.Count -gt 0){
  Write-Host "CSP issues detected:" -ForegroundColor Red
  $bad | Format-Table -AutoSize
  exit 1
}else{
  Write-Host "CSP checks passed for all pages" -ForegroundColor Green
}
