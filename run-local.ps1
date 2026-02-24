$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

if (!(Test-Path (Join-Path $frontendDir "server.js"))) {
  throw "Missing frontend/server.js"
}
if (!(Test-Path (Join-Path $backendDir "server.js"))) {
  throw "Missing backend/server.js"
}

$backend = Start-Process -FilePath node -ArgumentList "server.js" -WorkingDirectory $backendDir -PassThru
$frontend = Start-Process -FilePath node -ArgumentList "server.js" -WorkingDirectory $frontendDir -PassThru

Start-Sleep -Seconds 2

$ipv4 = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
  Select-Object -First 1 -ExpandProperty IPAddress)

if (-not $ipv4) {
  $ipv4 = "localhost"
}

Write-Host ""
Write-Host "DocSpark servers started:"
Write-Host "Frontend: http://$ipv4`:5173"
Write-Host "Backend:  http://$ipv4`:3000/api/health"
Write-Host ""
Write-Host "Press Ctrl+C to stop."

try {
  while ($true) {
    if ($backend.HasExited -or $frontend.HasExited) {
      throw "A server exited unexpectedly."
    }
    Start-Sleep -Seconds 1
    $backend.Refresh()
    $frontend.Refresh()
  }
}
finally {
  if (!$backend.HasExited) { Stop-Process -Id $backend.Id -Force }
  if (!$frontend.HasExited) { Stop-Process -Id $frontend.Id -Force }
}
