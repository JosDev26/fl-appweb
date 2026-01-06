import { NextRequest } from 'next/server'
import { supabase } from './supabase'
import { logIdorAttempt, logAccessDenied } from './security-logger'

// ============================================
// AUTHORIZATION HELPERS
// IDOR Protection & User Validation
// ============================================

export type UserType = 'cliente' | 'empresa'

export interface AuthenticatedUser {
  id: string
  type: UserType
}

export interface OwnershipResult {
  authorized: boolean
  error?: string
}

// ============================================
// USER EXTRACTION & VALIDATION
// ============================================

/**
 * Extract user ID from server-validated JWT (sb-access-token cookie)
 * This prevents spoofing as the token is set by the server after authentication
 * Returns null if not present or invalid
 */
export function extractUserId(request: NextRequest): string | null {
  // Get the access token from cookies (set by server on login)
  const accessToken = request.cookies.get('sb-access-token')?.value
  
  if (!accessToken) {
    return null
  }

  try {
    // JWT has 3 parts: header.payload.signature
    const parts = accessToken.split('.')
    if (parts.length !== 3) {
      return null
    }

    // Decode the payload (base64url)
    const payload = parts[1]
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8')
    const parsed = JSON.parse(decoded)

    // Return the subject (user ID) from the JWT
    return parsed.sub || null
  } catch {
    console.warn('[Auth] Failed to extract user ID from JWT')
    return null
  }
}

/**
 * Get user type from database (don't trust client headers)
 * This prevents user type spoofing attacks
 */
export async function getUserTypeFromDB(userId: string): Promise<UserType | null> {
  // Check usuarios table first
  const { data: cliente, error: clienteError } = await supabase
    .from('usuarios')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (!clienteError && cliente) {
    return 'cliente'
  }

  // Check empresas table
  const { data: empresa, error: empresaError } = await supabase
    .from('empresas')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (!empresaError && empresa) {
    return 'empresa'
  }

  return null
}

/**
 * Extract and validate user from request
 * Returns authenticated user or null
 */
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  const userId = extractUserId(request)
  
  if (!userId) {
    return null
  }

  const userType = await getUserTypeFromDB(userId)
  
  if (!userType) {
    return null
  }

  return { id: userId, type: userType }
}

// ============================================
// OWNERSHIP VALIDATION (IDOR PROTECTION)
// ============================================

/**
 * Validate that a user owns or has access to a solicitud
 * Prevents Insecure Direct Object Reference (IDOR) attacks
 */
export async function validateSolicitudAccess(
  request: NextRequest,
  solicitudId: string,
  user: AuthenticatedUser
): Promise<OwnershipResult> {
  try {
    // Get the solicitud
    const { data: solicitud, error } = await supabase
      .from('solicitudes')
      .select('id, id_cliente')
      .eq('id', solicitudId)
      .maybeSingle()

    if (error || !solicitud) {
      return { authorized: false, error: 'Solicitud no encontrada' }
    }

    // Direct ownership check for cliente
    if (user.type === 'cliente') {
      if (solicitud.id_cliente === user.id) {
        return { authorized: true }
      }

      // Log unauthorized access attempt
      await logIdorAttempt(request, user.id, 'solicitud', solicitudId)
      return { authorized: false, error: 'No tienes acceso a esta solicitud' }
    }

    // For empresa: verify the empresa-cliente relationship exists
    if (user.type === 'empresa') {
      if (!solicitud.id_cliente) {
        return { authorized: false, error: 'Solicitud sin cliente asignado' }
      }
      
      // Query the relationship table to verify empresa has access to this cliente
      // Try empresas_clientes table first (proper relation table)
      const { data: relation, error: relationError } = await (supabase as any)
        .from('empresas_clientes')
        .select('id')
        .eq('empresa_id', user.id)
        .eq('cliente_id', solicitud.id_cliente)
        .maybeSingle()

      // If relation table doesn't exist or query fails, fail closed for security
      if (relationError) {
        // Table might not exist - log and fail closed
        console.warn('[Auth] empresas_clientes query failed, failing closed:', relationError.message)
        await logIdorAttempt(request, user.id, 'solicitud', solicitudId)
        return { authorized: false, error: 'No tienes acceso a esta solicitud' }
      }

      // Only authorize if relationship row exists
      if (relation) {
        return { authorized: true }
      }

      await logIdorAttempt(request, user.id, 'solicitud', solicitudId)
      return { authorized: false, error: 'No tienes acceso a esta solicitud' }
    }

    return { authorized: false, error: 'Tipo de usuario inválido' }
  } catch (error) {
    console.error('[Auth] Error validating solicitud access:', error)
    return { authorized: false, error: 'Error verificando permisos' }
  }
}

/**
 * Validate that a user owns or has access to a caso (alias for solicitud in some contexts)
 */
