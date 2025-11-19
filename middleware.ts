import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Rutas que requieren autenticación
const protectedRoutes = ['/home', '/caso', '/admin', '/pago', '/solicitud']

// Rutas públicas (no requieren autenticación)
const publicRoutes = ['/login', '/crearcuenta', '/']

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Verificar si la ruta necesita protección
  const isProtectedRoute = protectedRoutes.some(route => path.startsWith(route))
  const isPublicRoute = publicRoutes.some(route => path === route || path.startsWith(route + '/'))

  // Obtener tokens de las cookies
  const accessToken = request.cookies.get('sb-access-token')?.value
  const refreshToken = request.cookies.get('sb-refresh-token')?.value

  // Si es una ruta protegida y no hay sesión, redirigir al login
  if (isProtectedRoute && !accessToken) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Si hay sesión y el usuario intenta acceder al login, redirigir al home
  if (isPublicRoute && path === '/login' && accessToken) {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  // Verificar validez del token si existe
  if (accessToken) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const { data: { user }, error } = await supabase.auth.getUser(accessToken)

      if (error || !user) {
        // Token inválido, eliminar cookies y redirigir al login si es ruta protegida
        if (isProtectedRoute) {
          const response = NextResponse.redirect(new URL('/login', request.url))
          response.cookies.delete('sb-access-token')
          response.cookies.delete('sb-refresh-token')
          return response
        }
      }
    } catch (error) {
      console.error('Error verificando sesión:', error)
      if (isProtectedRoute) {
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }
  }

  return NextResponse.next()
}

// Configurar las rutas donde el middleware debe ejecutarse
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
