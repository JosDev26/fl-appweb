import { useState, useCallback } from 'react'
import { InvitationCode } from '../types'
import { devLog } from '../utils/devLogger'

interface UseInvitationCodesReturn {
  invitationCodes: InvitationCode[]
  loading: boolean
  generatingCode: boolean
  generatedCode: string | null
  loadInvitationCodes: () => Promise<void>
  generateCode: (type: 'cliente' | 'empresa', expiryHours: number, maxUses: number, notes?: string) => Promise<boolean>
  deactivateCode: (codeId: string) => Promise<boolean>
  getCodeStatus: (code: InvitationCode) => { label: string; className: string }
}

export function useInvitationCodes(statusStyles: {
  badgeDanger: string
  badgeSuccess: string
  badgeWarning: string
  badgePrimary: string
}): UseInvitationCodesReturn {
  const [invitationCodes, setInvitationCodes] = useState<InvitationCode[]>([])
  const [loading, setLoading] = useState(false)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)

  const loadInvitationCodes = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/invitation-codes', {
        credentials: 'include'
      })
      const data = await response.json()
      
      devLog('Invitation codes response:', data)
      
      if (data.success) {
        setInvitationCodes(data.codes || [])
      } else {
        console.error('Error en respuesta:', data.error)
      }
    } catch (error) {
      console.error('Error cargando códigos:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const generateCode = useCallback(async (
    type: 'cliente' | 'empresa',
    expiryHours: number,
    maxUses: number,
    notes?: string
  ): Promise<boolean> => {
    // Validate inputs
    if (!Number.isFinite(expiryHours) || expiryHours <= 0) {
      alert('Por favor ingresa un valor válido para las horas de expiración')
      return false
    }
    if (!Number.isFinite(maxUses) || maxUses <= 0) {
      alert('Por favor ingresa un valor válido para el número máximo de usos')
      return false
    }

    setGeneratingCode(true)
    setGeneratedCode(null)

    try {
      const res = await fetch('/api/invitation-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          expiresInHours: expiryHours,
          maxUses,
          notes: notes || null
        })
      })
      const data = await res.json()
      
      if (data.success) {
        setGeneratedCode(data.code)
        await loadInvitationCodes()
        return true
      } else {
        alert('Error: ' + (data.error || 'Error al generar código'))
        return false
      }
    } catch (error) {
      alert('Error generando código')
      return false
    } finally {
      setGeneratingCode(false)
    }
  }, [loadInvitationCodes])

  const deactivateCode = useCallback(async (codeId: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/invitation-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ codeId, action: 'deactivate' })
      })
      const data = await res.json()
      
      if (data.success) {
        await loadInvitationCodes()
        return true
      } else {
        alert('Error: ' + data.error)
        return false
      }
    } catch (error) {
      alert('Error desactivando código')
      return false
    }
  }, [loadInvitationCodes])

  const getCodeStatus = useCallback((code: InvitationCode) => {
    if (!code.is_active) return { label: 'Inactivo', className: statusStyles.badgeDanger }
    if (code.used_at) return { label: 'Usado', className: statusStyles.badgeSuccess }
    if (new Date(code.expires_at) < new Date()) return { label: 'Expirado', className: statusStyles.badgeWarning }
    return { label: 'Activo', className: statusStyles.badgePrimary }
  }, [statusStyles])

  return {
    invitationCodes,
    loading,
    generatingCode,
    generatedCode,
    loadInvitationCodes,
    generateCode,
    deactivateCode,
    getCodeStatus
  }
}

export default useInvitationCodes
