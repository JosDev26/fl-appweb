import { supabase } from './supabase'
import { NextRequest } from 'next/server'
import { extractClientInfo } from './security-logger'

// ============================================
// AUDIT LOGGING MODULE
// For tracking business-critical actions
// ============================================

export type AuditAction =
  | 'visto_bueno_created'
  | 'visto_bueno_deleted'
  | 'payment_uploaded'
  | 'payment_approved'
  | 'payment_rejected'
  | 'solicitud_created'
  | 'solicitud_updated'
  | 'user_created'
  | 'user_updated'
  | 'empresa_created'
  | 'empresa_updated'
  | 'admin_action'
  | 'data_export'
  | 'settings_changed'

export interface AuditEntry {
  action: AuditAction
  actorId: string
  actorType: 'cliente' | 'empresa' | 'admin' | 'system'
  resourceType: string
  resourceId: string
  changes?: Record<string, { old: unknown; new: unknown }>
  metadata?: Record<string, unknown>
  ip: string
  userAgent: string
  timestamp: string
}

/**
 * Log an audit event for business-critical actions
 * This is separate from security logging - it tracks legitimate actions
 */
export async function logAuditEvent(
  action: AuditAction,
  request: NextRequest,
  params: {
    actorId: string
    actorType: 'cliente' | 'empresa' | 'admin' | 'system'
    resourceType: string
    resourceId: string
    changes?: Record<string, { old: unknown; new: unknown }>
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const clientInfo = extractClientInfo(request)

  const entry: AuditEntry = {
    action,
    actorId: params.actorId,
    actorType: params.actorType,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    changes: params.changes,
    metadata: params.metadata,
    ip: clientInfo.ip,
    userAgent: clientInfo.userAgent,
    timestamp: new Date().toISOString()
  }

  // Console logging - sanitize PII unless explicit consent via env var
  const logPii = process.env.AUDIT_LOG_PII === 'true'
  const sanitizedEntry = logPii ? entry : {
    ...entry,
    ip: '[REDACTED]',
    userAgent: '[REDACTED]'
  }
  console.log('[Audit]', JSON.stringify(sanitizedEntry))

  // Database logging (if enabled)
  if (process.env.AUDIT_LOG_TO_DB === 'true') {
    try {
      // Note: audit_log table must be created first
      // Using 'as any' because table may not exist in types yet
      await (supabase as any).from('audit_log').insert({
        action: entry.action,
        actor_id: entry.actorId,
        actor_type: entry.actorType,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId,
        changes: entry.changes || null,
        metadata: entry.metadata || null,
        ip_address: entry.ip,
        user_agent: entry.userAgent,
        created_at: entry.timestamp
      })
    } catch (error) {
      console.error('[Audit] Failed to log to database:', error)
    }
  }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

export async function auditVistoBueno(
  request: NextRequest,
  userId: string,
  userType: 'cliente' | 'empresa',
  vistoBuenoId: string,
  mes: string
): Promise<void> {
  await logAuditEvent('visto_bueno_created', request, {
    actorId: userId,
    actorType: userType,
    resourceType: 'visto_bueno',
    resourceId: vistoBuenoId,
    metadata: { mes }
  })
}

export async function auditPaymentUpload(
  request: NextRequest,
  userId: string,
  userType: 'cliente' | 'empresa',
  receiptId: string,
  mesPago: string,
  monto?: number
): Promise<void> {
  await logAuditEvent('payment_uploaded', request, {
    actorId: userId,
    actorType: userType,
    resourceType: 'payment_receipt',
    resourceId: receiptId,
    metadata: { mesPago, monto }
  })
}

export async function auditPaymentApproval(
  request: NextRequest,
  adminId: string,
  receiptId: string,
  approved: boolean,
  reason?: string
): Promise<void> {
  await logAuditEvent(approved ? 'payment_approved' : 'payment_rejected', request, {
    actorId: adminId,
    actorType: 'admin',
    resourceType: 'payment_receipt',
    resourceId: receiptId,
    metadata: { reason }
  })
}

export async function auditAdminAction(
  request: NextRequest,
  adminId: string,
  actionDescription: string,
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await logAuditEvent('admin_action', request, {
    actorId: adminId,
    actorType: 'admin',
    resourceType,
    resourceId,
    metadata: { action: actionDescription, ...metadata }
  })
}
