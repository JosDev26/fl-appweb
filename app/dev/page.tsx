'use client'

import { useState, useEffect } from 'react'
import styles from './dev.module.css'

// ===== INTERFACES =====
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
  id_sheets?: string | null
  nombre: string
  cedula: string | number
  correo: string | null
  modoPago: boolean  // camelCase como viene del API
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

interface ClientVistoBueno {
  id: string
  nombre: string
  cedula: string | number
  darVistoBueno: boolean
  tipo: 'cliente' | 'empresa'
}

interface GrupoEmpresa {
  id: string
  nombre: string
  empresa_principal_id: string
  empresa_principal?: { id: string; nombre: string }
  empresas_asociadas: { id: string; nombre: string; iva_perc?: number }[]
  created_at: string
}

interface EmpresaDisponible {
  id: string
  nombre: string
  iva_perc: number
}

type SectionType = 'comprobantes' | 'facturas' | 'plazos' | 'visto-bueno' | 'invitaciones' | 'ingresos' | 'fecha' | 'sync' | 'config' | 'grupos'

// ===== COMPONENTE PRINCIPAL =====
export default function DevPage() {
  // Estado de navegación
  const [activeSection, setActiveSection] = useState<SectionType>('comprobantes')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMounted, setIsMounted] = useState(false)

  // Estados globales
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SyncResult[]>([])
  
  // Estados por sección
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([])
  const [clientesModoPago, setClientesModoPago] = useState<ClienteModoPago[]>([])
  const [invitationCodes, setInvitationCodes] = useState<InvitationCode[]>([])
  const [monthInvoices, setMonthInvoices] = useState<InvoiceFile[]>([])
  const [clientesVistoBueno, setClientesVistoBueno] = useState<ClientVistoBueno[]>([])
  
  // Estados de loading por sección
  const [loadingReceipts, setLoadingReceipts] = useState(false)
  const [loadingCodes, setLoadingCodes] = useState(false)
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [loadingVistoBueno, setLoadingVistoBueno] = useState(false)
  const [loadingDeadlines, setLoadingDeadlines] = useState(false)
  
  // Estados para modales y formularios
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState<ClienteModoPago | null>(null)
  const [reviewingReceipt, setReviewingReceipt] = useState<string | null>(null)
  const [rejectNota, setRejectNota] = useState<string>('')
  const [uploadingInvoice, setUploadingInvoice] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedInvoiceMonth, setSelectedInvoiceMonth] = useState<string>('')
  
  // Estados para códigos de invitación
  const [generatingCode, setGeneratingCode] = useState(false)
  const [newCodeType, setNewCodeType] = useState<'cliente' | 'empresa'>('cliente')
  const [newCodeExpiry, setNewCodeExpiry] = useState('48')
  const [newCodeMaxUses, setNewCodeMaxUses] = useState('1')
  const [newCodeNotes, setNewCodeNotes] = useState('')
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  
  // Estados para simulador de fecha (GLOBAL - afecta a todos los usuarios)
  const [simulatedDate, setSimulatedDate] = useState<string>('')
  const [isDateSimulated, setIsDateSimulated] = useState(false)
  const [currentRealDate, setCurrentRealDate] = useState<string>('')
  const [loadingDateSimulator, setLoadingDateSimulator] = useState(false)
  
  // Estados para plazos de facturas
  const [invoiceDeadlines, setInvoiceDeadlines] = useState<any[]>([])
  
  // Estados para ingresos
  const [ingresos, setIngresos] = useState<any[]>([])
  const [ingresosResumen, setIngresosResumen] = useState<any>(null)
  const [loadingIngresos, setLoadingIngresos] = useState(false)
  const [ingresosYear, setIngresosYear] = useState<string>(new Date().getFullYear().toString())
  const [ingresosMes, setIngresosMes] = useState<string>('')

  // Estados para grupos de empresas
  const [grupos, setGrupos] = useState<GrupoEmpresa[]>([])
  const [empresasDisponibles, setEmpresasDisponibles] = useState<EmpresaDisponible[]>([])
  const [loadingGrupos, setLoadingGrupos] = useState(false)
  const [nuevoGrupoNombre, setNuevoGrupoNombre] = useState('')
  const [nuevoGrupoEmpresaPrincipal, setNuevoGrupoEmpresaPrincipal] = useState('')
  const [nuevoGrupoEmpresas, setNuevoGrupoEmpresas] = useState<string[]>([])
  const [creandoGrupo, setCreandoGrupo] = useState(false)

  // Montaje del componente - cargar fecha simulada global
  useEffect(() => {
    setIsMounted(true)
    const now = new Date()
    setCurrentRealDate(now.toISOString().split('T')[0])
    
    // Cargar fecha simulada global desde Supabase
    const loadGlobalSimulatedDate = async () => {
      try {
        const res = await fetch('/api/simulated-date')
        const data = await res.json()
        if (data.simulated && data.date) {
          setSimulatedDate(data.date)
          setIsDateSimulated(true)
        }
      } catch (error) {
        console.error('Error cargando fecha simulada:', error)
      }
    }
    loadGlobalSimulatedDate()
  }, [])

  // ===== FUNCIONES DE CARGA POR SECCIÓN =====
  
  // COMPROBANTES
  const loadPaymentData = async () => {
    setLoadingReceipts(true)
    try {
      // Endpoint original sin parámetros extra
      const response = await fetch('/api/payment-receipts')
      const data = await response.json()
      
      console.log('Payment receipts response:', data)
      
      if (data.success && data.data) {
        setReceipts(data.data.receipts || [])
        setClientesModoPago(data.data.clientesConModoPago || [])
      }
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      setLoadingReceipts(false)
    }
  }

  // Ver archivo con URL firmada (para bucket privado)
  const handleViewFile = async (filePath: string) => {
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
  }

  const handleApproveReceipt = async (receiptId: string) => {
    if (!confirm('¿Aprobar este comprobante y desactivar modo pago?')) return
    
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
      } else {
        alert('Error: ' + (data.error || 'Error al aprobar'))
      }
    } catch (error) {
      alert('Error aprobando comprobante')
    } finally {
      setReviewingReceipt(null)
    }
  }

  const handleRejectReceipt = async (receiptId: string, nota?: string) => {
    const notaRechazo = nota || rejectNota
    if (!notaRechazo.trim()) {
      alert('Debes agregar una nota de rechazo')
      return
    }
    setReviewingReceipt(receiptId)
    try {
      const res = await fetch('/api/payment-receipts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId, action: 'rechazar', nota: notaRechazo })
      })
      const data = await res.json()
      if (data.success) {
        alert('Comprobante rechazado')
        setRejectNota('')
        await loadPaymentData()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      alert('Error rechazando comprobante')
    } finally {
      setReviewingReceipt(null)
    }
  }

  // Resetear modoPago de todos los clientes y empresas
  const handleResetAllModoPago = async () => {
    if (!confirm('¿Estás seguro de quitar el modoPago a TODOS los clientes y empresas? Esta acción no se puede deshacer.')) {
      return
    }
    
    try {
      const res = await fetch('/api/client', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resetAllModoPago' })
      })
      const data = await res.json()
      
      if (data.success) {
        alert(`modoPago reseteado exitosamente:\n- ${data.usuariosActualizados} clientes\n- ${data.empresasActualizadas} empresas`)
        await loadPaymentData()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error reseteando modoPago')
    }
  }

  // FACTURAS
  const loadMonthInvoices = async () => {
    setLoadingInvoices(true)
    try {
      // El servidor usa la fecha simulada global automáticamente
      const response = await fetch('/api/upload-invoice?getAllMonth=true')
      const data = await response.json()
      
      console.log('Respuesta facturas:', data)
      
      if (data.success) {
        setMonthInvoices(data.invoices || [])
      }
    } catch (error) {
      console.error('Error cargando facturas:', error)
    } finally {
      setLoadingInvoices(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'xml') {
        setSelectedFile(file)
      } else {
        alert('Solo se permiten archivos XML')
        e.target.value = ''
      }
    }
  }

  const handleUploadInvoice = async () => {
    if (!selectedFile || !selectedClient || !selectedInvoiceMonth) return
    setUploadingInvoice(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('clientId', selectedClient.id)
      formData.append('clientType', selectedClient.tipo)
      formData.append('month', selectedInvoiceMonth)
      const res = await fetch('/api/upload-invoice', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        alert('Factura subida exitosamente')
        setShowInvoiceModal(false)
        setSelectedClient(null)
        setSelectedFile(null)
        await loadMonthInvoices()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      alert('Error subiendo factura')
    } finally {
      setUploadingInvoice(false)
    }
  }

  // PLAZOS DE FACTURAS
  const loadInvoiceDeadlines = async () => {
    setLoadingDeadlines(true)
    try {
      // Calcular plazos basados en clientes con modoPago activo
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth()
      const mesAnterior = new Date(year, month - 1, 1)
      const mesPago = mesAnterior.toISOString().slice(0, 7)
      // Fecha límite: día 15 del mes SIGUIENTE al actual
      const finMes = new Date(year, month + 1, 15)
      
      const clientesConModoPago = (clientesModoPago || []).filter(c => c.modoPago)
      
      const deadlines = clientesConModoPago.map(cliente => {
        const diasRestantes = Math.ceil((finMes.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return {
          nombre: cliente.nombre,
          tipo: cliente.tipo,
          mes_pago: mesPago,
          dias_restantes: diasRestantes,
          tiene_factura: false // TODO: consultar si existe factura
        }
      })
      
      setInvoiceDeadlines(deadlines)
    } catch (error) {
      console.error('Error cargando plazos:', error)
    } finally {
      setLoadingDeadlines(false)
    }
  }

  // VISTO BUENO
  const loadClientesVistoBueno = async () => {
    setLoadingVistoBueno(true)
    try {
      // Usar los endpoints originales que funcionan
      const [usuariosRes, empresasRes] = await Promise.all([
        fetch('/api/client?getAll=true'),
        fetch('/api/client?getAllEmpresas=true')
      ])
      const usuariosData = await usuariosRes.json()
      const empresasData = await empresasRes.json()
      
      console.log('Usuarios response:', usuariosData)
      console.log('Empresas response:', empresasData)
      
      const allClientes: ClientVistoBueno[] = []
      
      // La respuesta original usa "clientes" no "clients"
      if (usuariosData.success && usuariosData.clientes) {
        allClientes.push(...usuariosData.clientes.map((c: any) => ({
          id: c.id,
          nombre: c.nombre,
          cedula: c.cedula,
          darVistoBueno: c.darVistoBueno ?? true,
          tipo: 'cliente' as const
        })))
      }
      
      // La respuesta original usa "empresas" no "clients"
      if (empresasData.success && empresasData.empresas) {
        allClientes.push(...empresasData.empresas.map((e: any) => ({
          id: e.id,
          nombre: e.nombre,
          cedula: e.cedula,
          darVistoBueno: e.darVistoBueno ?? true,
          tipo: 'empresa' as const
        })))
      }
      
      // Ordenar: primero los que tienen darVistoBueno activo, luego por nombre
      allClientes.sort((a, b) => {
        if (a.darVistoBueno !== b.darVistoBueno) {
          return b.darVistoBueno ? 1 : -1
        }
        return a.nombre.localeCompare(b.nombre)
      })
      
      setClientesVistoBueno(allClientes)
    } catch (error) {
      console.error('Error cargando clientes:', error)
    } finally {
      setLoadingVistoBueno(false)
    }
  }

  const toggleVistoBueno = async (cliente: ClientVistoBueno) => {
    if (!confirm(`¿Cambiar "Dar visto bueno" para ${cliente.nombre}?`)) return
    try {
      const endpoint = cliente.tipo === 'cliente' ? '/api/client' : '/api/client'
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: cliente.id,
          tipo: cliente.tipo,
          darVistoBueno: !cliente.darVistoBueno
        })
      })
      const data = await res.json()
      if (data.success) {
        alert('Actualizado correctamente')
        await loadClientesVistoBueno()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      alert('Error actualizando cliente')
    }
  }

  // CÓDIGOS DE INVITACIÓN
  const loadInvitationCodes = async () => {
    setLoadingCodes(true)
    try {
      // El endpoint original usa DELETE para obtener códigos con filtros
      const response = await fetch('/api/invitation-codes?includeUsed=true&includeExpired=true', {
        method: 'DELETE'
      })
      const data = await response.json()
      
      console.log('Invitation codes response:', data)
      
      if (data.success) {
        setInvitationCodes(data.codes || [])
      }
    } catch (error) {
      console.error('Error cargando códigos:', error)
    } finally {
      setLoadingCodes(false)
    }
  }

  const generateInvitationCode = async () => {
    setGeneratingCode(true)
    setGeneratedCode(null)
    try {
      const res = await fetch('/api/invitation-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newCodeType,
          expiresInHours: parseInt(newCodeExpiry),
          maxUses: parseInt(newCodeMaxUses),
          notes: newCodeNotes || null
        })
      })
      const data = await res.json()
      if (data.success) {
        setGeneratedCode(data.code)
        alert('Código generado exitosamente')
        await loadInvitationCodes()
        setNewCodeNotes('')
      } else {
        alert('Error: ' + (data.error || 'Error al generar código'))
      }
    } catch (error) {
      alert('Error generando código')
    } finally {
      setGeneratingCode(false)
    }
  }

  const deactivateCode = async (codeId: string) => {
    if (!confirm('¿Desactivar este código?')) return
    try {
      const res = await fetch('/api/invitation-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeId, action: 'deactivate' })
      })
      const data = await res.json()
      if (data.success) {
        alert('Código desactivado')
        await loadInvitationCodes()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      alert('Error desactivando código')
    }
  }

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const getCodeStatus = (code: InvitationCode) => {
    if (!code.is_active) return { label: 'Inactivo', className: styles.badgeDanger }
    if (code.used_at) return { label: 'Usado', className: styles.badgeSuccess }
    if (new Date(code.expires_at) < new Date()) return { label: 'Expirado', className: styles.badgeWarning }
    return { label: 'Activo', className: styles.badgePrimary }
  }

  // INGRESOS
  const loadIngresos = async () => {
    setLoadingIngresos(true)
    try {
      // Cargar resumen mensual
      const resumenRes = await fetch(`/api/ingresos?resumen=true&year=${ingresosYear}`)
      const resumenData = await resumenRes.json()
      
      if (resumenData.success) {
        setIngresosResumen(resumenData)
      }
      
      // Cargar detalle del mes seleccionado o todos
      let url = `/api/ingresos?year=${ingresosYear}`
      if (ingresosMes) {
        url = `/api/ingresos?mes=${ingresosYear}-${ingresosMes}`
      }
      
      const detalleRes = await fetch(url)
      const detalleData = await detalleRes.json()
      
      if (detalleData.success) {
        setIngresos(detalleData.data || [])
      }
    } catch (error) {
      console.error('Error cargando ingresos:', error)
    } finally {
      setLoadingIngresos(false)
    }
  }

  // Formatear moneda
  const formatCurrency = (amount: number, moneda: string = 'colones') => {
    if (moneda?.toLowerCase() === 'dolares') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
    }
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(amount)
  }

  // SINCRONIZACIÓN
  const handleSync = async (endpoint: string, label: string) => {
    setLoading(true)
    try {
      const res = await fetch(endpoint)
      const data = await res.json()
      setResults([{ success: data.success, message: `${label}: ${data.message}`, details: data }])
    } catch (error: any) {
      setResults([{ success: false, message: `${label}: Error - ${error.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleSyncAll = async () => {
    setLoading(true)
    setResults([])
    const endpoints = [
      { url: '/api/sync-usuarios', label: 'Usuarios' },
      { url: '/api/sync-empresas', label: 'Empresas' },
      { url: '/api/sync-casos', label: 'Casos' },
      { url: '/api/sync-contactos', label: 'Contactos' },
      { url: '/api/sync-funcionarios', label: 'Funcionarios' },
      { url: '/api/sync-control-horas', label: 'Control de Horas' },
      { url: '/api/sync-gastos', label: 'Gastos' },
      { url: '/api/sync-solicitudes', label: 'Solicitudes' },
      { url: '/api/sync-actualizaciones', label: 'Actualizaciones' },
      { url: '/api/sync-historial-reportes', label: 'Historial Reportes' },
      { url: '/api/sync-materias', label: 'Materias' },
      { url: '/api/sync-clicks-etapa', label: 'Clicks Etapa' }
    ]
    const syncResults: SyncResult[] = []
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint.url)
        const data = await res.json()
        syncResults.push({ success: data.success, message: `${endpoint.label}: ${data.message}`, details: data })
      } catch (error: any) {
        syncResults.push({ success: false, message: `${endpoint.label}: Error - ${error.message}` })
      }
    }
    setResults(syncResults)
    setLoading(false)
  }

  // SIMULADOR DE FECHA (GLOBAL - afecta a todos los usuarios)
  const setSimulatedDateHandler = async () => {
    if (!simulatedDate) {
      alert('Selecciona una fecha')
      return
    }
    setLoadingDateSimulator(true)
    try {
      const res = await fetch('/api/simulated-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: simulatedDate })
      })
      const data = await res.json()
      if (data.success) {
        setIsDateSimulated(true)
        alert(`✅ Fecha simulada GLOBAL activada: ${simulatedDate}\n\n⚠️ TODOS los usuarios verán esta fecha.\n\n📋 Para desactivar antes de producción:\n- Usar "Restaurar Fecha Real" aquí\n- O eliminar registro en Supabase: DELETE FROM system_config WHERE key = 'simulated_date'`)
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      alert('Error activando fecha simulada')
    } finally {
      setLoadingDateSimulator(false)
    }
  }

  const resetSimulatedDate = async () => {
    if (!confirm('¿Desactivar la fecha simulada? Todos los usuarios verán la fecha real de Costa Rica.')) return
    setLoadingDateSimulator(true)
    try {
      const res = await fetch('/api/simulated-date', { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setIsDateSimulated(false)
        setSimulatedDate('')
        alert('✅ Fecha real restaurada\n\nTodos los usuarios ahora ven la fecha real de Costa Rica (UTC-6)')
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      alert('Error restaurando fecha')
    } finally {
      setLoadingDateSimulator(false)
    }
  }

  // CONFIGURACIÓN
  const validateConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/validate-config')
      const data = await res.json()
      setResults([{ success: data.isValid, message: data.isValid ? 'Configuración válida' : 'Errores encontrados', details: data }])
    } catch (error: any) {
      setResults([{ success: false, message: `Error validando: ${error.message}` }])
    } finally {
      setLoading(false)
    }
  }

  // GRUPOS DE EMPRESAS
  const loadGrupos = async () => {
    setLoadingGrupos(true)
    try {
      // Cargar grupos existentes
      const resGrupos = await fetch('/api/grupos-empresas')
      const dataGrupos = await resGrupos.json()
      console.log('Grupos response:', dataGrupos)
      if (dataGrupos.success) {
        setGrupos(dataGrupos.grupos || [])
      }

      // Obtener empresas de Supabase directamente
      const empresasRes = await fetch('/api/client?tipo=empresa&all=true')
      const empresasData = await empresasRes.json()
      console.log('Empresas response completa:', JSON.stringify(empresasData))
      
      // La respuesta puede tener empresas directamente o dentro de success
      const empresasList = empresasData.empresas || []
      console.log('Empresas encontradas:', empresasList.length)
      
      if (empresasList.length > 0) {
        setEmpresasDisponibles(empresasList.map((e: any) => ({
          id: e.id,
          nombre: e.nombre,
          iva_perc: e.iva_perc || 0.13
        })))
      } else {
        console.warn('No hay empresas en la base de datos')
        setEmpresasDisponibles([])
      }
    } catch (error) {
      console.error('Error cargando grupos:', error)
    } finally {
      setLoadingGrupos(false)
    }
  }

  const handleCrearGrupo = async () => {
    if (!nuevoGrupoNombre.trim() || !nuevoGrupoEmpresaPrincipal) {
      alert('Nombre del grupo y empresa principal son requeridos')
      return
    }

    setCreandoGrupo(true)
    try {
      const res = await fetch('/api/grupos-empresas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nuevoGrupoNombre.trim(),
          empresa_principal_id: nuevoGrupoEmpresaPrincipal,
          empresas_asociadas: nuevoGrupoEmpresas
        })
      })
      const data = await res.json()
      
      if (data.success) {
        alert('✅ Grupo creado exitosamente')
        setNuevoGrupoNombre('')
        setNuevoGrupoEmpresaPrincipal('')
        setNuevoGrupoEmpresas([])
        await loadGrupos()
      } else {
        alert('Error: ' + (data.error || 'Error al crear grupo'))
      }
    } catch (error) {
      console.error('Error creando grupo:', error)
      alert('Error al crear grupo')
    } finally {
      setCreandoGrupo(false)
    }
  }

  const handleAgregarEmpresaGrupo = async (grupoId: string, empresaId: string) => {
    try {
      const res = await fetch('/api/grupos-empresas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grupo_id: grupoId,
          action: 'add',
          empresa_id: empresaId
        })
      })
      const data = await res.json()
      
      if (data.success) {
        await loadGrupos()
      } else {
        alert('Error: ' + (data.error || 'Error al agregar empresa'))
      }
    } catch (error) {
      alert('Error al agregar empresa al grupo')
    }
  }

  const handleQuitarEmpresaGrupo = async (grupoId: string, empresaId: string) => {
    if (!confirm('¿Quitar esta empresa del grupo?')) return
    
    try {
      const res = await fetch('/api/grupos-empresas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grupo_id: grupoId,
          action: 'remove',
          empresa_id: empresaId
        })
      })
      const data = await res.json()
      
      if (data.success) {
        await loadGrupos()
      } else {
        alert('Error: ' + (data.error || 'Error al quitar empresa'))
      }
    } catch (error) {
      alert('Error al quitar empresa del grupo')
    }
  }

  const handleEliminarGrupo = async (grupoId: string) => {
    if (!confirm('¿Eliminar este grupo? Las empresas asociadas quedarán libres.')) return
    
    try {
      const res = await fetch(`/api/grupos-empresas?id=${grupoId}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      
      if (data.success) {
        alert('Grupo eliminado')
        await loadGrupos()
      } else {
        alert('Error: ' + (data.error || 'Error al eliminar'))
      }
    } catch (error) {
      alert('Error al eliminar grupo')
    }
  }

  // Obtener empresas que NO están en ningún grupo
  const getEmpresasLibres = () => {
    const empresasEnGrupos = new Set<string>()
    grupos.forEach(g => {
      empresasEnGrupos.add(g.empresa_principal_id)
      g.empresas_asociadas?.forEach(e => empresasEnGrupos.add(e.id))
    })
    return empresasDisponibles.filter(e => !empresasEnGrupos.has(e.id))
  }

  // ===== RENDERIZADO =====

  if (!isMounted) {
    return <div className={styles.loadingState}><div className={styles.spinner}></div><p>Cargando panel...</p></div>
  }

  return (
    <div className={`${styles.container} ${!sidebarOpen ? styles.sidebarClosed : ''}`}>
      {/* SIDEBAR */}
      <aside className={`${styles.sidebar} ${!sidebarOpen ? styles.collapsed : ''}`}>
        <nav className={styles.nav}>
          <button 
            className={`${styles.navItem} ${activeSection === 'comprobantes' ? styles.active : ''}`}
            onClick={() => { setActiveSection('comprobantes'); loadPaymentData() }}
          >
            <span className={styles.navIcon}>📄</span>
            <span className={styles.navLabel}>Comprobantes</span>
          </button>
          <button 
            className={`${styles.navItem} ${activeSection === 'facturas' ? styles.active : ''}`}
            onClick={() => { setActiveSection('facturas'); loadMonthInvoices() }}
          >
            <span className={styles.navIcon}>🧾</span>
            <span className={styles.navLabel}>Facturas del Mes</span>
          </button>
          <button 
            className={`${styles.navItem} ${activeSection === 'plazos' ? styles.active : ''}`}
            onClick={() => { setActiveSection('plazos'); loadInvoiceDeadlines() }}
          >
            <span className={styles.navIcon}>⏰</span>
            <span className={styles.navLabel}>Plazos de Facturas</span>
          </button>
          <button 
            className={`${styles.navItem} ${activeSection === 'visto-bueno' ? styles.active : ''}`}
            onClick={() => { setActiveSection('visto-bueno'); loadClientesVistoBueno() }}
          >
            <span className={styles.navIcon}>✓</span>
            <span className={styles.navLabel}>Visto Bueno</span>
          </button>
          <div className={styles.navDivider}></div>
          <button 
            className={`${styles.navItem} ${activeSection === 'invitaciones' ? styles.active : ''}`}
            onClick={() => { setActiveSection('invitaciones'); loadInvitationCodes() }}
          >
            <span className={styles.navIcon}>🎟️</span>
            <span className={styles.navLabel}>Códigos Invitación</span>
          </button>
          <button 
            className={`${styles.navItem} ${activeSection === 'ingresos' ? styles.active : ''}`}
            onClick={() => { setActiveSection('ingresos'); loadIngresos() }}
          >
            <span className={styles.navIcon}>💵</span>
            <span className={styles.navLabel}>Ingresos</span>
          </button>
          <button 
            className={`${styles.navItem} ${activeSection === 'grupos' ? styles.active : ''}`}
            onClick={() => { setActiveSection('grupos'); loadGrupos() }}
          >
            <span className={styles.navIcon}>🏢</span>
            <span className={styles.navLabel}>Grupos Empresas</span>
          </button>
          <button 
            className={`${styles.navItem} ${activeSection === 'fecha' ? styles.active : ''}`}
            onClick={() => setActiveSection('fecha')}
          >
            <span className={styles.navIcon}>📅</span>
            <span className={styles.navLabel}>Simulador de Fecha</span>
          </button>
          <div className={styles.navDivider}></div>
          <button 
            className={`${styles.navItem} ${activeSection === 'sync' ? styles.active : ''}`}
            onClick={() => setActiveSection('sync')}
          >
            <span className={styles.navIcon}>🔄</span>
            <span className={styles.navLabel}>Sincronización</span>
          </button>
          <button 
            className={`${styles.navItem} ${activeSection === 'config' ? styles.active : ''}`}
            onClick={() => setActiveSection('config')}
          >
            <span className={styles.navIcon}>⚙️</span>
            <span className={styles.navLabel}>Configuración</span>
          </button>
        </nav>
      </aside>

      {/* HEADER */}
      <header className={`${styles.header} ${!sidebarOpen ? styles.fullWidth : ''}`}>
        <div className={styles.headerLeft}>
          <button className={styles.toggleButton} onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <h1 className={styles.headerTitle}>Panel de Administración</h1>
        </div>
      </header>

      {/* CONTENIDO */}
      <main className={`${styles.content} ${!sidebarOpen ? styles.fullWidth : ''}`}>
        {/* COMPROBANTES */}
        {activeSection === 'comprobantes' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Gestión de Comprobantes de Pago</h2>
                <p className={styles.sectionDescription}>Revisa y aprueba/rechaza los comprobantes subidos por los clientes</p>
              </div>
              <button 
                className={`${styles.button} ${styles.buttonDanger}`}
                onClick={handleResetAllModoPago}
              >
                🔄 Resetear modoPago de todos
              </button>
            </div>
            {loadingReceipts ? (
              <div className={styles.loadingState}><div className={styles.spinner}></div><p>Cargando comprobantes...</p></div>
            ) : !receipts || receipts.length === 0 ? (
              <div className={styles.emptyState}>No hay comprobantes pendientes</div>
            ) : (
              <div className={styles.table}>
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Mes</th>
                      <th>Monto</th>
                      <th>Estado</th>
                      <th>Archivo</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((receipt) => {
                      // Buscar el nombre del cliente en clientesModoPago
                      const cliente = clientesModoPago.find(c => c.id === receipt.user_id && c.tipo === receipt.tipo_cliente)
                      const nombreCliente = cliente ? `${cliente.nombre} (${cliente.cedula})` : receipt.user_id
                      
                      return (
                        <tr key={receipt.id}>
                          <td>
                            {nombreCliente}
                            <br />
                            <small style={{ color: '#999' }}>{receipt.tipo_cliente}</small>
                          </td>
                          <td>{receipt.mes_pago}</td>
                          <td>₡{receipt.monto_declarado?.toLocaleString()}</td>
                          <td>
                            <span className={`${styles.badge} ${
                              receipt.estado === 'pendiente' ? styles.badgeWarning :
                              receipt.estado === 'aprobado' ? styles.badgeSuccess : styles.badgeDanger
                            }`}>
                              {receipt.estado}
                            </span>
                          </td>
                          <td>
                            <button 
                              className={styles.linkButton}
                              onClick={() => handleViewFile(receipt.file_path)}
                            >
                              Ver archivo
                            </button>
                          </td>
                          <td>
                          {receipt.estado === 'pendiente' && (
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button 
                                className={`${styles.button} ${styles.buttonSuccess}`}
                                onClick={() => handleApproveReceipt(receipt.id)}
                                disabled={reviewingReceipt === receipt.id}
                              >
                                Aprobar
                              </button>
                              <button 
                                className={`${styles.button} ${styles.buttonDanger}`}
                                onClick={() => {
                                  const nota = prompt('Razón del rechazo:')
                                  if (nota && nota.trim()) {
                                    handleRejectReceipt(receipt.id, nota)
                                  }
                                }}
                                disabled={reviewingReceipt === receipt.id}
                              >
                                Rechazar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* FACTURAS DEL MES */}
        {activeSection === 'facturas' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Facturas Electrónicas del Mes</h2>
                <p className={styles.sectionDescription}>Sube facturas XML para clientes con modoPago activo</p>
              </div>
              <button className={styles.button} onClick={() => setShowInvoiceModal(true)}>
                Subir Factura
              </button>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Mes a consultar</label>
              <input 
                type="month"
                className={styles.input}
                value={selectedInvoiceMonth}
                onChange={(e) => {
                  setSelectedInvoiceMonth(e.target.value)
                }}
              />
              <button className={styles.button} onClick={loadMonthInvoices} style={{ marginTop: '0.75rem' }}>
                Buscar Facturas
              </button>
            </div>
            {loadingInvoices ? (
              <div className={styles.loadingState}><div className={styles.spinner}></div><p>Cargando facturas...</p></div>
            ) : !monthInvoices || monthInvoices.length === 0 ? (
              <div className={styles.emptyState}>No hay facturas para este mes</div>
            ) : (
              <div className={styles.table}>
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Cédula</th>
                      <th>Tipo</th>
                      <th>Archivo</th>
                      <th>Subida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.clientName}</td>
                        <td>{invoice.clientCedula}</td>
                        <td><span className={styles.badge}>{invoice.clientType}</span></td>
                        <td>{invoice.name}</td>
                        <td>{new Date(invoice.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PLAZOS DE FACTURAS */}
        {activeSection === 'plazos' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Plazos de Facturas</h2>
                <p className={styles.sectionDescription}>Clientes con modoPago activo y estado de sus facturas</p>
              </div>
              <button className={styles.button} onClick={loadInvoiceDeadlines}>
                Actualizar
              </button>
            </div>
            {loadingDeadlines ? (
              <div className={styles.loadingState}><div className={styles.spinner}></div><p>Cargando plazos...</p></div>
            ) : !invoiceDeadlines || invoiceDeadlines.length === 0 ? (
              <div className={styles.emptyState}>No hay clientes con modoPago activo</div>
            ) : (
              <div className={styles.table}>
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Tipo</th>
                      <th>Mes Pago</th>
                      <th>Días Restantes</th>
                      <th>Factura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceDeadlines.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.nombre}</td>
                        <td><span className={styles.badge}>{item.tipo}</span></td>
                        <td>{item.mes_pago}</td>
                        <td>
                          <span className={`${styles.badge} ${
                            item.dias_restantes < 0 ? styles.badgeDanger :
                            item.dias_restantes <= 3 ? styles.badgeWarning : styles.badgeSuccess
                          }`}>
                            {item.dias_restantes} días
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${item.tiene_factura ? styles.badgeSuccess : styles.badgeDanger}`}>
                            {item.tiene_factura ? 'Subida' : 'Falta'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* VISTO BUENO */}
        {activeSection === 'visto-bueno' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Gestión de Visto Bueno</h2>
                <p className={styles.sectionDescription}>Activa/desactiva la opción "Dar visto bueno" por cliente</p>
              </div>
            </div>
            {loadingVistoBueno ? (
              <div className={styles.loadingState}><div className={styles.spinner}></div><p>Cargando clientes...</p></div>
            ) : !clientesVistoBueno || clientesVistoBueno.length === 0 ? (
              <div className={styles.emptyState}>No hay clientes registrados</div>
            ) : (
              <div className={styles.table}>
                <table>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Cédula</th>
                      <th>Tipo</th>
                      <th>Dar Visto Bueno</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientesVistoBueno.map((cliente) => (
                      <tr key={cliente.id}>
                        <td>{cliente.nombre}</td>
                        <td>{cliente.cedula}</td>
                        <td><span className={styles.badge}>{cliente.tipo}</span></td>
                        <td>
                          <span className={`${styles.badge} ${cliente.darVistoBueno ? styles.badgeSuccess : styles.badgeDanger}`}>
                            {cliente.darVistoBueno ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td>
                          <button 
                            className={`${styles.button} ${cliente.darVistoBueno ? styles.buttonDanger : styles.buttonSuccess}`}
                            onClick={() => toggleVistoBueno(cliente)}
                          >
                            {cliente.darVistoBueno ? 'Desactivar' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CÓDIGOS DE INVITACIÓN */}
        {activeSection === 'invitaciones' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Códigos de Invitación</h2>
                <p className={styles.sectionDescription}>Genera códigos temporales para registro de nuevos usuarios</p>
              </div>
            </div>
            <div className={styles.card} style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>Generar Nuevo Código</h3>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tipo de Cliente</label>
                <select className={styles.input} value={newCodeType} onChange={(e) => setNewCodeType(e.target.value as any)}>
                  <option value="cliente">Cliente</option>
                  <option value="empresa">Empresa</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Expiración (horas)</label>
                <input type="number" className={styles.input} value={newCodeExpiry} onChange={(e) => setNewCodeExpiry(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Usos máximos</label>
                <input type="number" className={styles.input} value={newCodeMaxUses} onChange={(e) => setNewCodeMaxUses(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Notas (opcional)</label>
                <input type="text" className={styles.input} value={newCodeNotes} onChange={(e) => setNewCodeNotes(e.target.value)} />
              </div>
              <button className={styles.button} onClick={generateInvitationCode} disabled={generatingCode}>
                {generatingCode ? 'Generando...' : 'Generar Código'}
              </button>
              {generatedCode && (
                <div className={styles.infoBox} style={{ marginTop: '1rem' }}>
                  <h3>Código Generado</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                    <code style={{ flex: 1, padding: '0.75rem', background: 'white', border: '1px solid #e0e0e0', borderRadius: '0.5rem' }}>
                      {generatedCode}
                    </code>
                    <button className={styles.buttonSecondary} onClick={() => copyToClipboard(generatedCode)}>
                      {copiedCode === generatedCode ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {loadingCodes ? (
              <div className={styles.loadingState}><div className={styles.spinner}></div><p>Cargando códigos...</p></div>
            ) : !invitationCodes || invitationCodes.length === 0 ? (
              <div className={styles.emptyState}>No hay códigos generados</div>
            ) : (
              <div className={styles.table}>
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th>Usos</th>
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
                          <td>
                            <code style={{ background: '#f5f5f5', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>
                              {code.code}
                            </code>
                          </td>
                          <td><span className={styles.badge}>{code.type}</span></td>
                          <td><span className={`${styles.badge} ${status.className}`}>{status.label}</span></td>
                          <td>{code.current_uses}/{code.max_uses}</td>
                          <td>{new Date(code.expires_at).toLocaleString()}</td>
                          <td>{code.notes || '-'}</td>
                          <td>
                            {code.is_active && (
                              <>
                                <button 
                                  className={`${styles.button} ${styles.buttonSecondary}`}
                                  onClick={() => copyToClipboard(code.code)}
                                  style={{ marginRight: '0.5rem' }}
                                >
                                  {copiedCode === code.code ? 'Copiado!' : 'Copiar'}
                                </button>
                                <button 
                                  className={`${styles.button} ${styles.buttonDanger}`}
                                  onClick={() => deactivateCode(code.id)}
                                >
                                  Desactivar
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* INGRESOS */}
        {activeSection === 'ingresos' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Registro de Ingresos</h2>
                <p className={styles.sectionDescription}>Resumen de ingresos por comprobantes aprobados</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <select 
                  className={styles.input}
                  value={ingresosYear}
                  onChange={(e) => { setIngresosYear(e.target.value); setTimeout(loadIngresos, 100) }}
                  style={{ width: 'auto' }}
                >
                  {[2024, 2025, 2026].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select 
                  className={styles.input}
                  value={ingresosMes}
                  onChange={(e) => { setIngresosMes(e.target.value); setTimeout(loadIngresos, 100) }}
                  style={{ width: 'auto' }}
                >
                  <option value="">Todos los meses</option>
                  <option value="01">Enero</option>
                  <option value="02">Febrero</option>
                  <option value="03">Marzo</option>
                  <option value="04">Abril</option>
                  <option value="05">Mayo</option>
                  <option value="06">Junio</option>
                  <option value="07">Julio</option>
                  <option value="08">Agosto</option>
                  <option value="09">Septiembre</option>
                  <option value="10">Octubre</option>
                  <option value="11">Noviembre</option>
                  <option value="12">Diciembre</option>
                </select>
                <button 
                  className={styles.button}
                  onClick={loadIngresos}
                  disabled={loadingIngresos}
                >
                  🔄 Actualizar
                </button>
              </div>
            </div>

            {loadingIngresos ? (
              <div className={styles.loadingState}><div className={styles.spinner}></div><p>Cargando ingresos...</p></div>
            ) : (
              <>
                {/* Resumen Anual */}
                {ingresosResumen && (
                  <div style={{ marginBottom: '2rem' }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: 600 }}>
                      Totales Anuales {ingresosYear}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                      <div className={styles.infoBox} style={{ borderLeft: '4px solid #4caf50' }}>
                        <h4 style={{ margin: 0, color: '#4caf50' }}>💵 Colones</h4>
                        <p style={{ margin: '0.5rem 0', fontSize: '1.5rem', fontWeight: 'bold' }}>
                          {formatCurrency(ingresosResumen.totalesAnuales?.colones?.total || 0, 'colones')}
                        </p>
                        <div style={{ fontSize: '0.85rem', color: '#666' }}>
                          <p>Honorarios: {formatCurrency(ingresosResumen.totalesAnuales?.colones?.honorarios || 0, 'colones')}</p>
                          <p>Servicios: {formatCurrency(ingresosResumen.totalesAnuales?.colones?.servicios || 0, 'colones')}</p>
                          <p>Gastos: {formatCurrency(ingresosResumen.totalesAnuales?.colones?.gastos || 0, 'colones')}</p>
                          <p><strong>{ingresosResumen.totalesAnuales?.colones?.cantidad || 0} comprobantes</strong></p>
                        </div>
                      </div>
                      <div className={styles.infoBox} style={{ borderLeft: '4px solid #2196f3' }}>
                        <h4 style={{ margin: 0, color: '#2196f3' }}>💲 Dólares</h4>
                        <p style={{ margin: '0.5rem 0', fontSize: '1.5rem', fontWeight: 'bold' }}>
                          {formatCurrency(ingresosResumen.totalesAnuales?.dolares?.total || 0, 'dolares')}
                        </p>
                        <div style={{ fontSize: '0.85rem', color: '#666' }}>
                          <p>Honorarios: {formatCurrency(ingresosResumen.totalesAnuales?.dolares?.honorarios || 0, 'dolares')}</p>
                          <p>Servicios: {formatCurrency(ingresosResumen.totalesAnuales?.dolares?.servicios || 0, 'dolares')}</p>
                          <p>Gastos: {formatCurrency(ingresosResumen.totalesAnuales?.dolares?.gastos || 0, 'dolares')}</p>
                          <p><strong>{ingresosResumen.totalesAnuales?.dolares?.cantidad || 0} comprobantes</strong></p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Resumen Mensual */}
                {ingresosResumen?.resumenMensual && !ingresosMes && (
                  <div style={{ marginBottom: '2rem' }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: 600 }}>
                      Resumen por Mes
                    </h3>
                    <div className={styles.table}>
                      <table>
                        <thead>
                          <tr>
                            <th>Mes</th>
                            <th>Colones</th>
                            <th>Dólares</th>
                            <th>Comprobantes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ingresosResumen.resumenMensual.map((mes: any) => (
                            <tr key={mes.mesNumero} style={{ 
                              opacity: mes.colones.cantidad + mes.dolares.cantidad === 0 ? 0.5 : 1 
                            }}>
                              <td><strong>{mes.mes}</strong></td>
                              <td>{formatCurrency(mes.colones.total, 'colones')}</td>
                              <td>{formatCurrency(mes.dolares.total, 'dolares')}</td>
                              <td>{mes.colones.cantidad + mes.dolares.cantidad}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Detalle de Ingresos */}
                <div>
                  <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: 600 }}>
                    Detalle de Ingresos {ingresosMes ? `(${['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][parseInt(ingresosMes)]})` : ''}
                  </h3>
                  {ingresos.length === 0 ? (
                    <div className={styles.emptyState}>No hay ingresos registrados para este período</div>
                  ) : (
                    <div className={styles.table}>
                      <table>
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Fecha Pago</th>
                            <th>Fecha Aprobación</th>
                            <th>Cliente</th>
                            <th>Modalidad</th>
                            <th>Moneda</th>
                            <th>Honorarios</th>
                            <th>Gastos</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ingresos.map((ingreso: any) => (
                            <tr key={ingreso.id}>
                              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{ingreso.id}</td>
                              <td>{ingreso.fecha_pago || '-'}</td>
                              <td>{ingreso.fecha_aprobacion || '-'}</td>
                              <td>{ingreso.id_cliente}</td>
                              <td>{ingreso.modalidad_pago || '-'}</td>
                              <td>
                                <span className={ingreso.moneda?.toLowerCase() === 'dolares' ? styles.badgePrimary : styles.badgeSuccess}>
                                  {ingreso.moneda || 'Colones'}
                                </span>
                              </td>
                              <td>{formatCurrency(ingreso.honorarios || 0, ingreso.moneda)}</td>
                              <td>{formatCurrency(ingreso.reembolso_gastos || 0, ingreso.moneda)}</td>
                              <td><strong>{formatCurrency(ingreso.total_ingreso || 0, ingreso.moneda)}</strong></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* SIMULADOR DE FECHA */}
        {activeSection === 'fecha' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>🌎 Simulador de Fecha GLOBAL</h2>
              <p className={styles.sectionDescription}>La fecha simulada afecta a TODOS los usuarios de la app</p>
            </div>
            <div className={styles.infoBox}>
              <h3>📅 Fecha Real del Sistema (Costa Rica UTC-6)</h3>
              <p><strong>{currentRealDate}</strong></p>
            </div>
            {isDateSimulated && (
              <div className={styles.infoBox} style={{ borderLeft: '4px solid #f57c00', background: '#fff3cd' }}>
                <h3>⚠️ FECHA SIMULADA ACTIVA (GLOBAL)</h3>
                <p><strong style={{ fontSize: '1.2rem' }}>{simulatedDate}</strong></p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: '#856404' }}>
                  Todos los usuarios ven esta fecha. <br/>
                  <strong>Eliminar antes de producción.</strong>
                </p>
              </div>
            )}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Seleccionar Fecha a Simular</label>
              <input 
                type="date"
                className={styles.input}
                value={simulatedDate}
                onChange={(e) => setSimulatedDate(e.target.value)}
                disabled={loadingDateSimulator}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button 
                className={styles.button} 
                onClick={setSimulatedDateHandler}
                disabled={loadingDateSimulator || !simulatedDate}
              >
                {loadingDateSimulator ? '⏳ Guardando...' : '🕐 Activar Simulación Global'}
              </button>
              <button 
                className={`${styles.button} ${styles.buttonDanger}`} 
                onClick={resetSimulatedDate}
                disabled={loadingDateSimulator || !isDateSimulated}
              >
                {loadingDateSimulator ? '⏳ Restaurando...' : '🔄 Restaurar Fecha Real'}
              </button>
            </div>
            
            {/* Instrucciones para producción */}
            <div className={styles.infoBox} style={{ marginTop: '1.5rem', borderLeft: '4px solid #dc3545' }}>
              <h3>🚨 IMPORTANTE: Antes de Producción</h3>
              <p style={{ fontSize: '0.9rem' }}>
                La fecha simulada se guarda en Supabase (tabla <code>system_config</code>).
                <br/><br/>
                <strong>Para desactivar:</strong>
                <br/>1. Usar el botón "Restaurar Fecha Real" arriba
                <br/>2. O ejecutar en Supabase: <code>DELETE FROM system_config WHERE key = 'simulated_date'</code>
                <br/><br/>
                <strong>Para verificar:</strong>
                <br/><code>SELECT * FROM system_config WHERE key = 'simulated_date'</code>
              </p>
            </div>
          </div>
        )}

        {/* SINCRONIZACIÓN */}
        {activeSection === 'sync' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Sincronización con AppSheet</h2>
                <p className={styles.sectionDescription}>Sincroniza datos desde Google Sheets hacia Supabase</p>
              </div>
            </div>
            
            <div className={styles.syncGrid}>
              {/* Botón principal - Sincronizar Todo */}
              <button 
                className={`${styles.syncCard} ${styles.syncCardPrimary}`} 
                onClick={handleSyncAll} 
                disabled={loading}
              >
                <span className={styles.syncIcon}>🔄</span>
                <span className={styles.syncLabel}>Sincronizar Todo</span>
              </button>
              
              {/* Tarjetas individuales */}
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-usuarios', 'Usuarios')} disabled={loading}>
                <span className={styles.syncIcon}>👤</span>
                <span className={styles.syncLabel}>Usuarios</span>
              </button>
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-empresas', 'Empresas')} disabled={loading}>
                <span className={styles.syncIcon}>🏢</span>
                <span className={styles.syncLabel}>Empresas</span>
              </button>
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-casos', 'Casos')} disabled={loading}>
                <span className={styles.syncIcon}>📁</span>
                <span className={styles.syncLabel}>Casos</span>
              </button>
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-contactos', 'Contactos')} disabled={loading}>
                <span className={styles.syncIcon}>📇</span>
                <span className={styles.syncLabel}>Contactos</span>
              </button>
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-funcionarios', 'Funcionarios')} disabled={loading}>
                <span className={styles.syncIcon}>👥</span>
                <span className={styles.syncLabel}>Funcionarios</span>
              </button>
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-control-horas', 'Control de Horas')} disabled={loading}>
                <span className={styles.syncIcon}>⏱️</span>
                <span className={styles.syncLabel}>Control Horas</span>
              </button>
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-gastos', 'Gastos')} disabled={loading}>
                <span className={styles.syncIcon}>💰</span>
                <span className={styles.syncLabel}>Gastos</span>
              </button>
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-solicitudes', 'Solicitudes')} disabled={loading}>
                <span className={styles.syncIcon}>📝</span>
                <span className={styles.syncLabel}>Solicitudes</span>
              </button>
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-actualizaciones', 'Actualizaciones')} disabled={loading}>
                <span className={styles.syncIcon}>📰</span>
                <span className={styles.syncLabel}>Actualizaciones</span>
              </button>
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-historial-reportes', 'Historial Reportes')} disabled={loading}>
                <span className={styles.syncIcon}>📊</span>
                <span className={styles.syncLabel}>Historial Reportes</span>
              </button>
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-materias', 'Materias')} disabled={loading}>
                <span className={styles.syncIcon}>📚</span>
                <span className={styles.syncLabel}>Materias</span>
              </button>
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-clicks-etapa', 'Clicks Etapa')} disabled={loading}>
                <span className={styles.syncIcon}>🔄</span>
                <span className={styles.syncLabel}>Clicks Etapa</span>
              </button>
            </div>
            
            {loading && (
              <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Sincronizando...</p>
              </div>
            )}
            
            {results.length > 0 && (
              <div className={styles.syncResults}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: 600 }}>Resultados</h3>
                {results.map((result, idx) => (
                  <div 
                    key={idx} 
                    className={`${styles.syncResultItem} ${result.success ? styles.success : styles.error}`}
                    style={{ flexDirection: 'column', alignItems: 'flex-start' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={styles.syncResultIcon}>{result.success ? '✅' : '❌'}</span>
                      <span>{result.message}</span>
                    </div>
                    {result.details?.stats && (
                      <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
                        {result.details.stats.leidos !== undefined && <span>📊 Leídos: {result.details.stats.leidos} | </span>}
                        {result.details.stats.procesados !== undefined && <span>Procesados: {result.details.stats.procesados} | </span>}
                        {result.details.stats.omitidos > 0 && <span style={{color: '#f57c00'}}>⚠️ Omitidos: {result.details.stats.omitidos} | </span>}
                        <span>✨ Nuevos: {result.details.stats.inserted || 0} | </span>
                        <span>🔄 Actualizados: {result.details.stats.updated || 0} | </span>
                        {result.details.stats.deleted > 0 && <span>🗑️ Eliminados: {result.details.stats.deleted} | </span>}
                        {result.details.stats.errors > 0 && <span style={{color: '#d32f2f'}}>❌ Errores: {result.details.stats.errors}</span>}
                      </div>
                    )}
                    {result.details?.details && result.details.details.length > 0 && (
                      <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', fontSize: '0.8rem', color: '#d32f2f', maxHeight: '150px', overflow: 'auto', width: '100%' }}>
                        <strong>Errores detallados:</strong>
                        <ul style={{ margin: '0.25rem 0', paddingLeft: '1rem' }}>
                          {result.details.details.slice(0, 10).map((err: any, i: number) => (
                            <li key={i}>{err.action} - ID: {err.id} - {err.error}</li>
                          ))}
                          {result.details.details.length > 10 && <li>... y {result.details.details.length - 10} más</li>}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* GRUPOS DE EMPRESAS */}
        {activeSection === 'grupos' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Grupos de Empresas</h2>
                <p className={styles.sectionDescription}>
                  Permite que una empresa principal vea y pague por otras empresas asociadas
                </p>
              </div>
              <button className={styles.button} onClick={loadGrupos} disabled={loadingGrupos}>
                {loadingGrupos ? 'Cargando...' : '🔄 Refrescar'}
              </button>
            </div>

            {/* Crear nuevo grupo */}
            <div className={styles.infoBox} style={{ marginBottom: '2rem' }}>
              <h3>Crear Nuevo Grupo</h3>
              <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Nombre del Grupo</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Ej: Grupo Corporativo ABC"
                    value={nuevoGrupoNombre}
                    onChange={(e) => setNuevoGrupoNombre(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Empresa Principal (la que paga por todas)</label>
                  <select
                    className={styles.input}
                    value={nuevoGrupoEmpresaPrincipal}
                    onChange={(e) => setNuevoGrupoEmpresaPrincipal(e.target.value)}
                  >
                    <option value="">Seleccionar empresa principal...</option>
                    {getEmpresasLibres().map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nombre} (IVA: {(emp.iva_perc * 100).toFixed(0)}%)
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Empresas Asociadas (opcional, se pueden agregar después)</label>
                  <select
                    multiple
                    className={styles.input}
                    style={{ minHeight: '100px' }}
                    value={nuevoGrupoEmpresas}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value)
                      setNuevoGrupoEmpresas(selected)
                    }}
                  >
                    {getEmpresasLibres()
                      .filter(emp => emp.id !== nuevoGrupoEmpresaPrincipal)
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.nombre} (IVA: {(emp.iva_perc * 100).toFixed(0)}%)
                        </option>
                      ))}
                  </select>
                  <small style={{ color: '#666' }}>Mantén Ctrl/Cmd para seleccionar múltiples</small>
                </div>
                <button
                  className={styles.button}
                  onClick={handleCrearGrupo}
                  disabled={creandoGrupo || !nuevoGrupoNombre.trim() || !nuevoGrupoEmpresaPrincipal}
                >
                  {creandoGrupo ? 'Creando...' : '➕ Crear Grupo'}
                </button>
              </div>
            </div>

            {/* Lista de grupos existentes */}
            {loadingGrupos ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Cargando grupos...</p>
              </div>
            ) : grupos.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No hay grupos de empresas creados</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                {grupos.map((grupo) => (
                  <div key={grupo.id} className={styles.card} style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{grupo.nombre}</h3>
                        <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.875rem' }}>
                          Creado: {new Date(grupo.created_at).toLocaleDateString('es-CR')}
                        </p>
                      </div>
                      <button
                        className={styles.buttonDanger}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                        onClick={() => handleEliminarGrupo(grupo.id)}
                      >
                        🗑️ Eliminar
                      </button>
                    </div>

                    {/* Empresa Principal */}
                    <div style={{ background: '#e3f2fd', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                      <strong style={{ color: '#1565c0' }}>👑 Empresa Principal:</strong>
                      <p style={{ margin: '0.5rem 0 0', fontSize: '1.1rem' }}>
                        {grupo.empresa_principal?.nombre || grupo.empresa_principal_id}
                      </p>
                      <small style={{ color: '#666' }}>Esta empresa ve y paga por las demás del grupo</small>
                    </div>

                    {/* Empresas Asociadas */}
                    <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '0.5rem' }}>
                      <strong>🏢 Empresas Asociadas ({grupo.empresas_asociadas?.length || 0}):</strong>
                      {grupo.empresas_asociadas?.length === 0 ? (
                        <p style={{ margin: '0.5rem 0', color: '#666' }}>Sin empresas asociadas</p>
                      ) : (
                        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                          {grupo.empresas_asociadas?.map((emp) => (
                            <li key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0' }}>
                              <span>
                                {emp.nombre}
                                {emp.iva_perc !== undefined && (
                                  <span style={{ color: '#666', marginLeft: '0.5rem' }}>
                                    (IVA: {(emp.iva_perc * 100).toFixed(0)}%)
                                  </span>
                                )}
                              </span>
                              <button
                                onClick={() => handleQuitarEmpresaGrupo(grupo.id, emp.id)}
                                style={{ 
                                  background: '#ffebee', 
                                  border: 'none', 
                                  padding: '0.25rem 0.5rem', 
                                  borderRadius: '0.25rem',
                                  cursor: 'pointer',
                                  color: '#c62828'
                                }}
                              >
                                ✕ Quitar
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Agregar empresa al grupo */}
                      {getEmpresasLibres().length > 0 && (
                        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                          <select
                            className={styles.input}
                            style={{ flex: 1 }}
                            id={`add-empresa-${grupo.id}`}
                          >
                            <option value="">Agregar empresa...</option>
                            {getEmpresasLibres().map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.nombre}
                              </option>
                            ))}
                          </select>
                          <button
                            className={styles.buttonSecondary}
                            onClick={() => {
                              const select = document.getElementById(`add-empresa-${grupo.id}`) as HTMLSelectElement
                              if (select?.value) {
                                handleAgregarEmpresaGrupo(grupo.id, select.value)
                              }
                            }}
                          >
                            ➕ Agregar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CONFIGURACIÓN */}
        {activeSection === 'config' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Validación de Configuración</h2>
                <p className={styles.sectionDescription}>Verifica que todas las variables de entorno estén configuradas</p>
              </div>
            </div>
            <button className={styles.button} onClick={validateConfig} disabled={loading}>
              Validar Configuración
            </button>
            {loading && <div className={styles.loadingState}><div className={styles.spinner}></div><p>Validando...</p></div>}
            {results.length > 0 && (
              <div className={styles.infoBox}>
                <h3>Resultado de Validación</h3>
                {results.map((result, idx) => (
                  <div key={idx}>
                    <p style={{ color: result.success ? '#388e3c' : '#d32f2f', fontWeight: 600 }}>
                      {result.message}
                    </p>
                    {result.details && (
                      <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '0.5rem', overflow: 'auto', fontSize: '0.875rem' }}>
                        {JSON.stringify(result.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL PARA SUBIR FACTURA */}
      {showInvoiceModal && (
        <div className={styles.modalOverlay} onClick={() => setShowInvoiceModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Subir Factura Electrónica</h2>
              <button className={styles.modalClose} onClick={() => setShowInvoiceModal(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Cliente</label>
                <select 
                  className={styles.input}
                  value={selectedClient?.id || ''}
                  onChange={(e) => {
                    const cliente = clientesModoPago.find(c => c.id === e.target.value)
                    setSelectedClient(cliente || null)
                  }}
                >
                  <option value="">Seleccionar cliente...</option>
                  {(clientesModoPago || []).filter(c => c.modoPago).map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nombre} ({cliente.cedula}) - {cliente.tipo}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Mes de Facturación</label>
                <input 
                  type="month"
                  className={styles.input}
                  value={selectedInvoiceMonth}
                  onChange={(e) => setSelectedInvoiceMonth(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Archivo XML</label>
                <input 
                  type="file"
                  className={styles.input}
                  accept=".xml"
                  onChange={handleFileSelect}
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.buttonSecondary} onClick={() => setShowInvoiceModal(false)}>
                Cancelar
              </button>
              <button 
                className={styles.button}
                onClick={handleUploadInvoice}
                disabled={!selectedClient || !selectedFile || !selectedInvoiceMonth || uploadingInvoice}
              >
                {uploadingInvoice ? 'Subiendo...' : 'Subir Factura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
