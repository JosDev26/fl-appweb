# Migración: Columna ID de Usuarios de Integer a Text

## 🎯 Objetivo
Cambiar la columna `id` de la tabla `usuarios` de `integer` a `text` para soportar IDs alfanuméricos provenientes de Google Sheets (ej: "ABC123", "EMP-001").

## ⚠️ IMPORTANTE - ANTES DE EMPEZAR

1. **HACER BACKUP** de la base de datos en Supabase
2. **RESTAURAR LOS DATOS** de Google Sheets si se borraron (usar historial de versiones)
3. Verificar que la columna G (AppSheet) y columna I (IVA_Perc) en Sheets están intactas

## 📋 Pasos de Migración

### 1. Ejecutar el script SQL en Supabase

Ir a Supabase Dashboard → SQL Editor y ejecutar:

```sql
-- Script: migrate_usuarios_id_to_text.sql
```

Este script:
- ✅ Convierte la columna `id` de integer a text
- ✅ Preserva todos los datos existentes
- ✅ Mantiene la integridad de la clave primaria

### 2. Ejecutar script de IVA_Perc (si no se ha hecho)

```sql
-- Script: add_iva_perc_to_usuarios.sql
```

### 3. Verificar que no hay errores de compilación

Los archivos ya están actualizados:
- ✅ `lib/database.types.ts` - id ahora es `string`
- ✅ `lib/sync-config.ts` - ID_Cliente se guarda en columna `id`
- ✅ `lib/googleSheets.ts` - writeClientes PRESERVA columnas G e I
- ✅ `lib/syncService.ts` - Sincronización bidireccional activa

### 4. Probar la sincronización

**Sincronización Bidireccional (Recomendado):**
```bash
# En el navegador o Postman:
POST /api/sync
Body: { "direction": "bidirectional" }
```

O usar el endpoint automático:
```
GET /api/sync/auto
```

**Sincronización Unidireccional:**
```bash
# Solo Sheets → Supabase:
POST /api/sync
Body: { "direction": "sheets-to-supabase" }

# Solo Supabase → Sheets:
POST /api/sync
Body: { "direction": "supabase-to-sheets" }
```

## 🔄 Sincronización Bidireccional

La sincronización ahora funciona en ambas direcciones:

### Sheets → Supabase
- ✅ Lee datos de Google Sheets columna A (ID_Cliente)
- ✅ Crea nuevos usuarios en Supabase
- ✅ Actualiza usuarios existentes
- ✅ Elimina usuarios que ya no están en Sheets

### Supabase → Sheets
- ✅ Lee datos de tabla `usuarios`
- ✅ Actualiza filas existentes en Sheets
- ✅ **PRESERVA columna G (AppSheet)** - Lee valor actual y lo mantiene
- ✅ **PRESERVA columna I (IVA_Perc)** - Lee valor actual y lo mantiene
- ✅ Elimina filas que ya no están en Supabase

## 🔒 Protecciones Implementadas

### Columnas Protegidas en Google Sheets

- **Columna E (Tipo_Identificación)**:
  - Antes de escribir: Lee valor actual de E
  - Al escribir: Mantiene el valor leído
  - Prioridad: Valor en Sheets > Valor de Supabase
  
- **Columna G (AppSheet)**: 
  - Antes de escribir: Lee valor actual de G
  - Al escribir: Mantiene el valor leído
  - Nunca sobrescribe con datos de Supabase
  
- **Columna I (IVA_Perc)**:
  - Antes de escribir: Lee valor actual de I
  - Al escribir: Mantiene el valor leído
  - Solo usa valor de Supabase si la celda está vacía

## 📊 Estructura Final

### Google Sheets "Clientes"
```
A: ID_Cliente        (texto alfanumérico: "ABC123", "EMP-001") ← Sincroniza ↔
B: Nombre                                                        ← Sincroniza ↔
C: Correo                                                        ← Sincroniza ↔
D: Telefono                                                      ← Sincroniza ↔
E: Tipo_Identificación (PRESERVADA - mantiene valor de Sheets)  ✋ Preservada
F: Identificacion                                                ← Sincroniza ↔
G: AppSheet          (PRESERVADA - NUNCA se toca)               ✋ Solo lectura
H: Moneda                                                        ← Sincroniza ↔
I: IVA_Perc          (PRESERVADA - mantiene valor de Sheets)    ✋ Preservada
J: (vacía)
K: Cuenta                                                        ← Sincroniza ↔
```

### Supabase `usuarios`
```
id: text PRIMARY KEY              ← Sincroniza desde/hacia columna A
nombre: text                      ← Sincroniza ↔
correo: text                      ← Sincroniza ↔
telefono: text                    ← Sincroniza ↔
tipo_cedula: text                 ← Sincroniza ↔
cedula: bigint                    ← Sincroniza ↔
esDolar: boolean                  ← Sincroniza desde/hacia columna H
iva_perc: numeric(5,4)            ← Lee desde columna I, NO sobrescribe
estaRegistrado: boolean           ← Sincroniza desde/hacia columna K
password: text                    (no sincroniza)
```

## 🧪 Verificación Post-Migración

1. Verificar que los IDs alfanuméricos se preservan:
```sql
SELECT id, nombre FROM usuarios LIMIT 5;
```

2. Verificar que IVA_Perc se sincroniza correctamente:
```sql
SELECT id, nombre, iva_perc FROM usuarios WHERE iva_perc IS NOT NULL;
```

3. Verificar que Google Sheets no perdió datos:
   - Abrir la hoja "Clientes"
   - Verificar que columna E (Tipo_Identificación) tiene datos
   - Verificar que columna G (AppSheet) tiene datos
   - Verificar que columna I (IVA_Perc) tiene datos
   - Verificar que IDs en columna A son alfanuméricos

4. Hacer cambio de prueba:
   - Cambiar un nombre en Sheets → Ejecutar sync → Verificar en Supabase
   - Cambiar un teléfono en Supabase → Ejecutar sync → Verificar en Sheets
   - Verificar que columnas E, G e I NO cambiaron

## 🚨 Si Algo Sale Mal

1. **Restaurar backup** de Supabase
2. **Restaurar Sheets** desde historial de versiones de Google
3. **Revisar logs** en la consola del navegador o terminal
4. **Verificar** que las columnas G e I no se borraron

## ✅ Checklist Final

- [ ] Backup de Supabase creado
- [ ] Backup de Google Sheets disponible (historial de versiones)
- [ ] Script `migrate_usuarios_id_to_text.sql` ejecutado
- [ ] Script `add_iva_perc_to_usuarios.sql` ejecutado
- [ ] Sync bidireccional probado
- [ ] IDs alfanuméricos preservados en ambos lados
- [ ] Columnas E, G e I preservadas en Sheets
- [ ] Cambios en Sheets se reflejan en Supabase
- [ ] Cambios en Supabase se reflejan en Sheets
- [ ] No hay errores de compilación en el código
