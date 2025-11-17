# Sincronización Bidireccional - Clientes ↔ Usuarios

## 🔄 Cómo Funciona

La sincronización bidireccional mantiene los datos consistentes entre Google Sheets (Clientes) y Supabase (usuarios), permitiendo cambios en ambas direcciones.

## 📝 Flujo de Sincronización

### Paso 1: Sheets → Supabase (Prioridad)
1. Lee todos los registros de Google Sheets "Clientes"
2. Lee todos los usuarios de Supabase
3. Compara los IDs para determinar operaciones:
   - **Nuevos en Sheets** → INSERT en Supabase
   - **Existentes modificados** → UPDATE en Supabase
   - **Eliminados de Sheets** → DELETE en Supabase

### Paso 2: Supabase → Sheets (Actualización)
1. Lee todos los usuarios de Supabase
2. Lee registros actuales de Sheets para preservar columnas G e I
3. Construye nuevas filas:
   - **Preserva columna G** (AppSheet) - Lee valor actual
   - **Preserva columna I** (IVA_Perc) - Lee valor actual o usa nuevo si vacío
   - Actualiza resto de columnas desde Supabase
4. Sobrescribe la hoja (excepto headers)

## 🔒 Columnas Preservadas

### Columna E (Tipo_Identificación)
```typescript
// Antes de escribir:
const columnE = currentRow[4] || ''; // Lee valor actual

// Al escribir:
preserved?.columnE || usuario.tipo_cedula || '',  // Mantiene valor o usa nuevo
```

**Prioridad**: Valor actual en Sheets > Valor de Supabase > Vacío

### Columna G (AppSheet)
```typescript
// Antes de escribir:
const columnG = currentRow[6] || ''; // Lee valor actual

// Al escribir:
preserved?.columnG || '',  // Mantiene el valor leído
```

**Nunca** se sobrescribe, siempre se mantiene el valor que tenía.

### Columna I (IVA_Perc)
```typescript
// Antes de escribir:
const columnI = currentRow[8] || ''; // Lee valor actual

// Al escribir:
preserved?.columnI || (usuario.iva_perc ? String(usuario.iva_perc) : ''),
```

**Prioridad**: Valor actual en Sheets > Valor de Supabase > Vacío

## 🚀 Endpoints Disponibles

### 1. Sincronización Bidireccional (Recomendado)
```bash
POST /api/sync
Content-Type: application/json

{
  "direction": "bidirectional"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Bidireccional: 2 insertados, 15 actualizados, 1 eliminados",
  "details": {
    "clientesToUsuarios": {
      "processed": 18,
      "inserted": 2,
      "updated": 15,
      "deleted": 1,
      "errors": 0
    },
    "usuariosToClientes": {
      "records": 19,
      "deleted": 0,
      "totalInSupabase": 19,
      "totalInSheetsBefore": 18
    },
    "summary": {
      "totalInserted": 2,
      "totalUpdated": 15,
      "totalDeleted": 1,
      "errors": 0
    }
  }
}
```

### 2. Sheets → Supabase (Solo lectura de Sheets)
```bash
POST /api/sync
Content-Type: application/json

{
  "direction": "sheets-to-supabase"
}
```

**Usa cuando:**
- Hiciste cambios en AppSheet/Sheets
- Quieres importar datos nuevos desde Sheets
- Prefieres no modificar Sheets

### 3. Supabase → Sheets (Actualiza Sheets)
```bash
POST /api/sync
Content-Type: application/json

{
  "direction": "supabase-to-sheets"
}
```

**Usa cuando:**
- Hiciste cambios en Supabase directamente
- Creaste usuarios nuevos vía API/frontend
- Necesitas actualizar Sheets con datos de la base de datos

**⚠️ IMPORTANTE:** Siempre preserva columnas G e I

### 4. Automático (Bidireccional por defecto)
```bash
GET /api/sync/auto
```

Sin parámetros ejecuta sincronización bidireccional completa.

## 📋 Casos de Uso

### Caso 1: Agregar cliente en AppSheet
1. Usuario crea nuevo cliente en AppSheet
2. AppSheet actualiza Google Sheets
3. Ejecutar: `POST /api/sync { "direction": "sheets-to-supabase" }`
4. Resultado: Cliente insertado en Supabase

### Caso 2: Modificar cliente en la web
1. Usuario cambia teléfono en aplicación web
2. Frontend actualiza Supabase
3. Ejecutar: `POST /api/sync { "direction": "supabase-to-sheets" }`
4. Resultado: Teléfono actualizado en Sheets (G e I preservadas)

### Caso 3: Eliminar cliente en AppSheet
1. Usuario elimina cliente en AppSheet
2. AppSheet elimina fila de Google Sheets
3. Ejecutar: `POST /api/sync { "direction": "sheets-to-supabase" }`
4. Resultado: Usuario eliminado de Supabase

