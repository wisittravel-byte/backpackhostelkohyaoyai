param(
    [int]$Port = 8080,
    [string]$Root = "${PSScriptRoot}..\.."
)

Write-Host "Starting simple PowerShell static server..."
Write-Host "Root: $Root"
Write-Host "Port: $Port"

Add-Type -AssemblyName System.Net.Sockets
Add-Type -AssemblyName System.Text

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "Listening on http://127.0.0.1:$Port/"

function Get-MimeType($path){
    switch ([System.IO.Path]::GetExtension($path).ToLower()){
        '.html'{ 'text/html' }
        '.htm'{ 'text/html' }
        '.js'{ 'application/javascript' }
        '.css'{ 'text/css' }
        '.png'{ 'image/png' }
        '.jpg'{ 'image/jpeg' }
        '.jpeg'{ 'image/jpeg' }
        '.svg'{ 'image/svg+xml' }
        '.json'{ 'application/json' }
        default{ 'application/octet-stream' }
    }
}

try{
    while ($true) {
        $client = $listener.AcceptTcpClient()
        Start-Job -ArgumentList $client -ScriptBlock {
            param($client)
            try{
                $stream = $client.GetStream()
                $sr = New-Object System.IO.StreamReader($stream)
                $reqLine = $sr.ReadLine()
                if (-not $reqLine) { $client.Close(); return }
                $parts = $reqLine.Split(' ')
                $method = $parts[0]
                $url = $parts[1]
                # drain headers
                while ($true){ $line = $sr.ReadLine(); if ($line -eq '') { break } }

                if ($url -eq '/') { $url = '/index.html' }
                $localPath = [System.IO.Path]::Combine($PSScriptRoot, '..', '..', $url.TrimStart('/'))
                $localPath = [System.IO.Path]::GetFullPath($localPath)

                $respStream = New-Object System.IO.StreamWriter($stream)
                if (-not (Test-Path $localPath)){
                    $respStream.Write("HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: 13`r`nConnection: close`r`n`r`n404 Not Found")
                    $respStream.Flush()
                    $client.Close(); return
                }

                $bytes = [System.IO.File]::ReadAllBytes($localPath)
                $mime = Get-MimeType $localPath
                $header = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
                $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                $stream.Write($headerBytes, 0, $headerBytes.Length)
                $stream.Write($bytes, 0, $bytes.Length)
                $stream.Flush()
                $client.Close()
            }
            catch{
                try{ $client.Close() } catch {}
            }
        }
    }
}
finally{
    $listener.Stop()
}
