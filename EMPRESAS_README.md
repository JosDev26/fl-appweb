# Configuración de Empresas

## Tabla Empresas en Supabase

Para habilitar la funcionalidad de empresas, ejecuta el siguiente script SQL en tu base de datos Supabase:

```sql
-- Archivo: create_empresas_table.sql
```

## Estructura de la Tabla

| Campo | Tipo | Descripción | Columna Google Sheets |
|-------|------|-------------|----------------------|
| `id` | serial | ID autoincremental (generado automáticamente) | - |
| `id_sheets` | text | ID del cliente en Google Sheets | Columna A (ID_Cliente) |
| `nombre` | text | Nombre de la empresa | Columna B (Nombre) |
| `cedula` | bigint | Cédula jurídica de la empresa | Columna C (Cedula) |
| `esDolar` | boolean | Indica si opera en dólares o colones | Columna H (Moneda) |
| `iva_perc` | numeric(4,2) | Porcentaje de IVA como decimal (ej: 0.13) | Columna G (IVA_Perc) |
| `estaRegistrado` | boolean | Indica si tiene cuenta activa | Columna J (Cuenta) |
| `password` | text | Contraseña encriptada | - |

## Mapeo de Valores

### Columna Moneda (H) -> esDolar
- "Dolares" / "Dolar" / "USD" → `true`
- "Colones" / cualquier otro → `false`

### Columna IVA_Perc (G) -> iva_perc
- "13%" → `0.13`
- "10" → `0.10`
- Valor por defecto: `0.13`

### Columna Cuenta (J) -> estaRegistrado
- "TRUE" / "true" / "1" / "Si" / "Sí" → `true`
- "FALSE" / "false" / "0" / "No" → `false`

## Funcionalidades

### Para Empresas:
1. **Crear Cuenta**: Las empresas pueden crear una cuenta usando su cédula jurídica
2. **Iniciar Sesión**: Pueden iniciar sesión con cédula y contraseña
3. **Panel Diferenciado**: El panel muestra "Panel de Empresa" en lugar de "Panel de Usuario"

### APIs Disponibles:
- `POST /api/login-empresa` - Login para empresas
- `POST /api/validar-identificacion-empresa` - Validar cédula de empresa
- `POST /api/crear-password-empresa` - Crear contraseña para empresa

## Sincronización con Google Sheets

La tabla `empresas` se sincroniza automáticamente con la hoja "Empresas" en Google Sheets siguiendo la misma lógica que los clientes.

### Configuración en `sync-config.ts`:
```typescript
{
  sheetsName: "Empresas",
  supabaseTable: "empresas",
  idColumn: "id_sheets",
  columns: [...]
}
```

## Diferencias con Clientes

| Característica | Clientes (usuarios) | Empresas |
|---------------|---------------------|----------|
| Tabla | `usuarios` | `empresas` |
| Campo IVA | No tiene | `iva_perc` (decimal) |
| Identificación | Cédula física | Cédula jurídica |
| Hoja Google Sheets | "Clientes" | "Empresas" |