### Caso 4: Sincronización programada
1. Configurar cron job para ejecutar cada hora
2. Ejecutar: `GET /api/sync/auto`
3. Resultado: Ambos sistemas actualizados automáticamente

## 🔧 Configuración de Cron

Para sincronización automática cada hora, usar el archivo `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/sync/auto",
    "schedule": "0 * * * *"
  }]
}
```

O usar un servicio externo como cron-job.org:
```
URL: https://tu-dominio.vercel.app/api/sync/auto
Horario: 0 * * * * (cada hora)
```

## 🧪 Probar Sincronización

### Test Manual

1. **Hacer cambio en Sheets:**
   - Cambiar nombre de un cliente
   - Ejecutar sync bidireccional
   - Verificar en Supabase que se actualizó

2. **Hacer cambio en Supabase:**
   ```sql
   UPDATE usuarios SET telefono = '8888-9999' WHERE id = 'ABC123';
   ```
   - Ejecutar sync bidireccional
   - Verificar en Sheets que se actualizó
   - **VERIFICAR** que columnas G e I no cambiaron

3. **Agregar registro nuevo:**
   - Sheets: Agregar fila con ID_Cliente nuevo
   - Ejecutar sync
   - Verificar que aparece en Supabase
   - Ejecutar sync de nuevo
   - Verificar que Sheets mantiene columna G vacía

### Test Automático

```bash
# Validar configuración
GET /api/validate-config

# Ver estadísticas
GET /api/sync (sin body)

# Probar lectura
GET /api/sync/test-read
```

## ⚠️ Advertencias

### NO HACER:
- ❌ Editar manualmente columna E (Tipo_Identificación) en Sheets - se preserva
- ❌ Editar manualmente columna G en Sheets (es de AppSheet)
- ❌ Confiar en que IVA_Perc de Supabase sobrescribirá Sheets
- ❌ Ejecutar sync mientras AppSheet está procesando cambios
- ❌ Modificar estructura de columnas sin actualizar `sync-config.ts`

### SÍ HACER:
- ✅ Ejecutar sync después de cambios importantes
- ✅ Verificar logs en consola para detectar errores
- ✅ Hacer backup antes de migraciones
- ✅ Probar en desarrollo antes de producción
- ✅ Configurar sincronización automática

## 📊 Monitoreo

### Logs en Consola

La sincronización imprime logs detallados:

```
🔄 Iniciando sincronización bidireccional (AppSheet tiene prioridad)...
🔄 Iniciando sincronización Clientes → usuarios...
📝 Procesando inserciones y actualizaciones...
✅ Usuario ABC123 actualizado: Juan Pérez
✅ Usuario EMP-001 insertado: Empresa S.A.
🗑️ Usuario OLD123 eliminado de Supabase
📊 Resultado: Clientes→usuarios: 1 insertados, 15 actualizados, 1 eliminados, 0 errores

🔄 Iniciando sincronización usuarios → Clientes...
📋 Preservando columnas E, G e I para 17 registros existentes
📝 Escribiendo 17 registros a hoja Clientes...
✅ Datos escritos exitosamente a hoja Clientes
✅ Preservadas: Columna E (Tipo_Identificación), Columna G (AppSheet) y Columna I (IVA_Perc)
```

### Respuesta de API

Siempre incluye:
- `success`: boolean
- `message`: string con resumen
- `details`: objeto con estadísticas detalladas

## 🔍 Troubleshooting

### "Error: clientesData undefined"
- Revisar credenciales de Google Sheets
- Verificar que la hoja "Clientes" existe
- Verificar permisos de la Service Account

### "Columnas E, G o I se borraron"
- Verificar que `googleSheets.ts` tiene la lógica de preservación para E, G e I
- Revisar historial de versiones de Sheets
- Restaurar desde backup

### "Tipo_Identificación desapareció"
- La columna E ahora está preservada
- Verificar que la lógica de preservación está activa
- Ejecutar sync nuevamente para restaurar desde Sheets

### "IDs perdiendo letras"
- Verificar que ejecutaste `migrate_usuarios_id_to_text.sql`
- Confirmar que columna `id` es tipo `text` en Supabase
- Verificar `sync-config.ts` tiene `transform: (value) => String(value)`

### "Registros duplicados"
- Verificar que IDs son únicos en ambos lados
- Ejecutar sync bidireccional completo
- Limpiar duplicados manualmente si es necesario

## 📚 Archivos Relacionados

- `lib/sync-config.ts` - Configuración de mapeo de columnas
- `lib/googleSheets.ts` - Funciones read/write de Sheets
- `lib/syncService.ts` - Lógica de sincronización
- `app/api/sync/route.ts` - Endpoint principal
- `app/api/sync/auto/route.ts` - Endpoint para cron jobs
