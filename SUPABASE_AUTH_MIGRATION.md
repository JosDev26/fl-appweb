# Migración a Supabase Auth con Identificación

## Resumen
Se ha migrado el sistema de autenticación de `localStorage` (inseguro) a **Supabase Auth** con cookies HTTP-Only. Los usuarios y empresas ahora usan su identificación (cédula) + contraseña para iniciar sesión de forma segura.

## Cambios Realizados

### 1. Backend - APIs Actualizadas

#### `app/api/crear-password/route.ts`
- ✅ Crea usuario en Supabase Auth con email interno: `{cedula}@clientes.interno`
- ✅ Encripta contraseña con bcrypt (12 rounds) para guardar en DB
- ✅ Guarda `correo` interno en tabla `usuarios`
- ✅ Agrega metadata: `cedula`, `nombre`, `tipo: 'cliente'`, `user_id`

#### `app/api/crear-password-empresa/route.ts`
- ✅ Crea empresa en Supabase Auth con email interno
- ✅ Encripta contraseña con bcrypt
- ✅ Guarda `correo` interno en tabla `empresas`
- ✅ Agrega metadata con `tipo: 'empresa'`

#### `app/api/login/route.ts`
- ✅ Convierte identificación a email interno
- ✅ Usa `supabase.auth.signInWithPassword()`
- ✅ Establece cookies HTTP-Only automáticamente:
  - `sb-access-token` (7 días)
  - `sb-refresh-token` (7 días)
- ❌ **YA NO usa localStorage** - las cookies se manejan automáticamente

#### `app/api/login-empresa/route.ts`
- ✅ Mismo flujo que login de clientes pero para empresas

#### `app/api/logout/route.ts` (NUEVO)
- ✅ Cierra sesión con `supabase.auth.signOut()`
- ✅ Elimina cookies HTTP-Only automáticamente

### 2. Frontend - Páginas Actualizadas

#### `app/login/page.tsx`
- ✅ Eliminado `localStorage.setItem('user', ...)`
- ✅ Las cookies HTTP-Only se establecen automáticamente al hacer login
- ✅ Redirección a `/home` después de login exitoso

### 3. Seguridad - Middleware

#### `middleware.ts` (NUEVO)
- ✅ Protege rutas: `/home`, `/caso`, `/admin`, `/pago`, `/solicitud`
- ✅ Verifica cookies `sb-access-token` antes de acceder
- ✅ Valida token con `supabase.auth.getUser()`
- ✅ Redirige a `/login` si no hay sesión válida
- ✅ Redirige a `/home` si usuario autenticado intenta ir a `/login`

### 4. Utilidades - Helper de Autenticación

#### `lib/auth.ts` (NUEVO)
- ✅ `getCurrentUser(accessToken)`: Obtiene usuario actual desde Supabase Auth
- ✅ Retorna datos de `usuarios` o `empresas` según metadata
- ✅ Interfaces TypeScript: `UsuarioData`, `EmpresaData`

### 5. Base de Datos - Schema

#### `add_correo_column.sql` (NUEVO)
- ✅ Agrega columna `correo TEXT` a `usuarios` y `empresas`
- ✅ Crea índices para búsquedas rápidas
- ✅ Comentarios explicativos del formato

## Pasos para Completar la Migración

### Paso 1: Configurar Variables de Entorno

Agrega a tu archivo `.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY="tu-service-role-key-aqui"
```

**¿Dónde encontrar el Service Role Key?**
1. Ve a tu proyecto en https://supabase.com/dashboard
2. Settings → API
3. Copia el valor de `service_role key` (⚠️ NUNCA expongas esta clave en el cliente)

### Paso 2: Ejecutar SQL en Supabase

1. Ve a SQL Editor en tu dashboard de Supabase
2. Ejecuta el contenido de `add_correo_column.sql`:
   ```sql
   -- Agrega columna correo a usuarios y empresas
   ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS correo TEXT;
   CREATE INDEX IF NOT EXISTS idx_usuarios_correo ON usuarios(correo);
   
   ALTER TABLE empresas ADD COLUMN IF NOT EXISTS correo TEXT;
   CREATE INDEX IF NOT EXISTS idx_empresas_correo ON empresas(correo);
   ```

### Paso 3: Actualizar Database Types

Regenera los tipos de Supabase para incluir la nueva columna `correo`:

```powershell
npx supabase gen types typescript --project-id yxawhlcikaoivcqpbjfl > lib/database.types.ts
```

### Paso 4: Instalar Dependencias

Si aún no tienes bcryptjs instalado:

```powershell
npm install bcryptjs
npm install --save-dev @types/bcryptjs
```

### Paso 5: Migrar Cuentas Existentes (Opcional)

Si ya tienes usuarios/empresas con contraseñas en texto plano o bcrypt:

#### Opción A: Migración Manual
1. Cada usuario debe "recuperar" su cuenta
2. Al crear nueva contraseña, se crea cuenta en Supabase Auth

#### Opción B: Script de Migración
Crea un endpoint temporal `/api/migrate-auth` que:
1. Lee todos los usuarios/empresas con `estaRegistrado=true`
2. Para cada uno:
   - Crea usuario en Supabase Auth con `supabaseAdmin.auth.admin.createUser()`
   - Actualiza campo `correo` con email interno
   - Mantiene password bcrypt en DB (por si acaso)

