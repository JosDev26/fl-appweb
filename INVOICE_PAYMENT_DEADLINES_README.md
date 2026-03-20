# Sistema de Gestión de Facturas Electrónicas

## 📋 Descripción General

Sistema para gestionar facturas electrónicas enviadas a clientes y empresas. Registra el estado de pago de cada factura mensual.

## 🔄 Flujo de Facturación

### Semana 1 del Mes Siguiente (Primera Semana de Noviembre para Octubre)
1. **Envío Automático de Reporte**: El sistema envía el resumen de horas trabajadas del mes anterior (octubre) en la pantalla `/pago`
2. **Revisión del Cliente**: El cliente revisa las horas trabajadas y monto
3. **Visto Bueno**: El cliente da su aprobación al monto a pagar

### Semana 2 del Mes Siguiente (Segunda Semana de Noviembre para Octubre)
4. **Emisión de Factura**: Se sube la factura electrónica (XML/PDF)
5. **Registro**: Se crea automáticamente un registro en la tabla

### Proceso de Pago
6. **Subida de Comprobante**: El cliente sube el comprobante de pago en `/pago`
7. **Aprobación**: El admin aprueba el comprobante
8. **Actualización Automática**: El estado se marca como "pagado"

## 🗄️ Estructura de la Base de Datos

### Tabla: `invoice_payment_deadlines`

```sql
CREATE TABLE invoice_payment_deadlines (
    id UUID PRIMARY KEY,
    mes_factura TEXT NOT NULL,           -- Mes al que corresponde (YYYY-MM)
    client_id TEXT NOT NULL,
    client_type TEXT NOT NULL,           -- 'cliente' | 'empresa'
    file_path TEXT NOT NULL,             -- Ruta de la factura en storage
    fecha_emision DATE NOT NULL,         -- Fecha en que se subió la factura
    estado_pago TEXT DEFAULT 'pendiente',-- 'pendiente' | 'pagado'
    fecha_pago TIMESTAMP,                -- Fecha de aprobación del comprobante
    nota TEXT,                           -- Notas adicionales
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(mes_factura, client_id, client_type)
);
```

## 🔧 Configuración del Sistema

### 1. Ejecutar Script SQL
```bash
# En Supabase SQL Editor, ejecutar:
create_invoice_payment_deadlines_table.sql
```

### 2. Verificar Políticas RLS
- Admin: acceso completo
- Clientes: solo pueden ver sus propios registros

## 📊 API Endpoints

### POST `/api/upload-invoice`
Sube una factura y crea automáticamente el plazo de pago.

**Request:**
```typescript
FormData {
  file: File,
  clientId: string,
  clientType: 'cliente' | 'empresa',
  simulatedDate?: string  // Opcional: para testing
}
```

**Response:**
```json
{
  "success": true,
  "mesFactura": "2024-11"
}
```

### GET `/api/invoice-payment-status`

#### Obtener todas las facturas pendientes:
```
GET /api/invoice-payment-status?getAllPending=true
```

**Response:**
```json
{
  "success": true,
  "deadlines": [
    {
      "id": "uuid",
      "mes_factura": "2024-10",
      "clientName": "Juan Pérez",
      "clientCedula": "123456789",
      "fecha_emision": "2024-11-08",
      "estado_pago": "pendiente"
    }
  ]
}
```

#### Obtener facturas de un cliente específico:
```
GET /api/invoice-payment-status?clientId={id}&clientType={tipo}
```

### POST `/api/invoice-payment-status`
Marca una factura como pagada (se llama automáticamente al aprobar comprobante).

**Request:**
```json
{
  "mesFactura": "2024-10",
  "clientId": "uuid",
  "clientType": "cliente",
  "fechaPago": "2024-11-20T10:30:00Z"
}
```

### PUT `/api/invoice-payment-status`
Actualiza la nota de una factura.

**Request:**
```json
{
  "mesFactura": "2024-10",
  "clientId": "uuid",
  "clientType": "cliente",
  "nota": "Pago parcial acordado"
}
```

## 🎯 Estados de Pago

| Estado | Descripción | Color |
|--------|-------------|-------|
| **pendiente** | Esperando pago | 🟡 Amarillo |
| **pagado** | Comprobante aprobado | 🟢 Verde |

## 💻 Panel de Administración

### Ubicación
`/dev` → Pestaña "📅 Facturas"

### Funcionalidades

#### 1. Vista de Tabla
Muestra todas las facturas pendientes con:
- Información del cliente (nombre, cédula)
- Mes de la factura
- Fecha de emisión
- Estado actual
- Notas adicionales

#### 2. Edición de Notas
- Agregar/editar notas
- Guardar o cancelar cambios

#### 3. Actualización
- Botón "Actualizar" para refrescar datos

## 🔄 Integración Automática

### Al Subir Factura (`/dev` → Modal de Facturas)
```typescript
// Automático al subir
1. Validar mes (solo una factura por mes)
2. Crear registro en invoice_payment_deadlines
3. Estado inicial: 'pendiente'
```

### Al Aprobar Comprobante (`/dev` → Vista Principal → Aprobar)
```typescript
// Automático al aprobar
1. Actualizar payment_receipt.estado = 'aprobado'
2. Desactivar usuario.modoPago = false
3. Buscar invoice_payment_deadlines por mes_pago
4. Actualizar estado_pago = 'pagado'
5. Guardar fecha_pago
```

## 📱 Flujo de Usuario (Cliente)

### Pantalla `/pago`
1. Ver reporte mensual de horas trabajadas
2. Revisar monto total
3. Dar visto bueno
4. Esperar factura electrónica (segunda semana)
5. Subir comprobante de pago
6. Esperar aprobación

## 🧪 Testing con Simulador de Fecha

### En Panel `/dev` → Simulador de Fecha
1. Activar simulador de fecha
2. Cambiar a mes deseado (ej: octubre 2024)
3. Subir factura → se asignará al mes simulado

### Ejemplo de Prueba
```typescript
// Octubre 2024 (fecha simulada)
Subir factura → mes_factura = "2024-10"
                fecha_emision = "2024-10-15"
```

## 🔐 Seguridad

### Políticas RLS
- Solo administradores pueden crear/modificar registros
- Clientes solo pueden ver sus propias facturas
- Uso de `current_setting('request.jwt.claims')`

### Validaciones
- Un solo registro por mes por cliente
- Estados válidos: pendiente | pagado
- Fechas inmutables una vez pagado

## 📈 Reportes y Métricas (Futuro)

- Tiempo promedio de pago
- Análisis de flujo de caja

## 🔧 Mantenimiento

### Limpieza de Datos Antiguos
```sql
-- Archivar plazos pagados antiguos (opcional)
UPDATE invoice_payment_deadlines
SET nota = CONCAT(nota, ' [ARCHIVADO]')
WHERE estado_pago = 'pagado'
  AND fecha_pago < NOW() - INTERVAL '1 year';
```

### Backup Recomendado
- Backup diario de `invoice_payment_deadlines`
- Retención de 90 días mínimo
- Incluir en backup general de Supabase

## 📞 Soporte

Para problemas o consultas:
1. Verificar logs en Supabase Dashboard
2. Revisar estado de RLS policies
3. Validar integridad de fechas
4. Confirmar sincronización con payment_receipts

---

**Versión:** 1.0  
**Última Actualización:** Noviembre 2024  
**Compatibilidad:** Next.js 14+, Supabase, TypeScript
