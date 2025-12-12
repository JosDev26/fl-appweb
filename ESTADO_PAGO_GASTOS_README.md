# Sistema de Estado de Pago de Gastos

## Descripción

Este sistema gestiona el estado de pago de los gastos, permitiendo distinguir entre gastos pagados y pendientes basándose en la aprobación de comprobantes de pago.

## Columna `estado_pago` en tabla `gastos`

### Valores posibles:
- `pendiente`: Gasto no pagado (por defecto al crear/sincronizar)
- `pagado`: Gasto pagado (cuando se aprueba el comprobante del mes)
- `pendiente_mes_actual`: Gasto pendiente del mes actual
- `pendiente_anterior`: Gasto pendiente de meses anteriores

## Flujo de Pago

### 1. Creación de Gastos
Cuando se sincroniza un gasto desde Google Sheets o se crea manualmente:
- **estado_pago**: `pendiente`

### 2. Cliente Sube Comprobante (`/pago/comprobante`)
- Cliente sube comprobante de pago para un mes específico (ej: `2025-01`)
- El comprobante queda en estado `pendiente`

### 3. Aprobación de Comprobante (`/dev`)
Cuando el administrador aprueba un comprobante:

1. **Actualiza el comprobante**:
   ```sql
   UPDATE payment_receipts 
   SET estado = 'aprobado', reviewed_at = NOW()
   WHERE id = receiptId
   ```

2. **Desactiva modoPago**:
   ```sql
   UPDATE usuarios/empresas 
   SET modoPago = false 
   WHERE id = userId
   ```

3. **Actualiza solicitudes mensualidades**:
   ```sql
   UPDATE solicitudes 
   SET monto_pagado = monto_pagado + monto_por_cuota,
       saldo_pendiente = total_a_pagar - monto_pagado
   WHERE id_cliente = userId AND modalidad_pago ILIKE 'mensualidad'
   ```

4. **✨ NUEVO: Marca gastos del mes como pagados**:
   ```sql
   UPDATE gastos 
   SET estado_pago = 'pagado', updated_at = NOW()
   WHERE id_cliente = userId 
     AND fecha >= '2025-01-01' 
     AND fecha <= '2025-01-31'
   ```

5. **Actualiza factura**:
   ```sql
   UPDATE invoice_payment_deadlines 
   SET estado_pago = 'pagado', fecha_pago = NOW()
   WHERE mes_factura = mesPago AND client_id = userId
   ```

6. **Registra ingreso en Google Sheets** (hoja "Ingresos")

## Archivos Modificados

### 1. `add_estado_pago_to_gastos.sql`
Script SQL para agregar la columna `estado_pago` a la tabla `gastos`.

**Ejecutar en Supabase SQL Editor:**
```sql
-- Agregar columna y constraints
ALTER TABLE gastos ADD COLUMN estado_pago TEXT DEFAULT 'pendiente';
ALTER TABLE gastos ADD CONSTRAINT check_estado_pago 
  CHECK (estado_pago IN ('pendiente', 'pagado', 'pendiente_mes_actual', 'pendiente_anterior'));
```

### 2. `app/api/payment-receipts/route.ts`
Actualizado método `PATCH` para marcar gastos como pagados cuando se aprueba un comprobante.

**Nuevo código (líneas ~290-310)**:
```typescript
// Marcar gastos del mes como pagados
if (mesPago) {
  const [year, month] = mesPago.split('-')
  const startDate = `${year}-${month}-01`
  const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0]
  
  const { error: gastosError } = await supabase
    .from('gastos')
    .update({ 
      estado_pago: 'pagado',
      updated_at: fechaAprobacion
    })
    .eq('id_cliente', userId)
    .gte('fecha', startDate)
    .lte('fecha', endDate)
}
```

### 3. `app/api/sync-gastos/route.ts`
Actualizado para incluir `estado_pago: 'pendiente'` al sincronizar gastos desde Sheets.

## Visualización en UI

### Páginas de Solicitudes (`/solicitud/[id]`)
Los gastos se filtran y muestran según su estado:

```typescript
// Gastos Pagados
gastos.filter(g => g.estado_pago === 'pagado')

// Gastos Pendientes (Mes Actual)
gastos.filter(g => g.estado_pago === 'pendiente_mes_actual')

// Gastos Pendientes (Meses Anteriores)
gastos.filter(g => g.estado_pago === 'pendiente_anterior')
```

## Consultas Útiles

### Ver todos los gastos con su estado de pago
```sql
SELECT 
  g.id,
  g.producto,
  g.total_cobro,
  g.fecha,
  g.estado_pago,
  u.nombre as cliente
FROM gastos g
LEFT JOIN usuarios u ON g.id_cliente = u.id
ORDER BY g.fecha DESC;
```

### Ver gastos pagados de un cliente
```sql
SELECT * FROM gastos 
WHERE id_cliente = 'dc8c946d' 
  AND estado_pago = 'pagado'
ORDER BY fecha DESC;
```

### Ver gastos pendientes por mes
```sql
SELECT 
  TO_CHAR(fecha, 'YYYY-MM') as mes,
  COUNT(*) as total_gastos,
  SUM(total_cobro) as total_monto
FROM gastos 
WHERE estado_pago = 'pendiente'
GROUP BY mes
ORDER BY mes DESC;
```

### Marcar manualmente gastos como pagados (si es necesario)
```sql
-- Marcar gastos de enero 2025 como pagados
UPDATE gastos 
SET estado_pago = 'pagado', updated_at = NOW()
WHERE id_cliente = 'usuario_id'
  AND fecha >= '2025-01-01' 
  AND fecha <= '2025-01-31';
```

## Notas Importantes

1. **Los gastos NO se incluyen en `monto_pagado` de solicitudes**: El `monto_pagado` solo cuenta las cuotas mensuales, no los gastos.

2. **Estado automático**: Los gastos se marcan automáticamente como `pagado` cuando se aprueba el comprobante del mes correspondiente.

3. **Sincronización**: Cuando se sincronizan gastos desde Sheets, siempre se crean con estado `pendiente`. El estado solo cambia al aprobar comprobantes.

4. **Grupos de empresas**: Cuando se aprueba el comprobante de una empresa principal, también se marcan como pagados los gastos de las empresas asociadas del mismo mes.

5. **Gastos sin cliente**: Si un gasto no tiene `id_cliente`, no se puede marcar como pagado automáticamente (no hay relación con comprobantes).

## Próximos Pasos (Opcional)

1. **Sincronización bidireccional**: Considerar escribir el `estado_pago` de vuelta a Google Sheets en una columna específica.

2. **Reportes**: Crear reportes de gastos pagados vs pendientes por cliente/mes.

3. **Alertas**: Notificar si hay gastos muy antiguos sin pagar.

4. **Auditoría**: Registrar cuándo y por quién se marcó un gasto como pagado.