```typescript
// Ejemplo de migración (NO incluir en producción)
const { data: usuarios } = await supabase
  .from('usuarios')
  .select('*')
  .eq('estaRegistrado', true)
  .not('password', 'is', null)

for (const usuario of usuarios || []) {
  const emailInterno = `${usuario.cedula}@clientes.interno`
  
  // Crear en Supabase Auth con contraseña temporal
  await supabaseAdmin.auth.admin.createUser({
    email: emailInterno,
    password: 'TEMP_PASSWORD_12345', // Usuario debe cambiarla
    email_confirm: true,
    user_metadata: {
      cedula: usuario.cedula,
      nombre: usuario.nombre,
      tipo: 'cliente',
      user_id: usuario.id
    }
  })
  
  // Actualizar correo en DB
  await supabase
    .from('usuarios')
    .update({ correo: emailInterno })
    .eq('id', usuario.id)
}
```

### Paso 6: Actualizar Páginas Protegidas

Reemplaza `localStorage.getItem('user')` con llamadas a `getCurrentUser()`:

**ANTES:**
```typescript
// En página protegida
const userString = localStorage.getItem('user')
const user = JSON.parse(userString || '{}')
```

**DESPUÉS:**
```typescript
// En Server Component
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/auth'

export default async function HomePage() {
  const cookieStore = cookies()
  const accessToken = cookieStore.get('sb-access-token')?.value
  
  if (!accessToken) {
    redirect('/login')
  }
  
  const user = await getCurrentUser(accessToken)
  
  if (!user) {
    redirect('/login')
  }
  
  return (
    <div>
      <h1>Bienvenido {user.nombre}</h1>
      <p>Cédula: {user.cedula}</p>
    </div>
  )
}
```

### Paso 7: Agregar Botón de Logout

```tsx
// Componente de logout
'use client'

export function LogoutButton() {
  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' })
    window.location.href = '/login'
  }
  
  return (
    <button onClick={handleLogout}>
      Cerrar Sesión
    </button>
  )
}
```

### Paso 8: Probar el Sistema

1. **Test de Registro:**
   - Ir a `/crearcuenta`
   - Validar identificación
   - Crear contraseña
   - Verificar que se crea usuario en Supabase Auth Dashboard

2. **Test de Login:**
   - Ir a `/login`
   - Ingresar identificación + contraseña
   - Verificar redirección a `/home`
   - Revisar cookies en DevTools (Application → Cookies)
     - Debe haber `sb-access-token` (HttpOnly ✓)
     - Debe haber `sb-refresh-token` (HttpOnly ✓)

3. **Test de Middleware:**
   - Cerrar sesión
   - Intentar acceder a `/home` directamente
   - Debe redirigir a `/login`

4. **Test de Logout:**
   - Login exitoso
   - Hacer click en logout
   - Verificar que cookies se eliminan
   - Verificar redirección a `/login`

## Beneficios de la Migración

### Seguridad
- ✅ **HTTP-Only Cookies**: JavaScript no puede acceder (protección contra XSS)
- ✅ **Secure Flag**: Solo se envían por HTTPS en producción
- ✅ **SameSite**: Protección contra CSRF
- ✅ **Bcrypt**: Contraseñas hasheadas con 12 rounds
- ✅ **Supabase Auth**: JWT firmados, refresh automático

### UX
- ✅ **Sesiones Persistentes**: No necesitas re-login constante
- ✅ **Auto-refresh**: Tokens se renuevan automáticamente
- ✅ **Logout Global**: Cierra sesión en todos los tabs

### Desarrollo
- ✅ **Middleware Centralizado**: Protección de rutas en un solo lugar
- ✅ **TypeScript**: Tipos para `UsuarioData` y `EmpresaData`
- ✅ **Debugging**: Ver sesiones en Supabase Dashboard

## Notas Importantes

⚠️ **NUNCA expongas `SUPABASE_SERVICE_ROLE_KEY` en el cliente**
- Solo usar en API routes (server-side)
- Nunca incluir en código del browser
- No commitear en git (agregar a `.gitignore`)

⚠️ **Email interno es SOLO para mapeo**
- Usuarios NO usan email para login
- Solo ingresan: Identificación + Contraseña
- El email `{cedula}@clientes.interno` es solo para Supabase Auth

⚠️ **Mantener bcrypt en DB temporalmente**
- Por si necesitas rollback
- Después de 30 días de migración exitosa, puedes eliminar columna `password`

## Troubleshooting

### Error: "SUPABASE_SERVICE_ROLE_KEY not found"
- Verifica que agregaste la variable en `.env.local`
- Reinicia el servidor de desarrollo: `npm run dev`

### Error: "User already registered"
- Usuario ya tiene cuenta en Supabase Auth
- Verificar en Dashboard → Authentication → Users
- Si es prueba, puedes eliminar desde el Dashboard

### Cookies no se establecen
- Verifica que usas `NextResponse` en API routes
- Confirma que retornas `response.cookies.set(...)`
- Revisa configuración de `sameSite` y `secure`

### Middleware redirige infinitamente
- Verifica que `/login` esté en `publicRoutes`
- Confirma que no hay typos en `protectedRoutes`
- Revisa consola del navegador por errores

## Próximos Pasos

1. ✅ Ejecutar SQL para agregar columnas `correo`
2. ✅ Agregar `SUPABASE_SERVICE_ROLE_KEY` a `.env.local`
3. ⏳ Actualizar database types
4. ⏳ Probar registro de nuevo usuario
5. ⏳ Probar login con cookies
6. ⏳ Migrar páginas protegidas a usar `getCurrentUser()`
7. ⏳ Agregar botones de logout en la UI
8. ⏳ Desplegar a producción con variables de entorno correctas
