# 🔄 Configuración de Sincronización usuarios ↔ Clientes

## 📋 Mapeo Configurado

| Supabase (usuarios) | Google Sheets (Clientes) | Columna | Transformación |
|---------------------|--------------------------|---------|----------------|
| `id` | `ID_Cliente` | A | parseInt() |
| `nombre` | `Nombre` | B | String trim() |
| `correo` | `Correo` | C | toLowerCase() trim() |
| `telefono` | `Telefono` | D | parseInt() (solo números) |
| `tipo_cedula` | `Tipo_Identificación` | E | String trim() |
| `cedula` | `Identificacion` | F | parseInt() (solo números) |
| `esDolar` | `Moneda` | H | "Dólar"/"Colones" → boolean |
| `estaRegistrado` | `Cuenta` | J | "Registrado"/"No Registrado" → boolean |

## 🎯 Características

- **✅ Solo sincroniza la tabla usuarios**
- **✅ Mapeo personalizado de nombres de columnas**
- **✅ Transformaciones automáticas de tipos de datos**
- **✅ Manejo de valores nulos y vacíos**
- **✅ Validación de configuración**
- **✅ Sincronización bidireccional**

## 🔧 Uso

### API Endpoints:
- `POST /api/sync` con `direction: "clientes-to-usuarios"`
- `POST /api/sync` con `direction: "usuarios-to-clientes"`
- `POST /api/sync` con `direction: "bidirectional"`
- `GET /api/validate-config` - Validar configuración
- `POST /api/validate-config` - Probar lectura de datos

### Interfaz Web:
- Botón "📥 Clientes → usuarios" - Sync desde Google Sheets
- Botón "📤 usuarios → Clientes" - Sync hacia Google Sheets
- Botón "🔄 Sincronización Completa" - Bidireccional
- Botón "🧪 Probar Lectura de Datos" - Test de conectividad

## 📊 Estadísticas

La página principal muestra:
- Número de registros en Supabase (usuarios)
- Número de registros en Google Sheets (Clientes)
- Timestamp de última verificación
- Mensajes de error si los hay

## ⚙️ Configuración Requerida

### Google Sheet "BD":
```
Hoja: Clientes
Headers (Fila 1): ID_Cliente | Nombre | Correo | Telefono | Tipo_Identificación | Identificacion | [G] | Moneda | [I] | Cuenta
Columnas:         A          | B      | C      | D        | E                   | F              |     | H      |     | J
```

### Variables de Entorno (.env.local):
```bash
GOOGLE_SHEETS_PRIVATE_KEY="..."
GOOGLE_SHEETS_CLIENT_EMAIL="..."
GOOGLE_SHEETS_SPREADSHEET_ID="..."
```

## 🔄 Flujo de Sincronización

1. **Clientes → usuarios**: Lee Google Sheets, transforma datos, upsert en Supabase
2. **usuarios → Clientes**: Lee Supabase, transforma datos, reescribe Google Sheets
3. **Bidireccional**: Ejecuta ambos procesos en secuencia

## 🛠️ Personalización

Para modificar el mapeo, edita `lib/sync-config.ts`:

```typescript
{
  sheetsColumn: "Tu_Columna_Real",
  supabaseColumn: "campo_supabase",
  transform: (value) => {
    // Tu lógica de transformación
    return transformedValue;
  }
}
```