# Guía para Eliminar el Simulador de Fechas en Producción

**OBJETIVO**: Remover completamente la funcionalidad de simulación de fechas antes de desplegar a producción.

**CONTEXTO**: El simulador de fechas ahora es **GLOBAL** (se guarda en Supabase, tabla `system_config`). Cuando está activo, **TODOS** los usuarios ven la fecha simulada. Esta funcionalidad **DEBE** eliminarse en producción para usar siempre fechas reales.

---

## 🚨 CAMBIO IMPORTANTE (Nov 2025)

El sistema de fecha simulada cambió de `localStorage` (por navegador) a **Supabase** (global).

**Nuevo flujo:**
1. La fecha simulada se guarda en `system_config` con `key = 'simulated_date'`
2. Todos los endpoints usan `lib/dateUtils.ts` → `getCurrentDateCR()` que:
   - Primero busca fecha simulada en Supabase
   - Si no existe, usa la **fecha real de Costa Rica (UTC-6)**

---

## ✅ Método Rápido: Solo Desactivar Fecha Simulada

**OPCIÓN 1 - Desde /dev:**
1. Ir a `/dev` → "Simulador de Fecha"
2. Clic en "Restaurar Fecha Real"

**OPCIÓN 2 - Desde Supabase SQL:**
```sql
-- Verificar si hay fecha simulada
SELECT * FROM system_config WHERE key = 'simulated_date';

-- Eliminar fecha simulada
DELETE FROM system_config WHERE key = 'simulated_date';
```

---

## 📋 Checklist Completo para Producción

Si quieres eliminar **completamente** el código del simulador (no solo desactivarlo):

### 1. **Eliminar tabla de Supabase**
```sql
-- Solo si quieres eliminar la tabla completa
DROP TABLE IF EXISTS system_config;
```

### 2. **Modificar `lib/dateUtils.ts`**

Eliminar el bloque de fecha simulada:
// RESULTADO: Solo enviar 'file' y 'monto' en el FormData
```

---

### 4. **Backend: `/app/api/upload-invoice/route.ts`**

#### Eliminar lectura de `simulatedDate` en POST (líneas ~113-115):

```typescript
// ELIMINAR:
const simulatedDate = formData.get('simulatedDate') as string | null

// Y en línea ~195:
// CAMBIAR:
const now = simulatedDate ? new Date(simulatedDate + 'T12:00:00') : new Date()

// POR:
const now = new Date()
```

#### Eliminar uso de fecha simulada en timestamp (línea ~220):

```typescript
// CAMBIAR:
const timestamp = now.getTime()

// POR:
const timestamp = new Date().getTime()
```

#### Eliminar logging (línea ~200):

```typescript
// ELIMINAR:
console.log('📅 Mes de factura:', mesFactura, '(proporcionado:', mesFacturaFromForm, ')')
```

#### Eliminar lectura de `simulatedDate` en GET (líneas ~302-310):

```typescript
// CAMBIAR ESTO:
const simulatedDate = searchParams.get('simulatedDate')
const now = simulatedDate ? new Date(simulatedDate + 'T12:00:00') : new Date()

const mesAnterior = new Date(now)
mesAnterior.setMonth(mesAnterior.getMonth() - 1)
const currentMonth = mesAnterior.getMonth()
const currentYear = mesAnterior.getFullYear()

// POR ESTO:
const currentMonth = new Date().getMonth()
const currentYear = new Date().getFullYear()
```

---

### 5. **Backend: `/app/api/upload-comprobante/route.ts`**

#### Eliminar lectura de `simulatedDate` (líneas ~93-95):

```typescript
// ELIMINAR:
const simulatedDate = formData.get('simulatedDate') as string | null

// Y en línea ~155:
// CAMBIAR:
const now = simulatedDate ? new Date(simulatedDate + 'T12:00:00') : new Date()

// POR:
const now = new Date()
```

#### En línea ~175:

```typescript
// CAMBIAR:
const uploadedAt = simulatedDate 
  ? new Date(simulatedDate + 'T' + new Date().toISOString().split('T')[1]).toISOString()
  : new Date().toISOString()

// POR:
const uploadedAt = new Date().toISOString()
```

---

### 6. **Backend: `/app/api/datos-pago/route.ts`**

Ya usa `new Date()` correctamente. **No requiere cambios**.

---

### 7. **Backend: `/app/api/datos-pago/route.ts`**

#### Eliminar lectura de `simulatedDate` (líneas ~13-17):

```typescript
// ELIMINAR:
const { searchParams } = new URL(request.url)
const simulatedDate = searchParams.get('simulatedDate')
const now = simulatedDate ? new Date(simulatedDate + 'T12:00:00') : new Date()

// Y cambiar línea ~18:
// CAMBIAR:
const inicioMes = new Date(now);

// POR:
const inicioMes = new Date();
```

---

### 8. **Backend: `/app/api/payment-receipts/route.ts`**

Ya usa `new Date()` correctamente. **No requiere cambios**.

---

### 9. **Backend: `/app/api/visto-bueno/route.ts`**

#### Eliminar lectura de `fechaSimulada` (líneas ~29-31):

```typescript
// ELIMINAR:
const { mes, fechaSimulada } = body

