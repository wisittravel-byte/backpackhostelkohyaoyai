param(
    [int]$Port = 8080,
    [string]$Root = (Split-Path -Parent $MyInvocation.MyCommand.Definition),
    [string]$Bind = '127.0.0.1' # Default bind localhost to avoid URL ACL requirement
)

Write-Host "Starting static server" -ForegroundColor Green
Write-Host "Root: $Root" -ForegroundColor Green

# Determine listener prefix
if ($Bind -eq '0.0.0.0' -or $Bind -eq '*') {
    $prefix = ('http://+:{0}/' -f $Port)
    $display = ('http://0.0.0.0:{0}/ (all interfaces)' -f $Port)
} else {
    $prefix = ('http://{0}:{1}/' -f $Bind, $Port)
    $display = $prefix
}
Write-Host "Listening on $display" -ForegroundColor Green

function Get-ContentType($path) {
    switch ([io.path]::GetExtension($path).ToLower()) {
        '.html' { 'text/html; charset=utf-8' }
        '.htm'  { 'text/html; charset=utf-8' }
        '.css'  { 'text/css; charset=utf-8' }
        '.js'   { 'application/javascript; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.gif'  { 'image/gif' }
        '.svg'  { 'image/svg+xml' }
        '.woff2'{ 'font/woff2' }
        '.webp' { 'image/webp' }
        default { 'application/octet-stream' }
    }
}

try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
} catch {
    Write-Host "Failed to start HttpListener: $($_.Exception.Message)" -ForegroundColor Red
    if ($prefix -like 'http://+*') {
        Write-Host "Hint: Binding to all interfaces may require an URL ACL. Run as Administrator and execute:" -ForegroundColor Yellow
        Write-Host "  netsh http add urlacl url=$prefix user=Everyone" -ForegroundColor Yellow
    }
    exit 1
}

try {
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $req = $context.Request
            $res = $context.Response

            $path = $req.Url.AbsolutePath.TrimStart('/')
            if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }
            # basic path sanitization
            $path = $path -replace '\.\.', ''
            $file = Join-Path $Root $path

            # if a directory is requested, serve its index.html
            if (Test-Path $file -PathType Container) {
                $file = Join-Path $file 'index.html'
            }

            if (-not (Test-Path $file)) {
                $res.StatusCode = 404
                $data = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
                $res.ContentType = 'text/plain; charset=utf-8'
                $res.ContentLength64 = $data.Length
                $res.OutputStream.Write($data,0,$data.Length)
                $res.OutputStream.Close()
                continue
            }

            try {
                $bytes = [System.IO.File]::ReadAllBytes($file)
                $res.ContentType = Get-ContentType $file
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes,0,$bytes.Length)
                $res.OutputStream.Close()
            } catch {
                Write-Host "Error serving $file : $_" -ForegroundColor Yellow
                $res.StatusCode = 500
                $buf = [System.Text.Encoding]::UTF8.GetBytes('Server error')
                $res.OutputStream.Write($buf,0,$buf.Length)
                $res.OutputStream.Close()
            }
        } catch {
            Start-Sleep -Milliseconds 25
        }
    }
} finally {
    if ($listener -and $listener.IsListening) { $listener.Stop(); $listener.Close() }
}
