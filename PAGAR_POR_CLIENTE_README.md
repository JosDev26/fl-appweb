# Pagar por Cliente — Panel `/dev`

Herramienta administrativa que permite registrar un pago **en nombre de un cliente o empresa** directamente desde el panel de desarrollo, sin que el cliente tenga que subir el comprobante por su cuenta. El flujo realiza el upload del archivo y la aprobación del comprobante en un solo paso.

---

## Ubicación

Panel de administración `/dev` → ítem de navegación **"Pagar por Cliente"** (`activeSection === 'pagar-cliente'`).

---

## Flujo completo paso a paso

### 1. Cargar lista de clientes

Al entrar a la sección (o al presionar **"Refrescar Clientes"**) se llama a `loadClientesParaPago()`, que hace dos requests en paralelo:

```
GET /api/client?tipo=empresa&all=true
GET /api/client?tipo=cliente
```

Los resultados se combinan en un solo arreglo ordenado alfabéticamente. El selector agrupa visualmente las opciones en dos `<optgroup>`: **Empresas** y **Clientes**. Cada opción muestra nombre + cédula si existe.

---

### 2. Seleccionar mes de pago

Se despliegan los **últimos 12 meses** (sin incluir el mes actual) generados por `getMesesPago()`. El valor se almacena en formato `YYYY-MM`.

> Si se selecciona un mes que no sea el mes anterior ni el actual, la UI muestra una advertencia en amarillo indicando que el monto auto-calculado refleja la deuda actual y puede no corresponder exactamente a ese mes histórico.

---

### 3. Calcular monto adeudado automáticamente

Cada vez que cambia el cliente **o** el mes, se ejecuta `loadMontoPago(clientId, tipoCliente)`:

```
GET /api/datos-pago
Headers:
  x-user-id: <id del cliente seleccionado>
  x-tipo-cliente: 'empresa' | 'cliente'
Query (opcional):
  simulatedDate=YYYY-MM-DD   ← si la fecha simulada global está activa
```

#### Qué calcula `GET /api/datos-pago`

El endpoint determina el rango del mes anterior (o el mes del parámetro `?mes=`) y acumula todos los conceptos pendientes del cliente:

| Concepto | Tabla | Condición |
|---|---|---|
| Trabajos por hora del mes | `trabajos_por_hora` | Casos del cliente, rango de fechas del mes |
| Trabajos por hora atrasados | `trabajos_por_hora` | `estado_pago='pendiente'`, hasta 12 meses atrás |
| Gastos del mes | `gastos` | `id_cliente`, rango de fechas |
| Gastos atrasados | `gastos` | `estado_pago='pendiente'`, hasta 12 meses atrás |
| Mensualidades | `solicitudes` | `modalidad_pago ILIKE 'mensualidad'` |
| Servicios profesionales del mes | `servicios_profesionales` | No cancelados, rango de fechas |
| Servicios profesionales atrasados | `servicios_profesionales` | `estado_pago='pendiente'`, hasta 12 meses atrás |

**Cálculo de totales:**

```
subtotal = costoTPH + montoTPHAtrasados + totalGastos + gastosAtrasados
         + totalMensualidades + totalServiciosProfesionales + serviciosAtrasados

IVA = (costoTPH + montoTPHAtrasados) × ivaPerc + IVA extraído de mensualidades

totalAPagar = subtotal + IVA
```

- La `tarifaHora` y el `ivaPerc` (porcentaje IVA) se leen directamente de la tabla `empresas`.
- Para mensualidades con `se_cobra_iva = true`, el IVA se extrae del monto (`subtotal = monto / 1.13`).
- Los gastos (`total_cobro`) **no** llevan IVA adicional; ya es el monto final.

**Grupos de empresas:** si el cliente seleccionado es empresa principal de un grupo (`grupos_empresas`), el endpoint calcula los datos de cada empresa miembro de forma independiente y devuelve `granTotalAPagar` (suma de la empresa principal + todas las asociadas). La UI utiliza `granTotalAPagar` como monto por defecto.

La respuesta también incluye `moneda`, `desglose.honorarios` y `desglose.gastos` que se muestran debajo del campo de monto.

El monto se puede editar manualmente. Si el valor difiere del calculado, se muestra una advertencia en naranja.

---

### 4. Adjuntar comprobante

Campo de archivo (`<input type="file">`):
- Formatos aceptados: **PDF, JPG, JPEG, PNG**
- Tamaño máximo: **5 MB** (validado en el cliente antes de asignar el archivo)

---

### 5. Revisar y confirmar

Cuando los cuatro campos están completos (cliente, mes, monto, archivo) aparece el botón **"Revisar y Registrar Pago"**. Al presionarlo se activa `pagoConfirmando = true` y se muestra un resumen:

- Nombre del cliente y tipo (empresa/cliente)
- Mes de pago
- Monto formateado
- Nombre del archivo adjunto

Hay dos acciones:
- **Confirmar Pago** → ejecuta `handlePagarPorCliente()`
- **Cancelar** → vuelve al formulario

---

### 6. Ejecución del pago — `handlePagarPorCliente()`

El proceso ocurre en **dos pasos secuenciales**:

#### Paso 6.1 — Subir comprobante

```
POST /api/upload-comprobante
Headers:
  x-user-id: <id>
  x-tipo-cliente: 'empresa' | 'cliente'
Body (multipart/form-data):
  file: <archivo>
  monto: <string numérico>
  mes_pago: YYYY-MM
  simulatedDate?: YYYY-MM-DD
```

**Validaciones de seguridad del endpoint:**

