# FLDB - Sincronización Supabase ↔ Google Sheets

Este proyecto permite mantener sincronizados los datos entre tu aplicación web (Supabase) y AppSheet (Google Sheets).

## 🏗️ Arquitectura

```
AppSheet (Google Sheets) ↔ Next.js API ↔ Supabase ↔ Página Web
```

- **Supabase**: Base de datos principal
- **Next.js API**: Intermediario que maneja la sincronización
- **Google Sheets**: Fuente de datos para AppSheet
- **Página Web**: Interfaz para gestionar datos

## 🔧 Configuración

### 1. Configurar Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita **Google Sheets API**:
   - Ve a "APIs & Services" > "Library"
   - Busca "Google Sheets API" y habilítala
4. Crea una **cuenta de servicio**:
   - Ve a "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Llena los campos requeridos
5. Genera una **clave JSON**:
   - Click en la cuenta de servicio creada
   - Ve a "Keys" > "Add Key" > "Create New Key"
   - Selecciona "JSON" y descarga el archivo

### 2. Configurar Google Sheets

1. Crea un nuevo Google Sheet para tu proyecto FLDB
2. Crea las siguientes hojas:

#### Hoja "Usuarios" (columnas):
| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| id | nombre | tipo_cedula | cedula | telefono | correo | esDolar | estaRegistrado |

#### Hoja "Casos" (columnas):
| A | B | C | D | E |
|---|---|---|---|---|
| id | id_usuario | nombre | estado | expediente |

3. **Importante**: Comparte el Google Sheet con el email de la cuenta de servicio:
   - Click "Share" en el Google Sheet
   - Agrega el email de la cuenta de servicio (ej: `tu-servicio@proyecto.iam.gserviceaccount.com`)
   - Asigna permisos de "Editor"

### 3. Configurar Variables de Entorno

Copia `.env.example` a `.env.local` y completa los valores:

```bash
# Supabase (ya configurado)
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anonima

# Google Sheets (del archivo JSON descargado)
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_CLIENT_EMAIL="tu-servicio@proyecto.iam.gserviceaccount.com"
GOOGLE_SHEETS_SPREADSHEET_ID="1AbC...XyZ" # Del URL del Google Sheet

# Opcional: Para sincronización automática
CRON_SECRET_TOKEN="tu_token_secreto"
```

## 🚀 Uso

### Sincronización Manual

En la página web principal encontrarás botones para:

1. **📥 AppSheet → Supabase**: Sincroniza datos desde Google Sheets a Supabase
2. **📤 Supabase → AppSheet**: Sincroniza datos desde Supabase a Google Sheets  
3. **🔄 Sincronización Completa**: Sincronización bidireccional
4. **📊 Actualizar Stats**: Actualiza estadísticas de ambas fuentes

### Sincronización Automática

#### Opción 1: Vercel Cron Jobs
Si desplegaste en Vercel, puedes usar [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs):

1. Crea `vercel.json` en la raíz del proyecto:
```json
{
  "crons": [
    {
      "path": "/api/sync/auto",
      "schedule": "0 */2 * * *"
    }
  ]
}
```

#### Opción 2: GitHub Actions
Crea `.github/workflows/sync.yml`:
```yaml
name: Sync Database
on:
  schedule:
    - cron: '0 */2 * * *'  # Cada 2 horas

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Sync
        run: |
          curl -X POST "${{ secrets.SYNC_URL }}/api/sync/auto" \
               -H "Authorization: Bearer ${{ secrets.CRON_SECRET_TOKEN }}" \
               -H "Content-Type: application/json"
```

## 📋 APIs Disponibles

### `POST /api/sync`
Ejecuta sincronización manual:
```javascript
fetch('/api/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    direction: 'bidirectional' // 'supabase-to-sheets' | 'sheets-to-supabase' | 'bidirectional'
  })
})
```

### `GET /api/sync`
Obtiene estadísticas de sincronización:
```javascript
fetch('/api/sync')
```

### `POST /api/sync/auto`
Endpoint para sincronización automática programada (requiere token de autorización).

## 🔄 Flujo de Sincronización

### Cuando cambias datos en AppSheet:
1. Los datos se guardan en Google Sheets
2. La sincronización detecta los cambios
3. Los datos se actualizan en Supabase
4. La página web refleja los cambios

### Cuando cambias datos en la página web:
1. Los datos se guardan en Supabase
2. La sincronización detecta los cambios  
3. Los datos se actualizan en Google Sheets
4. AppSheet refleja los cambios

## ⚠️ Consideraciones Importantes

### Limitaciones de Google Sheets API:
- **100 requests por 100 segundos por usuario**
- **300 requests por minuto**
- Para uso intensivo, considera implementar rate limiting

### Resolución de Conflictos:
- La sincronización actual da prioridad a Google Sheets (AppSheet)
- Los timestamps se pueden usar para resolución más sofisticada

### Rendimiento:
- Para tablas grandes (>1000 filas), considera implementar sincronización incremental
- La sincronización completa puede tomar varios segundos

## 🛠️ Desarrollo

### Agregar nuevas tablas:
1. Actualiza `database.types.ts` con los nuevos tipos
2. Agrega métodos en `GoogleSheetsService` para la nueva tabla
3. Actualiza `SyncService` para incluir la nueva tabla
4. Crea la hoja correspondiente en Google Sheets

### Depuración:
- Revisa los logs del servidor para errores de sincronización
- Verifica permisos del Google Sheet
- Confirma que las credenciales sean correctas

## 📞 Soporte

Si encuentras problemas:
1. Verifica que todas las variables de entorno estén configuradas
2. Confirma que el Google Sheet esté compartido con la cuenta de servicio
3. Revisa los logs de la consola para errores específicos
4. Verifica los permisos de la API de Google Sheets