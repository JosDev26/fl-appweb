# 📅 Simulador de Fechas - Guía de Uso

## Descripción

El simulador de fechas es una herramienta de desarrollo que permite simular diferentes fechas en la aplicación sin necesidad de cambiar la fecha del sistema operativo. Es útil para probar funcionalidades dependientes del tiempo como facturas, pagos, reportes, vencimientos, etc.

## 🎯 Características

- **Simulación Global**: La fecha simulada afecta a toda la aplicación
- **Persistencia**: La fecha se guarda en `localStorage` y persiste entre sesiones
- **Indicador Visual**: Muestra un banner naranja en la esquina superior derecha cuando hay una fecha simulada activa
- **Ajustes Rápidos**: Botones para adelantar/atrasar la fecha en 1, 7 o 30 días
- **Calendario Visual**: Selector de fecha intuitivo
- **Desactivación Fácil**: Un clic para volver a la fecha real del sistema

## 🚀 Cómo Usar

### Activar la Simulación

1. Ve al panel de desarrollo en `/dev`
2. Haz clic en la pestaña "🗓️ Simulador de Fecha"
3. Selecciona la fecha que deseas simular usando:
   - El calendario (selector de fecha)
   - Los botones de ajuste rápido (-30, -7, -1, +1, +7, +30 días)
   - El botón "Hoy" para volver al día actual
4. Haz clic en "🕐 Activar Simulación"
5. La página se recargará automáticamente y verás el indicador naranja en la esquina

### Cambiar la Fecha Simulada

1. Ve a `/dev` → "🗓️ Simulador de Fecha"
2. Ajusta la fecha como desees
3. Haz clic en "🔄 Actualizar Fecha"
4. La página se recargará con la nueva fecha

### Desactivar la Simulación

1. Ve a `/dev` → "🗓️ Simulador de Fecha"
2. Haz clic en "✕ Desactivar Simulación"
3. La aplicación volverá a usar la fecha real del sistema

## 💻 Uso en el Código

### Importar las Utilidades

```typescript
import { 
  getCurrentDate, 
  getCurrentTimestamp,
  getCurrentISOString,
  getCurrentMonthString,
  isDateSimulated 
} from '@/lib/dateSimulator'
```

### Obtener la Fecha Actual (o Simulada)

```typescript
// En lugar de: new Date()
const currentDate = getCurrentDate()

// En lugar de: Date.now()
const currentTimestamp = getCurrentTimestamp()

// Para formato ISO
const isoDate = getCurrentISOString()

// Para el mes actual (YYYY-MM)
const currentMonth = getCurrentMonthString()
```

### Verificar si Hay Simulación Activa

```typescript
if (isDateSimulated()) {
  console.log('⚠️ Usando fecha simulada')
} else {
  console.log('✅ Usando fecha real')
}
```

### Comparar Fechas

```typescript
import { getDaysDifference, isCurrentMonth, isToday } from '@/lib/dateSimulator'

// Días transcurridos desde una fecha
const daysPassed = getDaysDifference(someDate)

// Verificar si es del mes actual
if (isCurrentMonth(invoiceDate)) {
  console.log('Factura del mes actual')
}

// Verificar si es hoy
if (isToday(paymentDate)) {
  console.log('Pago de hoy')
}
```

## 📋 Casos de Uso

### 1. Probar Ciclos de Facturación

```typescript
// Simular primer día del mes para ver facturas nuevas
// Ir a /dev y configurar: 2025-12-01

// Simular fin de mes para ver cierres
// Ir a /dev y configurar: 2025-12-31
```

### 2. Probar Vencimientos

```typescript
// Simular una fecha después del vencimiento
const dueDate = new Date('2025-12-15')
const today = getCurrentDate() // Fecha simulada

if (today > dueDate) {
  console.log('¡Pago vencido!')
}
```

### 3. Generar Reportes Históricos

```typescript
// Simular un mes pasado para ver datos históricos
// Ir a /dev y configurar: 2025-10-15

const currentMonth = getCurrentMonthString() // "2025-10"
// Ahora puedes generar reportes de octubre
```

### 4. Probar Modo Pago Mensual

```typescript
// Simular inicio de mes para activar modo pago
// Ir a /dev y configurar: 2025-12-01

// Simular diferentes días del mes para ver estados
```

