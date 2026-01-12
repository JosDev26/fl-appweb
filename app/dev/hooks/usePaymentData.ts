import { useState, useCallback } from 'react'
import { PaymentReceipt, ClienteModoPago } from '../types'
import { devLog } from '../utils/devLogger'

interface UsePaymentDataReturn {
  receipts: PaymentReceipt[]
  clientesModoPago: ClienteModoPago[]
  loading: boolean
  reviewingReceipt: string | null
  loadPaymentData: () => Promise<void>
  handleViewFile: (filePath: string) => Promise<void>
  handleApproveReceipt: (receiptId: string) => Promise<boolean>
  handleRejectReceipt: (receiptId: string, nota: string) => Promise<boolean>
  handleResetModoPago: (clienteId: string, tipo: 'cliente' | 'empresa') => Promise<boolean>
  handleResetAllModoPago: () => Promise<boolean>
}

export function usePaymentData(): UsePaymentDataReturn {
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([])
  const [clientesModoPago, setClientesModoPago] = useState<ClienteModoPago[]>([])
  const [loading, setLoading] = useState(false)
  const [reviewingReceipt, setReviewingReceipt] = useState<string | null>(null)

  const loadPaymentData = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/payment-receipts')
      const data = await response.json()
      
      devLog('Payment receipts response:', data)
      
      if (data.success && data.data) {
        setReceipts(data.data.receipts || [])
        setClientesModoPago(data.data.clientesConModoPago || [])
      }
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleViewFile = useCallback(async (filePath: string) => {
    try {
      const response = await fetch(`/api/storage-url?path=${encodeURIComponent(filePath)}&bucket=payment-receipts`)
      const data = await response.json()
      
      if (data.success && data.signedUrl) {
        window.open(data.signedUrl, '_blank')
      } else {
        alert('Error obteniendo URL del archivo: ' + (data.error || 'Error desconocido'))
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error obteniendo URL del archivo')
    }
  }, [])

  const handleApproveReceipt = useCallback(async (receiptId: string): Promise<boolean> => {
    if (!confirm('¿Aprobar este comprobante y desactivar modo pago?')) return false
    
    setReviewingReceipt(receiptId)
    try {
      const res = await fetch('/api/payment-receipts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId, action: 'aprobar' })
      })
      const data = await res.json()
      if (data.success) {
        alert('Comprobante aprobado exitosamente')
        await loadPaymentData()
        return true
      } else {
        alert('Error: ' + (data.error || 'Error al aprobar'))
        return false
      }
    } catch (error) {
      alert('Error aprobando comprobante')
      return false
    } finally {
      setReviewingReceipt(null)
    }
  }, [loadPaymentData])

  const handleRejectReceipt = useCallback(async (receiptId: string, nota: string): Promise<boolean> => {
    if (!nota.trim()) {
      alert('Debes agregar una nota de rechazo')
      return false
    }
    
    setReviewingReceipt(receiptId)
    try {
      const res = await fetch('/api/payment-receipts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId, action: 'rechazar', nota })
      })
      const data = await res.json()
      if (data.success) {
        alert('Comprobante rechazado')
        await loadPaymentData()
        return true
      } else {
        alert('Error: ' + (data.error || 'Error al rechazar'))
        return false
      }
    } catch (error) {
      alert('Error rechazando comprobante')
      return false
    } finally {
      setReviewingReceipt(null)
    }
  }, [loadPaymentData])

  const handleResetModoPago = useCallback(async (clienteId: string, tipo: 'cliente' | 'empresa'): Promise<boolean> => {
    if (!confirm('¿Desactivar modo pago para este cliente?')) return false
    
    try {
      const res = await fetch('/api/modo-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, tipo, modoPago: false })
      })
      const data = await res.json()
      if (data.success) {
        alert('Modo pago desactivado')
        await loadPaymentData()
        return true
      } else {
        alert('Error: ' + (data.error || 'Error al desactivar'))
        return false
      }
    } catch (error) {
      alert('Error desactivando modo pago')
      return false
    }
  }, [loadPaymentData])

  const handleResetAllModoPago = useCallback(async (): Promise<boolean> => {
    if (!confirm('¿Desactivar modo pago para TODOS los clientes/empresas? Esta acción es irreversible.')) return false
    
    try {
      const res = await fetch('/api/modo-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-all' })
      })
      const data = await res.json()
      if (data.success) {
        alert(`Modo pago desactivado para ${data.updated} registros`)
        await loadPaymentData()
        return true
      } else {
        alert('Error: ' + (data.error || 'Error al resetear'))
        return false
      }
    } catch (error) {
      alert('Error reseteando modo pago')
      return false
    }
  }, [loadPaymentData])

  return {
    receipts,
    clientesModoPago,
    loading,
    reviewingReceipt,
    loadPaymentData,
    handleViewFile,
    handleApproveReceipt,
    handleRejectReceipt,
    handleResetModoPago,
    handleResetAllModoPago
  }
}

export default usePaymentData