1. **Rate limit:** 10 uploads por hora por IP.
2. **Autenticación:** se requiere `x-user-id` en el header.
3. **Duplicado:** si ya existe un comprobante `pendiente` o `aprobado` para el mismo `(user_id, tipo_cliente, mes_pago)`, se rechaza con 400.
4. **Tamaño:** máximo 5 MB.
5. **MIME type:** solo `application/pdf`, `image/jpeg`, `image/png`.
6. **Extensión:** solo `.pdf`, `.jpg`, `.jpeg`, `.png`.
7. **Magic bytes (firma del archivo):** se validan los primeros bytes del archivo para prevenir spoofing de extensión (p.ej. un `.exe` renombrado a `.pdf` es rechazado).
8. **Sanitización del nombre:** se eliminan caracteres especiales y path traversal; nombre truncado a 100 caracteres.

**Si pasa las validaciones:**

- Se sube el archivo a Supabase Storage en el bucket `payment-receipts` con la ruta `{userId}/{timestamp}{extension}`.
- Se inserta un registro en la tabla `payment_receipts` con `estado = 'pendiente'`.
- Si la inserción en BD falla, el archivo ya subido se elimina de Storage (rollback manual).
- Se genera una URL firmada (válida 1 hora) para preview y se devuelve junto con el `id` del comprobante.

#### Paso 6.2 — Aprobar comprobante inmediatamente

Con el `receiptId` obtenido en el paso anterior:

```
PATCH /api/payment-receipts
Body (JSON):
  { receiptId, action: 'aprobar', nota: 'Pago registrado desde panel admin para <mes>' }
```

- Requiere sesión de **dev admin** activa (verificada por `verifyDevAdminSession`).
- Llama al RPC de Supabase `approve_payment_receipt` de forma atómica, que:
  - Cambia `estado` del comprobante a `'aprobado'`.
  - Actualiza `estado_pago` de trabajos, gastos y servicios del mes a `'pagado'`.
  - Evalúa si el cliente sigue teniendo datos pendientes (`cliente_tiene_datos_pendientes`); si no los tiene, desactiva `modoPago`.
- **Grupos:** si la empresa es principal de un grupo, se recorre cada empresa miembro. Para cada una se verifica si tiene datos pendientes antes de desactivar `modoPago`, y se actualizan sus solicitudes de mensualidad.

---

### 7. Resultado

Si todo salió bien, se muestra un banner verde con:

```
Pago registrado exitosamente para <Nombre> - <Mes> - <Símbolo><Monto>
```

El símbolo de moneda (`$` o `₡`) se determina desde `pagoDetalles.moneda`.

Si hubo error en cualquier paso, se muestra un banner rojo con el detalle. Los errores parciales (comprobante subido pero sin aprobar) instruyen al admin a aprobarlo manualmente desde la sección de Comprobantes.

Tras el éxito se limpia el formulario (archivo y estado de confirmación), pero se conservan el cliente y el mes seleccionados para facilitar pagos de meses consecutivos.

---

## Diagrama de flujo simplificado

```
Admin selecciona cliente + mes
        │
        ▼
GET /api/datos-pago ──► Calcula monto adeudado (TPH + gastos + mensualidades + SP)
        │
        ▼
Admin adjunta comprobante (PDF/JPG/PNG, ≤ 5MB)
        │
        ▼
Admin presiona "Confirmar Pago"
        │
        ▼
POST /api/upload-comprobante
  ├─ Validar seguridad (magic bytes, MIME, extensión, tamaño, duplicados)
  ├─ Subir a Supabase Storage
  └─ Insertar en payment_receipts (estado='pendiente') → devuelve receiptId
        │
        ▼
PATCH /api/payment-receipts { action: 'aprobar' }
  ├─ RPC approve_payment_receipt (atómico)
  │    ├─ estado → 'aprobado'
  │    ├─ Marca TPH/gastos/SP del mes como 'pagado'
  │    └─ Desactiva modoPago si no quedan datos pendientes
  └─ Si es grupo: verifica y actualiza empresas miembro
        │
        ▼
Muestra resultado al admin
```

---

## Estados del formulario

| Estado React | Tipo | Descripción |
|---|---|---|
| `clientesParaPago` | array | Lista combinada de empresas y clientes |
| `pagoClienteSeleccionado` | string | ID del cliente/empresa seleccionado |
| `pagoTipoSeleccionado` | `'empresa' \| 'cliente'` | Tipo del seleccionado |
| `pagoMes` | string `YYYY-MM` | Mes de pago elegido |
| `pagoMontoCalculado` | number | Monto devuelto por la API |
| `pagoMonto` | string | Monto que se usará (editable) |
| `pagoArchivo` | `File \| null` | Archivo adjunto |
| `pagoDetalles` | object | Detalles del cálculo (moneda, desglose) |
| `pagoConfirmando` | boolean | Muestra el panel de confirmación |
| `loadingPagoMonto` | boolean | Calculando monto |
| `loadingPago` | boolean | Procesando pago |
| `pagoResultado` | `{success, message} \| null` | Resultado final |

---

## Consideraciones importantes

- **Fecha simulada global:** si está activa en el panel, se propaga a `/api/datos-pago` y a `/api/upload-comprobante`, afectando el mes de referencia y el timestamp del comprobante.
- **Meses atrasados:** el cálculo automático suma toda la deuda acumulada hasta el presente, no la deuda puntual de ese mes histórico. Para pagos parciales por mes específico, el admin debe ajustar el monto manualmente.
- **Grupos de empresas:** el `granTotalAPagar` consolida la deuda de la empresa principal y todas las empresas asociadas en un solo comprobante.
- **No se puede duplicar:** si ya existe un comprobante `pendiente` o `aprobado` para el mismo cliente y mes, el sistema rechaza el upload.
- **Rollback de storage:** si la inserción en BD falla después del upload, el archivo se elimina de Supabase Storage automáticamente.
