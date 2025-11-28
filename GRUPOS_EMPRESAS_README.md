# Grupos de Empresas

## Descripción

La funcionalidad de **Grupos de Empresas** permite que una empresa principal vea y pague por otras empresas asociadas. Las horas trabajadas, gastos y solicitudes de todas las empresas del grupo se muestran y suman en el portal de la empresa principal.

## Estructura de Base de Datos

### Tabla `grupos_empresas`
- `id` (UUID): Identificador único del grupo
- `nombre` (TEXT): Nombre del grupo (ej: "Grupo Corporativo ABC")
- `empresa_principal_id` (TEXT): ID de la empresa que paga por todas
- `created_at`, `updated_at` (TIMESTAMPTZ): Fechas de auditoría

### Tabla `grupos_empresas_miembros`
- `id` (UUID): Identificador único
- `grupo_id` (UUID): Referencia al grupo
- `empresa_id` (TEXT): ID de la empresa asociada
- `created_at` (TIMESTAMPTZ): Fecha de creación

### Restricciones
- Una empresa principal solo puede tener un grupo (`unique_empresa_principal`)
- Una empresa solo puede estar en un grupo (`unique_empresa_miembro`)

## Endpoints API

### `/api/grupos-empresas`

#### GET
Obtiene todos los grupos con la información de las empresas.

#### POST
Crea un nuevo grupo.
```json
{
  "nombre": "Grupo Corporativo ABC",
  "empresaPrincipalId": "emp-001",
  "empresasAsociadas": ["emp-002", "emp-003"]
}
```

#### PUT
Actualiza un grupo existente (agregar/quitar empresas).
```json
{
  "grupoId": "uuid-del-grupo",
  "empresasAsociadas": ["emp-002", "emp-003", "emp-004"]
}
```

#### DELETE
Elimina un grupo.
```json
{
  "grupoId": "uuid-del-grupo"
}
```

## Flujo de Funcionamiento

### 1. Creación del Grupo (Admin)
1. En `/dev`, sección "Grupos de Empresas"
2. Seleccionar empresa principal
3. Seleccionar empresas asociadas
4. Guardar grupo

### 2. Vista de Pago (Empresa Principal)
1. La empresa principal accede a `/pago`
2. Ve sus propios trabajos, gastos y solicitudes
3. Ve una sección adicional "Empresas Asociadas al Grupo"
4. Cada empresa asociada muestra:
   - Horas trabajadas y costo
   - Mensualidades
   - Gastos
   - Subtotal
   - IVA (con el porcentaje específico de esa empresa)
   - Total
5. Al final, se muestra el **Gran Total del Grupo**

### 3. Visto Bueno
- La empresa principal da visto bueno por todo el grupo
- Se genera UNA factura con el monto total del grupo

### 4. Aprobación de Pago (Admin)
Cuando el admin aprueba el comprobante de pago de la empresa principal:
1. Se desactiva `modoPago` de la empresa principal
2. Se desactiva `modoPago` de TODAS las empresas asociadas
3. Se actualizan las solicitudes mensualidades de todas las empresas
4. Se marcan las facturas de todas las empresas como pagadas

## Consideraciones de IVA

Cada empresa puede tener su propio porcentaje de IVA (`iva_perc`). El sistema:
- Calcula el IVA de cada empresa con su propio porcentaje
- Muestra el desglose por empresa
- Suma todos los IVAs para el total del grupo

## Archivos Modificados

- `create_grupos_empresas_table.sql` - SQL para crear las tablas
- `app/api/grupos-empresas/route.ts` - CRUD de grupos
- `app/api/datos-pago/route.ts` - Obtener datos agregados del grupo
- `app/api/payment-receipts/route.ts` - Desactivar modoPago del grupo
- `app/dev/page.tsx` - UI para administrar grupos
- `app/pago/page.tsx` - UI para mostrar datos del grupo
- `app/pago/pago.module.css` - Estilos para la sección de grupos

## Setup

1. Ejecutar el script SQL en Supabase:
   ```sql
   -- Ejecutar el contenido de create_grupos_empresas_table.sql
   ```

2. Reiniciar la aplicación para que tome los nuevos endpoints

## Notas Técnicas

- Los grupos usan estructura de dos tablas (normalizada) para mantener integridad referencial
- RLS habilitado pero con políticas abiertas (control en backend)
- Índices optimizados para búsquedas frecuentes
