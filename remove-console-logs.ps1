# Script para eliminar console.log/error/warn/info/debug de archivos TS/TSX
$files = Get-ChildItem -Path "app","lib","middleware.ts" -Include "*.ts","*.tsx" -Recurse -File
$count = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $originalContent = $content
    
    # Eliminar console.log, console.error, console.warn, console.info, console.debug
    # Patrón que captura líneas completas con console.*
    $content = $content -replace '(?m)^\s*console\.(log|error|warn|info|debug)\([^;]*\);?\s*$\r?\n', ''
    
    # Si hubo cambios, guardar el archivo
    if ($content -ne $originalContent) {
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
        $count++
        Write-Host "✓ $($file.Name)" -ForegroundColor Green
    }
}

Write-Host "`n✅ Procesados $count archivos" -ForegroundColor Cyan
