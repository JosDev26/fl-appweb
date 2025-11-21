# Habilitar HTTPS en Desarrollo Local para PWA

La PWA no se puede instalar desde una IP de red (ej: 10.0.1.5:3000) porque requiere HTTPS.

## Opción 1: Certificado SSL Autofirmado (Desarrollo Local)

### Paso 1: Instalar mkcert
```bash
# Windows (con Chocolatey)
choco install mkcert

# O descargar desde: https://github.com/FiloSottile/mkcert/releases
```

### Paso 2: Crear certificados
```bash
# Instalar la CA local
mkcert -install

# Crear certificados para localhost y tu IP local
mkcert localhost 10.0.1.5 127.0.0.1 ::1
```

Esto creará dos archivos:
- `localhost+3.pem` (certificado)
- `localhost+3-key.pem` (llave privada)

### Paso 3: Mover certificados
```bash
mkdir certs
move localhost+3.pem certs/cert.pem
move localhost+3-key.pem certs/key.pem
```

### Paso 4: Actualizar package.json
Agrega este script:
```json
{
  "scripts": {
    "dev": "next dev",
    "dev:https": "node server-https.js",
    "build": "next build",
    "start": "next start"
  }
}
```

### Paso 5: Ejecutar con HTTPS
```bash
npm run dev:https
```

Ahora podrás acceder desde:
- `https://localhost:3000` ✅
- `https://10.0.1.5:3000` ✅

---

## Opción 2: Usar ngrok (Más Rápido)

### Paso 1: Instalar ngrok
```bash
# Windows (con Chocolatey)
choco install ngrok

# O descargar desde: https://ngrok.com/download
```

### Paso 2: Ejecutar tu app
```bash
npm run dev
```

### Paso 3: Crear túnel HTTPS
```bash
ngrok http 3000
```

Te dará una URL HTTPS pública:
```
https://xxxx-xx-xx-xxx-xx.ngrok.io
```

✅ Esa URL tiene HTTPS y permitirá instalar la PWA
✅ Funciona en cualquier dispositivo
✅ Se puede compartir con otros

---

## Opción 3: Configurar Chrome/Edge (Solo Desarrollo)

### Chrome
1. Abre `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Agrega: `http://10.0.1.5:3000`
3. Habilita la opción
4. Reinicia Chrome

### Edge
1. Abre `edge://flags/#unsafely-treat-insecure-origin-as-secure`
2. Agrega: `http://10.0.1.5:3000`
3. Habilita
4. Reinicia Edge

⚠️ **Nota**: Esto solo funciona en el dispositivo donde configures el flag.

---

## Comparación

| Método | Ventajas | Desventajas |
|--------|----------|-------------|
| **mkcert** | ✅ HTTPS real local<br>✅ Funciona en toda la red | ⚙️ Requiere configuración<br>⚙️ Cada dispositivo debe confiar en el certificado |
| **ngrok** | ✅ Muy fácil<br>✅ HTTPS instantáneo<br>✅ URL pública | ⚠️ URL cambia cada vez<br>⚠️ Requiere internet |
| **Chrome flags** | ✅ Sin instalación | ⚠️ Solo en ese navegador<br>⚠️ Inseguro para producción |

---

## Recomendación

Para **desarrollo local en red**:
→ Usa **ngrok** (más rápido y sencillo)

Para **desarrollo profesional**:
→ Usa **mkcert** (HTTPS permanente)

Para **producción**:
→ Despliega en Vercel/Netlify (HTTPS incluido)
