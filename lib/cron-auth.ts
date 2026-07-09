import { NextRequest, NextResponse } from 'next/server'

// ============================================================================
// Auth centralizada para endpoints disparados por cron.
//
// Soporta dos tokens (auth dual):
//   - CRON_SECRET       -> estándar de Vercel Cron (Vercel lo inyecta
//                          automáticamente como `Authorization: Bearer <valor>`
//                          en las invocaciones del cron definidas en vercel.json).
//   - CRON_SECRET_TOKEN -> token custom usado por GitHub Actions
//                          (.github/workflows/sync-database.yml) al llamar
//                          manualmente a /api/sync/auto.
//
// Comportamiento:
//   - Si hay al menos un token configurado, el header `Authorization: Bearer`
//     debe matchear alguno. Si no matchea -> 401.
//   - Si NO hay ningún token configurado:
//       * En producción (VERCEL_ENV === 'production') -> 401 (fail-closed).
//         Evita dejar endpoints públicos si alguien olvida configurar el token.
//       * En dev/preview -> permite acceso (modo desarrollo, igual que antes).
//
// Uso:
//   const unauthorized = validateCronAuth(request)
//   if (unauthorized) return unauthorized
// ============================================================================

const PROD_ENVS = new Set(['production'])

function isProduction(): boolean {
  // VERCEL_ENV distingue production/preview/development en Vercel.
  // NODE_ENV === 'production' es fallback para entornos no-Vercel que seteen
  // solo NODE_ENV (poco común, pero defensivo).
  return (
    PROD_ENVS.has(process.env.VERCEL_ENV ?? '') ||
    process.env.NODE_ENV === 'production'
  )
}

/** Devuelve los tokens de cron válidos (no vacíos). */
export function getCronTokens(): string[] {
  return [process.env.CRON_SECRET, process.env.CRON_SECRET_TOKEN].filter(
    (t): t is string => typeof t === 'string' && t.trim() !== ''
  )
}

/** True si hay al menos un token de cron configurado. */
export function isCronAuthConfigured(): boolean {
  return getCronTokens().length > 0
}

/**
 * Valida el header `Authorization: Bearer <token>` del request contra los
 * tokens configurados.
 *
 * @returns `null` si la request está autorizada; otherwise una `NextResponse`
 *          401 lista para retornar.
 */
export function validateCronAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')
  const tokens = getCronTokens()

  if (tokens.length === 0) {
    if (isProduction()) {
      // Fail-closed: en producción sin token configurado, rechazamos.
      // Evita el agujero de seguridad "si expectedToken es undefined, deja pasar".
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized: no cron token configured (set CRON_SECRET or CRON_SECRET_TOKEN)',
        },
        { status: 401 }
      )
    }
    // Modo dev/preview sin token: permite acceso (comportamiento histórico).
    return null
  }

  const authorized = tokens.some(t => authHeader === `Bearer ${t}`)
  if (!authorized) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    )
  }
  return null
}
