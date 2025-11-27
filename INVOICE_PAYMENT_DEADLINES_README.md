# Sistema de Gestión de Plazos de Facturas Electrónicas

## 📋 Descripción General

Sistema para gestionar y monitorear los plazos de pago de facturas electrónicas enviadas a clientes y empresas. Automatiza el seguimiento de fechas de vencimiento, estados de pago y alertas de facturas vencidas.

## 🔄 Flujo de Facturación

### Semana 1 del Mes Siguiente (Primera Semana de Noviembre para Octubre)
1. **Envío Automático de Reporte**: El sistema envía el resumen de horas trabajadas del mes anterior (octubre) en la pantalla `/pago`
2. **Revisión del Cliente**: El cliente revisa las horas trabajadas y monto
3. **Visto Bueno**: El cliente da su aprobación al monto a pagar

### Semana 2 del Mes Siguiente (Segunda Semana de Noviembre para Octubre)
4. **Emisión de Factura**: Se envía la factura electrónica
5. **Creación de Plazo**: Se crea automáticamente un plazo de pago de **14 días** desde la fecha de emisión
6. **Fecha de Vencimiento**: Se calcula automáticamente (emisión + 14 días)

### Durante el Plazo
7. **Subida de Comprobante**: El cliente sube el comprobante de pago en `/pago`
8. **Aprobación**: El admin aprueba el comprobante
9. **Actualización Automática**: El estado del plazo se marca como "pagado"

## 🗄️ Estructura de la Base de Datos

### Tabla: `invoice_payment_deadlines`

```sql
CREATE TABLE invoice_payment_deadlines (
    id UUID PRIMARY KEY,
    mes_factura TEXT NOT NULL,           -- Mes al que corresponde (YYYY-MM)
    client_id TEXT NOT NULL,
    client_type TEXT NOT NULL,           -- 'cliente' | 'empresa'
    file_path TEXT NOT NULL,             -- Ruta de la factura en storage
    fecha_emision DATE NOT NULL,         -- Fecha de emisión de factura
    fecha_vencimiento DATE NOT NULL,     -- Fecha límite de pago
    estado_pago TEXT DEFAULT 'pendiente',-- 'pendiente' | 'pagado' | 'vencido'
    fecha_pago TIMESTAMP,                -- Fecha de aprobación del comprobante
    dias_plazo INTEGER DEFAULT 14,       -- Días de plazo (configurable)
    nota TEXT,                           -- Notas adicionales
    recordatorio_enviado_7d BOOLEAN,     -- Recordatorio 7 días antes
    recordatorio_enviado_3d BOOLEAN,     -- Recordatorio 3 días antes
    recordatorio_enviado_vencimiento BOOLEAN,
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
- Clientes: solo pueden ver sus propios plazos

### 3. Configurar Plazo por Defecto
El plazo por defecto es **14 días**, pero se puede personalizar por factura.

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
  "mesFactura": "2024-11",
  "fechaVencimiento": "2024-11-28",
  "diasPlazo": 14
}
```

### GET `/api/invoice-payment-status`

