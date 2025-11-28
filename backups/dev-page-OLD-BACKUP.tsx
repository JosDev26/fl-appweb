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
  const [activeSection, setActiveSection] = useState<'comprobantes' | 'facturas' | 'plazos' | 'visto-bueno' | 'invitaciones' | 'fecha' | 'sync' | 'config'>('comprobantes')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  
  // Estados para simulador de fecha
  const [simulatedDate, setSimulatedDate] = useState<string>('')
  const [isDateSimulated, setIsDateSimulated] = useState(false)
  const [currentRealDate, setCurrentRealDate] = useState<string>('')
  const [isMounted, setIsMounted] = useState(false)
  
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
  const [selectedInvoiceMonth, setSelectedInvoiceMonth] = useState<string>('')
  const [monthInvoices, setMonthInvoices] = useState<InvoiceFile[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)

  // Estados para plazos de facturas
  interface InvoiceDeadline {
    id: string
    mes_factura: string
    client_id: string
    client_type: string
    file_path: string
    fecha_emision: string
    fecha_vencimiento: string
    estado_pago: 'pendiente' | 'pagado' | 'vencido'
    fecha_pago?: string
    dias_plazo: number
    nota?: string
    clientName?: string
    clientCedula?: string | number
    diasRestantes?: number
  }
  const [invoiceDeadlines, setInvoiceDeadlines] = useState<InvoiceDeadline[]>([])
  const [loadingDeadlines, setLoadingDeadlines] = useState(false)
  const [editingDeadline, setEditingDeadline] = useState<string | null>(null)
  const [newDiasPlazo, setNewDiasPlazo] = useState<string>('')
  const [newNota, setNewNota] = useState<string>('')

  // Estados para notificaciones
  const [notification, setNotification] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error'
  }>({ show: false, message: '', type: 'success' })

  // Estados para gestión de visto bueno
  interface ClientVistoBueno {
    id: string
    nombre: string
    cedula: string | number
    tipo: 'cliente' | 'empresa'
    darVistoBueno: boolean
    modoPago: boolean
    vistoBuenoDado?: boolean
    fechaVistoBueno?: string
  }
  const [clientesVistoBueno, setClientesVistoBueno] = useState<ClientVistoBueno[]>([])
  const [loadingVistoBueno, setLoadingVistoBueno] = useState(false)
  const [updatingVistoBueno, setUpdatingVistoBueno] = useState<string | null>(null)

  // Cargar datos de pagos
  useEffect(() => {
    if (activeView === 'principal') {
      loadPaymentData()
      loadMonthInvoices()
      loadClientesVistoBueno() // Cargar para validar al subir facturas
    }
  }, [activeView])

  // Inicializar fecha actual
  useEffect(() => {
    setIsMounted(true)
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    setCurrentRealDate(dateStr)
    
    // Verificar si hay fecha simulada en localStorage
    const savedSimulatedDate = localStorage.getItem('simulatedDate')
    if (savedSimulatedDate) {
      setSimulatedDate(savedSimulatedDate)
      setIsDateSimulated(true)
    } else {
      setSimulatedDate(dateStr)
    }
    
    // Cargar datos de visto bueno después de que isMounted esté listo
    setTimeout(() => {
      loadClientesVistoBueno()
    }, 0)
  }, [])

  // Cargar códigos de invitación cuando se accede a la pestaña
  useEffect(() => {
    if (activeTab === 'invitations') {
      loadInvitationCodes()
    } else if (activeTab === 'invoice-deadlines') {
      loadInvoiceDeadlines()
    } else if (activeTab === 'visto-bueno') {
      loadClientesVistoBueno()
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
        setNotification({ show: true, message: 'Comprobante aprobado exitosamente', type: 'success' })
        loadPaymentData()
      } else {
        setNotification({ show: true, message: `Error: ${data.error || 'Error al aprobar'}`, type: 'error' })
      }
    } catch (error) {
      setNotification({ show: true, message: 'Error al aprobar comprobante', type: 'error' })
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
        setNotification({ show: true, message: 'Comprobante rechazado', type: 'success' })
        loadPaymentData()
      } else {
        setNotification({ show: true, message: `Error: ${data.error || 'Error al rechazar'}`, type: 'error' })
      }
    } catch (error) {
      setNotification({ show: true, message: 'Error al rechazar comprobante', type: 'error' })
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
      setNotification({ show: true, message: 'Error al descargar archivo', type: 'error' })
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

  const formatInvoiceDate = (fileName: string, fallbackDate: string) => {
    // Extraer timestamp del nombre del archivo (formato: {timestamp}_{mes}_{nombre})
    const parts = fileName.split('_')
    if (parts.length >= 3 && !isNaN(Number(parts[0]))) {
      const timestamp = Number(parts[0])
      return new Date(timestamp).toLocaleString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
    // Fallback a la fecha de creación del archivo
    return formatDate(fallbackDate)
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
  const openInvoiceModal = async (cliente: ClienteModoPago) => {
    // Verificar si requiere visto bueno y si ya lo dio
    if (cliente.modo_pago) {
      const clienteVB = clientesVistoBueno.find(c => c.id === cliente.id && c.tipo === cliente.tipo)
      
      if (clienteVB?.darVistoBueno && !clienteVB?.vistoBuenoDado) {
        alert(`⚠️ ${cliente.nombre} aún no ha dado visto bueno a las horas del mes.\n\nNo se puede subir la factura hasta que el cliente apruebe las horas trabajadas.`)
        return
      }
    }
    
    // Inicializar mes por defecto (mes anterior)
    const now = new Date()
    const mesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const mesDefault = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`
    
    setSelectedClient(cliente)
    setSelectedInvoiceMonth(mesDefault)
    setShowInvoiceModal(true)
    setSelectedFile(null)
  }

  const closeInvoiceModal = () => {
    setShowInvoiceModal(false)
    setSelectedClient(null)
    setSelectedFile(null)
    setSelectedInvoiceMonth('')
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
    if (!selectedFile || !selectedClient || !selectedInvoiceMonth) return

    setUploadingInvoice(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('clientId', selectedClient.id)
      formData.append('clientType', selectedClient.tipo)
      formData.append('mesFactura', selectedInvoiceMonth) // Mes de las horas trabajadas
      
      // Incluir fecha simulada si está activa (para fecha de emisión)
      if (isMounted && isDateSimulated && simulatedDate) {
        formData.append('simulatedDate', simulatedDate)
      }

      const response = await fetch('/api/upload-invoice', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        const monthInfo = data.mesFactura ? ` para ${data.mesFactura}` : ''
        alert(`Factura${monthInfo} subida exitosamente`)
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
      // Enviar fecha simulada si existe
      const simulatedDateStr = typeof window !== 'undefined' ? localStorage.getItem('simulatedDate') : null
      const url = simulatedDateStr 
        ? `/api/upload-invoice?getAllMonth=true&simulatedDate=${simulatedDateStr}`
        : '/api/upload-invoice?getAllMonth=true'
      const response = await fetch(url)
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

  // Funciones para gestión de plazos
  const loadInvoiceDeadlines = async () => {
    setLoadingDeadlines(true)
    try {
      const response = await fetch('/api/invoice-payment-status?getAllPending=true')
      const data = await response.json()
      
      if (data.success) {
        setInvoiceDeadlines(data.deadlines || [])
      } else {
        console.error('Error al cargar plazos:', data.error)
      }
    } catch (error) {
      console.error('Error loading deadlines:', error)
    } finally {
      setLoadingDeadlines(false)
    }
  }

  const updateDeadlinePlazo = async (deadline: InvoiceDeadline) => {
    try {
      const response = await fetch('/api/invoice-payment-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mesFactura: deadline.mes_factura,
          clientId: deadline.client_id,
          clientType: deadline.client_type,
          diasPlazo: parseInt(newDiasPlazo),
          nota: newNota || deadline.nota
        })
      })

      const data = await response.json()

      if (data.success) {
        alert('Plazo actualizado exitosamente')
        setEditingDeadline(null)
        setNewDiasPlazo('')
        setNewNota('')
        loadInvoiceDeadlines()
      } else {
        alert('Error: ' + (data.error || 'Error al actualizar plazo'))
      }
    } catch (error) {
      alert('Error al actualizar plazo')
      console.error(error)
    }
  }

  const startEditDeadline = (deadline: InvoiceDeadline) => {
    setEditingDeadline(deadline.id)
    setNewDiasPlazo(deadline.dias_plazo.toString())
    setNewNota(deadline.nota || '')
  }

  const cancelEditDeadline = () => {
    setEditingDeadline(null)
    setNewDiasPlazo('')
    setNewNota('')
  }

  // Funciones para gestión de visto bueno
  const loadClientesVistoBueno = async () => {
    setLoadingVistoBueno(true)
    try {
      // Obtener mes anterior (mes de horas trabajadas)
      // Leer directamente de localStorage sin depender de isMounted
      const simulatedDateStr = typeof window !== 'undefined' ? localStorage.getItem('simulatedDate') : null
      const now = simulatedDateStr ? new Date(simulatedDateStr + 'T12:00:00') : new Date()
      
      // Calcular mes anterior (mes de las horas que se están revisando)
      const mesAnterior = new Date(now)
      mesAnterior.setMonth(mesAnterior.getMonth() - 1)
      const mes = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`
      
      // Cargar usuarios
      const resUsuarios = await fetch('/api/client?getAll=true')
      const dataUsuarios = await resUsuarios.json()
      
      // Cargar empresas
      const resEmpresas = await fetch('/api/client?getAllEmpresas=true')
      const dataEmpresas = await resEmpresas.json()
      
      const clientes: ClientVistoBueno[] = []
      
      if (dataUsuarios.success && dataUsuarios.clientes) {
        for (const c of dataUsuarios.clientes) {
          let vistoBuenoDado = false
          let fechaVistoBueno = undefined
          
          // Si tiene darVistoBueno activo, verificar si ya dio visto bueno este mes
          if (c.darVistoBueno) {
            try {
              const vbRes = await fetch(`/api/visto-bueno?mes=${mes}`, {
                headers: {
                  'x-user-id': c.id,
                  'x-tipo-cliente': 'cliente'
                }
              })
              const vbData = await vbRes.json()
              if (vbData.success) {
                vistoBuenoDado = vbData.dado
                fechaVistoBueno = vbData.fecha_visto_bueno
              }
            } catch (err) {
              console.error('Error checking visto bueno:', err)
            }
          }
          
          clientes.push({
            id: c.id,
            nombre: c.nombre,
            cedula: c.cedula,
            tipo: 'cliente',
            darVistoBueno: c.darVistoBueno || false,
            modoPago: c.modoPago || false,
            vistoBuenoDado,
            fechaVistoBueno
          })
        }
      }
      
      if (dataEmpresas.success && dataEmpresas.empresas) {
        for (const e of dataEmpresas.empresas) {
          let vistoBuenoDado = false
          let fechaVistoBueno = undefined
          
          // Si tiene darVistoBueno activo, verificar si ya dio visto bueno este mes
          if (e.darVistoBueno) {
            try {
              const vbRes = await fetch(`/api/visto-bueno?mes=${mes}`, {
                headers: {
                  'x-user-id': e.id,
                  'x-tipo-cliente': 'empresa'
                }
              })
              const vbData = await vbRes.json()
              if (vbData.success) {
                vistoBuenoDado = vbData.dado
                fechaVistoBueno = vbData.fecha_visto_bueno
              }
            } catch (err) {
              console.error('Error checking visto bueno:', err)
            }
          }
          
          clientes.push({
            id: e.id,
            nombre: e.nombre,
            cedula: e.cedula,
            tipo: 'empresa',
            darVistoBueno: e.darVistoBueno || false,
            modoPago: e.modoPago || false,
            vistoBuenoDado,
            fechaVistoBueno
          })
        }
      }
      
      // Ordenar: primero los que tienen darVistoBueno activo, luego por nombre
      clientes.sort((a, b) => {
        if (a.darVistoBueno !== b.darVistoBueno) {
          return b.darVistoBueno ? 1 : -1
        }
        return a.nombre.localeCompare(b.nombre)
      })
      
      setClientesVistoBueno(clientes)
    } catch (error) {
      console.error('Error loading visto bueno:', error)
    } finally {
      setLoadingVistoBueno(false)
    }
  }

  const toggleVistoBueno = async (cliente: ClientVistoBueno) => {
    setUpdatingVistoBueno(cliente.id)
    try {
      const response = await fetch('/api/client/visto-bueno', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: cliente.id,
          clientType: cliente.tipo,
          darVistoBueno: !cliente.darVistoBueno
        })
      })

      const data = await response.json()

      if (data.success) {
        // Actualizar estado local
        setClientesVistoBueno(prev =>
          prev.map(c =>
            c.id === cliente.id
              ? { ...c, darVistoBueno: !c.darVistoBueno }
              : c
          )
        )
      } else {
        alert('Error: ' + (data.error || 'Error al actualizar'))
      }
    } catch (error) {
      alert('Error al actualizar visto bueno')
      console.error(error)
    } finally {
      setUpdatingVistoBueno(null)
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

  // Funciones para simulador de fecha
  const activateSimulatedDate = () => {
    if (!simulatedDate) {
      alert('Por favor seleccione una fecha')
      return
    }
    
    localStorage.setItem('simulatedDate', simulatedDate)
    setIsDateSimulated(true)
    alert(`Fecha simulada activada: ${new Date(simulatedDate).toLocaleDateString('es-ES', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}`)
    
    // Recargar la página para que todos los componentes usen la nueva fecha
    window.location.reload()
  }

  const deactivateSimulatedDate = () => {
    localStorage.removeItem('simulatedDate')
    setIsDateSimulated(false)
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    setSimulatedDate(dateStr)
    alert('Fecha simulada desactivada. Usando fecha real del sistema.')
    
    // Recargar la página para que todos los componentes usen la fecha real
    window.location.reload()
  }

  const resetToToday = () => {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    setSimulatedDate(dateStr)
  }

  const adjustDate = (days: number) => {
    const current = new Date(simulatedDate)
    current.setDate(current.getDate() + days)
    const newDateStr = current.toISOString().split('T')[0]
    setSimulatedDate(newDateStr)
  }

  return (
    <div className={styles.container}>
      {/* Notificación flotante */}
      {notification.show && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          <span>{notification.message}</span>
          <button
            className={styles.notificationClose}
            onClick={() => setNotification({ ...notification, show: false })}
          >
            ✕
          </button>
        </div>
      )}

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
                onClick={() => {
                  loadPaymentData()
                  loadClientesVistoBueno()
                }}
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
                            <th>Estado Visto Bueno</th>
                            <th>Factura Electrónica</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientesModoPago.map((cliente) => {
                            const clienteVB = clientesVistoBueno.find(c => c.id === cliente.id && c.tipo === cliente.tipo)
                            const requiereVB = clienteVB?.darVistoBueno || false
                            const vbDado = clienteVB?.vistoBuenoDado || false
                            
                            return (
                              <tr key={`${cliente.tipo}-${cliente.id}`}>
                                <td>{cliente.tipo === 'empresa' ? 'Empresa' : 'Cliente'}</td>
                                <td>{cliente.nombre}</td>
                                <td>{cliente.cedula}</td>
                                <td>
                                  {requiereVB ? (
                                    vbDado ? (
                                      <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.875rem' }}>
                                        ✅ Aprobado
                                      </span>
                                    ) : (
                                      <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '0.875rem' }}>
                                        ⏳ Pendiente
                                      </span>
                                    )
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                                      N/A
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <button
                                    onClick={() => openInvoiceModal(cliente)}
                                    className={styles.invoiceButton}
                                    disabled={requiereVB && !vbDado}
                                    style={requiereVB && !vbDado ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                                    title={requiereVB && !vbDado ? 'Cliente debe dar visto bueno primero' : 'Adjuntar factura electrónica'}
                                  >
                                    📄 Adjuntar Factura
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
                              <td>{formatInvoiceDate(invoice.name, invoice.created_at)}</td>
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

                    <div style={{ marginBottom: '1.5rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#19304B' }}>
                        📅 Mes de las horas trabajadas (a facturar):
                      </label>
                      <input
                        type="month"
                        value={selectedInvoiceMonth}
                        onChange={(e) => setSelectedInvoiceMonth(e.target.value)}
                        className={styles.formInput}
                        disabled={uploadingInvoice}
                        style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
                      />
                      <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                        Selecciona el mes de las horas que se están facturando (normalmente el mes anterior)
                      </p>
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
            className={`${styles.tab} ${activeTab === 'date-simulator' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('date-simulator')}
          >
            🗓️ Simulador de Fecha
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'invoice-deadlines' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('invoice-deadlines')}
          >
            📅 Plazos de Facturas
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'visto-bueno' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('visto-bueno')}
          >
            ✅ Visto Bueno
          </button>
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
          {activeTab === 'date-simulator' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Simulador de Fecha</h2>
              <p className={styles.description}>
                Simula diferentes fechas para probar funcionalidades dependientes del tiempo (facturas, pagos, reportes, etc.)
              </p>

              <div className={styles.dateSimulatorContainer}>
                <div className={styles.dateStatusCard}>
                  <h3>Estado Actual</h3>
                  {!isMounted ? (
                    <div className={styles.loadingState}>
                      <div className={styles.spinner}></div>
                      <p>Cargando...</p>
                    </div>
                  ) : isDateSimulated ? (
                    <div className={styles.dateActive}>
                      <span className={styles.statusBadge} style={{ backgroundColor: '#f59e0b' }}>🕐 Simulación Activa</span>
                      <p className={styles.dateDisplay}>
                        <strong>Fecha Simulada:</strong><br />
                        {new Date(simulatedDate + 'T12:00:00').toLocaleDateString('es-ES', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  ) : (
                    <div className={styles.dateInactive}>
                      <span className={styles.statusBadge} style={{ backgroundColor: '#10b981' }}>✓ Fecha Real</span>
                      <p className={styles.dateDisplay}>
                        <strong>Fecha del Sistema:</strong><br />
                        {new Date(currentRealDate + 'T12:00:00').toLocaleDateString('es-ES', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  )}
                </div>

                <div className={styles.dateControlCard}>
                  <h3>Seleccionar Fecha</h3>
                  <div className={styles.dateInputGroup}>
                    <input
                      type="date"
                      value={simulatedDate}
                      onChange={(e) => setSimulatedDate(e.target.value)}
                      className={styles.dateInput}
                    />
                    <button
                      onClick={resetToToday}
                      className={styles.todayButton}
                      title="Volver a hoy"
                    >
                      Hoy
                    </button>
                  </div>

                  <div className={styles.quickAdjust}>
                    <h4>Ajuste Rápido</h4>
                    <div className={styles.adjustButtons}>
                      <button onClick={() => adjustDate(-30)} className={styles.adjustButton}>-30 días</button>
                      <button onClick={() => adjustDate(-7)} className={styles.adjustButton}>-7 días</button>
                      <button onClick={() => adjustDate(-1)} className={styles.adjustButton}>-1 día</button>
                      <button onClick={() => adjustDate(1)} className={styles.adjustButton}>+1 día</button>
                      <button onClick={() => adjustDate(7)} className={styles.adjustButton}>+7 días</button>
                      <button onClick={() => adjustDate(30)} className={styles.adjustButton}>+30 días</button>
                    </div>
                  </div>

                  <div className={styles.dateActions}>
                    {!isDateSimulated ? (
                      <button
                        onClick={activateSimulatedDate}
                        className={`${styles.actionButton} ${styles.primary}`}
                      >
                        🕐 Activar Simulación
                      </button>
                    ) : (
                      <div className={styles.actionGroup}>
                        <button
                          onClick={activateSimulatedDate}
                          className={`${styles.actionButton} ${styles.warning}`}
                        >
                          🔄 Actualizar Fecha
                        </button>
                        <button
                          onClick={deactivateSimulatedDate}
                          className={`${styles.actionButton} ${styles.danger}`}
                        >
                          ✕ Desactivar Simulación
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.infoBox} style={{ marginTop: '2rem' }}>
                <h3>ℹ️ Información Importante:</h3>
                <ul>
                  <li><strong>Alcance Global:</strong> La fecha simulada afectará a toda la aplicación</li>
                  <li><strong>Persistencia:</strong> La fecha se guarda en localStorage y persiste entre sesiones</li>
                  <li><strong>Recarga Automática:</strong> La página se recargará al activar/desactivar para aplicar los cambios</li>
                  <li><strong>Casos de Uso:</strong> Probar vencimientos, generar reportes históricos, simular ciclos de facturación</li>
                  <li><strong>Advertencia:</strong> No usar en producción, solo para desarrollo y pruebas</li>
                </ul>
              </div>

              <div className={styles.infoBox} style={{ marginTop: '1rem', backgroundColor: '#fef3c7' }}>
                <h3>⚠️ Recomendaciones:</h3>
                <ul>
                  <li>Verifica que la fecha simulada sea coherente con tus pruebas</li>
                  <li>Recuerda desactivar la simulación cuando termines las pruebas</li>
                  <li>Ten en cuenta que algunos datos pueden quedar con timestamps simulados</li>
                  <li>Los jobs automáticos y cron jobs usarán la fecha simulada si está activa</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'invoice-deadlines' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Gestión de Plazos de Facturas</h2>
              <p className={styles.description}>
                Monitorea y gestiona los plazos de pago de las facturas electrónicas enviadas a los clientes
              </p>

              <div className={styles.principalHeader}>
                <h3>Facturas Pendientes y Vencidas</h3>
                <button
                  onClick={loadInvoiceDeadlines}
                  disabled={loadingDeadlines}
                  className={styles.refreshButton}
                >
                  {loadingDeadlines ? 'Cargando...' : 'Actualizar'}
                </button>
              </div>

              {loadingDeadlines ? (
                <div className={styles.loadingState}>
                  <div className={styles.spinner}></div>
                  <p>Cargando plazos...</p>
                </div>
              ) : invoiceDeadlines.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No hay facturas pendientes de pago</p>
                </div>
              ) : (
                <div className={styles.deadlinesTable}>
                  <table>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Cédula</th>
                        <th>Mes Factura</th>
                        <th>Fecha Emisión</th>
                        <th>Fecha Vencimiento</th>
                        <th>Días Restantes</th>
                        <th>Estado</th>
                        <th>Plazo (días)</th>
                        <th>Notas</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceDeadlines.map((deadline) => {
                        const isVencido = deadline.estado_pago === 'vencido'
                        const isPagado = deadline.estado_pago === 'pagado'
                        const isUrgente = (deadline.diasRestantes ?? 0) <= 3 && !isPagado && !isVencido
                        const isEditing = editingDeadline === deadline.id

                        return (
                          <tr key={deadline.id} className={isVencido ? styles.rowVencido : isUrgente ? styles.rowUrgente : ''}>
                            <td>{deadline.clientName}</td>
                            <td>{deadline.clientCedula}</td>
                            <td>
                              <strong>
                                {new Date(deadline.mes_factura + '-01').toLocaleDateString('es-CR', { 
                                  year: 'numeric', 
                                  month: 'long' 
                                })}
                              </strong>
                            </td>
                            <td>{new Date(deadline.fecha_emision).toLocaleDateString('es-CR')}</td>
                            <td>{new Date(deadline.fecha_vencimiento).toLocaleDateString('es-CR')}</td>
                            <td>
                              <span className={
                                isPagado ? styles.diasPagado :
                                isVencido ? styles.diasVencido : 
                                isUrgente ? styles.diasUrgente : 
                                styles.diasNormal
                              }>
                                {isPagado ? '✓ Pagado' : 
                                 isVencido ? `${Math.abs(deadline.diasRestantes ?? 0)} días vencido` : 
                                 `${deadline.diasRestantes} días`}
                              </span>
                            </td>
                            <td>
                              <span className={`${styles.statusBadge} ${
                                isPagado ? styles.statusPagado :
                                isVencido ? styles.statusVencido :
                                styles.statusPendiente
                              }`}>
                                {deadline.estado_pago}
                              </span>
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="1"
                                  value={newDiasPlazo}
                                  onChange={(e) => setNewDiasPlazo(e.target.value)}
                                  className={styles.formInput}
                                  style={{ width: '70px' }}
                                />
                              ) : (
                                `${deadline.dias_plazo} días`
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={newNota}
                                  onChange={(e) => setNewNota(e.target.value)}
                                  className={styles.formInput}
                                  placeholder="Agregar nota..."
                                />
                              ) : (
                                deadline.nota || '-'
                              )}
                            </td>
                            <td>
                              {!isPagado && (
                                <>
                                  {isEditing ? (
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                      <button
                                        onClick={() => updateDeadlinePlazo(deadline)}
                                        className={styles.actionButtonSmall}
                                        style={{ backgroundColor: '#10b981' }}
                                        title="Guardar"
                                      >
                                        ✓
                                      </button>
                                      <button
                                        onClick={cancelEditDeadline}
                                        className={styles.actionButtonSmall}
                                        style={{ backgroundColor: '#ef4444' }}
                                        title="Cancelar"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => startEditDeadline(deadline)}
                                      className={styles.actionButtonSmall}
                                      title="Editar plazo"
                                    >
                                      ✏️
                                    </button>
                                  )}
                                </>
                              )}
                              {isPagado && (
                                <span style={{ color: '#10b981' }}>
                                  ✓ {new Date(deadline.fecha_pago!).toLocaleDateString('es-CR')}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className={styles.infoBox} style={{ marginTop: '2rem' }}>
                <h3>📋 Información del Sistema de Plazos:</h3>
                <ul>
                  <li><strong>Fecha de Emisión:</strong> Fecha en que se sube la factura (segunda semana del mes siguiente)</li>
                  <li><strong>Plazo por defecto:</strong> 14 días desde la fecha de emisión</li>
                  <li><strong>Estados:</strong>
                    <ul>
                      <li><span style={{ color: '#f59e0b' }}>Pendiente:</span> Esperando pago dentro del plazo</li>
                      <li><span style={{ color: '#ef4444' }}>Vencido:</span> Pasó la fecha límite sin pagar</li>
                      <li><span style={{ color: '#10b981' }}>Pagado:</span> Comprobante aprobado</li>
                    </ul>
                  </li>
                  <li><strong>Alertas:</strong>
                    <ul>
                      <li>🔴 Filas rojas: Facturas vencidas</li>
                      <li>🟡 Filas amarillas: Facturas urgentes (3 días o menos)</li>
                    </ul>
                  </li>
                  <li><strong>Flujo de Pago:</strong>
                    <ol>
                      <li>Primera semana: Cliente recibe reporte de horas trabajadas</li>
                      <li>Primera semana: Cliente da visto bueno al monto</li>
                      <li>Segunda semana: Se envía factura electrónica (14 días para pagar)</li>
                      <li>Cliente sube comprobante y admin lo aprueba</li>
                    </ol>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'visto-bueno' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Gestión de Visto Bueno</h2>
              <p className={styles.description}>
                Configura qué clientes y empresas deben dar visto bueno a las horas trabajadas del mes antes de emitir la factura
              </p>

              <div className={styles.principalHeader}>
                <h3>Clientes y Empresas</h3>
                <button
                  onClick={loadClientesVistoBueno}
                  disabled={loadingVistoBueno}
                  className={styles.refreshButton}
                >
                  {loadingVistoBueno ? 'Cargando...' : 'Actualizar'}
                </button>
              </div>

              {loadingVistoBueno ? (
                <div className={styles.loadingState}>
                  <div className={styles.spinner}></div>
                  <p>Cargando clientes...</p>
                </div>
              ) : clientesVistoBueno.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No hay clientes registrados</p>
                </div>
              ) : (
                <>
                  <div className={styles.statsCards} style={{ marginBottom: '1.5rem' }}>
                    <div className={styles.statCard}>
                      <div className={styles.statValue}>
                        {clientesVistoBueno.filter(c => c.darVistoBueno).length}
                      </div>
                      <div className={styles.statLabel}>Con Visto Bueno Requerido</div>
                    </div>
                    <div className={styles.statCard} style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                      <div className={styles.statValue} style={{ color: 'white' }}>
                        {clientesVistoBueno.filter(c => c.darVistoBueno && c.modoPago && c.vistoBuenoDado).length}
                      </div>
                      <div className={styles.statLabel} style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                        ✅ Aprobaciones Este Mes
                      </div>
                    </div>
                    <div className={styles.statCard} style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
                      <div className={styles.statValue} style={{ color: 'white' }}>
                        {clientesVistoBueno.filter(c => c.darVistoBueno && c.modoPago && !c.vistoBuenoDado).length}
                      </div>
                      <div className={styles.statLabel} style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                        ⏳ Pendientes de Aprobar
                      </div>
                    </div>
                    <div className={styles.statCard}>
                      <div className={styles.statValue}>
                        {clientesVistoBueno.filter(c => !c.darVistoBueno).length}
                      </div>
                      <div className={styles.statLabel}>Sin Visto Bueno Requerido</div>
                    </div>
                  </div>

                  <div className={styles.deadlinesTable}>
                    <table>
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>Cédula</th>
                          <th>Tipo</th>
                          <th>Requiere Visto Bueno</th>
                          <th>Estado del Mes</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientesVistoBueno.map((cliente) => (
                          <tr key={`${cliente.tipo}-${cliente.id}`}>
                            <td><strong>{cliente.nombre}</strong></td>
                            <td>{cliente.cedula}</td>
                            <td>
                              <span className={`${styles.statusBadge} ${cliente.tipo === 'empresa' ? styles.statusPendiente : styles.statusPagado}`}>
                                {cliente.tipo === 'empresa' ? 'Jurídico' : 'Físico'}
                              </span>
                            </td>
                            <td>
                              {cliente.darVistoBueno ? (
                                <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                                  ✅ Sí
                                </span>
                              ) : (
                                <span style={{ color: '#475569', fontWeight: '600' }}>
                                  ➖ No
                                </span>
                              )}
                            </td>
                            <td>
                              {cliente.darVistoBueno ? (
                                !cliente.modoPago ? (
                                  <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                    ⏸️ Sin facturación activa
                                  </span>
                                ) : cliente.vistoBuenoDado ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                                      ✅ Visto Bueno Dado
                                    </span>
                                    {cliente.fechaVistoBueno && (
                                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        📅 {new Date(cliente.fechaVistoBueno).toLocaleDateString('es-ES', {
                                          day: '2-digit',
                                          month: 'short',
                                          year: 'numeric'
                                        })} • {new Date(cliente.fechaVistoBueno).toLocaleTimeString('es-ES', {
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                                    ⏳ Pendiente de Aprobación
                                  </span>
                                )
                              ) : (
                                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                  N/A
                                </span>
                              )}
                            </td>
                            <td>
                              <button
                                onClick={() => toggleVistoBueno(cliente)}
                                disabled={updatingVistoBueno === cliente.id}
                                className={styles.actionButtonSmall}
                                style={{
                                  backgroundColor: cliente.darVistoBueno ? '#ef4444' : '#10b981'
                                }}
                                title={cliente.darVistoBueno ? 'Desactivar visto bueno' : 'Activar visto bueno'}
                              >
                                {updatingVistoBueno === cliente.id ? '...' : (cliente.darVistoBueno ? '✕ Desactivar' : '✓ Activar')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className={styles.infoBox} style={{ marginTop: '2rem', borderLeft: '4px solid #f59e0b' }}>
                <h3>⚠️ Restricción de Facturas</h3>
                <p style={{ fontSize: '1rem', marginBottom: '1rem', color: '#f59e0b', fontWeight: '600' }}>
                  <strong>IMPORTANTE:</strong> Los clientes con visto bueno requerido NO pueden recibir facturas electrónicas hasta que den su aprobación mensual.
                </p>
                <ul>
                  <li><strong>🔒 Bloqueo automático:</strong> En la vista "Principal", el botón "Adjuntar Factura" estará deshabilitado para clientes pendientes de aprobación</li>
                  <li><strong>✅ Aprobación requerida:</strong> El cliente debe entrar a su portal, revisar las horas del mes y dar "Visto Bueno" desde la página de Pago</li>
                  <li><strong>📄 Después de aprobar:</strong> Una vez dado el visto bueno, se desbloquea la opción de adjuntar la factura electrónica</li>
                  <li><strong>📅 Renovación mensual:</strong> El visto bueno se reinicia cada mes - cada mes se requiere nueva aprobación</li>
                </ul>
              </div>

              <div className={styles.infoBox} style={{ marginTop: '1.5rem' }}>
                <h3>📋 ¿Qué es el Visto Bueno?</h3>
                <ul>
                  <li><strong>Propósito:</strong> Algunos clientes/empresas necesitan revisar y aprobar las horas trabajadas del mes antes de recibir la factura</li>
                  <li><strong>Flujo con Visto Bueno:</strong>
                    <ol>
                      <li><strong>Primera semana del mes siguiente:</strong> Cliente recibe reporte de horas trabajadas</li>
                      <li><strong>Primera semana:</strong> Cliente revisa y da visto bueno al monto desde su portal</li>
                      <li><strong>Segunda semana:</strong> Una vez aprobado, el administrador puede adjuntar la factura electrónica</li>
                      <li><strong>Plazo de pago:</strong> Cliente tiene 14 días para pagar desde la emisión de factura</li>
                    </ol>
                  </li>
                  <li><strong>Flujo sin Visto Bueno:</strong>
                    <ol>
                      <li><strong>Primera semana:</strong> Cliente recibe reporte informativo</li>
                      <li><strong>Segunda semana:</strong> Se puede adjuntar factura directamente sin esperar aprobación</li>
                      <li><strong>Plazo de pago:</strong> 14 días desde la emisión</li>
                    </ol>
                  </li>
                  <li><strong>Cuándo activar:</strong> Para clientes corporativos, empresas con proceso de aprobación interno, o contratos que lo requieran</li>
                  <li><strong>Nota:</strong> Este campo NO se sincroniza con AppSheet, es exclusivo del sistema web</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'invitations' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Generador de Códigos de Invitación</h2>
              <p className={styles.description}>
                Genera códigos únicos y seguros para permitir el registro de nuevos usuarios y empresas
              </p>

              <div className={styles.codeGeneratorForm}>
                <div className={styles.formRow}>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Tipo de cedula</label>
                    <select 
                      value={newCodeType} 
                      onChange={(e) => setNewCodeType(e.target.value as 'cliente' | 'empresa')}
                      className={styles.formSelect}
                      disabled={generatingCode}
                    >
                      <option value="cliente">Físico</option>
                      <option value="empresa">Jurídico</option>
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
