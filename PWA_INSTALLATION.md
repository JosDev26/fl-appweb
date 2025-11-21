# Instalación de la PWA

Esta aplicación está configurada como una Progressive Web App (PWA), lo que significa que puedes instalarla en tu dispositivo como si fuera una aplicación nativa.

## 📱 Instalar en Android

1. Abre la aplicación en **Google Chrome**
2. Toca el menú (⋮) en la esquina superior derecha
3. Selecciona **"Agregar a pantalla de inicio"** o **"Instalar app"**
4. Confirma la instalación
5. La app aparecerá en tu pantalla de inicio

## 🍎 Instalar en iOS (iPhone/iPad)

1. Abre la aplicación en **Safari**
2. Toca el botón de compartir (□↑) en la parte inferior
3. Desplázate y selecciona **"Agregar a pantalla de inicio"**
4. Ajusta el nombre si lo deseas
5. Toca **"Agregar"**
6. La app aparecerá en tu pantalla de inicio

## 💻 Instalar en PC (Windows/Mac/Linux)

### Google Chrome / Microsoft Edge
1. Abre la aplicación en el navegador
2. Busca el ícono de instalación (⊕) en la barra de direcciones
3. Haz clic en **"Instalar"**
4. La app se abrirá en una ventana independiente
5. Podrás acceder a ella desde el menú de inicio o aplicaciones

### Alternativa
- Ve a **⋮ → Más herramientas → Crear acceso directo**
- Marca la casilla **"Abrir como ventana"**
- Haz clic en **"Crear"**

## ✅ Características de la PWA

- ✨ Funciona sin conexión (páginas visitadas previamente)
- 🚀 Carga más rápida gracias al caché
- 📲 Se comporta como una app nativa
- 🔔 Puede enviar notificaciones (si está habilitado)
- 📱 Interfaz optimizada para móviles y escritorio
- 💾 Actualizaciones automáticas en segundo plano

## 🔧 Para Desarrolladores

### Archivos Importantes
- `/public/manifest.json` - Configuración de la PWA
- `/public/icons/` - Iconos en diferentes tamaños
- `/next.config.ts` - Configuración de next-pwa
- Service Worker generado automáticamente en `/public/sw.js`

### Verificar Instalación
1. Abre DevTools (F12)
2. Ve a la pestaña **"Application"** o **"Aplicación"**
3. Revisa:
   - Manifest
   - Service Workers
   - Caché Storage

### Regenerar Service Worker
El Service Worker se genera automáticamente al hacer build:
```bash
npm run build
```

### Modo Desarrollo
El PWA está deshabilitado en desarrollo para facilitar debugging.
Para probarlo en producción local:
```bash
npm run build
npm start
```

## 🐛 Solución de Problemas

### La app no aparece para instalar
- Verifica que uses HTTPS (o localhost)
- Asegúrate de que el manifest.json se carga correctamente
- Revisa la consola del navegador para errores

### Cambios no se reflejan
- Desinstala la app
- Limpia la caché del navegador
- Reinstala la app

### Iconos no se muestran
- Verifica que existan los archivos en `/public/icons/`
- Confirma que las rutas en `manifest.json` sean correctas
- Fuerza una actualización del manifest (Ctrl + F5)
