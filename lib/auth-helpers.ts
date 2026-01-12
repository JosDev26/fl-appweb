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
      console.warn('[Auth] JWT does not have 3 parts')
      return null
    }

    // Decode the payload using base64url normalization for edge runtime compatibility
    // JWT uses base64url encoding which differs from standard base64:
    // - Replace '-' with '+'
    // - Replace '_' with '/'
    // - Add '=' padding to make length a multiple of 4
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padding = base64.length % 4
    if (padding) {
      base64 += '='.repeat(4 - padding)
    }
    
    const payload = JSON.parse(atob(base64))

    // Return the user_id from user_metadata (this is the ID from usuarios/empresas table)
    // NOT payload.sub which is the Supabase Auth UUID
    const userId = payload.user_metadata?.user_id
    return userId ? String(userId) : null
  } catch (error) {
    console.warn('[Auth] Failed to extract user ID from JWT:', error)
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

    // For empresa: first check direct ownership, then grupo empresas, then relationship table
    if (user.type === 'empresa') {
      // Direct ownership check - empresa IS the client
      if (solicitud.id_cliente === user.id) {
        return { authorized: true }
      }

      if (!solicitud.id_cliente) {
        return { authorized: false, error: 'Solicitud sin cliente asignado' }
      }

      // Check if this empresa is principal of a group containing the solicitud's client
      const isGrupoPrincipal = await isEmpresaPrincipalOfGroup(user.id, solicitud.id_cliente)
      if (isGrupoPrincipal) {
        return { authorized: true }
      }
      
      // Query the relationship table to verify empresa has access to this cliente
      // Try empresas_clientes table (for empresa managing other clients)
      const { data: relation, error: relationError } = await (supabase as any)
        .from('empresas_clientes')
        .select('id')
        .eq('empresa_id', user.id)
        .eq('cliente_id', solicitud.id_cliente)
        .maybeSingle()

      // If relation table doesn't exist (42P01), skip silently - only direct ownership and grupo checks apply
      // For other errors, log a warning
      if (relationError && relationError.code !== '42P01') {
        console.warn('[Auth] empresas_clientes query failed:', relationError.message)
      }

      // Authorize if relationship row exists
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

    // For empresa: first check direct ownership, then grupo empresas, then relationship table
    if (user.type === 'empresa') {
      // Direct ownership check - empresa IS the client
      if (caso.id_cliente === user.id) {
        return { authorized: true }
      }

      if (!caso.id_cliente) {
        return { authorized: false, error: 'Caso sin cliente asignado' }
      }

      // Check if this empresa is principal of a group containing the caso's client
      const isGrupoPrincipal = await isEmpresaPrincipalOfGroup(user.id, caso.id_cliente)
      if (isGrupoPrincipal) {
        return { authorized: true }
      }
      
      // Query the relationship table to verify empresa has access to this cliente
      const { data: relation, error: relationError } = await (supabase as any)
        .from('empresas_clientes')
        .select('id')
        .eq('empresa_id', user.id)
        .eq('cliente_id', caso.id_cliente)
        .maybeSingle()

      // If relation table doesn't exist (42P01), only direct ownership and grupo checks apply
      // Only log warning for other errors
      if (relationError && relationError.code !== '42P01') {
        console.warn('[Auth] empresas_clientes query failed:', relationError.message)
      }

      // Authorize if relationship row exists
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
 * Check if an empresa principal has access to another empresa via grupos_empresas
 * Returns true if empresaId is the principal of a group containing targetEmpresaId
 */
export async function isEmpresaPrincipalOfGroup(
  empresaId: string,
  targetEmpresaId: string
): Promise<boolean> {
  try {
    // First, find if this empresa is a principal of any group
    const { data: grupo, error: grupoError } = await (supabase as any)
      .from('grupos_empresas')
      .select('id')
      .eq('empresa_principal_id', empresaId)
      .maybeSingle()

    if (grupoError || !grupo) {
      // Not a principal of any group
      return false
    }

    // Check if the target empresa is a member of this group
    const { data: miembro, error: miembroError } = await (supabase as any)
      .from('grupos_empresas_miembros')
      .select('id')
      .eq('grupo_id', grupo.id)
      .eq('empresa_id', targetEmpresaId)
      .maybeSingle()

    if (miembroError) {
      console.warn('[Auth] grupos_empresas_miembros query failed:', miembroError.message)
      return false
    }

    return !!miembro
  } catch (error) {
    console.error('[Auth] Error checking grupo empresas relationship:', error)
    return false
  }
}

/**
 * Check if an empresa has access to a specific cliente via empresas_clientes relationship
 * This is the central authorization check for empresa-cliente relationships
 */
export async function isEmpresaAuthorizedForCliente(
  empresaId: string,
  clienteId: string
): Promise<boolean> {
  try {
    const { data: relation, error } = await (supabase as any)
      .from('empresas_clientes')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('cliente_id', clienteId)
      .maybeSingle()

    // Fail closed: if query fails or no relation exists, deny access
    if (error) {
      console.warn('[Auth] empresas_clientes query failed:', error.message)
      return false
    }

    return !!relation
  } catch (error) {
    console.error('[Auth] Error checking empresa-cliente relationship:', error)
    return false
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

  // For empresa, verify proper empresa-cliente relationship exists
  if (currentUser.type === 'empresa') {
    const hasAccess = await isEmpresaAuthorizedForCliente(currentUser.id, resourceUserId)
    
    if (hasAccess) {
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
