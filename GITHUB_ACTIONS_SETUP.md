# Configuración de GitHub Actions para Sincronización cada 5 minutos

## Objetivo
Ejecutar sincronización automática de Google Sheets cada 5 minutos usando GitHub Actions (ya que Vercel solo permite cron jobs de mínimo 1 día).

## Pasos a implementar

### 1. Crear endpoint de trigger seguro
**Archivo:** `app/api/sync/trigger/route.ts`

- Crear endpoint GET que verifique un token secreto en el header `Authorization`
- Si el token es válido, ejecutar todas las sincronizaciones en paralelo:
  - `/api/sync-usuarios`
  - `/api/sync-empresas`
  - `/api/sync-casos`
  - `/api/sync-solicitudes`
  - `/api/sync-contactos`
  - `/api/sync-funcionarios`
  - `/api/sync-control-horas`
  - `/api/sync-gastos`
  - Cualquier otro endpoint de sincronización que exista
- Retornar resultado con status de cada sincronización
- Si falla autenticación, retornar 401

### 2. Crear GitHub Action workflow
**Archivo:** `.github/workflows/sync-google-sheets.yml`

Configuración:
```yaml
name: Sync Google Sheets Every 5 Minutes

on:
  schedule:
    - cron: '*/5 * * * *'  # Cada 5 minutos
  workflow_dispatch:  # Permite ejecutar manualmente desde GitHub UI

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Sync Endpoint
        run: |
          curl -X GET \
            -H "Authorization: Bearer ${{ secrets.SYNC_SECRET_TOKEN }}" \
            https://[DOMINIO_DE_VERCEL]/api/sync/trigger
```

### 3. Configurar secretos en GitHub
En el repositorio de GitHub:
1. Ir a Settings → Secrets and variables → Actions
2. Crear nuevo secret: `SYNC_SECRET_TOKEN`
3. Generar un token aleatorio seguro (usar: `openssl rand -hex 32` o similar)
4. Guardar el mismo token en las variables de entorno de Vercel como `SYNC_SECRET_TOKEN`

### 4. Agregar variable de entorno en Vercel
En Vercel Dashboard:
1. Ir al proyecto → Settings → Environment Variables
2. Agregar: `SYNC_SECRET_TOKEN` con el mismo valor del secret de GitHub
3. Agregar: `NEXT_PUBLIC_APP_URL` con la URL del deployment (ej: `https://tu-app.vercel.app`)

### 5. Testing
- Ejecutar manualmente el workflow desde GitHub Actions tab
- Verificar logs en GitHub Actions
- Verificar que los datos se sincronicen correctamente
- Confirmar que el endpoint /api/sync/trigger rechaza requests sin token

### 6. Monitoreo
- GitHub Actions enviará notificaciones por email si el workflow falla
- Los logs están disponibles en: Repository → Actions → workflow name

## Notas importantes
- GitHub Actions gratuito: 2000 minutos/mes para repos privados, ilimitado para públicos
- Cada ejecución toma ~30 segundos aprox
- En 1 mes: 30 segundos × (12 ejecuciones/hora × 24 horas × 30 días) = ~4320 minutos
- **Si el repo es privado, excederá el límite gratuito**
- **Solución:** Hacer el repo público o reducir frecuencia a cada 15 minutos

## Alternativa si se excede límite
Cambiar cron a cada 15 minutos:
```yaml
cron: '*/15 * * * *'  # Cada 15 minutos
```
Esto usaría ~1440 minutos/mes (dentro del límite gratuito)

## Comandos útiles
```bash
# Generar token seguro
openssl rand -hex 32

# Probar endpoint localmente
curl -X GET \
  -H "Authorization: Bearer tu_token_aqui" \
  http://localhost:3000/api/sync/trigger
```
