# 📋 PRESERVACIÓN DE COLUMNAS APPSHEET

## 🎯 Problema resuelto
Las columnas G e I de Google Sheets contenían información específica para AppSheet que se eliminaba durante la sincronización con Supabase.

## 🔧 Solución implementada

### Modificaciones en `lib/googleSheets.ts`

#### 1. **Función readClientes()** 
- ✅ Ahora ignora las columnas G e I durante la lectura
- ✅ Solo procesa las columnas mapeadas en la configuración
- ✅ Agrega logging para indicar que G e I son preservadas

#### 2. **Función writeClientes()** 
- ✅ Lee los datos actuales antes de escribir
- ✅ Crea un mapa para preservar datos de columnas G e I por ID_Cliente
- ✅ Mantiene la estructura completa: A-B-C-D-E-F-G-H-I-J
- ✅ Preserva los datos de AppSheet en las posiciones correctas

#### 3. **Nueva función updateClienteRow()** 
- ✅ Permite actualizar filas individuales sin afectar G e I
- ✅ Actualiza solo las columnas específicas (A,B,C,D,E,F,H,J)
- ✅ Usa batchUpdate para mayor eficiencia

## 📊 Estructura de columnas preservada

```
A = ID_Cliente       (sincronizada)
B = Nombre           (sincronizada)  
C = Correo           (sincronizada)
D = Telefono         (sincronizada)
E = Tipo_Identificación (sincronizada)
F = Identificacion   (sincronizada)
G = [AppSheet Data]  (PRESERVADA - NO SINCRONIZADA)
H = Moneda           (sincronizada)
I = [AppSheet Data]  (PRESERVADA - NO SINCRONIZADA)
J = Cuenta           (sincronizada)
```

## 🔄 Flujo de sincronización actualizado

### Desde Supabase a Sheets:
1. 📖 Lee datos actuales de la hoja incluyendo columnas G e I
2. 🗂️ Crea mapa de datos preservados por ID_Cliente
3. 📝 Construye nuevas filas manteniendo datos de AppSheet
4. ✅ Escribe datos completos con estructura A-J preservada

### Desde Sheets a Supabase:
1. 📖 Lee datos pero ignora columnas G e I
2. 📊 Procesa solo columnas mapeadas en sync-config.ts
3. ✅ Sincroniza normalmente sin afectar datos de AppSheet

## ⚠️ Importante
- Las columnas G e I NO se sincronizan hacia Supabase
- Los datos de AppSheet en G e I se mantienen intactos
- La sincronización bidireccional funciona sin pérdida de datos
- Los headers de G e I se preservan o se crean como "AppSheet_G" y "AppSheet_I"

## 📝 Logging mejorado
- Indica cuando se preservan columnas G e I
- Muestra estructura de columnas en cada sincronización
- Detalla qué datos se mantienen y cuáles se sincronizan

## ✅ Resultados esperados
- ✅ Las columnas G e I ya no se eliminan durante la sincronización
- ✅ Los datos de AppSheet permanecen intactos
- ✅ La sincronización bidireccional funciona normalmente
- ✅ No hay pérdida de información específica de AppSheet