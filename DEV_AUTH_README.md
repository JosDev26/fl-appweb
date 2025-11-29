# 🔐 Sistema de Autenticación /dev

Sistema de autenticación de 3 factores para el panel de administración `/dev`:

1. **Email** - Correo registrado en la base de datos
2. **Contraseña** - Hash almacenado con bcrypt
3. **Código temporal** - Código de 64 caracteres enviado por correo (expira en 10 minutos)

---

## 📋 Instalación

### 1. Instalar dependencias

```bash
npm install bcryptjs resend
npm install -D @types/bcryptjs
```

### 2. Configurar variables de entorno

Añade a tu `.env.local`:

```env
# API Key de Resend para enviar correos
RESEND_API_KEY=re_tu_api_key_aqui
```

**Para obtener tu API Key de Resend:**
1. Ve a https://resend.com
2. Crea una cuenta gratis
3. Verifica tu dominio o usa el dominio de prueba
4. Copia tu API Key desde el dashboard

### 3. Crear tablas en Supabase

Ejecuta el script SQL en Supabase SQL Editor:

```sql
-- Copia todo el contenido de: create_dev_auth_tables.sql
```

Este script crea 3 tablas:
- `dev_admins` - Usuarios administradores
- `dev_auth_codes` - Códigos temporales de autenticación
- `dev_sessions` - Sesiones activas

### 4. Crear tu primer administrador

**Opción A: Usando el script Node.js**

```bash
node create-dev-admin.js
```

Sigue las instrucciones y copia el SQL generado en Supabase.

**Opción B: Manualmente**

1. Genera un hash de contraseña:
```javascript
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('tu-contraseña-aqui', 10);
console.log(hash);
```

2. Inserta en Supabase:
```sql
INSERT INTO public.dev_admins (email, password_hash, name, is_active)
VALUES (
  'admin@tuempresa.com',
  '$2a$10$HASH_GENERADO_AQUI',
  'Administrador Principal',
  true
);
```

---

## 🚀 Uso

### Acceder al panel

1. Ve a `/dev/login`
2. Ingresa tu **email** y **contraseña**
3. Recibirás un código de 64 caracteres por correo
4. Copia y pega el código completo
5. Acceso concedido por **8 horas**

### Cerrar sesión

Desde cualquier página `/dev`, llama al endpoint:

```javascript
await fetch('/api/dev-auth/logout', { method: 'POST' })
```

O implementa un botón de logout.

---

## 🔒 Seguridad

### Características de seguridad

- ✅ **Contraseñas hasheadas** con bcrypt (10 rounds)
- ✅ **Códigos únicos** de 64 caracteres (criptográficamente seguros)
- ✅ **Expiran en 10 minutos** y solo se usan una vez
- ✅ **Sesiones verificadas** en cada request con middleware
- ✅ **Cookies httpOnly** para prevenir XSS
- ✅ **Límite de códigos activos** (máximo 3 por admin)
- ✅ **Logs de IP y User-Agent** para auditoría
- ✅ **Sesiones de 8 horas** con expiración automática

### Recomendaciones

1. **Usa contraseñas fuertes** (mínimo 12 caracteres, mayúsculas, números, símbolos)
2. **Configura Resend con tu dominio** para envíos profesionales
3. **Revisa los logs** de `dev_sessions` y `dev_auth_codes` regularmente
4. **Limita los correos autorizados** solo a personal de confianza
5. **Ejecuta limpieza periódica**:
```sql
SELECT cleanup_expired_dev_data();
```

---

## 📊 Tablas

### `dev_admins`
Administradores autorizados

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | Identificador único |
| email | TEXT | Correo (único) |
| password_hash | TEXT | Hash bcrypt de la contraseña |
| name | TEXT | Nombre del administrador |
| is_active | BOOLEAN | Estado (activo/inactivo) |
| last_login | TIMESTAMP | Último acceso exitoso |

### `dev_auth_codes`
Códigos temporales enviados por correo

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | Identificador único |
| admin_id | UUID | FK a `dev_admins` |
| code | TEXT | Código de 64 caracteres (único) |
| expires_at | TIMESTAMP | Expiración (10 minutos) |
| used_at | TIMESTAMP | Cuándo se usó |
| is_active | BOOLEAN | Si sigue válido |
| ip_address | TEXT | IP de origen |
| user_agent | TEXT | Navegador/cliente |

### `dev_sessions`
Sesiones activas

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | Identificador único |
| admin_id | UUID | FK a `dev_admins` |
| session_token | TEXT | Token de sesión (único) |
| expires_at | TIMESTAMP | Expiración (8 horas) |
| is_active | BOOLEAN | Si sigue activa |
| ip_address | TEXT | IP de origen |
| user_agent | TEXT | Navegador/cliente |

---

## 🛠️ Administración

### Agregar más administradores

```bash
node create-dev-admin.js
```

### Desactivar un administrador

```sql
UPDATE public.dev_admins 
SET is_active = false 
WHERE email = 'admin@example.com';
```

### Ver sesiones activas

```sql
SELECT 
  s.*, 
  a.email, 
  a.name 
FROM public.dev_sessions s
JOIN public.dev_admins a ON s.admin_id = a.id
WHERE s.is_active = true 
  AND s.expires_at > NOW()
ORDER BY s.created_at DESC;
```

### Cerrar todas las sesiones de un admin

```sql
UPDATE public.dev_sessions 
SET is_active = false 
WHERE admin_id = 'uuid-del-admin';
```

### Cambiar contraseña

```javascript
// 1. Genera el nuevo hash
const bcrypt = require('bcryptjs');
const newHash = bcrypt.hashSync('nueva-contraseña', 10);
console.log(newHash);
```

```sql
-- 2. Actualiza en Supabase
UPDATE public.dev_admins 
SET password_hash = '$2a$10$NUEVO_HASH_AQUI',
    updated_at = NOW()
WHERE email = 'admin@example.com';
```

---

## 🔧 Solución de Problemas

### "Error al enviar correo"

- Verifica que `RESEND_API_KEY` esté configurado
- Comprueba que el dominio esté verificado en Resend
- Revisa los logs de Resend dashboard

### "Credenciales inválidas"

- Verifica que el email exista en `dev_admins`
- Confirma que `is_active = true`
- Prueba regenerar el hash de contraseña

### "Código expirado"

- Los códigos expiran en 10 minutos
- Solicita un nuevo código
- Limpia códigos viejos: `SELECT cleanup_expired_dev_data();`

### "Sesión expirada"

- Las sesiones duran 8 horas
- Cierra sesión y vuelve a iniciar
- Revisa que la cookie `dev-auth` exista

---

## 📧 Personalizar el Email

Edita el template HTML en:
```
app/api/dev-auth/login/route.ts
```

Función: `sendAuthCode()`

Puedes personalizar:
- Colores del gradiente
- Logo/imagen de la empresa
- Texto y mensajes
- Tiempo de expiración mostrado

---

## 🎯 Próximos Pasos

1. **Ejecuta el SQL** en Supabase (`create_dev_auth_tables.sql`)
2. **Instala dependencias** (`npm install bcryptjs resend`)
3. **Configura Resend** (obtén tu API key)
4. **Crea tu admin** (`node create-dev-admin.js`)
5. **Prueba el login** en `/dev/login`

---

## 📄 Licencia

Sistema de autenticación para uso interno del proyecto.
