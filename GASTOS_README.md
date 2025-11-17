# Tabla Gastos - Documentación

## 📊 Estructura de la Tabla

### Google Sheets "Gastos" → Supabase `gastos`

| Sheets | Columna | Supabase | Tipo | Descripción |
|--------|---------|----------|------|-------------|
| A | ID_Gasto | id | text | ID único del gasto (PK) |
| B | ID_Asociacion | id_asociacion | text | ID de asociación |
| C o D | ID_Solicitud / ID_Caso | id_caso | text | ID del caso/solicitud (la que tenga dato) |
| G | ID_Responsable | id_responsable | text | FK a funcionarios.id |
| I | Fecha | fecha | date | Fecha del gasto (MM/DD/YYYY) |
| K | Producto | producto | text | Descripción del producto/servicio |
| P | Total_Cobro | total_cobro | numeric | Total a cobrar (₡8,215 → 8215.00) |

## 📝 Archivos Creados

1. **`create_gastos_table.sql`** - Script para crear la tabla en Supabase
2. **`app/api/sync-gastos/route.ts`** - Endpoint para sincronizar desde Sheets
3. **`lib/database.types.ts`** - Tipos TypeScript actualizados

## 🚀 Uso

### 1. Crear la tabla en Supabase
```sql
-- Ejecutar: create_gastos_table.sql
```

### 2. Sincronizar datos
```bash
POST /api/sync-gastos
```

### 3. Verificar sincronización
```bash
GET /api/sync-gastos
```

## ⚙️ Lógica de Sincronización

### ID_Caso (Columna C o D)
```typescript
const idSolicitud = row[2]  // C: ID_Solicitud
const idCasoCol = row[3]    // D: ID_Caso
const idCaso = idSolicitud || idCasoCol || null
```
Toma el valor de C, si está vacío toma D.

### Fecha (Columna I)
```typescript
// Input: "10/30/2025" (MM/DD/YYYY)
// Output: "2025-10-30" (YYYY-MM-DD)
```

### Total_Cobro (Columna P)
```typescript
// Input: "₡8,215"
// Output: 8215.00
// Remueve: ₡, $, comas
```

## 🔒 Foreign Keys

- `id_responsable` → `funcionarios.id` (ON DELETE SET NULL)

## 📋 Índices Creados

- `idx_gastos_id_asociacion` - Para búsquedas por asociación
- `idx_gastos_id_caso` - Para búsquedas por caso/solicitud
- `idx_gastos_id_responsable` - Para búsquedas por responsable
- `idx_gastos_fecha` - Para ordenamiento por fecha (DESC)
- `idx_gastos_total_cobro` - Para filtros por monto

## ✅ Ejemplo de Registro

### Entrada (Google Sheets):
```
A: c106b161
B: c106b161
C: (vacío)
D: c106b161
G: abc123
I: 10/30/2025
K: Copia Llave
P: ₡8,215
```

### Salida (Supabase):
```json
{
  "id": "c106b161",
  "id_asociacion": "c106b161",
  "id_caso": "c106b161",
  "id_responsable": "abc123",
  "fecha": "2025-10-30",
  "producto": "Copia Llave",
  "total_cobro": 8215.00
}
```

## 🧪 Testing

1. Verificar que la tabla existe:
```sql
SELECT * FROM gastos LIMIT 5;
```

2. Sincronizar datos:
```bash
POST /api/sync-gastos
```

3. Verificar resultados:
```sql
SELECT 
  id, 
  producto, 
  total_cobro,
  fecha,
  id_responsable
FROM gastos
ORDER BY fecha DESC;
```