## ⚠️ Advertencias y Limitaciones

### No Usar en Producción

- El simulador está diseñado SOLO para desarrollo y pruebas
- No debe estar activo en el entorno de producción
- Los datos creados con fechas simuladas tendrán esos timestamps

### Impacto en Datos

- Los registros creados mientras hay una fecha simulada tendrán ese timestamp
- Ten cuidado al crear facturas, pagos o reportes con fechas simuladas
- Considera limpiar datos de prueba después de usar el simulador

### Comportamiento del Sistema

- Jobs automáticos y cron jobs usarán la fecha simulada si está activa
- APIs externas seguirán usando sus propias fechas reales
- El servidor puede usar fecha real mientras el cliente usa fecha simulada

### Sincronización

- Si usas múltiples pestañas, todas verán la misma fecha simulada
- Los cambios en una pestaña afectarán a las demás después de recargar
- El indicador visual aparecerá en todas las páginas

## 🔧 Implementación Técnica

### Almacenamiento

```javascript
// La fecha se guarda en localStorage
localStorage.setItem('simulatedDate', '2025-12-15')
localStorage.removeItem('simulatedDate') // Para desactivar
```

### Función Principal

```typescript
export function getCurrentDate(): Date {
  if (typeof window !== 'undefined') {
    const simulatedDateStr = localStorage.getItem('simulatedDate')
    
    if (simulatedDateStr) {
      const [year, month, day] = simulatedDateStr.split('-').map(Number)
      const now = new Date()
      return new Date(year, month - 1, day, now.getHours(), now.getMinutes())
    }
  }
  
  return new Date()
}
```

### Componente Indicador

El componente `DateSimulatorIndicator` se renderiza en `app/layout.tsx` y muestra:
- Icono animado de reloj
- Fecha simulada actual
- Enlace directo al panel de desarrollo
- Solo visible cuando hay simulación activa

## 🎨 Interfaz de Usuario

### Panel de Control

- **Estado Actual**: Muestra si hay fecha simulada activa y qué fecha es
- **Selector de Fecha**: Input tipo date para elegir cualquier día
- **Botón "Hoy"**: Vuelve a la fecha real actual
- **Ajustes Rápidos**: 6 botones para moverte rápido en el tiempo
- **Acciones**: Activar, Actualizar o Desactivar la simulación

### Indicador Visual

- Aparece en la esquina superior derecha
- Color naranja para máxima visibilidad
- Animación de pulso para recordar que está activo
- Clic en el icono de engranaje lleva al panel /dev

## 📝 Mejores Prácticas

1. **Documenta tus Pruebas**: Anota qué fechas usaste para qué pruebas
2. **Limpia Después**: Desactiva la simulación cuando termines
3. **Verifica Datos**: Revisa que los timestamps sean correctos en tu base de datos
4. **Comunicación**: Informa al equipo si dejas fechas simuladas activas
5. **No Mezcles**: Evita crear datos reales mientras hay una fecha simulada

## 🐛 Resolución de Problemas

### La fecha no cambia

- Verifica que recargaste la página después de activar/cambiar
- Limpia la caché del navegador
- Abre una pestaña de incógnito para probar

### Datos con fechas incorrectas

- Verifica que la simulación estaba desactivada al crear los datos
- Revisa el indicador visual para confirmar el estado
- Considera usar timestamps en lugar de fechas si es crítico

### El indicador no aparece

- Verifica que el layout incluye `<DateSimulatorIndicator />`
- Revisa la consola del navegador por errores
- Confirma que localStorage tiene 'simulatedDate'

## 📚 Recursos Adicionales

- Archivo: `/lib/dateSimulator.ts` - Funciones principales
- Componente: `/app/components/DateSimulatorIndicator.tsx` - Indicador visual
- Panel: `/app/dev/page.tsx` - Interfaz de control
- Documentación: Este archivo

## 🔄 Actualizaciones Futuras

Posibles mejoras:
- Presets de fechas comunes (inicio/fin de mes, trimestre, año)
- Historial de fechas simuladas usadas
- Modo "time travel" para avanzar automáticamente
- Exportar/importar configuraciones de simulación
- Alertas cuando se crean datos con fecha simulada