#### Obtener todos los plazos pendientes:
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
      "fecha_vencimiento": "2024-11-22",
      "estado_pago": "pendiente",
      "diasRestantes": 5,
      "dias_plazo": 14
    }
  ]
}
```

#### Obtener plazos de un cliente específico:
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
Actualiza la configuración de un plazo.

**Request:**
```json
{
  "mesFactura": "2024-10",
  "clientId": "uuid",
  "clientType": "cliente",
  "diasPlazo": 21,  // Nuevo plazo
  "nota": "Extensión solicitada por el cliente"
}
```

## 🎯 Estados de Pago

| Estado | Descripción | Color |
|--------|-------------|-------|
| **pendiente** | Dentro del plazo, esperando pago | 🟡 Amarillo |
| **pagado** | Comprobante aprobado | 🟢 Verde |
| **vencido** | Pasó la fecha límite sin pagar | 🔴 Rojo |

## 🚨 Alertas y Notificaciones

### Alertas Visuales (Panel /dev)
- **Fila Roja**: Factura vencida
- **Fila Amarilla**: Factura urgente (3 días o menos)
- **Contador de Días**: 
  - Verde: Más de 3 días restantes
  - Naranja pulsante: 3 días o menos
  - Rojo: Vencido

### Sistema de Recordatorios (Próximamente)
- 📧 **7 días antes**: Recordatorio preventivo
- 📧 **3 días antes**: Recordatorio urgente
- 📧 **Día del vencimiento**: Alerta crítica

## 💻 Panel de Administración

### Ubicación
`/dev` → Pestaña "📅 Plazos de Facturas"

### Funcionalidades

#### 1. Vista de Tabla
Muestra todas las facturas pendientes y vencidas con:
- Información del cliente (nombre, cédula)
- Mes de la factura
- Fechas de emisión y vencimiento
- Días restantes (con alertas visuales)
- Estado actual
- Plazo configurado
- Notas adicionales

#### 2. Edición de Plazos
- Clic en el botón ✏️ para editar
- Modificar días de plazo (recalcula fecha de vencimiento automáticamente)
- Agregar/editar notas
- Guardar o cancelar cambios

#### 3. Filtros y Actualización
- Botón "Actualizar" para refrescar datos
- Automáticamente marca facturas vencidas

## 🔄 Integración Automática

### Al Subir Factura (`/dev` → Modal de Facturas)
```typescript
// Automático al subir
1. Validar mes (solo una factura por mes)
2. Crear registro en invoice_payment_deadlines
3. Calcular fecha_vencimiento = fecha_emision + dias_plazo
4. Estado inicial: 'pendiente'
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

### Actualización Diaria de Vencidos
```typescript
// En cada GET getAllPending
1. Obtener fecha actual
2. Buscar deadlines con estado='pendiente' y fecha_vencimiento < hoy
3. Actualizar automáticamente a estado='vencido'
```

## 📱 Flujo de Usuario (Cliente)

### Pantalla `/pago`
1. Ver reporte mensual de horas trabajadas
2. Revisar monto total
3. Dar visto bueno
4. Esperar factura electrónica (segunda semana)
5. Subir comprobante de pago
6. Esperar aprobación

### Próximamente: Vista de Plazos para Clientes
- Ver sus facturas pendientes
- Fechas de vencimiento
- Estado de comprobantes

## 🧪 Testing con Simulador de Fecha

### En Panel `/dev` → Simulador de Fecha
1. Activar simulador de fecha
2. Cambiar a mes deseado (ej: octubre 2024)
3. Subir factura → se asignará al mes simulado
4. Cambiar a noviembre 2024
5. Subir otra factura → se asignará a noviembre
6. Ver plazos → cada factura tiene su mes correcto

### Ejemplo de Prueba
```typescript
// Octubre 2024 (fecha simulada)
Subir factura → mes_factura = "2024-10"
                fecha_emision = "2024-10-15"
                fecha_vencimiento = "2024-10-29"

// Noviembre 2024 (fecha simulada)
Subir factura → mes_factura = "2024-11"
                fecha_emision = "2024-11-15"
                fecha_vencimiento = "2024-11-29"
```

## 🔐 Seguridad

### Políticas RLS
- Solo administradores pueden crear/modificar plazos
- Clientes solo pueden ver sus propios plazos
- Uso de `current_setting('request.jwt.claims')`

### Validaciones
- Un solo plazo por mes por cliente
- Estados válidos: pendiente | pagado | vencido
- Días de plazo mínimo: 1 día
- Fechas inmutables una vez pagado

## 📈 Reportes y Métricas (Futuro)

- Tiempo promedio de pago
- Tasa de pagos a tiempo vs vencidos
- Clientes con historial de retrasos
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
