#!/usr/bin/env pwsh
# Test Rate Limiting - Script de prueba manual
# Este script hace múltiples requests para verificar el rate limiting

$baseUrl = "http://localhost:3000"

Write-Host "`n" -NoNewline
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " 🧪 PRUEBA DE RATE LIMITING" -ForegroundColor White
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# Función para hacer requests y mostrar resultados
function Test-RateLimit {
    param(
        [string]$Endpoint,
        [string]$Description,
        [int]$Requests,
        [string]$Method = "GET",
        [hashtable]$Body = @{}
    )
    
    Write-Host "📋 Probando: $Description" -ForegroundColor Yellow
    Write-Host "   Endpoint: $Endpoint" -ForegroundColor Gray
    Write-Host "   Requests: $Requests" -ForegroundColor Gray
    Write-Host ""
    
    $allowed = 0
    $blocked = 0
    
    for ($i = 1; $i -le $Requests; $i++) {
        try {
            $params = @{
                Uri = "$baseUrl$Endpoint"
                Method = $Method
                Headers = @{
                    "Content-Type" = "application/json"
                }
                ErrorAction = "Stop"
            }
            
            if ($Body.Count -gt 0) {
                $params.Body = ($Body | ConvertTo-Json)
            }
            
            $response = Invoke-WebRequest @params
            
            if ($response.StatusCode -eq 200) {
                $allowed++
                Write-Host "   ✅ Request $i : " -NoNewline -ForegroundColor Green
                Write-Host "200 OK" -ForegroundColor White
                
                # Mostrar headers de rate limit si existen
                $limit = $response.Headers["X-RateLimit-Limit"]
                $remaining = $response.Headers["X-RateLimit-Remaining"]
                if ($limit -and $remaining) {
                    Write-Host "      📊 Límite: $limit | Restantes: $remaining" -ForegroundColor DarkGray
                }
            }
        }
        catch {
            if ($_.Exception.Response -ne $null -and $_.Exception.Response.StatusCode -eq 429) {
                $blocked++
                $response = $_.Exception.Response
                $reader = $null
                try {
                    $stream = $response.GetResponseStream()
                    if ($stream -ne $null) {
                        $reader = New-Object System.IO.StreamReader($stream)
                        $content = $reader.ReadToEnd() | ConvertFrom-Json
                        
                        Write-Host "   ❌ Request $i : " -NoNewline -ForegroundColor Red
                        Write-Host "429 Too Many Requests" -ForegroundColor White
                        Write-Host "      💬 Error: $($content.error)" -ForegroundColor DarkYellow
                        Write-Host "      ⏱️  Retry After: $($content.retryAfter) segundos" -ForegroundColor DarkYellow
                        
                        # Mostrar headers
                        $limit = $response.Headers["X-RateLimit-Limit"]
                        $remaining = $response.Headers["X-RateLimit-Remaining"]
                        if ($limit -and $remaining) {
                            Write-Host "      📊 Límite: $limit | Restantes: $remaining" -ForegroundColor DarkGray
                        }
                    }
                } finally {
                    if ($reader -ne $null) { $reader.Close() }
                }
            }
            elseif ($_.Exception.Response -ne $null) {
                Write-Host "   ⚠️  Request $i : " -NoNewline -ForegroundColor Yellow
                Write-Host "$($_.Exception.Response.StatusCode)" -ForegroundColor White
            }
            else {
                Write-Host "   ⚠️  Request $i : Error" -ForegroundColor Yellow
            }
        }
        
        Start-Sleep -Milliseconds 200
    }
    
    Write-Host ""
    Write-Host "   📊 Resumen: " -NoNewline -ForegroundColor Cyan
    Write-Host "$allowed permitidos" -NoNewline -ForegroundColor Green
    Write-Host " | " -NoNewline
    Write-Host "$blocked bloqueados" -ForegroundColor Red
    Write-Host ""
    Write-Host "   ─────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host ""
}

# Verificar que el servidor esté corriendo
Write-Host "🔍 Verificando que el servidor esté corriendo..." -ForegroundColor White
try {
    $response = Invoke-WebRequest -Uri $baseUrl -Method GET -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ Servidor respondiendo en $baseUrl" -ForegroundColor Green
    Write-Host ""
}
catch {
    Write-Host "❌ ERROR: El servidor no está corriendo en $baseUrl" -ForegroundColor Red
    Write-Host ""
    Write-Host "Por favor ejecuta:" -ForegroundColor Yellow
    Write-Host "  npm run dev" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# Prueba 1: Auth Rate Limit (5 requests per 10 min)
Test-RateLimit -Endpoint "/api/validar-identificacion" `
               -Description "Auth Rate Limit (5 req/10min)" `
               -Requests 7 `
               -Method "POST" `
               -Body @{ identificacion = "123456789" }

# Prueba 2: Standard Rate Limit  
Write-Host "Esperando 2 segundos..." -ForegroundColor DarkGray
Start-Sleep -Seconds 2
Write-Host ""

Test-RateLimit -Endpoint "/api/client?tipo=usuario" `
               -Description "Standard Rate Limit (100 req/hour)" `
               -Requests 5 `
               -Method "GET"

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " ✅ PRUEBAS COMPLETADAS" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 Nota: Si ves requests bloqueados (429), el rate limiting" -ForegroundColor Yellow
Write-Host "   está funcionando correctamente!" -ForegroundColor Yellow
Write-Host ""