// CAMBIAR POR:
const { mes } = body
```

#### Eliminar uso de fecha simulada (líneas ~38-40):

```typescript
// ELIMINAR:
const fechaVistoBueno = fechaSimulada || new Date().toISOString()

// Y en línea ~48:
// CAMBIAR:
fecha_visto_bueno: fechaVistoBueno

// POR:
fecha_visto_bueno: new Date().toISOString()
```

---

### 10. **Frontend: `/app/pago/page.tsx` (actualización)**

#### En función `loadDatosPago()` (líneas ~108-114):

```typescript
// ELIMINAR:
const now = getCurrentDate()
const simulatedDateParam = now ? `?simulatedDate=${now.toISOString().split('T')[0]}` : ''

const response = await fetch(`/api/datos-pago${simulatedDateParam}`, {

// CAMBIAR POR:
const response = await fetch('/api/datos-pago', {
```

---

### 11. **Frontend: `/app/pago/page.tsx` (visto bueno)**

#### En función `handleDarVistoBueno()` (líneas ~165-168):

```typescript
// ELIMINAR del body JSON:
body: JSON.stringify({ 
  mes,
  fechaSimulada: now.toISOString()  // ELIMINAR esta línea
})

// RESULTADO:
body: JSON.stringify({ mes })
```

---

## 🔍 Verificación Post-Eliminación

### Búsqueda de texto para confirmar eliminación completa:

```bash
# En la raíz del proyecto, buscar referencias:
grep -r "simulatedDate" app/
grep -r "fechaSimulada" app/
grep -r "isDateSimulated" app/
grep -r "Simulador de Fecha" app/
grep -r "getCurrentDate" app/
```

**RESULTADO ESPERADO**: Sin coincidencias (o solo en este archivo .md)

---

## ✅ Testing Post-Eliminación

1. **Compilar el proyecto**:
   ```bash
   npm run build
   ```
   Verificar que no hay errores de TypeScript

2. **Verificar localStorage**:
   - Abrir DevTools → Application → Local Storage
   - Confirmar que no hay clave `simulatedDate`

3. **Probar flujos críticos**:
   - Subir factura electrónica en `/dev` → debe usar fecha actual real
   - Subir comprobante de pago en `/pago/comprobante` → debe usar fecha actual real
   - Dar visto bueno en `/pago` → debe registrar mes actual real
   - Ver plazos de facturas en `/dev` → debe calcular con fecha actual real

---

## 🚨 Archivos NO TOCAR

Estos archivos usan `new Date()` correctamente y NO requieren cambios:

- `/app/api/invoice-payment-status/route.ts` ✅
- `/app/api/visto-bueno/route.ts` ✅
- `/app/api/client/route.ts` ✅
- `/app/api/payment-status/route.ts` ✅
- `/lib/supabase.ts` ✅

---

## 📝 Resumen de Cambios

| Archivo | Líneas a Eliminar | Acción |
|---------|-------------------|--------|
| `app/dev/page.tsx` | ~67-71, ~143-157, ~294-309, ~420-430, ~465-473, ~480-530, ~595-601, ~1406, ~1425-1435, ~1495-1510, ~1540-1630 | Eliminar estados, useEffect, funciones (formatInvoiceDate), fecha simulada en loadMonthInvoices y visto bueno, pestaña y sección UI |
| `app/pago/page.tsx` | ~83-92, ~108-114, ~115, ~145, ~165-168 | Eliminar `getCurrentDate()`, `fechaSimulada`, `simulatedDateParam`, usar `new Date()` |
| `app/pago/comprobante/page.tsx` | ~160-165 | Eliminar append de `simulatedDate` |
| `app/api/upload-invoice/route.ts` | ~113-115, ~195, ~200, ~220, ~302-310 | Eliminar lectura y uso de `simulatedDate` en POST y GET, timestamp con fecha real |
| `app/api/upload-comprobante/route.ts` | ~93-95, ~155, ~175 | Eliminar lectura y uso de `simulatedDate` |
| `app/api/datos-pago/route.ts` | ~13-17, ~18 | Eliminar lectura de `simulatedDate` y uso en inicioMes |
| `app/api/visto-bueno/route.ts` | ~29-31, ~38-40, ~48 | Eliminar lectura y uso de `fechaSimulada` |

**TOTAL**: ~205 líneas eliminadas, 7 archivos modificados

---

## ⚠️ IMPORTANTE

- **HACER BACKUP** antes de eliminar código
- **PROBAR EN STAGING** antes de producción
- **EJECUTAR TESTS** completos después de cambios
- **REVISAR LOGS** en producción por 48 horas después del deploy

---

**Fecha de creación**: 2025-11-26  
**Versión del sistema**: Pre-producción con simulador activo  
**Próximo paso**: Ejecutar eliminación antes de primer deploy a producción
