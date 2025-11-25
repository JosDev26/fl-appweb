'use client'

import { useState, useEffect } from 'react'
import styles from './dev.module.css'

interface SyncResult {
  success: boolean
  message: string
  details?: any
}

interface PaymentReceipt {
  id: string
  user_id: string
  tipo_cliente: string
  file_path: string
  file_name: string
  file_size: number
  file_type: string
  mes_pago: string
  monto_declarado: number | null
  estado: string
  nota_revision: string | null
  uploaded_at: string
}

interface ClienteModoPago {
  id: string
  id_sheets: string | null
  nombre: string
  cedula: string | number
  correo: string | null
  modo_pago: boolean
  tipo: 'cliente' | 'empresa'
}

interface InvitationCode {
  id: string
  code: string
  type: 'cliente' | 'empresa'
  created_at: string
  expires_at: string
  used_at: string | null
  used_by: string | null
  is_active: boolean
  max_uses: number
  current_uses: number
  notes: string | null
}

interface InvoiceFile {
  name: string
  id: string
  created_at: string
  updated_at: string
  clientId: string
  clientType: 'cliente' | 'empresa'
  clientName: string
  clientCedula: string | number
  path: string
}

export default function DevPage() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SyncResult[]>([])
  const [activeView, setActiveView] = useState<'principal' | 'avanzado'>('principal')
  const [activeTab, setActiveTab] = useState<'sync' | 'config' | 'test' | 'invitations'>('sync')
  
  // Estados para vista principal
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([])
  const [clientesModoPago, setClientesModoPago] = useState<ClienteModoPago[]>([])
  const [loadingReceipts, setLoadingReceipts] = useState(false)
  const [reviewingReceipt, setReviewingReceipt] = useState<string | null>(null)
  const [rejectNota, setRejectNota] = useState<string>('')
  
  // Estados para códigos de invitación
  const [invitationCodes, setInvitationCodes] = useState<InvitationCode[]>([])
  const [loadingCodes, setLoadingCodes] = useState(false)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [newCodeType, setNewCodeType] = useState<'cliente' | 'empresa'>('cliente')
  const [newCodeExpiry, setNewCodeExpiry] = useState('48')
  const [newCodeMaxUses, setNewCodeMaxUses] = useState('1')
  const [newCodeNotes, setNewCodeNotes] = useState('')
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  
  // Estados para facturas electrónicas
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState<ClienteModoPago | null>(null)
  const [uploadingInvoice, setUploadingInvoice] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [monthInvoices, setMonthInvoices] = useState<InvoiceFile[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)

  // Cargar datos de pagos
  useEffect(() => {
    if (activeView === 'principal') {
      loadPaymentData()
      loadMonthInvoices()
    }
  }, [activeView])

  // Cargar códigos de invitación cuando se accede a la pestaña
  useEffect(() => {
    if (activeTab === 'invitations') {
      loadInvitationCodes()
    }
  }, [activeTab])

  const loadPaymentData = async () => {
    setLoadingReceipts(true)
    try {
      const response = await fetch('/api/payment-receipts')
      const data = await response.json()
      
      if (data.success) {
        setReceipts(data.data.receipts)
        setClientesModoPago(data.data.clientesConModoPago)
      }
    } catch (error) {
      console.error('Error loading payment data:', error)
    } finally {
      setLoadingReceipts(false)
    }
  }

  const handleApproveReceipt = async (receiptId: string) => {
    if (!confirm('¿Aprobar este comprobante y desactivar modo pago?')) return
    
    setReviewingReceipt(receiptId)
    try {
      const response = await fetch('/api/payment-receipts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptId,
          action: 'aprobar'
        })
      })

      const data = await response.json()
      
      if (data.success) {
        alert('Comprobante aprobado exitosamente')
        loadPaymentData()
      } else {
        alert('Error: ' + (data.error || 'Error al aprobar'))
      }
    } catch (error) {
      alert('Error al aprobar comprobante')
      console.error(error)
    } finally {
      setReviewingReceipt(null)
    }
  }

  const handleRejectReceipt = async (receiptId: string) => {
    const nota = prompt('Ingrese el motivo del rechazo:')
    if (!nota) return
    
    setReviewingReceipt(receiptId)
    try {
      const response = await fetch('/api/payment-receipts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptId,
          action: 'rechazar',
          nota
        })
      })

      const data = await response.json()
      
      if (data.success) {
        alert('Comprobante rechazado')
        loadPaymentData()
      } else {
        alert('Error: ' + (data.error || 'Error al rechazar'))
      }
    } catch (error) {
      alert('Error al rechazar comprobante')
      console.error(error)
    } finally {
      setReviewingReceipt(null)
    }
  }

  const downloadReceipt = async (filePath: string, fileName: string) => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data, error } = await supabase
        .storage
        .from('payment-receipts')
        .download(filePath)
      
      if (error) throw error
      
      if (data) {
        const url = URL.createObjectURL(data)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      alert('Error al descargar archivo')
      console.error(error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatMonto = (monto: number | null) => {
    if (!monto) return 'No especificado'
    return `₡${monto.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // Funciones para códigos de invitación
  const loadInvitationCodes = async () => {
    setLoadingCodes(true)
    try {
      const response = await fetch('/api/invitation-codes?includeUsed=true&includeExpired=true', {
        method: 'DELETE'
      })
      const data = await response.json()
      
      if (data.success) {
        setInvitationCodes(data.codes)
      }
    } catch (error) {
      console.error('Error loading invitation codes:', error)
    } finally {
      setLoadingCodes(false)
    }
  }

  const generateInvitationCode = async () => {
    setGeneratingCode(true)
    setGeneratedCode(null)
    try {
      const response = await fetch('/api/invitation-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newCodeType,
          expiresInHours: parseInt(newCodeExpiry),
          maxUses: parseInt(newCodeMaxUses),
          notes: newCodeNotes
        })
      })

      const data = await response.json()
      
      if (data.success) {
        setGeneratedCode(data.code)
        alert('Código generado exitosamente')
        loadInvitationCodes()
        // Limpiar formulario
        setNewCodeNotes('')
      } else {
        alert('Error: ' + (data.error || 'Error al generar código'))
      }
    } catch (error) {
      alert('Error al generar código')
      console.error(error)
    } finally {
      setGeneratingCode(false)
    }
  }

  const copyToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
    } catch (error) {
      alert('Error al copiar al portapapeles')
    }
  }

  const getCodeStatus = (code: InvitationCode) => {
    if (!code.is_active) return 'desactivado'
    if (new Date(code.expires_at) < new Date()) return 'expirado'
    if (code.current_uses >= code.max_uses) return 'agotado'
    return 'activo'
  }

  // Funciones para facturas electrónicas
  const openInvoiceModal = (cliente: ClienteModoPago) => {
    setSelectedClient(cliente)
    setShowInvoiceModal(true)
    setSelectedFile(null)
  }

  const closeInvoiceModal = () => {
    setShowInvoiceModal(false)
    setSelectedClient(null)
    setSelectedFile(null)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar extensión
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['xml', 'pdf'].includes(extension)) {
      alert('Solo se permiten archivos XML y PDF')
      return
    }

    // Validar tamaño (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('El archivo no puede superar los 10MB')
      return
    }

    setSelectedFile(file)
  }

  const uploadInvoice = async () => {
    if (!selectedFile || !selectedClient) return

    setUploadingInvoice(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('clientId', selectedClient.id)
      formData.append('clientType', selectedClient.tipo)

      const response = await fetch('/api/upload-invoice', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        alert('Factura subida exitosamente')
        closeInvoiceModal()
        loadMonthInvoices() // Recargar el historial
      } else {
        alert('Error: ' + (data.error || 'Error al subir factura'))
      }
    } catch (error) {
      alert('Error al subir factura')
      console.error(error)
    } finally {
      setUploadingInvoice(false)
    }
  }

  const loadMonthInvoices = async () => {
    setLoadingInvoices(true)
    try {
      const response = await fetch('/api/upload-invoice?getAllMonth=true')
      const data = await response.json()
      
      console.log('Respuesta del API de facturas:', data)
      
      if (data.success) {
        setMonthInvoices(data.invoices || [])
        console.log(`Se cargaron ${data.invoices?.length || 0} facturas del mes`)
      } else {
        console.error('Error al cargar facturas:', data.error)
      }
    } catch (error) {
      console.error('Error loading month invoices:', error)
    } finally {
      setLoadingInvoices(false)
    }
  }

  const downloadInvoice = async (filePath: string, fileName: string) => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data, error } = await supabase
        .storage
        .from('electronic-invoices')
        .download(filePath)
      
      if (error) throw error
      
      if (data) {
        const url = URL.createObjectURL(data)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      alert('Error al descargar factura')
      console.error(error)
    }
  }

  const getFileExtension = (fileName: string) => {
    return fileName.split('.').pop()?.toUpperCase() || ''
  }

  const deleteInvoice = async (filePath: string, fileName: string) => {
    if (!confirm(`¿Está seguro de eliminar la factura "${fileName}"?`)) return

    try {
      const response = await fetch(`/api/upload-invoice?filePath=${encodeURIComponent(filePath)}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        alert('Factura eliminada exitosamente')
        loadMonthInvoices() // Recargar el historial
      } else {
        alert('Error: ' + (data.error || 'Error al eliminar factura'))
      }
    } catch (error) {
      alert('Error al eliminar factura')
      console.error(error)
    }
  }

  const addResult = (result: SyncResult) => {
    setResults(prev => [result, ...prev])
  }

  const syncClientes = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Clientes completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Clientes',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncEmpresas = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-empresas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Empresas completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Empresas',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncContactos = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-contactos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Contactos completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Contactos',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncCasos = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-casos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Casos completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Casos',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncFuncionarios = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-funcionarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Funcionarios completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Funcionarios',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncControlHoras = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-control-horas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Control de Horas completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Control de Horas',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncSolicitudes = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Solicitudes completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Solicitudes',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncMaterias = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-materias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Materias completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Materias',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncActualizaciones = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-actualizaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Actualizaciones completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Actualizaciones',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncGastos = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Gastos completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Gastos',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncHistorialReportes = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-historial-reportes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Historial de Reportes completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Historial de Reportes',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncAll = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización completa exitosa' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar todo',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const validateConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/validate-config', {
        method: 'GET',
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Configuración válida' : 'Error en configuración',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al validar configuración',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const resetModoPago = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/reset-modo-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Modo pago reiniciado para todos los clientes' : 'Error al reiniciar',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al reiniciar modo pago',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const clearResults = () => {
    setResults([])
  }

  return (
    <div className={styles.container}>
      <div className={styles.panel}>
        <header className={styles.header}>
          <h1 className={styles.title}>Panel de Desarrollo</h1>
          <p className={styles.subtitle}>Gestión de Pagos y Sincronización</p>
        </header>

        {/* Navegación Principal/Avanzado */}
        <div className={styles.mainNav}>
          <button
            className={`${styles.navButton} ${activeView === 'principal' ? styles.navButtonActive : ''}`}
            onClick={() => setActiveView('principal')}
          >
            Principal
          </button>
          <button
            className={`${styles.navButton} ${activeView === 'avanzado' ? styles.navButtonActive : ''}`}
            onClick={() => setActiveView('avanzado')}
          >
            Avanzado
          </button>
        </div>

        {/* VISTA PRINCIPAL - Gestión de Pagos */}
        {activeView === 'principal' && (
          <div className={styles.principalView}>
            <div className={styles.principalHeader}>
              <h2 className={styles.sectionTitle}>Gestión de Comprobantes de Pago</h2>
              <button
                onClick={loadPaymentData}
                disabled={loadingReceipts}
                className={styles.refreshButton}
              >
                {loadingReceipts ? 'Cargando...' : 'Actualizar'}
              </button>
            </div>

            {loadingReceipts ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Cargando datos...</p>
              </div>
            ) : (
              <>
                {/* Comprobantes subidos */}
                <div className={styles.receiptsSection}>
                  <h3 className={styles.subsectionTitle}>
                    Comprobantes Subidos ({receipts.length})
                  </h3>
                  
                  {receipts.length === 0 ? (
                    <div className={styles.emptyState}>
                      <p>No hay comprobantes subidos</p>
                    </div>
                  ) : (
                    <div className={styles.receiptsGrid}>
                      {receipts.map((receipt) => (
                        <div key={receipt.id} className={styles.receiptCard}>
                          <div className={styles.receiptHeader}>
                            <span className={`${styles.receiptStatus} ${styles[`status${receipt.estado.charAt(0).toUpperCase() + receipt.estado.slice(1)}`]}`}>
                              {receipt.estado === 'pendiente' ? 'Pendiente' :
                               receipt.estado === 'aprobado' ? 'Aprobado' :
                               'Rechazado'}
                            </span>
                            <span className={styles.receiptType}>
                              {receipt.tipo_cliente === 'empresa' ? 'Empresa' : 'Cliente'}
                            </span>
                          </div>

                          <div className={styles.receiptInfo}>
                            <p className={styles.receiptUserId}>
                              <strong>ID Usuario:</strong> {receipt.user_id}
                            </p>
                            <p className={styles.receiptFile}>
                              <strong>Archivo:</strong> {receipt.file_name} ({formatFileSize(receipt.file_size)})
                            </p>
                            <p className={styles.receiptMonto}>
                              <strong>Monto:</strong> {formatMonto(receipt.monto_declarado)}
                            </p>
                            <p className={styles.receiptDate}>
                              <strong>Subido:</strong> {formatDate(receipt.uploaded_at)}
                            </p>
                            <p className={styles.receiptMonth}>
                              <strong>Mes:</strong> {receipt.mes_pago}
                            </p>
                            
                            {receipt.nota_revision && (
                              <p className={styles.receiptNota}>
                                <strong>Nota:</strong> {receipt.nota_revision}
                              </p>
                            )}
                          </div>

                          <div className={styles.receiptActions}>
                            <button
                              onClick={() => downloadReceipt(receipt.file_path, receipt.file_name)}
                              className={styles.downloadButton}
                            >
                              Descargar
                            </button>

                            {receipt.estado === 'pendiente' && (
                              <>
                                <button
                                  onClick={() => handleApproveReceipt(receipt.id)}
                                  disabled={reviewingReceipt === receipt.id}
                                  className={styles.approveButton}
                                >
                                  Aprobar
                                </button>
                                <button
                                  onClick={() => handleRejectReceipt(receipt.id)}
                                  disabled={reviewingReceipt === receipt.id}
                                  className={styles.rejectButton}
                                >
                                  Rechazar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Clientes con modoPago activo */}
                <div className={styles.modoPagoSection}>
                  <h3 className={styles.subsectionTitle}>
                    Clientes con Modo Pago Activo ({clientesModoPago.length})
                  </h3>
                  
                  {clientesModoPago.length === 0 ? (
                    <div className={styles.emptyState}>
                      <p>No hay clientes con modo pago activo</p>
                    </div>
                  ) : (
                    <div className={styles.clientesTable}>
                      <table>
                        <thead>
                          <tr>
                            <th>Tipo</th>
                            <th>Nombre</th>
                            <th>Cédula</th>
                            <th>Factura Electrónica</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientesModoPago.map((cliente) => (
                            <tr key={`${cliente.tipo}-${cliente.id}`}>
                              <td>{cliente.tipo === 'empresa' ? 'Empresa' : 'Cliente'}</td>
                              <td>{cliente.nombre}</td>
                              <td>{cliente.cedula}</td>
                              <td>
                                <button
                                  onClick={() => openInvoiceModal(cliente)}
                                  className={styles.invoiceButton}
                                >
                                  📄 Adjuntar Factura
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Historial de Facturas del Mes */}
                <div className={styles.invoicesHistorySection}>
                  <div className={styles.principalHeader}>
                    <h2 className={styles.sectionTitle}>Historial de Facturas del Mes</h2>
                    <button
                      onClick={loadMonthInvoices}
                      disabled={loadingInvoices}
                      className={styles.refreshButton}
                    >
                      {loadingInvoices ? 'Cargando...' : 'Actualizar'}
                    </button>
                  </div>

                  {loadingInvoices ? (
                    <div className={styles.loadingState}>
                      <div className={styles.spinner}></div>
                      <p>Cargando facturas...</p>
                    </div>
                  ) : monthInvoices.length === 0 ? (
                    <div className={styles.emptyState}>
                      <p>No hay facturas subidas este mes</p>
                    </div>
                  ) : (
                    <div className={styles.invoicesHistoryTable}>
                      <table>
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Cliente</th>
                            <th>Cédula</th>
                            <th>Tipo</th>
                            <th>Archivo</th>
                            <th>Formato</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthInvoices.map((invoice, index) => (
                            <tr key={`${invoice.clientId}-${invoice.name}-${index}`}>
                              <td>{formatDate(invoice.created_at)}</td>
                              <td>{invoice.clientName}</td>
                              <td>{invoice.clientCedula}</td>
                              <td>
                                <span className={`${styles.typeBadge} ${styles[`type${invoice.clientType.charAt(0).toUpperCase() + invoice.clientType.slice(1)}`]}`}>
                                  {invoice.clientType === 'empresa' ? 'Empresa' : 'Cliente'}
                                </span>
                              </td>
                              <td className={styles.fileNameCell}>{invoice.name}</td>
                              <td>
                                <span className={`${styles.formatBadge} ${styles[`format${getFileExtension(invoice.name)}`]}`}>
                                  {getFileExtension(invoice.name)}
                                </span>
                              </td>
                              <td>
                                <div className={styles.actionButtons}>
                                  <button
                                    onClick={() => downloadInvoice(invoice.path, invoice.name)}
                                    className={styles.downloadButtonSmall}
                                    title="Descargar factura"
                                  >
                                    ⬇️
                                  </button>
                                  <button
                                    onClick={() => deleteInvoice(invoice.path, invoice.name)}
                                    className={styles.deleteButtonSmall}
                                    title="Eliminar factura"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className={styles.invoicesSummary}>
                        <p><strong>Total de facturas este mes:</strong> {monthInvoices.length}</p>
                        <p><strong>XML:</strong> {monthInvoices.filter(i => getFileExtension(i.name) === 'XML').length}</p>
                        <p><strong>PDF:</strong> {monthInvoices.filter(i => getFileExtension(i.name) === 'PDF').length}</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Modal para subir facturas */}
            {showInvoiceModal && selectedClient && (
              <div className={styles.modalOverlay} onClick={closeInvoiceModal}>
                <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.modalHeader}>
                    <h3>Adjuntar Factura Electrónica</h3>
                    <button onClick={closeInvoiceModal} className={styles.closeButton}>✕</button>
                  </div>

                  <div className={styles.modalBody}>
                    <div className={styles.clientInfo}>
                      <p><strong>Cliente:</strong> {selectedClient.nombre}</p>
                      <p><strong>Cédula:</strong> {selectedClient.cedula}</p>
                      <p><strong>Tipo:</strong> {selectedClient.tipo === 'empresa' ? 'Empresa' : 'Cliente'}</p>
                    </div>

                    <div className={styles.uploadSection}>
                      <label className={styles.uploadLabel}>
                        <input
                          type="file"
                          accept=".xml,.pdf"
                          onChange={handleFileSelect}
                          style={{ display: 'none' }}
                          disabled={uploadingInvoice}
                        />
                        <div className={styles.uploadBox}>
                          {selectedFile ? (
                            <>
                              <span className={styles.fileIcon}>📄</span>
                              <span className={styles.fileName}>{selectedFile.name}</span>
                              <span className={styles.fileSize}>
                                ({(selectedFile.size / 1024).toFixed(2)} KB)
                              </span>
                            </>
                          ) : (
                            <>
                              <span className={styles.uploadIcon}>⬆️</span>
                              <span>Seleccionar archivo XML o PDF</span>
                              <span className={styles.uploadHint}>Máximo 10MB</span>
                            </>
                          )}
                        </div>
                      </label>

                      <div className={styles.securityInfo}>
                        <h4>🔒 Validaciones de Seguridad:</h4>
                        <ul>
                          <li>Solo se permiten archivos XML y PDF</li>
                          <li>Verificación de firmas de archivo</li>
                          <li>Detección de contenido malicioso</li>
                          <li>Límite de tamaño: 10MB</li>
                          <li>Escaneo de scripts y código embebido</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className={styles.modalFooter}>
                    <button
                      onClick={closeInvoiceModal}
                      className={styles.cancelButton}
                      disabled={uploadingInvoice}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={uploadInvoice}
                      className={styles.uploadButton}
                      disabled={!selectedFile || uploadingInvoice}
                    >
                      {uploadingInvoice ? 'Subiendo...' : 'Subir Factura'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VISTA AVANZADO - Sincronización (contenido original) */}
        {activeView === 'avanzado' && (
          <>
            <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'invitations' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('invitations')}
          >
            Códigos de Invitación
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'sync' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            Sincronización
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'config' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('config')}
          >
            Configuración
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'test' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('test')}
          >
            Pruebas
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === 'invitations' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Generador de Códigos de Invitación</h2>
              <p className={styles.description}>
                Genera códigos únicos y seguros para permitir el registro de nuevos usuarios y empresas
              </p>

              <div className={styles.codeGeneratorForm}>
                <div className={styles.formRow}>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Tipo de Usuario</label>
                    <select 
                      value={newCodeType} 
                      onChange={(e) => setNewCodeType(e.target.value as 'cliente' | 'empresa')}
                      className={styles.formSelect}
                      disabled={generatingCode}
                    >
                      <option value="cliente">Cliente</option>
                      <option value="empresa">Empresa</option>
                    </select>
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Expira en (horas)</label>
                    <input
                      type="number"
                      min="1"
                      value={newCodeExpiry}
                      onChange={(e) => setNewCodeExpiry(e.target.value)}
                      className={styles.formInput}
                      disabled={generatingCode}
                    />
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Máximo de usos</label>
                    <input
                      type="number"
                      min="1"
                      value={newCodeMaxUses}
                      onChange={(e) => setNewCodeMaxUses(e.target.value)}
                      className={styles.formInput}
                      disabled={generatingCode}
                    />
                  </div>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Notas (opcional)</label>
                  <input
                    type="text"
                    value={newCodeNotes}
                    onChange={(e) => setNewCodeNotes(e.target.value)}
                    className={styles.formInput}
                    placeholder="Ej: Código para cliente Juan Pérez"
                    disabled={generatingCode}
                  />
                </div>

                <button
                  onClick={generateInvitationCode}
                  disabled={generatingCode}
                  className={`${styles.actionButton} ${styles.primary}`}
                  style={{ marginTop: '1rem' }}
                >
                  {generatingCode ? 'Generando...' : 'Generar Código'}
                </button>

                {generatedCode && (
                  <div className={styles.generatedCodeBox}>
                    <h3>Código Generado:</h3>
                    <div className={styles.codeDisplay}>
                      <code>{generatedCode}</code>
                      <button
                        onClick={() => copyToClipboard(generatedCode)}
                        className={styles.copyButton}
                      >
                        {copiedCode === generatedCode ? '✓ Copiado' : 'Copiar'}
                      </button>
                    </div>
                    <p className={styles.codeInstruction}>
                      Comparte este código con el usuario para que pueda registrarse. 
                      El código es de un solo uso y expira en {newCodeExpiry} horas.
                    </p>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '3rem' }}>
                <div className={styles.principalHeader}>
                  <h2 className={styles.sectionTitle}>Códigos Generados</h2>
                  <button
                    onClick={loadInvitationCodes}
                    disabled={loadingCodes}
                    className={styles.refreshButton}
                  >
                    {loadingCodes ? 'Cargando...' : 'Actualizar'}
                  </button>
                </div>

                {loadingCodes ? (
                  <div className={styles.loadingState}>
                    <div className={styles.spinner}></div>
                    <p>Cargando códigos...</p>
                  </div>
                ) : invitationCodes.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No hay códigos generados</p>
                  </div>
                ) : (
                  <div className={styles.codesTable}>
                    <table>
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Tipo</th>
                          <th>Estado</th>
                          <th>Usos</th>
                          <th>Creado</th>
                          <th>Expira</th>
                          <th>Notas</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invitationCodes.map((code) => {
                          const status = getCodeStatus(code)
                          return (
                            <tr key={code.id}>
                              <td className={styles.codeCell}>
                                <code>{code.code.substring(0, 16)}...</code>
                              </td>
                              <td>{code.type === 'empresa' ? 'Empresa' : 'Cliente'}</td>
                              <td>
                                <span className={`${styles.statusBadge} ${styles[`status${status.charAt(0).toUpperCase() + status.slice(1)}`]}`}>
                                  {status}
                                </span>
                              </td>
                              <td>{code.current_uses} / {code.max_uses}</td>
                              <td>{formatDate(code.created_at)}</td>
                              <td>{formatDate(code.expires_at)}</td>
                              <td>{code.notes || '-'}</td>
                              <td>
                                <button
                                  onClick={() => copyToClipboard(code.code)}
                                  className={styles.copyButtonSmall}
                                  title="Copiar código completo"
                                >
                                  {copiedCode === code.code ? '✓' : '📋'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className={styles.infoBox} style={{ marginTop: '2rem' }}>
                <h3>Información de Seguridad:</h3>
                <ul>
                  <li>Cada código es generado usando criptografía segura (256 bits)</li>
                  <li>Los códigos son únicos y no pueden ser adivinados</li>
                  <li>Puedes configurar el tiempo de expiración y número de usos</li>
                  <li>Los códigos usados o expirados no pueden reutilizarse</li>
                  <li>Solo usuarios con códigos válidos pueden registrarse</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'sync' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Sincronización Manual</h2>
              <p className={styles.description}>
                Ejecuta la sincronización de datos entre Google Sheets y la base de datos
              </p>

              <div className={styles.buttonGrid}>
                <button
                  onClick={syncClientes}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? 'Procesando...' : 'Sincronizar Clientes'}
                </button>

                <button
                  onClick={syncEmpresas}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? 'Procesando...' : 'Sincronizar Empresas'}
                </button>

                <button
                  onClick={syncContactos}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? 'Procesando...' : 'Sincronizar Contactos'}
                </button>

                <button
                  onClick={syncMaterias}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? 'Procesando...' : 'Sincronizar Materias'}
                </button>

                <button
                  onClick={syncCasos}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? 'Procesando...' : 'Sincronizar Casos'}
                </button>

                <button
                  onClick={syncFuncionarios}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? 'Procesando...' : 'Sincronizar Funcionarios'}
                </button>

                <button
                  onClick={syncControlHoras}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? 'Procesando...' : 'Sincronizar Control Horas'}
                </button>

                <button
                  onClick={syncSolicitudes}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? 'Procesando...' : 'Sincronizar Solicitudes'}
                </button>

                <button
                  onClick={syncActualizaciones}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? 'Procesando...' : 'Sincronizar Actualizaciones'}
                </button>

                <button
                  onClick={syncGastos}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? 'Procesando...' : 'Sincronizar Gastos'}
                </button>

                <button
                  onClick={syncHistorialReportes}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? 'Procesando...' : 'Sincronizar Historial Reportes'}
                </button>

                <button
                  onClick={syncAll}
                  disabled={loading}
                  className={`${styles.actionButton} ${styles.primary}`}
                >
                  {loading ? 'Procesando...' : 'Sincronizar Todo'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Validación de Configuración</h2>
              <p className={styles.description}>
                Verifica que las credenciales y configuración estén correctas
              </p>

              <div className={styles.buttonGrid}>
                <button
                  onClick={validateConfig}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? 'Validando...' : 'Validar Configuración'}
                </button>
              </div>

              <h2 className={styles.sectionTitle} style={{marginTop: '2rem'}}>Control de Modo Pago</h2>
              <p className={styles.description}>
                Reiniciar el modo pago para todos los usuarios y empresas
              </p>

              <div className={styles.buttonGrid}>
                <button
                  onClick={resetModoPago}
                  disabled={loading}
                  className={`${styles.actionButton} ${styles.danger}`}
                >
                  {loading ? 'Procesando...' : 'Reiniciar Modo Pago (Todos a False)'}
                </button>
              </div>

              <div className={styles.infoBox}>
                <h3>Variables de Entorno Requeridas:</h3>
                <ul>
                  <li>NEXT_PUBLIC_SUPABASE_URL</li>
                  <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
                  <li>GOOGLE_SERVICE_ACCOUNT_EMAIL</li>
                  <li>GOOGLE_PRIVATE_KEY</li>
                  <li>GOOGLE_SPREADSHEET_ID</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'test' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Información del Sistema</h2>
              
              <div className={styles.infoBox}>
                <h3>Tablas Configuradas:</h3>
                <ul>
                  <li><strong>Clientes</strong> → tabla: usuarios</li>
                  <li><strong>Empresas</strong> → tabla: empresas</li>
                </ul>
              </div>

              <div className={styles.infoBox}>
                <h3>Mapeo de Columnas - Clientes:</h3>
                <ul>
                  <li>A: ID_Cliente → id_sheets</li>
                  <li>B: Nombre → nombre</li>
                  <li>C: Correo → correo</li>
                  <li>D: Telefono → telefono</li>
                  <li>E: Tipo_Identificación → tipo_cedula</li>
                  <li>F: Identificacion → cedula</li>
                  <li>H: Moneda → esDolar</li>
                  <li>J: Cuenta → estaRegistrado</li>
                </ul>
              </div>

              <div className={styles.infoBox}>
                <h3>Mapeo de Columnas - Empresas:</h3>
                <ul>
                  <li>A: ID_Cliente → id_sheets</li>
                  <li>B: Nombre → nombre</li>
                  <li>C: Cedula → cedula</li>
                  <li>G: IVA_Perc → iva_perc</li>
                  <li>H: Moneda → esDolar</li>
                  <li>J: Cuenta → estaRegistrado</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className={styles.resultsSection}>
            <div className={styles.resultsHeader}>
              <h2 className={styles.sectionTitle}>Resultados</h2>
              <button onClick={clearResults} className={styles.clearButton}>
                Limpiar
              </button>
            </div>

            <div className={styles.results}>
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`${styles.result} ${result.success ? styles.resultSuccess : styles.resultError}`}
                >
                  <div className={styles.resultHeader}>
                    <span className={styles.resultIcon}>
                      {result.success ? '✓' : '✗'}
                    </span>
                    <span className={styles.resultMessage}>{result.message}</span>
                  </div>
                  {result.details && (
                    <pre className={styles.resultDetails}>
                      {JSON.stringify(result.details, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  )
}
