# Guía para Eliminar el Simulador de Fechas en Producción

**OBJETIVO**: Remover completamente la funcionalidad de simulación de fechas antes de desplegar a producción.

**CONTEXTO**: El simulador de fechas (`localStorage.simulatedDate`) permite testear el flujo de facturación sin esperar al mes siguiente. Esta funcionalidad **DEBE** eliminarse en producción para usar siempre fechas reales.

---

## 📋 Checklist de Archivos a Modificar

### 1. **Frontend: `/app/dev/page.tsx`**

#### Eliminar estado y lógica del simulador:

```typescript
// ELIMINAR ESTOS ESTADOS (líneas ~67-71):
const [simulatedDate, setSimulatedDate] = useState<string>('')
const [isDateSimulated, setIsDateSimulated] = useState(false)
const [currentRealDate, setCurrentRealDate] = useState<string>('')
const [isMounted, setIsMounted] = useState(false)
```

#### Eliminar useEffect de inicialización (líneas ~143-157):

```typescript
// ELIMINAR TODO ESTE useEffect:
useEffect(() => {
  setIsMounted(true)
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]
  setCurrentRealDate(dateStr)
  
  const savedSimulatedDate = localStorage.getItem('simulatedDate')
  if (savedSimulatedDate) {
    setSimulatedDate(savedSimulatedDate)
    setIsDateSimulated(true)
  } else {
    setSimulatedDate(dateStr)
  }
}, [])
```

#### Eliminar funciones del simulador (líneas ~480-530):

```typescript
// ELIMINAR ESTAS FUNCIONES:
const activateSimulation = () => { ... }
const resetSimulation = () => { ... }
const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => { ... }
```

#### Eliminar pestaña del simulador en UI (líneas ~1495-1510):

```typescript
// ELIMINAR ESTE BOTÓN:
<button
  className={`${styles.tab} ${activeTab === 'date-simulator' ? styles.tabActive : ''}`}
  onClick={() => setActiveTab('date-simulator')}
>
  🗓️ Simulador de Fecha
</button>
```

#### Eliminar sección completa del simulador (líneas ~1540-1630):

```typescript
// ELIMINAR TODO ESTE BLOQUE:
{activeTab === 'date-simulator' && (
  <div className={styles.section}>
    <h2 className={styles.sectionTitle}>Simulador de Fecha del Sistema</h2>
    ...
  </div>
)}
```

#### En función `uploadInvoice()` (líneas ~420-430):

```typescript
// ELIMINAR ESTAS LÍNEAS:
if (isMounted && isDateSimulated && simulatedDate) {
  formData.append('simulatedDate', simulatedDate)
}

// RESULTADO: Solo enviar archivo, clientId, clientType, mesFactura
```

#### En función `loadMonthInvoices()` (líneas ~465-473):

```typescript
// CAMBIAR ESTO:
const simulatedDateStr = typeof window !== 'undefined' ? localStorage.getItem('simulatedDate') : null
const url = simulatedDateStr 
  ? `/api/upload-invoice?getAllMonth=true&simulatedDate=${simulatedDateStr}`
  : '/api/upload-invoice?getAllMonth=true'
const response = await fetch(url)

// POR ESTO:
const response = await fetch('/api/upload-invoice?getAllMonth=true')
```

#### En función `formatInvoiceDate()` (líneas ~294-309):

```typescript
// ELIMINAR TODA LA FUNCIÓN:
const formatInvoiceDate = (fileName: string, fallbackDate: string) => {
  const parts = fileName.split('_')
  if (parts.length >= 3 && !isNaN(Number(parts[0]))) {
    const timestamp = Number(parts[0])
    return new Date(timestamp).toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  return formatDate(fallbackDate)
}

// Y cambiar su uso (línea ~1406):
// CAMBIAR:
<td>{formatInvoiceDate(invoice.name, invoice.created_at)}</td>

// POR:
<td>{formatDate(invoice.created_at)}</td>
```

#### En modal de factura (líneas ~1425-1435):

```typescript
// ELIMINAR ESTE BLOQUE COMPLETO:
{isMounted && isDateSimulated && simulatedDate && (
  <p style={{ color: '#f59e0b', fontWeight: 'bold' }}>
    📅 Mes de factura: {new Date(simulatedDate + 'T12:00:00').toLocaleDateString('es-CR', { year: 'numeric', month: 'long' })}
  </p>
)}
{isMounted && !isDateSimulated && (
  <p>
    📅 Mes de factura: {new Date().toLocaleDateString('es-CR', { year: 'numeric', month: 'long' })}
  </p>
)}
```

#### En función `loadClientesVistoBueno()` (líneas ~595-601):

```typescript
// CAMBIAR ESTO:
const simulatedDateStr = isMounted ? localStorage.getItem('simulatedDate') : null
const now = simulatedDateStr ? new Date(simulatedDateStr + 'T12:00:00') : new Date()
const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

console.log('📅 Verificando visto bueno para mes:', mes, simulatedDateStr ? '(simulado)' : '(real)')

// POR ESTO:
const now = new Date()
const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
```

---

### 2. **Frontend: `/app/pago/page.tsx`**

#### Eliminar función `getCurrentDate()` (líneas ~83-92):

```typescript
// ELIMINAR ESTA FUNCIÓN:
const getCurrentDate = () => {
  if (typeof window !== 'undefined') {
    const simulatedDate = localStorage.getItem('simulatedDate')
    if (simulatedDate) {
      return new Date(simulatedDate + 'T12:00:00')
    }
  }
  return new Date()
}
```

#### Reemplazar llamadas a `getCurrentDate()` con `new Date()`:

```typescript
// CAMBIAR ESTO (líneas ~115, ~145):
const now = getCurrentDate()

// POR ESTO:
const now = new Date()
```

---

### 3. **Frontend: `/app/pago/comprobante/page.tsx`**

#### En función `handleSubmit()` (líneas ~160-165):

```typescript
// ELIMINAR ESTAS LÍNEAS:
const simulatedDate = localStorage.getItem('simulatedDate')
if (simulatedDate) {
  formData.append('simulatedDate', simulatedDate)
}

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
