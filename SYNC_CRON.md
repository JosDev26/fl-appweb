# Sincronización Automática

La aplicación está configurada para sincronizar automáticamente todas las tablas de Google Sheets con Supabase cada 5 minutos.

## Configuración

### Vercel Cron Jobs

El archivo `vercel.json` configura un cron job que ejecuta el endpoint `/api/sync/auto` cada 5 minutos:

```json
{
  "crons": [
    {
      "path": "/api/sync/auto",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### Formato del Schedule

El formato es: `minuto hora día mes día-semana`
- `*/5 * * * *` = Cada 5 minutos
- `*/10 * * * *` = Cada 10 minutos
- `0 * * * *` = Cada hora
- `0 */6 * * *` = Cada 6 horas
- `0 0 * * *` = Una vez al día a medianoche

## Endpoint de Sincronización

**URL:** `POST /api/sync/auto`

**Headers (opcional):**
```
Authorization: Bearer YOUR_CRON_SECRET_TOKEN
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Sincronización completada: 6/6 tablas sincronizadas",
  "timestamp": "2025-11-12T10:30:00.000Z",
  "type": "scheduled-sync",
  "results": {
    "timestamp": "2025-11-12T10:30:00.000Z",
    "syncs": [
      {
        "table": "Clientes",
        "success": true,
        "status": 200,
        "stats": { "inserted": 0, "updated": 5, "deleted": 0, "errors": 0 }
      },
      // ... más tablas
    ]
  }
}
```

## Tablas Sincronizadas

El cron job sincroniza las siguientes tablas en orden:

1. **Clientes** → `usuarios`
2. **Empresas** → `empresas`
3. **Contactos** → `contactos`
4. **Funcionarios** → `funcionarios`
5. **Casos** → `casos`
6. **Control_Horas** → `trabajos_por_hora`

## Variables de Entorno

### Requeridas

```env
# Google Sheets API
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Base URL de la aplicación
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
```

### Opcional

```env
# Token de seguridad para el cron job (opcional pero recomendado)
CRON_SECRET_TOKEN=your-random-secret-token
```

## Seguridad

### Sin Token (Desarrollo)
Si no se configura `CRON_SECRET_TOKEN`, el endpoint `/api/sync/auto` estará abierto. Esto es útil para desarrollo local.

### Con Token (Producción)
Para producción, configura `CRON_SECRET_TOKEN` en Vercel:

1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agrega `CRON_SECRET_TOKEN` con un valor aleatorio seguro
4. El cron job de Vercel automáticamente incluirá el header de autorización

## Desarrollo Local

Para probar la sincronización manualmente:

```bash
# Sin autenticación
curl -X POST http://localhost:3000/api/sync/auto

# Con autenticación
curl -X POST http://localhost:3000/api/sync/auto \
  -H "Authorization: Bearer YOUR_CRON_SECRET_TOKEN"
```

## Monitoreo

### Ver Logs en Vercel
1. Ve a tu proyecto en Vercel
2. Deployments → [tu deployment] → Functions
3. Busca `/api/sync/auto` para ver los logs de ejecución

### Ver Estado del Cron
Vercel te permite ver:
- Cuándo se ejecutó el cron por última vez
- Si tuvo éxito o falló
- Los logs de cada ejecución

## Solución de Problemas

### El cron no se ejecuta
- Verifica que `vercel.json` esté en la raíz del proyecto
- Asegúrate de que el proyecto esté deployado en Vercel
- Los cron jobs solo funcionan en producción, no en preview

### Errores de sincronización
- Verifica las credenciales de Google Sheets
- Verifica las credenciales de Supabase
- Revisa los logs en Vercel para detalles específicos

### Timeout
Si la sincronización toma más de 10 segundos (límite de Vercel Hobby):
- Considera actualizar a Vercel Pro
- O divide la sincronización en múltiples cron jobs

## Sincronización Manual

También puedes sincronizar manualmente desde la interfaz web:
- Ve a `/dev`
- Haz clic en el botón "Sincronizar Todo Automáticamente"