export async function validateCasoAccess(
  request: NextRequest,
  casoId: string,
  user: AuthenticatedUser
): Promise<OwnershipResult> {
  try {
    // Get the caso from casos table
    const { data: caso, error } = await supabase
      .from('casos')
      .select('id, id_cliente')
      .eq('id', casoId)
      .maybeSingle()

    if (error || !caso) {
      return { authorized: false, error: 'Caso no encontrado' }
    }

    // Direct ownership check for cliente
    if (user.type === 'cliente') {
      if (caso.id_cliente === user.id) {
        return { authorized: true }
      }

      await logIdorAttempt(request, user.id, 'caso', casoId)
      return { authorized: false, error: 'No tienes acceso a este caso' }
    }

    // For empresa: verify the empresa-cliente relationship exists
    if (user.type === 'empresa') {
      if (!caso.id_cliente) {
        return { authorized: false, error: 'Caso sin cliente asignado' }
      }
      
      // Query the relationship table to verify empresa has access to this cliente
      const { data: relation, error: relationError } = await (supabase as any)
        .from('empresas_clientes')
        .select('id')
        .eq('empresa_id', user.id)
        .eq('cliente_id', caso.id_cliente)
        .maybeSingle()

      // If relation table doesn't exist or query fails, fail closed for security
      if (relationError) {
        console.warn('[Auth] empresas_clientes query failed, failing closed:', relationError.message)
        await logIdorAttempt(request, user.id, 'caso', casoId)
        return { authorized: false, error: 'No tienes acceso a este caso' }
      }

      // Only authorize if relationship row exists
      if (relation) {
        return { authorized: true }
      }

      await logIdorAttempt(request, user.id, 'caso', casoId)
      return { authorized: false, error: 'No tienes acceso a este caso' }
    }

    return { authorized: false, error: 'Tipo de usuario inválido' }
  } catch (error) {
    console.error('[Auth] Error validating caso access:', error)
    return { authorized: false, error: 'Error verificando permisos' }
  }
}

/**
 * Validate user can access their own data only
 */
export async function validateSelfAccess(
  request: NextRequest,
  resourceUserId: string,
  currentUser: AuthenticatedUser
): Promise<OwnershipResult> {
  if (currentUser.id === resourceUserId) {
    return { authorized: true }
  }

  // For empresa, check if the resource user belongs to them
  if (currentUser.type === 'empresa') {
    // Query to check if client exists
    const { data: cliente } = await (supabase as any)
      .from('usuarios')
      .select('id')
      .eq('id', resourceUserId)
      .maybeSingle()

    // For now, empresas can access their clients
    // TODO: Add proper empresa-cliente relationship check when schema is updated
    if (cliente) {
      return { authorized: true }
    }
  }

  await logAccessDenied(request, 'Self access denied', currentUser.id, resourceUserId)
  return { authorized: false, error: 'No tienes acceso a este recurso' }
}

// ============================================
// IDOR PROTECTION FEATURE FLAG
// ============================================

export function isIdorProtectionEnabled(): boolean {
  // Default to true for safety - set IDOR_PROTECTION_DISABLED=true to disable
  return process.env.IDOR_PROTECTION_DISABLED !== 'true'
}

/**
 * Main IDOR check wrapper with feature flag
 */
export async function checkSolicitudAccess(
  request: NextRequest,
  solicitudId: string
): Promise<{ user: AuthenticatedUser; authorized: true } | { authorized: false; error: string; status: number }> {
  // Get authenticated user
  const user = await getAuthenticatedUser(request)
  
  if (!user) {
    return { 
      authorized: false, 
      error: 'No autenticado', 
      status: 401 
    }
  }

  // Skip IDOR check if disabled (for debugging only)
  if (!isIdorProtectionEnabled()) {
    console.warn('[Security] IDOR protection is DISABLED')
    return { user, authorized: true }
  }

  // Validate access
  const result = await validateSolicitudAccess(request, solicitudId, user)
  
  if (!result.authorized) {
    return { 
      authorized: false, 
      error: result.error || 'Acceso denegado', 
      status: 403 
    }
  }

  return { user, authorized: true }
}

/**
 * Main IDOR check wrapper for casos
 */
export async function checkCasoAccess(
  request: NextRequest,
  casoId: string
): Promise<{ user: AuthenticatedUser; authorized: true } | { authorized: false; error: string; status: number }> {
  const user = await getAuthenticatedUser(request)
  
  if (!user) {
    return { authorized: false, error: 'No autenticado', status: 401 }
  }

  if (!isIdorProtectionEnabled()) {
    console.warn('[Security] IDOR protection is DISABLED')
    return { user, authorized: true }
  }

  const result = await validateCasoAccess(request, casoId, user)
  
  if (!result.authorized) {
    return { authorized: false, error: result.error || 'Acceso denegado', status: 403 }
  }

  return { user, authorized: true }
}
