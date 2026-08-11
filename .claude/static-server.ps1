$root = Split-Path -Parent $PSScriptRoot
$port = 5173
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$port/"

$mime = @{
    '.html'='text/html'; '.htm'='text/html'; '.css'='text/css'; '.js'='application/javascript';
    '.json'='application/json'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg';
    '.gif'='image/gif'; '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.webp'='image/webp';
    '.woff'='font/woff'; '.woff2'='font/woff2'
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    try {
        $path = [Uri]::UnescapeDataString($request.Url.AbsolutePath)
        if ($path -eq '/') { $path = '/index.html' }
        $filePath = Join-Path $root ($path.TrimStart('/'))
        $fullRoot = (Resolve-Path $root).Path
        if ((Test-Path $filePath) -and ((Resolve-Path $filePath).Path).StartsWith($fullRoot)) {
            $ext = [IO.Path]::GetExtension($filePath)
            $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
            $bytes = [IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $notFound = [Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($notFound, 0, $notFound.Length)
        }
    } catch {
        $response.StatusCode = 500
    } finally {
        $response.OutputStream.Close()
    }
}
