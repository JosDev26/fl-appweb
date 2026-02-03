'use client'

import { useState, useEffect, useCallback } from 'react'
import styles from './dev.module.css'

// ===== DEV LOGGER =====
const isDev = process.env.NODE_ENV === 'development'
const devLog = (...args: unknown[]) => {
  if (isDev) console.log(...args)
}

// ===== URL VALIDATION HELPER =====
const isHttpUrl = (url: string | null | undefined): url is string => {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

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
  cedula: string
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
  clientCedula: string
  path: string
}

interface ClientVistoBueno {
  id: string
  nombre: string
  cedula: string
  darVistoBueno: boolean
  tipo: 'cliente' | 'empresa'
}

// Tipos para Estado Mensual de Visto Bueno
interface VistoBuenoRecord {
  id: string
  clientId: string
  clientType: 'cliente' | 'empresa'
  clientName: string
  clientCedula: string
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  fechaVistoBueno: string | null
  fechaRechazo: string | null
  motivoRechazo: string | null
  archivoUrl: string | null
}

interface VistoBuenoEstadoMensual {
  aprobados: VistoBuenoRecord[]
  rechazados: VistoBuenoRecord[]
  pendientes: VistoBuenoRecord[]
  counts: {
    aprobados: number
    rechazados: number
    pendientes: number
    total: number
  }
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

interface DeudaCliente {
  id: string
  nombre: string
  cedula: string
  tipo: 'usuario' | 'empresa'
  grupoId?: string
  grupoNombre?: string
  esGrupoPrincipal?: boolean
  tarifa_hora: number
  iva_perc: number
  mesAnterior: {
    mes: string
    totalHoras: number
    montoHoras: number
    totalGastos: number
    totalMensualidades: number
    totalServiciosProfesionales: number
    subtotal: number
    iva: number
    total: number
  }
  mesActual: {
    mes: string
    totalHoras: number
    montoHoras: number
    totalGastos: number
    totalMensualidades: number
    totalServiciosProfesionales: number
    subtotal: number
    iva: number
    total: number
  }
}

interface TotalesDeudas {
  mesAnterior: {
    mes: string
    totalHoras: number
    montoHoras: number
    totalGastos: number
    totalMensualidades: number
    totalServiciosProfesionales: number
    subtotal: number
    iva: number
    total: number
  }
  mesActual: {
    mes: string
    totalHoras: number
    montoHoras: number
    totalGastos: number
    totalMensualidades: number
    totalServiciosProfesionales: number
    subtotal: number
    iva: number
    total: number
  }
}

// Vista Pago types
type TipoModalidadPago = 'Mensualidad' | 'Etapa Finalizada' | 'Único Pago' | 'Cobro por hora' | 'Solo gastos-servicios'

interface ProyectoMensualidad {
  id: string
  titulo: string
  costoNeto: number        // Sin IVA
  montoIva: number         // IVA
  totalProyecto: number    // Con IVA (total_a_pagar)
  cantidadCuotas: number
  montoPorCuota: number
  montoPagado: number
  saldoPendiente: number
}

interface ClienteVistaPago {
  id: string
  nombre: string
  cedula: string
  tipo: 'usuario' | 'empresa'
  tipoModalidad: TipoModalidadPago
  modoPago: boolean
  fechaActivacionModoPago: string | null
  grupoId?: string
  grupoNombre?: string
  esGrupoPrincipal?: boolean
  mes: string
  totalHoras: number
  montoHoras: number
  tarifaHora: number
  // Gastos desglosados
  gastosCliente: number
  gastosServiciosProfesionales: number
  totalGastos: number
  // Gastos pendientes de meses anteriores
  gastosPendientesAnteriores: number
  // Servicios profesionales (solo costo, sin gastos ni IVA)
  totalServiciosProfesionales: number
  totalMensualidades: number
  subtotal: number
  ivaPerc: number
  // IVA desglosado
  ivaHorasMensualidades: number
  ivaServiciosProfesionales: number
  iva: number
  total: number
  notaInterna?: string
  trabajosPorHora?: any[]
  gastos?: any[]
  gastosAnteriores?: any[]
  serviciosProfesionales?: any[]
  solicitudes?: any[]
  proyectos?: ProyectoMensualidad[]
}

interface TotalesPorModalidad {
  count: number
  totalHoras: number
  montoHoras: number
  totalGastos: number
  totalMensualidades: number
  subtotal: number
  iva: number
  total: number
  // Campos desglosados
  totalServiciosProfesionales: number
  gastosCliente: number
  gastosServiciosProfesionales: number
  ivaHorasMensualidades: number
  ivaServiciosProfesionales: number
}

interface TotalesPorGrupo {
  grupoNombre: string
  empresas: string[]
  totalHoras: number
  montoHoras: number
  totalGastos: number
  totalMensualidades: number
  subtotal: number
  iva: number
  total: number
  // Campos desglosados
  totalServiciosProfesionales: number
  gastosCliente: number
  gastosServiciosProfesionales: number
  ivaHorasMensualidades: number
  ivaServiciosProfesionales: number
}

type SectionType = 'comprobantes' | 'facturas' | 'plazos' | 'visto-bueno' | 'invitaciones' | 'ingresos' | 'fecha' | 'sync' | 'config' | 'grupos' | 'deudas' | 'gastos-estado' | 'servicios-estado' | 'vista-pago'

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
  
  // Estados para Visto Bueno - Estado Mensual
  const [vistoBuenoTab, setVistoBuenoTab] = useState<'config' | 'estado'>('config')
  const [vistoBuenoMes, setVistoBuenoMes] = useState<string>('')
  const [vistoBuenoEstado, setVistoBuenoEstado] = useState<VistoBuenoEstadoMensual | null>(null)
  const [loadingVistoBuenoEstado, setLoadingVistoBuenoEstado] = useState(false)
  const [showMotivoModal, setShowMotivoModal] = useState(false)
  const [selectedRechazo, setSelectedRechazo] = useState<VistoBuenoRecord | null>(null)
  const [forzandoAprobacion, setForzandoAprobacion] = useState<string | null>(null)
  
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

  // Estados para deudas de clientes
  const [deudas, setDeudas] = useState<DeudaCliente[]>([])
  const [totalesDeudas, setTotalesDeudas] = useState<TotalesDeudas | null>(null)
  const [loadingDeudas, setLoadingDeudas] = useState(false)
  const [filtroDeudas, setFiltroDeudas] = useState<'todos' | 'empresas' | 'usuarios'>('todos')
  const [vistaDeudas, setVistaDeudas] = useState<'mesAnterior' | 'mesActual'>('mesAnterior')

  // Estados para gestión de estado de gastos
  const [gastosEstado, setGastosEstado] = useState<any[]>([])
  const [loadingGastosEstado, setLoadingGastosEstado] = useState(false)
  const [filtroEstadoGasto, setFiltroEstadoGasto] = useState<string>('todos')
  const [filtroMesGasto, setFiltroMesGasto] = useState<string>('')
  const [filtroClienteGasto, setFiltroClienteGasto] = useState<string>('')
  const [selectedGastos, setSelectedGastos] = useState<string[]>([])
  const [nuevoEstadoGasto, setNuevoEstadoGasto] = useState<string>('pendiente')

  // Estados para gestión de estado de servicios profesionales
  const [serviciosEstado, setServiciosEstado] = useState<any[]>([])
  const [loadingServiciosEstado, setLoadingServiciosEstado] = useState(false)
  const [filtroEstadoServicio, setFiltroEstadoServicio] = useState<string>('todos')
  const [filtroMesServicio, setFiltroMesServicio] = useState<string>('')
  const [filtroClienteServicio, setFiltroClienteServicio] = useState<string>('')
  const [selectedServicios, setSelectedServicios] = useState<string[]>([])
  const [nuevoEstadoServicio, setNuevoEstadoServicio] = useState<string>('pendiente')

  // Estados para Vista Pago
  const [clientesVistaPago, setClientesVistaPago] = useState<ClienteVistaPago[]>([])
  const [loadingVistaPago, setLoadingVistaPago] = useState(false)
  const [totalesPorModalidadPago, setTotalesPorModalidadPago] = useState<Record<TipoModalidadPago, TotalesPorModalidad> | null>(null)
  const [totalesPorGrupoPago, setTotalesPorGrupoPago] = useState<Record<string, TotalesPorGrupo> | null>(null)
  const [granTotalPago, setGranTotalPago] = useState<TotalesPorModalidad | null>(null)
  const [filtroModalidadPago, setFiltroModalidadPago] = useState<TipoModalidadPago | 'todos'>('todos')
  const [filtroTipoPago, setFiltroTipoPago] = useState<'todos' | 'empresas' | 'usuarios'>('todos')
  const [searchVistaPago, setSearchVistaPago] = useState<string>('')
  const [ordenVistaPago, setOrdenVistaPago] = useState<'nombre' | 'total' | 'tipo'>('nombre')
  const [clienteExpandido, setClienteExpandido] = useState<string | null>(null)
  const [editandoNota, setEditandoNota] = useState<string | null>(null)
  const [notaTemp, setNotaTemp] = useState<string>('')

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
    
    // Auto-cargar datos de la primera sección (comprobantes)
    loadPaymentData()
  }, [])

  // Effect para recargar ingresos cuando cambian año/mes o se activa la sección
  useEffect(() => {
    if (activeSection === 'ingresos') {
      loadIngresos()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingresosYear, ingresosMes, activeSection])

  // ===== FUNCIONES DE CARGA POR SECCIÓN =====
  
  // COMPROBANTES
  const loadPaymentData = async () => {
    setLoadingReceipts(true)
    try {
      // Endpoint original sin parámetros extra
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
      // Usar fecha simulada si está activa, de lo contrario fecha actual
      const now = isDateSimulated && simulatedDate ? new Date(simulatedDate) : new Date()
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
      
      devLog('Usuarios response:', usuariosData)
      devLog('Empresas response:', empresasData)
      
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

  // ESTADO MENSUAL VISTO BUENO
  const loadVistoBuenoEstado = async (mes?: string) => {
    const mesParam = mes || vistoBuenoMes
    if (!mesParam) return
    
    setLoadingVistoBuenoEstado(true)
    try {
      const res = await fetch(`/api/visto-bueno/admin?mes=${mesParam}`, {
        credentials: 'include' // Incluir cookies de sesión de dev admin
      })
      const data = await res.json()
      
      if (data.success) {
        // Combinar data y counts en un solo objeto
        setVistoBuenoEstado({
          ...data.data,
          counts: data.counts
        })
      } else {
        console.error('Error cargando estado visto bueno:', data.error)
        setVistoBuenoEstado(null)
      }
    } catch (error) {
      console.error('Error cargando estado visto bueno:', error)
      setVistoBuenoEstado(null)
    } finally {
      setLoadingVistoBuenoEstado(false)
    }
  }

  const handleForzarAprobacion = async (record: VistoBuenoRecord) => {
    if (!vistoBuenoMes) {
      alert('Debe seleccionar un mes primero')
      return
    }
    if (!confirm(`¿Forzar aprobación para ${record.clientName}? Esto eliminará el rechazo actual.`)) return
    
    const compositeKey = `${record.clientType}:${record.clientId}`
    setForzandoAprobacion(compositeKey)
    try {
      const res = await fetch('/api/visto-bueno/admin/forzar', {
        method: 'POST',
        credentials: 'include', // Incluir cookies de sesión de dev admin
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: record.clientId,
          clientType: record.clientType,
          mes: vistoBuenoMes
        })
      })
      const data = await res.json()
      
      if (data.success) {
        alert('Aprobación forzada correctamente')
        await loadVistoBuenoEstado()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      alert('Error forzando aprobación')
    } finally {
      setForzandoAprobacion(null)
    }
  }

  // CÓDIGOS DE INVITACIÓN
  const loadInvitationCodes = async () => {
    setLoadingCodes(true)
    try {
      // GET request to retrieve invitation codes with filters
      const response = await fetch('/api/invitation-codes?includeUsed=true&includeExpired=true', {
        method: 'GET',
        credentials: 'include' // Incluir cookies de sesión
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
      setLoadingCodes(false)
    }
  }

  const generateInvitationCode = async () => {
    // Validate numeric inputs
    const expiryValue = parseInt(newCodeExpiry, 10)
    const maxUsesValue = parseInt(newCodeMaxUses, 10)
    
    if (!Number.isFinite(expiryValue) || expiryValue <= 0) {
      alert('Por favor ingresa un valor válido para las horas de expiración')
      return
    }
    if (!Number.isFinite(maxUsesValue) || maxUsesValue <= 0) {
      alert('Por favor ingresa un valor válido para el número máximo de usos')
      return
    }
    
    setGeneratingCode(true)
    setGeneratedCode(null)
    try {
      const res = await fetch('/api/invitation-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newCodeType,
          expiresInHours: expiryValue,
          maxUses: maxUsesValue,
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
        credentials: 'include', // Incluir cookies de sesión
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

  const copyToClipboard = async (code: string) => {
    if (!navigator.clipboard) {
      alert('Clipboard API no disponible en este navegador')
      return
    }
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
    } catch (error) {
      console.error('Error copiando al clipboard:', error)
      alert('Error al copiar el código')
    }
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
      const res = await fetch(endpoint, { method: 'POST' })
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
    // Orden correcto respetando dependencias (Foreign Keys)
    const endpoints = [
      // 1. Tablas base sin dependencias
      { url: '/api/sync-usuarios', label: 'Usuarios' },
      { url: '/api/sync-empresas', label: 'Empresas' },
      { url: '/api/sync-contactos', label: 'Contactos' },
      { url: '/api/sync-materias', label: 'Materias' },
      { url: '/api/sync-funcionarios', label: 'Funcionarios' },
      { url: '/api/sync-historial-reportes', label: 'Historial Reportes' },
      
      // 2. Tablas que dependen de usuarios/empresas
      { url: '/api/sync-casos', label: 'Casos' },
      { url: '/api/sync-solicitudes', label: 'Solicitudes' },
      { url: '/api/sync-ingresos', label: 'Ingresos' },
      
      // 3. Tablas que dependen de casos/solicitudes
      { url: '/api/sync-control-horas', label: 'Control de Horas' },
      { url: '/api/sync-gastos', label: 'Gastos' },
      { url: '/api/sync-actualizaciones', label: 'Actualizaciones' },
      { url: '/api/sync-clicks-etapa', label: 'Clicks Etapa' }
    ]
    const syncResults: SyncResult[] = []
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint.url, { method: 'POST' })
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
      devLog('Grupos response:', dataGrupos)
      if (dataGrupos.success) {
        setGrupos(dataGrupos.grupos || [])
      }

      // Obtener empresas de Supabase directamente
      const empresasRes = await fetch('/api/client?tipo=empresa&all=true')
      const empresasData = await empresasRes.json()
      devLog('Empresas response completa:', JSON.stringify(empresasData))
      
      // La respuesta puede tener empresas directamente o dentro de success
      const empresasList = empresasData.empresas || []
      devLog('Empresas encontradas:', empresasList.length)
      
      if (empresasList.length > 0) {
        setEmpresasDisponibles(empresasList.map((e: any) => ({
          id: e.id,
          nombre: e.nombre,
          iva_perc: e.iva_perc ?? 0.13
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

  // DEUDAS DE CLIENTES
  const loadDeudas = async () => {
    setLoadingDeudas(true)
    try {
      const url = isDateSimulated && simulatedDate 
        ? `/api/deudas-clientes?simulatedDate=${simulatedDate}`
        : '/api/deudas-clientes'
      const res = await fetch(url)
      const data = await res.json()
      
      if (data.success) {
        setDeudas(data.deudas || [])
        setTotalesDeudas(data.totales || null)
      } else {
        console.error('Error cargando deudas:', data.error)
      }
    } catch (error) {
      console.error('Error cargando deudas:', error)
    } finally {
      setLoadingDeudas(false)
    }
  }

  // GASTOS - ESTADO DE PAGO
  const loadGastosEstado = async () => {
    setLoadingGastosEstado(true)
    try {
      const params = new URLSearchParams()
      if (filtroEstadoGasto && filtroEstadoGasto !== 'todos') {
        params.append('estado', filtroEstadoGasto)
      }
      if (filtroMesGasto) {
        params.append('mes', filtroMesGasto)
      }
      if (filtroClienteGasto) {
        params.append('cedula', filtroClienteGasto)
      }
      
      const url = `/api/gastos-estado${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url)
      const data = await res.json()
      
      if (data.success) {
        setGastosEstado(data.gastos || [])
      } else {
        console.error('Error cargando gastos:', data.error)
        alert('Error cargando gastos: ' + data.error)
      }
    } catch (error) {
      console.error('Error cargando gastos:', error)
      alert('Error de conexión al cargar gastos')
    } finally {
      setLoadingGastosEstado(false)
    }
  }

  // Actualizar estado de un gasto individual
  const updateGastoEstado = async (id: string, nuevoEstado: string) => {
    try {
      const res = await fetch('/api/gastos-estado', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estado: nuevoEstado })
      })
      const data = await res.json()
      
      if (data.success) {
        // Actualizar el estado local
        setGastosEstado(prev => prev.map(g => 
          g.id === id ? { ...g, estado_pago: nuevoEstado } : g
        ))
      } else {
        alert('Error actualizando estado: ' + data.error)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error de conexión')
    }
  }

  // Actualizar estado de múltiples gastos
  const updateGastosEstadoBulk = async () => {
    if (selectedGastos.length === 0) {
      alert('Selecciona al menos un gasto')
      return
    }
    
    try {
      const res = await fetch('/api/gastos-estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedGastos, estado: nuevoEstadoGasto })
      })
      const data = await res.json()
      
      if (data.success) {
        alert(`${data.updated} gastos actualizados`)
        setSelectedGastos([])
        loadGastosEstado()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error de conexión')
    }
  }

  // Toggle selección de gasto
  const toggleGastoSelection = (id: string) => {
    setSelectedGastos(prev => 
      prev.includes(id) 
        ? prev.filter(g => g !== id)
        : [...prev, id]
    )
  }

  // Seleccionar/deseleccionar todos
  const toggleAllGastos = () => {
    if (selectedGastos.length === gastosEstado.length) {
      setSelectedGastos([])
    } else {
      setSelectedGastos(gastosEstado.map(g => g.id))
    }
  }

  // SERVICIOS PROFESIONALES - ESTADO DE PAGO
  const loadServiciosEstado = async () => {
    setLoadingServiciosEstado(true)
    // Clear selection when reloading to prevent stale selection
    setSelectedServicios([])
    try {
      const params = new URLSearchParams()
      if (filtroEstadoServicio && filtroEstadoServicio !== 'todos') {
        params.append('estado', filtroEstadoServicio)
      }
      if (filtroMesServicio) {
        params.append('mes', filtroMesServicio)
      }
      if (filtroClienteServicio) {
        params.append('cedula', filtroClienteServicio)
      }
      
      const url = `/api/servicios-estado${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url)
      const data = await res.json()
      
      if (data.success) {
        setServiciosEstado(data.servicios || [])
      } else {
        console.error('Error cargando servicios:', data.error)
        alert('Error cargando servicios: ' + data.error)
      }
    } catch (error) {
      console.error('Error cargando servicios:', error)
      alert('Error de conexión al cargar servicios')
    } finally {
      setLoadingServiciosEstado(false)
    }
  }

  // Actualizar estado de un servicio individual
  const updateServicioEstado = async (id: string, nuevoEstado: string) => {
    try {
      const res = await fetch('/api/servicios-estado', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estado: nuevoEstado })
      })
      const data = await res.json()
      
      if (data.success) {
        // Actualizar el estado local
        setServiciosEstado(prev => prev.map(s => 
          s.id === id ? { ...s, estado_pago: nuevoEstado } : s
        ))
      } else {
        alert('Error actualizando estado: ' + data.error)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error de conexión')
    }
  }

  // Actualizar estado de múltiples servicios
  const updateServiciosEstadoBulk = async () => {
    if (selectedServicios.length === 0) {
      alert('Selecciona al menos un servicio')
      return
    }
    
    try {
      const res = await fetch('/api/servicios-estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedServicios, estado: nuevoEstadoServicio })
      })
      const data = await res.json()
      
      if (data.success) {
        alert(`${data.updated} servicios actualizados`)
        setSelectedServicios([])
        loadServiciosEstado()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error de conexión')
    }
  }

  // Toggle selección de servicio
  const toggleServicioSelection = (id: string) => {
    setSelectedServicios(prev => 
      prev.includes(id) 
        ? prev.filter(s => s !== id)
        : [...prev, id]
    )
  }

  // Seleccionar/deseleccionar todos los servicios
  const toggleAllServicios = () => {
    if (selectedServicios.length === serviciosEstado.length) {
      setSelectedServicios([])
    } else {
      setSelectedServicios(serviciosEstado.map(s => s.id))
    }
  }

  // Filtrar deudas según el filtro seleccionado
  const getDeudasFiltradas = () => {
    if (filtroDeudas === 'todos') return deudas
    return deudas.filter(d => d.tipo === (filtroDeudas === 'empresas' ? 'empresa' : 'usuario'))
  }

  // Calcular totales por grupo
  const getTotalesPorGrupo = () => {
    const grupos: { [grupoId: string]: { nombre: string; total: number; totalHoras: number; cantidad: number } } = {}
    const deudasFiltradas = getDeudasFiltradas()
    
    deudasFiltradas.forEach(deuda => {
      if (deuda.grupoId) {
        const datos = vistaDeudas === 'mesAnterior' ? deuda.mesAnterior : deuda.mesActual
        if (!grupos[deuda.grupoId]) {
          grupos[deuda.grupoId] = { 
            nombre: deuda.grupoNombre || '', 
            total: 0, 
            totalHoras: 0,
            cantidad: 0
          }
        }
        grupos[deuda.grupoId].cantidad += 1
        // Redondear a 2 decimales para evitar errores de punto flotante
        grupos[deuda.grupoId].total = Math.round((grupos[deuda.grupoId].total + datos.total) * 100) / 100
        grupos[deuda.grupoId].totalHoras = Math.round((grupos[deuda.grupoId].totalHoras + datos.totalHoras) * 100) / 100
      }
    })
    
    return grupos
  }

  // VISTA PAGO - Cargar datos de clientes con modoPago
  const loadVistaPago = async () => {
    setLoadingVistaPago(true)
    try {
      const url = isDateSimulated && simulatedDate 
        ? `/api/vista-pago?simulatedDate=${simulatedDate}`
        : '/api/vista-pago'
      const res = await fetch(url, { credentials: 'include' })
      const data = await res.json()
      
      if (data.success) {
        setClientesVistaPago(data.clientes || [])
        setTotalesPorModalidadPago(data.totalesPorModalidad || null)
        setTotalesPorGrupoPago(data.totalesPorGrupo || null)
        setGranTotalPago(data.granTotal || null)
      } else {
        console.error('Error cargando vista pago:', data.error)
        alert('Error cargando datos de pago: ' + data.error)
      }
    } catch (error) {
      console.error('Error cargando vista pago:', error)
      alert('Error de conexión al cargar datos de pago')
    } finally {
      setLoadingVistaPago(false)
    }
  }

  // Filtrar clientes de vista pago
  const getClientesVistaPagoFiltrados = () => {
    let filtrados = [...clientesVistaPago]
    
    // Filtro por modalidad
    if (filtroModalidadPago !== 'todos') {
      filtrados = filtrados.filter(c => c.tipoModalidad === filtroModalidadPago)
    }
    
    // Filtro por tipo (empresa/usuario)
    if (filtroTipoPago !== 'todos') {
      filtrados = filtrados.filter(c => c.tipo === (filtroTipoPago === 'empresas' ? 'empresa' : 'usuario'))
    }
    
    // Búsqueda por texto
    if (searchVistaPago.trim()) {
      const search = searchVistaPago.toLowerCase()
      filtrados = filtrados.filter(c => 
        c.nombre.toLowerCase().includes(search) ||
        c.cedula.toLowerCase().includes(search) ||
        (c.grupoNombre || '').toLowerCase().includes(search)
      )
    }
    
    // Ordenamiento
    filtrados.sort((a, b) => {
      if (ordenVistaPago === 'total') {
        return b.total - a.total
      }
      if (ordenVistaPago === 'tipo') {
        if (a.tipo !== b.tipo) return a.tipo === 'empresa' ? -1 : 1
        return a.nombre.localeCompare(b.nombre)
      }
      // Por defecto: nombre
      return a.nombre.localeCompare(b.nombre)
    })
    
    return filtrados
  }

  // Guardar nota interna
  const guardarNotaInterna = async (clienteId: string, tipo: 'usuario' | 'empresa') => {
    try {
      const res = await fetch('/api/vista-pago', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clienteId, tipo, nota: notaTemp })
      })
      const data = await res.json()
      
      if (data.success) {
        // Actualizar estado local
        setClientesVistaPago(prev => prev.map(c => 
          c.id === clienteId ? { ...c, notaInterna: notaTemp || undefined } : c
        ))
        setEditandoNota(null)
        setNotaTemp('')
      } else {
        alert('Error guardando nota: ' + data.error)
      }
    } catch (error) {
      console.error('Error guardando nota:', error)
      alert('Error de conexión')
    }
  }

  // Formatear horas
  const formatHoras = (horas: number) => {
    const h = Math.floor(horas)
    const m = Math.round((horas - h) * 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  // Nombre del mes
  const getNombreMes = (mesStr: string) => {
    const [year, month] = mesStr.split('-')
    const meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    return `${meses[parseInt(month)]} ${year}`
  }

  const handleLogout = async () => {
    if (!confirm('¿Cerrar sesión del panel de administración?')) {
      return
    }

    try {
      const res = await fetch('/api/dev-auth/logout', { 
        method: 'POST',
        credentials: 'include' // Asegurar que se envíen las cookies
      })
      const data = await res.json()

      if (data.success) {
        // Usar replace para limpiar historial y forzar recarga completa
        window.location.replace('/dev/login')
      } else {
        alert('Error al cerrar sesión')
      }
    } catch (error) {
      console.error('Error cerrando sesión:', error)
      alert('Error al cerrar sesión')
    }
  }

  // ===== RENDERIZADO =====

  if (!isMounted) {
    return <div className={styles.loadingState}><div className={styles.spinner}></div><p>Cargando panel...</p></div>
  }

  return (
    <div className={`${styles.container} ${!sidebarOpen ? styles.sidebarClosed : ''}`}>
      {/* SIDEBAR */}
      <aside id="sidebar-nav" className={`${styles.sidebar} ${!sidebarOpen ? styles.collapsed : ''}`}>
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
            className={`${styles.navItem} ${activeSection === 'deudas' ? styles.active : ''}`}
            onClick={() => { setActiveSection('deudas'); loadDeudas() }}
          >
            <span className={styles.navIcon}>💰</span>
            <span className={styles.navLabel}>Deudas Clientes</span>
          </button>
          <button 
            className={`${styles.navItem} ${activeSection === 'vista-pago' ? styles.active : ''}`}
            onClick={() => { setActiveSection('vista-pago'); loadVistaPago() }}
          >
            <span className={styles.navIcon}>📊</span>
            <span className={styles.navLabel}>Vista Pago</span>
          </button>
          <button 
            className={`${styles.navItem} ${activeSection === 'gastos-estado' ? styles.active : ''}`}
            onClick={() => { setActiveSection('gastos-estado'); loadGastosEstado() }}
          >
            <span className={styles.navIcon}>💳</span>
            <span className={styles.navLabel}>Estado Gastos</span>
          </button>
          <button 
            className={`${styles.navItem} ${activeSection === 'servicios-estado' ? styles.active : ''}`}
            onClick={() => { setActiveSection('servicios-estado'); loadServiciosEstado() }}
          >
            <span className={styles.navIcon}>🛠️</span>
            <span className={styles.navLabel}>Estado Servicios</span>
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
          <button 
            className={styles.toggleButton} 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={sidebarOpen}
            aria-controls="sidebar-nav"
          >
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
                <p className={styles.sectionDescription}>Configuración y estado mensual del visto bueno</p>
              </div>
            </div>
            
            {/* Tabs */}
            <div className={styles.tabsContainer} role="tablist" aria-label="Visto Bueno">
              <button 
                className={`${styles.tab} ${vistoBuenoTab === 'config' ? styles.tabActive : ''}`}
                onClick={() => setVistoBuenoTab('config')}
                role="tab"
                aria-selected={vistoBuenoTab === 'config'}
                aria-controls="tabpanel-config"
                id="tab-config"
              >
                Configuración
              </button>
              <button 
                className={`${styles.tab} ${vistoBuenoTab === 'estado' ? styles.tabActive : ''}`}
                onClick={() => {
                  setVistoBuenoTab('estado')
                  if (!vistoBuenoEstado) {
                    // Inicializar con mes anterior
                    const now = new Date()
                    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                    const mesStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`
                    setVistoBuenoMes(mesStr)
                    loadVistoBuenoEstado(mesStr)
                  }
                }}
                role="tab"
                aria-selected={vistoBuenoTab === 'estado'}
                aria-controls="tabpanel-estado"
                id="tab-estado"
              >
                Estado Mensual
              </button>
            </div>

            {/* Tab: Configuración */}
            {vistoBuenoTab === 'config' && (
              <div role="tabpanel" id="tabpanel-config" aria-labelledby="tab-config">
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

            {/* Tab: Estado Mensual */}
            {vistoBuenoTab === 'estado' && (
              <div role="tabpanel" id="tabpanel-estado" aria-labelledby="tab-estado">
                {/* Selector de mes */}
                <div className={styles.card} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <label className={styles.formLabel} style={{ margin: 0 }}>Mes:</label>
                    <input 
                      type="month" 
                      className={styles.input}
                      value={vistoBuenoMes}
                      onChange={(e) => {
                        setVistoBuenoMes(e.target.value)
                        loadVistoBuenoEstado(e.target.value)
                      }}
                      style={{ width: 'auto' }}
                    />
                    <button 
                      className={styles.button}
                      onClick={() => loadVistoBuenoEstado()}
                      disabled={loadingVistoBuenoEstado}
                    >
                      {loadingVistoBuenoEstado ? 'Cargando...' : 'Actualizar'}
                    </button>
                  </div>
                </div>

                {loadingVistoBuenoEstado ? (
                  <div className={styles.loadingState}><div className={styles.spinner}></div><p>Cargando estado...</p></div>
                ) : !vistoBuenoEstado ? (
                  <div className={styles.emptyState}>Selecciona un mes para ver el estado</div>
                ) : (
                  <>
                    {/* Resumen */}
                    <div className={styles.statsGrid} style={{ marginBottom: '1.5rem' }}>
                      <div className={styles.statCard}>
                        <span className={styles.statLabel}>Aprobados</span>
                        <span className={styles.statValue} style={{ color: '#16a34a' }}>{vistoBuenoEstado.counts.aprobados}</span>
                      </div>
                      <div className={styles.statCard}>
                        <span className={styles.statLabel}>Rechazados</span>
                        <span className={styles.statValue} style={{ color: '#dc2626' }}>{vistoBuenoEstado.counts.rechazados}</span>
                      </div>
                      <div className={styles.statCard}>
                        <span className={styles.statLabel}>Pendientes</span>
                        <span className={styles.statValue} style={{ color: '#ca8a04' }}>{vistoBuenoEstado.counts.pendientes}</span>
                      </div>
                    </div>

                    {/* Rechazados */}
                    {vistoBuenoEstado.rechazados.length > 0 && (
                      <div className={styles.card} style={{ marginBottom: '1.5rem', borderLeft: '4px solid #dc2626' }}>
                        <h3 style={{ marginBottom: '1rem', color: '#dc2626' }}>
                          ❌ Rechazados ({vistoBuenoEstado.rechazados.length})
                        </h3>
                        <div className={styles.table}>
                          <table>
                            <thead>
                              <tr>
                                <th>Cliente</th>
                                <th>Tipo</th>
                                <th>Fecha Rechazo</th>
                                <th>Motivo</th>
                                <th>Archivo</th>
                                <th>Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vistoBuenoEstado.rechazados.map((record) => (
                                <tr key={`${record.clientType}:${record.clientId}`}>
                                  <td>
                                    <strong>{record.clientName}</strong>
                                    <br />
                                    <small style={{ color: '#666' }}>{record.clientCedula}</small>
                                  </td>
                                  <td><span className={styles.badge}>{record.clientType}</span></td>
                                  <td>{record.fechaRechazo ? new Date(record.fechaRechazo).toLocaleDateString('es-CR') : '-'}</td>
                                  <td>
                                    {record.motivoRechazo ? (
                                      <button 
                                        className={styles.buttonLink}
                                        onClick={() => {
                                          setSelectedRechazo(record)
                                          setShowMotivoModal(true)
                                        }}
                                      >
                                        Ver motivo
                                      </button>
                                    ) : '-'}
                                  </td>
                                  <td>
                                    {isHttpUrl(record.archivoUrl) ? (
                                      <a href={record.archivoUrl} target="_blank" rel="noopener noreferrer" className={styles.buttonLink}>
                                        Ver archivo
                                      </a>
                                    ) : '-'}
                                  </td>
                                  <td>
                                    <button 
                                      className={`${styles.button} ${styles.buttonWarning}`}
                                      onClick={() => handleForzarAprobacion(record)}
                                      disabled={!vistoBuenoMes || forzandoAprobacion === `${record.clientType}:${record.clientId}`}
                                    >
                                      {forzandoAprobacion === `${record.clientType}:${record.clientId}` ? 'Forzando...' : 'Forzar Aprobación'}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Aprobados */}
                    {vistoBuenoEstado.aprobados.length > 0 && (
                      <div className={styles.card} style={{ marginBottom: '1.5rem', borderLeft: '4px solid #16a34a' }}>
                        <h3 style={{ marginBottom: '1rem', color: '#16a34a' }}>
                          ✅ Aprobados ({vistoBuenoEstado.aprobados.length})
                        </h3>
                        <div className={styles.table}>
                          <table>
                            <thead>
                              <tr>
                                <th>Cliente</th>
                                <th>Tipo</th>
                                <th>Fecha Aprobación</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vistoBuenoEstado.aprobados.map((record) => (
                                <tr key={`${record.clientType}:${record.clientId}`}>
                                  <td>
                                    <strong>{record.clientName}</strong>
                                    <br />
                                    <small style={{ color: '#666' }}>{record.clientCedula}</small>
                                  </td>
                                  <td><span className={styles.badge}>{record.clientType}</span></td>
                                  <td>{record.fechaVistoBueno ? new Date(record.fechaVistoBueno).toLocaleDateString('es-CR') : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Pendientes */}
                    {vistoBuenoEstado.pendientes.length > 0 && (
                      <div className={styles.card} style={{ marginBottom: '1.5rem', borderLeft: '4px solid #ca8a04' }}>
                        <h3 style={{ marginBottom: '1rem', color: '#ca8a04' }}>
                          ⏳ Pendientes ({vistoBuenoEstado.pendientes.length})
                        </h3>
                        <div className={styles.table}>
                          <table>
                            <thead>
                              <tr>
                                <th>Cliente</th>
                                <th>Tipo</th>
                                <th>Cédula</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vistoBuenoEstado.pendientes.map((record) => (
                                <tr key={`${record.clientType}:${record.clientId}`}>
                                  <td><strong>{record.clientName}</strong></td>
                                  <td><span className={styles.badge}>{record.clientType}</span></td>
                                  <td>{record.clientCedula}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {vistoBuenoEstado.aprobados.length === 0 && 
                     vistoBuenoEstado.rechazados.length === 0 && 
                     vistoBuenoEstado.pendientes.length === 0 && (
                      <div className={styles.emptyState}>
                        No hay registros para este mes
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Modal para ver motivo */}
            {showMotivoModal && selectedRechazo && (
              <div className={styles.modalOverlay} onClick={() => setShowMotivoModal(false)}>
                <div 
                  className={styles.modal} 
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="modal-motivo-title"
                >
                  <div className={styles.modalHeader}>
                    <h3 id="modal-motivo-title">Motivo de Rechazo</h3>
                    <button className={styles.modalClose} onClick={() => setShowMotivoModal(false)} aria-label="Cerrar modal">×</button>
                  </div>
                  <div className={styles.modalBody}>
                    <p><strong>Cliente:</strong> {selectedRechazo.clientName}</p>
                    <p><strong>Fecha:</strong> {selectedRechazo.fechaRechazo ? new Date(selectedRechazo.fechaRechazo).toLocaleString('es-CR') : '-'}</p>
                    <div style={{ marginTop: '1rem', padding: '1rem', background: '#f5f5f5', borderRadius: '0.5rem', whiteSpace: 'pre-wrap' }}>
                      {selectedRechazo.motivoRechazo}
                    </div>
                    {isHttpUrl(selectedRechazo.archivoUrl) && (
                      <div style={{ marginTop: '1rem' }}>
                        <a href={selectedRechazo.archivoUrl} target="_blank" rel="noopener noreferrer" className={styles.button}>
                          Ver Archivo Adjunto
                        </a>
                      </div>
                    )}
                  </div>
                  <div className={styles.modalFooter}>
                    <button className={styles.button} onClick={() => setShowMotivoModal(false)}>Cerrar</button>
                  </div>
                </div>
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
                            <code className={styles.codeBox}>
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
                  onChange={(e) => setIngresosYear(e.target.value)}
                  style={{ width: 'auto' }}
                >
                  {[2024, 2025, 2026].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select 
                  className={styles.input}
                  value={ingresosMes}
                  onChange={(e) => setIngresosMes(e.target.value)}
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
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-ingresos', 'Ingresos')} disabled={loading}>
                <span className={styles.syncIcon}>💵</span>
                <span className={styles.syncLabel}>Ingresos</span>
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
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-lista-servicios', 'Lista Servicios')} disabled={loading}>
                <span className={styles.syncIcon}>📋</span>
                <span className={styles.syncLabel}>Lista Servicios</span>
              </button>
              
              <button className={styles.syncCard} onClick={() => handleSync('/api/sync-servicios-profesionales', 'Servicios Profesionales')} disabled={loading}>
                <span className={styles.syncIcon}>💼</span>
                <span className={styles.syncLabel}>Servicios Profesionales</span>
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
                    <div className={styles.empresaPrincipalBox}>
                      <strong className={styles.empresaPrincipalLabel}>👑 Empresa Principal:</strong>
                      <p className={styles.empresaPrincipalNombre}>
                        {grupo.empresa_principal?.nombre || grupo.empresa_principal_id}
                      </p>
                      <small className={styles.textMuted}>Esta empresa ve y paga por las demás del grupo</small>
                    </div>

                    {/* Empresas Asociadas */}
                    <div className={styles.empresasAsociadasBox}>
                      <strong>🏢 Empresas Asociadas ({grupo.empresas_asociadas?.length || 0}):</strong>
                      {grupo.empresas_asociadas?.length === 0 ? (
                        <p className={styles.textMuted} style={{ margin: '0.5rem 0' }}>Sin empresas asociadas</p>
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

        {/* DEUDAS DE CLIENTES */}
        {activeSection === 'deudas' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Deudas de Clientes</h2>
                <p className={styles.sectionDescription}>
                  Montos pendientes de pago por empresas y usuarios
                </p>
              </div>
              <button className={styles.button} onClick={loadDeudas} disabled={loadingDeudas}>
                {loadingDeudas ? 'Cargando...' : 'Refrescar'}
              </button>
            </div>

            {/* Filtros y vista */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Ver mes:</label>
                <select
                  className={styles.input}
                  value={vistaDeudas}
                  onChange={(e) => setVistaDeudas(e.target.value as 'mesAnterior' | 'mesActual')}
                  style={{ minWidth: '200px' }}
                >
                  <option value="mesAnterior">
                    {totalesDeudas?.mesAnterior.mes ? getNombreMes(totalesDeudas.mesAnterior.mes) : 'Mes Anterior'} (Reportado)
                  </option>
                  <option value="mesActual">
                    {totalesDeudas?.mesActual.mes ? getNombreMes(totalesDeudas.mesActual.mes) : 'Mes Actual'} (En curso)
                  </option>
                </select>
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Filtrar por:</label>
                <select
                  className={styles.input}
                  value={filtroDeudas}
                  onChange={(e) => setFiltroDeudas(e.target.value as 'todos' | 'empresas' | 'usuarios')}
                  style={{ minWidth: '150px' }}
                >
                  <option value="todos">Todos</option>
                  <option value="empresas">Solo Empresas</option>
                  <option value="usuarios">Solo Usuarios</option>
                </select>
              </div>
            </div>

            {/* Resumen de totales */}
            {totalesDeudas && (
              <div className={styles.deudasResumen}>
                <h3 className={styles.deudasResumenTitle}>
                  Total {vistaDeudas === 'mesAnterior' ? getNombreMes(totalesDeudas.mesAnterior.mes) : getNombreMes(totalesDeudas.mesActual.mes)}
                </h3>
                <div className={styles.deudasResumenGrid}>
                  <div>
                    <strong>Horas:</strong>
                    <p className={styles.deudasResumenValue}>
                      {formatHoras(vistaDeudas === 'mesAnterior' ? totalesDeudas.mesAnterior.totalHoras : totalesDeudas.mesActual.totalHoras)}
                    </p>
                  </div>
                  <div>
                    <strong>Monto Horas:</strong>
                    <p className={styles.deudasResumenValue}>
                      {formatCurrency(vistaDeudas === 'mesAnterior' ? totalesDeudas.mesAnterior.montoHoras : totalesDeudas.mesActual.montoHoras)}
                    </p>
                  </div>
                  <div>
                    <strong>Gastos:</strong>
                    <p className={styles.deudasResumenValue}>
                      {formatCurrency(vistaDeudas === 'mesAnterior' ? totalesDeudas.mesAnterior.totalGastos : totalesDeudas.mesActual.totalGastos)}
                    </p>
                  </div>
                  <div>
                    <strong>Mensualidades:</strong>
                    <p className={styles.deudasResumenValue}>
                      {formatCurrency(vistaDeudas === 'mesAnterior' ? totalesDeudas.mesAnterior.totalMensualidades : totalesDeudas.mesActual.totalMensualidades)}
                    </p>
                  </div>
                  <div>
                    <strong>Servicios Prof.:</strong>
                    <p className={styles.deudasResumenValue}>
                      {formatCurrency(vistaDeudas === 'mesAnterior' ? totalesDeudas.mesAnterior.totalServiciosProfesionales || 0 : totalesDeudas.mesActual.totalServiciosProfesionales || 0)}
                    </p>
                  </div>
                  <div>
                    <strong>Subtotal:</strong>
                    <p className={styles.deudasResumenValue}>
                      {formatCurrency(vistaDeudas === 'mesAnterior' ? totalesDeudas.mesAnterior.subtotal : totalesDeudas.mesActual.subtotal)}
                    </p>
                  </div>
                  <div>
                    <strong>IVA:</strong>
                    <p className={styles.deudasResumenValue}>
                      {formatCurrency(vistaDeudas === 'mesAnterior' ? totalesDeudas.mesAnterior.iva : totalesDeudas.mesActual.iva)}
                    </p>
                  </div>
                  <div className={styles.deudasResumenTotal}>
                    <strong>TOTAL A COBRAR:</strong>
                    <p className={styles.deudasResumenTotalValue}>
                      {formatCurrency(vistaDeudas === 'mesAnterior' ? totalesDeudas.mesAnterior.total : totalesDeudas.mesActual.total)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Lista de deudas */}
            {loadingDeudas ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Cargando deudas...</p>
              </div>
            ) : getDeudasFiltradas().length === 0 ? (
              <div className={styles.emptyState}>
                <p>No hay deudas pendientes para el período seleccionado</p>
              </div>
            ) : (
              <div className={styles.table}>
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Tipo</th>
                      <th>Grupo</th>
                      <th style={{ textAlign: 'right' }}>Horas</th>
                      <th style={{ textAlign: 'right' }}>Monto Horas</th>
                      <th style={{ textAlign: 'right' }}>Gastos</th>
                      <th style={{ textAlign: 'right' }}>Mensualidades</th>
                      <th style={{ textAlign: 'right' }}>Servicios Prof.</th>
                      <th style={{ textAlign: 'right' }}>Subtotal</th>
                      <th style={{ textAlign: 'right' }}>IVA</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const deudasFiltradas = getDeudasFiltradas()
                      const totalesPorGrupo = getTotalesPorGrupo()
                      const gruposYaMostrados = new Set<string>()
                      const filas: React.ReactNode[] = []
                      
                      deudasFiltradas.forEach((deuda, index) => {
                        const datos = vistaDeudas === 'mesAnterior' ? deuda.mesAnterior : deuda.mesActual
                        
                        // Agregar fila de la deuda
                        filas.push(
                          <tr 
                            key={deuda.id} 
                            className={deuda.esGrupoPrincipal ? styles.rowGrupoPrincipal : (deuda.grupoId ? styles.rowGrupoAsociado : '')}
                          >
                            <td>
                              <strong>{deuda.nombre}</strong>
                              <br />
                              <small className={styles.textMuted}>{deuda.cedula}</small>
                            </td>
                            <td>
                              <span className={`${styles.badge} ${deuda.tipo === 'empresa' ? styles.badgeInfo : styles.badgeWarning}`}>
                                {deuda.tipo === 'empresa' ? 'Empresa' : 'Usuario'}
                              </span>
                            </td>
                            <td>
                              {deuda.grupoNombre ? (
                                <span style={{ fontSize: '0.875rem' }}>
                                  {deuda.esGrupoPrincipal ? '* ' : '  '}
                                  {deuda.grupoNombre}
                                </span>
                              ) : (
                                <span className={styles.textMuted}>—</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>{formatHoras(datos.totalHoras)}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(datos.montoHoras)}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(datos.totalGastos)}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(datos.totalMensualidades)}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(datos.totalServiciosProfesionales || 0)}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(datos.subtotal)}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(datos.iva)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }} className={styles.textSuccess}>
                              {formatCurrency(datos.total)}
                            </td>
                          </tr>
                        )
                        
                        // Si es el último del grupo, agregar fila de subtotal
                        if (deuda.grupoId && !gruposYaMostrados.has(deuda.grupoId)) {
                          // Verificar si es el último elemento del grupo
                          const siguienteDeuda = deudasFiltradas[index + 1]
                          const esUltimoDelGrupo = !siguienteDeuda || siguienteDeuda.grupoId !== deuda.grupoId
                          
                          if (esUltimoDelGrupo) {
                            gruposYaMostrados.add(deuda.grupoId)
                            const grupoTotal = totalesPorGrupo[deuda.grupoId]
                            if (grupoTotal) {
                              filas.push(
                                <tr key={`grupo-total-${deuda.grupoId}`} className={styles.rowGrupoTotal}>
                                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>
                                    Total {grupoTotal.nombre} ({grupoTotal.cantidad} empresas):
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                    {formatHoras(grupoTotal.totalHoras)}
                                  </td>
                                  <td colSpan={6}></td>
                                  <td style={{ textAlign: 'right', fontWeight: 700 }} className={styles.textSuccess}>
                                    {formatCurrency(grupoTotal.total)}
                                  </td>
                                </tr>
                              )
                            }
                          }
                        }
                      })
                      
                      return filas
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ESTADO DE GASTOS */}
        {activeSection === 'gastos-estado' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Estado de Pago de Gastos</h2>
                <p className={styles.sectionDescription}>
                  Gestiona manualmente el estado de pago de los gastos registrados
                </p>
              </div>
              <button className={styles.button} onClick={loadGastosEstado} disabled={loadingGastosEstado}>
                {loadingGastosEstado ? 'Cargando...' : 'Refrescar'}
              </button>
            </div>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Estado:</label>
                <select
                  className={styles.input}
                  value={filtroEstadoGasto}
                  onChange={(e) => setFiltroEstadoGasto(e.target.value)}
                  style={{ minWidth: '180px' }}
                >
                  <option value="todos">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="pagado">Pagado</option>
                  <option value="pendiente_mes_actual">Pendiente (Mes Actual)</option>
                  <option value="pendiente_anterior">Pendiente (Mes Anterior)</option>
                </select>
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Mes:</label>
                <input
                  type="month"
                  className={styles.input}
                  value={filtroMesGasto}
                  onChange={(e) => setFiltroMesGasto(e.target.value)}
                  style={{ minWidth: '150px' }}
                />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Cédula Cliente:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={filtroClienteGasto}
                  onChange={(e) => setFiltroClienteGasto(e.target.value)}
                  placeholder="Cédula..."
                  style={{ minWidth: '150px' }}
                />
              </div>
              <button 
                className={styles.button} 
                onClick={loadGastosEstado}
                disabled={loadingGastosEstado}
              >
                Buscar
              </button>
              <button 
                className={styles.buttonSecondary} 
                onClick={() => {
                  setFiltroEstadoGasto('todos')
                  setFiltroMesGasto('')
                  setFiltroClienteGasto('')
                }}
              >
                Limpiar
              </button>
            </div>

            {/* Acciones en lote */}
            {gastosEstado.length > 0 && (
              <div className={styles.bulkActions}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={selectedGastos.length === gastosEstado.length && gastosEstado.length > 0}
                    onChange={toggleAllGastos}
                  />
                  Seleccionar todos ({selectedGastos.length}/{gastosEstado.length})
                </label>
                <div className={styles.bulkActionsRight}>
                  <span>Cambiar a:</span>
                  <select
                    className={styles.input}
                    value={nuevoEstadoGasto}
                    onChange={(e) => setNuevoEstadoGasto(e.target.value)}
                    style={{ minWidth: '180px' }}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="pagado">Pagado</option>
                    <option value="pendiente_mes_actual">Pendiente (Mes Actual)</option>
                    <option value="pendiente_anterior">Pendiente (Mes Anterior)</option>
                  </select>
                  <button 
                    className={styles.button}
                    onClick={updateGastosEstadoBulk}
                    disabled={selectedGastos.length === 0}
                  >
                    Aplicar ({selectedGastos.length})
                  </button>
                </div>
              </div>
            )}

            {/* Lista de gastos */}
            {loadingGastosEstado ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Cargando gastos...</p>
              </div>
            ) : gastosEstado.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No hay gastos que coincidan con los filtros</p>
                <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                  Ajusta los filtros o haz clic en &quot;Buscar&quot; para cargar gastos
                </p>
              </div>
            ) : (
              <div className={styles.table}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedGastos.length === gastosEstado.length && gastosEstado.length > 0}
                          onChange={toggleAllGastos}
                        />
                      </th>
                      <th>ID</th>
                      <th>Producto</th>
                      <th>Cliente</th>
                      <th style={{ textAlign: 'right' }}>Monto</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastosEstado.map((gasto) => (
                      <tr key={gasto.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedGastos.includes(gasto.id)}
                            onChange={() => toggleGastoSelection(gasto.id)}
                          />
                        </td>
                        <td>
                          <small className={styles.textMuted}>{gasto.id.substring(0, 8)}...</small>
                        </td>
                        <td>
                          <strong>{gasto.producto || 'Sin producto'}</strong>
                          {gasto.id_caso && (
                            <><br /><small className={styles.textMuted}>Caso: {gasto.id_caso}</small></>
                          )}
                        </td>
                        <td>
                          {gasto.cliente_nombre || (
                            <span className={styles.textMuted}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {formatCurrency(gasto.total_cobro || 0)}
                        </td>
                        <td>
                          {gasto.fecha ? new Date(gasto.fecha).toLocaleDateString('es-CR') : '—'}
                        </td>
                        <td>
                          <span className={`${styles.badge} ${
                            gasto.estado_pago === 'pagado' ? styles.badgeSuccess :
                            gasto.estado_pago === 'pendiente_anterior' ? styles.badgeDanger :
                            styles.badgeWarning
                          }`}>
                            {gasto.estado_pago === 'pagado' ? '✓ Pagado' :
                             gasto.estado_pago === 'pendiente_anterior' ? '⚠ Pend. Anterior' :
                             gasto.estado_pago === 'pendiente_mes_actual' ? '⏳ Pend. Mes Actual' :
                             '⏳ Pendiente'}
                          </span>
                        </td>
                        <td>
                          <select
                            className={styles.input}
                            value={gasto.estado_pago || 'pendiente'}
                            onChange={(e) => updateGastoEstado(gasto.id, e.target.value)}
                            style={{ minWidth: '140px', fontSize: '0.875rem', padding: '0.25rem 0.5rem' }}
                          >
                            <option value="pendiente">Pendiente</option>
                            <option value="pagado">Pagado</option>
                            <option value="pendiente_mes_actual">Pend. Mes Actual</option>
                            <option value="pendiente_anterior">Pend. Anterior</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Info */}
            <div className={styles.infoBox} style={{ marginTop: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>ℹ️ Estados de Pago</h4>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                <li><strong>Pendiente:</strong> Gasto registrado pero aún no pagado</li>
                <li><strong>Pagado:</strong> Gasto ya incluido en un comprobante de pago aprobado</li>
                <li><strong>Pendiente (Mes Actual):</strong> Gasto del mes en curso, pendiente de cobro</li>
                <li><strong>Pendiente (Mes Anterior):</strong> Gasto de meses anteriores que no ha sido cobrado</li>
              </ul>
            </div>
          </div>
        )}

        {/* ESTADO DE SERVICIOS PROFESIONALES */}
        {activeSection === 'servicios-estado' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Estado de Pago de Servicios Profesionales</h2>
                <p className={styles.sectionDescription}>
                  Gestiona manualmente el estado de pago de los servicios profesionales registrados
                </p>
              </div>
              <button className={styles.button} onClick={loadServiciosEstado} disabled={loadingServiciosEstado}>
                {loadingServiciosEstado ? 'Cargando...' : 'Refrescar'}
              </button>
            </div>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Estado:</label>
                <select
                  className={styles.input}
                  value={filtroEstadoServicio}
                  onChange={(e) => setFiltroEstadoServicio(e.target.value)}
                  style={{ minWidth: '180px' }}
                >
                  <option value="todos">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="pagado">Pagado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Mes:</label>
                <input
                  type="month"
                  className={styles.input}
                  value={filtroMesServicio}
                  onChange={(e) => setFiltroMesServicio(e.target.value)}
                  style={{ minWidth: '150px' }}
                />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Cédula Cliente:</label>
                <input
                  type="text"
                  className={styles.input}
                  value={filtroClienteServicio}
                  onChange={(e) => setFiltroClienteServicio(e.target.value)}
                  placeholder="Cédula..."
                  style={{ minWidth: '150px' }}
                />
              </div>
              <button 
                className={styles.button} 
                onClick={loadServiciosEstado}
                disabled={loadingServiciosEstado}
              >
                Buscar
              </button>
              <button 
                className={styles.buttonSecondary} 
                onClick={() => {
                  setFiltroEstadoServicio('todos')
                  setFiltroMesServicio('')
                  setFiltroClienteServicio('')
                }}
              >
                Limpiar
              </button>
            </div>

            {/* Acciones en lote */}
            {serviciosEstado.length > 0 && (
              <div className={styles.bulkActions}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={selectedServicios.length === serviciosEstado.length && serviciosEstado.length > 0}
                    onChange={toggleAllServicios}
                  />
                  Seleccionar todos ({selectedServicios.length}/{serviciosEstado.length})
                </label>
                <div className={styles.bulkActionsRight}>
                  <span>Cambiar a:</span>
                  <select
                    className={styles.input}
                    value={nuevoEstadoServicio}
                    onChange={(e) => setNuevoEstadoServicio(e.target.value)}
                    style={{ minWidth: '180px' }}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="pagado">Pagado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                  <button 
                    className={styles.button}
                    onClick={updateServiciosEstadoBulk}
                    disabled={selectedServicios.length === 0}
                  >
                    Aplicar ({selectedServicios.length})
                  </button>
                </div>
              </div>
            )}

            {/* Lista de servicios */}
            {loadingServiciosEstado ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Cargando servicios...</p>
              </div>
            ) : serviciosEstado.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No hay servicios que coincidan con los filtros</p>
                <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                  Ajusta los filtros o haz clic en &quot;Buscar&quot; para cargar servicios
                </p>
              </div>
            ) : (
              <div className={styles.table}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedServicios.length === serviciosEstado.length && serviciosEstado.length > 0}
                          onChange={toggleAllServicios}
                          aria-label="Seleccionar todos los servicios"
                        />
                      </th>
                      <th>Servicio</th>
                      <th>Cliente</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviciosEstado.map((servicio) => (
                      <tr key={servicio.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedServicios.includes(servicio.id)}
                            onChange={() => toggleServicioSelection(servicio.id)}
                            aria-label={`Seleccionar servicio ${servicio.servicio_titulo || servicio.lista_servicios?.titulo || servicio.id}`}
                          />
                        </td>
                        <td>
                          <strong>{servicio.servicio_titulo || servicio.lista_servicios?.titulo || 'Sin título'}</strong>
                          {servicio.funcionarios?.nombre && (
                            <><br /><small className={styles.textMuted}>{servicio.funcionarios.nombre}</small></>
                          )}
                        </td>
                        <td>
                          {servicio.cliente_nombre || (
                            <span className={styles.textMuted}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {formatCurrency(servicio.total || 0)}
                        </td>
                        <td>
                          {servicio.fecha ? new Date(servicio.fecha).toLocaleDateString('es-CR') : '—'}
                        </td>
                        <td>
                          <span className={`${styles.badge} ${
                            servicio.estado_pago === 'pagado' ? styles.badgeSuccess :
                            servicio.estado_pago === 'cancelado' ? styles.badgeDanger :
                            styles.badgeWarning
                          }`}>
                            {servicio.estado_pago === 'pagado' ? '✓ Pagado' :
                             servicio.estado_pago === 'cancelado' ? '✗ Cancelado' :
                             '⏳ Pendiente'}
                          </span>
                        </td>
                        <td>
                          <select
                            className={styles.input}
                            value={servicio.estado_pago || 'pendiente'}
                            onChange={(e) => updateServicioEstado(servicio.id, e.target.value)}
                            style={{ minWidth: '140px', fontSize: '0.875rem', padding: '0.25rem 0.5rem' }}
                          >
                            <option value="pendiente">Pendiente</option>
                            <option value="pagado">Pagado</option>
                            <option value="cancelado">Cancelado</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Info */}
            <div className={styles.infoBox} style={{ marginTop: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>ℹ️ Estados de Servicios Profesionales</h4>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                <li><strong>Pendiente:</strong> Servicio registrado pero aún no incluido en un pago</li>
                <li><strong>Pagado:</strong> Servicio incluido en un comprobante de pago aprobado</li>
                <li><strong>Cancelado:</strong> Servicio cancelado, no se cobrará al cliente</li>
              </ul>
              <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#666' }}>
                <strong>Nota:</strong> Los servicios marcados como &quot;Cancelado&quot; no aparecerán en los totales de pago del cliente.
              </p>
            </div>
          </div>
        )}

        {/* VISTA PAGO */}
        {activeSection === 'vista-pago' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Vista de Pago por Cliente</h2>
                <p className={styles.sectionDescription}>
                  Desglose de pagos pendientes para clientes con modo pago activo, agrupados por tipo de modalidad
                </p>
              </div>
              <button className={styles.button} onClick={loadVistaPago} disabled={loadingVistaPago}>
                {loadingVistaPago ? 'Cargando...' : 'Refrescar'}
              </button>
            </div>

            {/* Resumen por tipo de modalidad */}
            {granTotalPago && totalesPorModalidadPago && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', color: '#333' }}>📊 Resumen General</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  {(['Mensualidad', 'Etapa Finalizada', 'Único Pago', 'Cobro por hora', 'Solo gastos-servicios'] as TipoModalidadPago[]).map(tipo => {
                    const t = totalesPorModalidadPago[tipo]
                    if (t.count === 0) return null
                    return (
                      <div 
                        key={tipo} 
                        className={styles.card}
                        style={{ 
                          cursor: 'pointer',
                          border: filtroModalidadPago === tipo ? '2px solid #1976d2' : '1px solid #e0e0e0',
                          transition: 'border-color 0.2s'
                        }}
                        onClick={() => setFiltroModalidadPago(filtroModalidadPago === tipo ? 'todos' : tipo)}
                      >
                        <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>{tipo}</h4>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1976d2', margin: '0.25rem 0' }}>
                          {formatCurrency(t.total)}
                        </p>
                        <p style={{ fontSize: '0.85rem', color: '#888' }}>{t.count} cliente{t.count !== 1 ? 's' : ''}</p>
                      </div>
                    )
                  })}
                </div>
                
                {/* Total */}
                <div className={styles.deudasResumen}>
                  <h3 className={styles.deudasResumenTitle}>TOTAL ({granTotalPago.count} clientes con modo pago)</h3>
                  <div className={styles.deudasResumenGrid}>
                    <div>
                      <strong>Horas:</strong>
                      <p className={styles.deudasResumenValue}>{formatHoras(granTotalPago.totalHoras)}</p>
                    </div>
                    <div>
                      <strong>Monto Horas:</strong>
                      <p className={styles.deudasResumenValue}>{formatCurrency(granTotalPago.montoHoras)}</p>
                    </div>
                    <div>
                      <strong>Gastos:</strong>
                      <p className={styles.deudasResumenValue}>{formatCurrency(granTotalPago.totalGastos)}</p>
                      {(granTotalPago.gastosCliente > 0 || granTotalPago.gastosServiciosProfesionales > 0) && (
                        <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>
                          (Cliente: {formatCurrency(granTotalPago.gastosCliente)} / Serv.: {formatCurrency(granTotalPago.gastosServiciosProfesionales)})
                        </p>
                      )}
                    </div>
                    <div>
                      <strong>Servicios Prof.:</strong>
                      <p className={styles.deudasResumenValue}>{formatCurrency(granTotalPago.totalServiciosProfesionales)}</p>
                    </div>
                    <div>
                      <strong>Mensualidades:</strong>
                      <p className={styles.deudasResumenValue}>{formatCurrency(granTotalPago.totalMensualidades)}</p>
                    </div>
                    <div>
                      <strong>Subtotal:</strong>
                      <p className={styles.deudasResumenValue}>{formatCurrency(granTotalPago.subtotal)}</p>
                    </div>
                    <div>
                      <strong>IVA:</strong>
                      <p className={styles.deudasResumenValue}>{formatCurrency(granTotalPago.iva)}</p>
                      {(granTotalPago.ivaHorasMensualidades > 0 || granTotalPago.ivaServiciosProfesionales > 0) && (
                        <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>
                          (Hrs/Mens: {formatCurrency(granTotalPago.ivaHorasMensualidades)} / Serv.: {formatCurrency(granTotalPago.ivaServiciosProfesionales)})
                        </p>
                      )}
                    </div>
                    <div className={styles.deudasResumenTotal}>
                      <strong>TOTAL A COBRAR:</strong>
                      <p className={styles.deudasResumenTotalValue}>{formatCurrency(granTotalPago.total)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className={styles.formGroup} style={{ marginBottom: 0, minWidth: '180px' }}>
                <label className={styles.formLabel}>Tipo Modalidad:</label>
                <select
                  className={styles.input}
                  value={filtroModalidadPago}
                  onChange={(e) => setFiltroModalidadPago(e.target.value as TipoModalidadPago | 'todos')}
                >
                  <option value="todos">Todas las modalidades</option>
                  <option value="Mensualidad">Mensualidad</option>
                  <option value="Etapa Finalizada">Etapa Finalizada</option>
                  <option value="Único Pago">Único Pago</option>
                  <option value="Cobro por hora">Cobro por hora</option>
                  <option value="Solo gastos-servicios">Solo gastos-servicios</option>
                </select>
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0, minWidth: '150px' }}>
                <label className={styles.formLabel}>Tipo Cliente:</label>
                <select
                  className={styles.input}
                  value={filtroTipoPago}
                  onChange={(e) => setFiltroTipoPago(e.target.value as 'todos' | 'empresas' | 'usuarios')}
                >
                  <option value="todos">Todos</option>
                  <option value="empresas">Solo Empresas</option>
                  <option value="usuarios">Solo Usuarios</option>
                </select>
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0, minWidth: '150px' }}>
                <label className={styles.formLabel}>Ordenar por:</label>
                <select
                  className={styles.input}
                  value={ordenVistaPago}
                  onChange={(e) => setOrdenVistaPago(e.target.value as 'nombre' | 'total' | 'tipo')}
                >
                  <option value="nombre">Nombre</option>
                  <option value="total">Total (Mayor a menor)</option>
                  <option value="tipo">Tipo (Empresa primero)</option>
                </select>
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1, minWidth: '200px' }}>
                <label className={styles.formLabel}>Buscar:</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="Nombre, cédula o grupo..."
                  value={searchVistaPago}
                  onChange={(e) => setSearchVistaPago(e.target.value)}
                />
              </div>
            </div>

            {/* Lista de clientes */}
            {loadingVistaPago ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Cargando datos de pago...</p>
              </div>
            ) : getClientesVistaPagoFiltrados().length === 0 ? (
              <div className={styles.emptyState}>
                <p>No hay clientes con modo pago activo {filtroModalidadPago !== 'todos' ? `en modalidad "${filtroModalidadPago}"` : ''}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Agrupar por tipo de modalidad */}
                {(['Mensualidad', 'Etapa Finalizada', 'Único Pago', 'Cobro por hora', 'Solo gastos-servicios'] as TipoModalidadPago[]).map(tipoModalidad => {
                  const clientesDeEstaModalidad = getClientesVistaPagoFiltrados().filter(c => c.tipoModalidad === tipoModalidad)
                  if (clientesDeEstaModalidad.length === 0) return null
                  if (filtroModalidadPago !== 'todos' && filtroModalidadPago !== tipoModalidad) return null
                  
                  return (
                    <div key={tipoModalidad} style={{ marginBottom: '1.5rem' }}>
                      <h3 style={{ 
                        marginBottom: '1rem', 
                        padding: '0.75rem 1rem', 
                        background: tipoModalidad === 'Mensualidad' ? 'rgba(33, 150, 243, 0.12)' : 
                                   tipoModalidad === 'Etapa Finalizada' ? 'rgba(255, 152, 0, 0.12)' : 
                                   tipoModalidad === 'Único Pago' ? 'rgba(156, 39, 176, 0.12)' : 
                                   tipoModalidad === 'Cobro por hora' ? 'rgba(76, 175, 80, 0.12)' : 'rgba(158, 158, 158, 0.12)',
                        border: tipoModalidad === 'Mensualidad' ? '1px solid rgba(33, 150, 243, 0.3)' : 
                                tipoModalidad === 'Etapa Finalizada' ? '1px solid rgba(255, 152, 0, 0.3)' : 
                                tipoModalidad === 'Único Pago' ? '1px solid rgba(156, 39, 176, 0.3)' : 
                                tipoModalidad === 'Cobro por hora' ? '1px solid rgba(76, 175, 80, 0.3)' : '1px solid rgba(158, 158, 158, 0.3)',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>📌 {tipoModalidad}</span>
                        <span style={{ fontWeight: 600 }}>
                          {clientesDeEstaModalidad.length} cliente{clientesDeEstaModalidad.length !== 1 ? 's' : ''} | 
                          Total: {formatCurrency(clientesDeEstaModalidad.reduce((sum, c) => sum + c.total, 0))}
                        </span>
                      </h3>
                      
                      {clientesDeEstaModalidad.map(cliente => (
                        <div 
                          key={cliente.id} 
                          className={styles.card}
                          style={{ 
                            marginBottom: '0.75rem',
                            borderLeft: cliente.tipo === 'empresa' ? '4px solid #1976d2' : '4px solid #ff9800'
                          }}
                        >
                          {/* Header del cliente */}
                          <div 
                            style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'flex-start',
                              cursor: 'pointer'
                            }}
                            onClick={() => setClienteExpandido(clienteExpandido === cliente.id ? null : cliente.id)}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                                <strong style={{ fontSize: '1.1rem' }}>{cliente.nombre}</strong>
                                <span className={`${styles.badge} ${cliente.tipo === 'empresa' ? styles.badgeInfo : styles.badgeWarning}`}>
                                  {cliente.tipo === 'empresa' ? 'Empresa' : 'Usuario'}
                                </span>
                                {cliente.grupoNombre && (
                                  <span className={styles.badge} style={{ background: '#e0e0e0', color: '#333' }}>
                                    {cliente.esGrupoPrincipal ? '★ ' : ''}{cliente.grupoNombre}
                                  </span>
                                )}
                              </div>
                              <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
                                {cliente.cedula} | Mes: {getNombreMes(cliente.mes)}
                              </p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#388e3c', margin: 0 }}>
                                {formatCurrency(cliente.total)}
                              </p>
                              <p style={{ fontSize: '0.85rem', color: '#888', margin: 0 }}>
                                {clienteExpandido === cliente.id ? '▲ Contraer' : '▼ Expandir'}
                              </p>
                            </div>
                          </div>

                          {/* Detalles expandidos */}
                          {clienteExpandido === cliente.id && (
                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(0, 0, 0, 0.12)' }} className="dark:border-opacity-20 dark:border-white">
                              {/* Desglose de costos */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                                {/* Horas */}
                                <div style={{ padding: '0.75rem', background: 'rgba(0, 0, 0, 0.04)', borderRadius: '6px', border: '1px solid rgba(0, 0, 0, 0.08)' }}>
                                  <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: 0 }}>Horas</p>
                                  <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.25rem 0 0' }}>
                                    {formatHoras(cliente.totalHoras)}
                                  </p>
                                  <p style={{ fontSize: '0.85rem', opacity: 0.6, margin: 0 }}>
                                    {formatCurrency(cliente.montoHoras)}
                                  </p>
                                </div>
                                
                                {/* Gastos con desglose */}
                                <div style={{ padding: '0.75rem', background: 'rgba(255, 152, 0, 0.1)', borderRadius: '6px', border: '1px solid rgba(255, 152, 0, 0.3)' }}>
                                  <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: 0 }}>Gastos Total</p>
                                  <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.25rem 0 0' }}>
                                    {formatCurrency(cliente.totalGastos)}
                                  </p>
                                  {(cliente.gastosCliente > 0 || cliente.gastosServiciosProfesionales > 0) && (
                                    <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem', lineHeight: 1.3 }}>
                                      {cliente.gastosCliente > 0 && (
                                        <div>• Cliente: {formatCurrency(cliente.gastosCliente)}</div>
                                      )}
                                      {cliente.gastosServiciosProfesionales > 0 && (
                                        <div>• Serv.Prof: {formatCurrency(cliente.gastosServiciosProfesionales)}</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                
                                {/* Gastos Pendientes de Meses Anteriores */}
                                {cliente.gastosPendientesAnteriores > 0 && (
                                  <div style={{ padding: '0.75rem', background: 'rgba(244, 67, 54, 0.15)', borderRadius: '6px', border: '1px solid rgba(244, 67, 54, 0.4)' }}>
                                    <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: 0 }}>⚠️ Gastos Meses Ant.</p>
                                    <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.25rem 0 0', color: '#d32f2f' }}>
                                      {formatCurrency(cliente.gastosPendientesAnteriores)}
                                    </p>
                                    <p style={{ fontSize: '0.7rem', opacity: 0.6, margin: 0 }}>
                                      (pendientes de pago)
                                    </p>
                                  </div>
                                )}
                                
                                {/* Servicios Profesionales (solo costo) */}
                                <div style={{ padding: '0.75rem', background: 'rgba(156, 39, 176, 0.1)', borderRadius: '6px', border: '1px solid rgba(156, 39, 176, 0.3)' }}>
                                  <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: 0 }}>Servicios Prof.</p>
                                  <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.25rem 0 0' }}>
                                    {formatCurrency(cliente.totalServiciosProfesionales || 0)}
                                  </p>
                                  <p style={{ fontSize: '0.7rem', opacity: 0.5, margin: 0 }}>
                                    (solo costo)
                                  </p>
                                </div>
                                
                                {/* Mensualidades */}
                                <div style={{ padding: '0.75rem', background: 'rgba(0, 0, 0, 0.04)', borderRadius: '6px', border: '1px solid rgba(0, 0, 0, 0.08)' }}>
                                  <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: 0 }}>Mensualidades</p>
                                  <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.25rem 0 0' }}>
                                    {formatCurrency(cliente.totalMensualidades)}
                                  </p>
                                </div>
                                
                                {/* IVA con desglose */}
                                <div style={{ padding: '0.75rem', background: 'rgba(33, 150, 243, 0.1)', borderRadius: '6px', border: '1px solid rgba(33, 150, 243, 0.3)' }}>
                                  <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: 0 }}>IVA ({Math.round(cliente.ivaPerc * 100)}%)</p>
                                  <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.25rem 0 0' }}>
                                    {formatCurrency(cliente.iva)}
                                  </p>
                                  {(cliente.ivaHorasMensualidades > 0 || cliente.ivaServiciosProfesionales > 0) && (
                                    <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem', lineHeight: 1.3 }}>
                                      {cliente.ivaHorasMensualidades > 0 && (
                                        <div>• Horas/Mens: {formatCurrency(cliente.ivaHorasMensualidades)}</div>
                                      )}
                                      {cliente.ivaServiciosProfesionales > 0 && (
                                        <div>• Serv.Prof: {formatCurrency(cliente.ivaServiciosProfesionales)}</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                
                                {/* Subtotal */}
                                <div style={{ padding: '0.75rem', background: 'rgba(76, 175, 80, 0.15)', borderRadius: '6px', border: '1px solid rgba(76, 175, 80, 0.3)' }}>
                                  <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: 0 }}>Subtotal</p>
                                  <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.25rem 0 0' }}>
                                    {formatCurrency(cliente.subtotal)}
                                  </p>
                                </div>
                                
                                {/* Total */}
                                <div style={{ padding: '0.75rem', background: 'rgba(76, 175, 80, 0.25)', borderRadius: '6px', border: '1px solid rgba(76, 175, 80, 0.4)' }}>
                                  <p style={{ fontSize: '0.8rem', color: '#2e7d32', margin: 0, fontWeight: 600 }}>TOTAL</p>
                                  <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0 0', color: '#2e7d32' }}>
                                    {formatCurrency(cliente.total)}
                                  </p>
                                </div>
                              </div>
                              
                              {/* Proyectos con Mensualidad */}
                              {cliente.tipoModalidad === 'Mensualidad' && cliente.proyectos && cliente.proyectos.length > 0 && (
                                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(33, 150, 243, 0.08)', border: '1px solid rgba(33, 150, 243, 0.2)', borderRadius: '8px' }}>
                                  <h4 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#1976d2' }}>
                                    📊 Proyectos con Mensualidad ({cliente.proyectos.length})
                                  </h4>
                                  
                                  {cliente.proyectos.map((proyecto, idx) => (
                                    <div key={proyecto.id} style={{ 
                                      marginBottom: idx < cliente.proyectos!.length - 1 ? '1rem' : 0,
                                      padding: '1rem',
                                      background: 'rgba(255, 255, 255, 0.7)',
                                      border: '1px solid rgba(33, 150, 243, 0.3)',
                                      borderRadius: '6px'
                                    }}>
                                      <h5 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 600, color: '#1565c0' }}>
                                        {proyecto.titulo}
                                      </h5>
                                      
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                                        <div>
                                          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.75rem' }}>Costo Neto (sin IVA)</p>
                                          <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{formatCurrency(proyecto.costoNeto)}</p>
                                        </div>
                                        
                                        <div>
                                          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.75rem' }}>IVA</p>
                                          <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{formatCurrency(proyecto.montoIva)}</p>
                                        </div>
                                        
                                        <div>
                                          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.75rem' }}>Total Proyecto</p>
                                          <p style={{ margin: '0.25rem 0 0', fontWeight: 700, color: '#1976d2' }}>{formatCurrency(proyecto.totalProyecto)}</p>
                                        </div>
                                        
                                        <div>
                                          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.75rem' }}>Cuotas Totales</p>
                                          <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{proyecto.cantidadCuotas}</p>
                                        </div>
                                        
                                        <div>
                                          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.75rem' }}>Monto por Cuota</p>
                                          <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{formatCurrency(proyecto.montoPorCuota)}</p>
                                        </div>
                                        
                                        <div>
                                          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.75rem' }}>Monto Pagado</p>
                                          <p style={{ margin: '0.25rem 0 0', fontWeight: 600, color: '#2e7d32' }}>{formatCurrency(proyecto.montoPagado)}</p>
                                        </div>
                                        
                                        <div>
                                          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.75rem' }}>Saldo Pendiente</p>
                                          <p style={{ margin: '0.25rem 0 0', fontWeight: 700, color: '#d32f2f' }}>{formatCurrency(proyecto.saldoPendiente)}</p>
                                        </div>
                                        
                                        <div>
                                          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.75rem' }}>Pago Este Mes</p>
                                          <p style={{ margin: '0.25rem 0 0', fontWeight: 700, color: '#f57c00' }}>
                                            {formatCurrency(proyecto.montoPorCuota)}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                  
                                  {/* Resumen de pago del mes */}
                                  <div style={{ 
                                    marginTop: '1rem', 
                                    padding: '0.75rem',
                                    background: 'rgba(255, 152, 0, 0.15)',
                                    border: '1px solid rgba(255, 152, 0, 0.3)',
                                    borderRadius: '6px'
                                  }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div>
                                        <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.8 }}>Total Mensualidades del Mes</p>
                                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', opacity: 0.7 }}>
                                          (Cuotas + Gastos + Otros)
                                        </p>
                                      </div>
                                      <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f57c00' }}>
                                        {formatCurrency(cliente.total)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              {/* Info adicional */}
                              <div style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '1rem' }}>
                                <p style={{ margin: '0.25rem 0' }}>
                                  <strong>Tarifa por hora:</strong> {formatCurrency(cliente.tarifaHora)}
                                </p>
                                {cliente.fechaActivacionModoPago && (
                                  <p style={{ margin: '0.25rem 0' }}>
                                    <strong>Modo pago activado:</strong> {new Date(cliente.fechaActivacionModoPago).toLocaleDateString('es-CR')}
                                  </p>
                                )}
                              </div>

                              {/* Detalle de trabajos */}
                              {cliente.trabajosPorHora && cliente.trabajosPorHora.length > 0 && (
                                <details style={{ marginBottom: '0.75rem' }}>
                                  <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '0.5rem' }}>
                                    📋 Trabajos por hora ({cliente.trabajosPorHora.length})
                                  </summary>
                                  <div style={{ maxHeight: '200px', overflow: 'auto', background: 'rgba(0, 0, 0, 0.04)', border: '1px solid rgba(0, 0, 0, 0.08)', padding: '0.75rem', borderRadius: '6px' }}>
                                    <table style={{ width: '100%', fontSize: '0.85rem' }}>
                                      <thead>
                                        <tr>
                                          <th style={{ textAlign: 'left', padding: '0.25rem' }}>Fecha</th>
                                          <th style={{ textAlign: 'left', padding: '0.25rem' }}>Descripción</th>
                                          <th style={{ textAlign: 'right', padding: '0.25rem' }}>Duración</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {cliente.trabajosPorHora.map((t: any, idx: number) => (
                                          <tr key={idx}>
                                            <td style={{ padding: '0.25rem' }}>{t.fecha ? new Date(t.fecha).toLocaleDateString('es-CR') : '—'}</td>
                                            <td style={{ padding: '0.25rem' }}>{t.descripcion || t.titulo || '—'}</td>
                                            <td style={{ textAlign: 'right', padding: '0.25rem' }}>{t.duracion || '—'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </details>
                              )}

                              {/* Detalle de gastos */}
                              {cliente.gastos && cliente.gastos.length > 0 && (
                                <details style={{ marginBottom: '0.75rem' }}>
                                  <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '0.5rem' }}>
                                    💳 Gastos ({cliente.gastos.length})
                                  </summary>
                                  <div style={{ maxHeight: '200px', overflow: 'auto', background: 'rgba(0, 0, 0, 0.04)', border: '1px solid rgba(0, 0, 0, 0.08)', padding: '0.75rem', borderRadius: '6px' }}>
                                    <table style={{ width: '100%', fontSize: '0.85rem' }}>
                                      <thead>
                                        <tr>
                                          <th style={{ textAlign: 'left', padding: '0.25rem' }}>Fecha</th>
                                          <th style={{ textAlign: 'left', padding: '0.25rem' }}>Producto</th>
                                          <th style={{ textAlign: 'right', padding: '0.25rem' }}>Monto</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {cliente.gastos.map((g: any, idx: number) => (
                                          <tr key={idx}>
                                            <td style={{ padding: '0.25rem' }}>{g.fecha ? new Date(g.fecha).toLocaleDateString('es-CR') : '—'}</td>
                                            <td style={{ padding: '0.25rem' }}>{g.producto || '—'}</td>
                                            <td style={{ textAlign: 'right', padding: '0.25rem' }}>{formatCurrency(g.total_cobro || 0)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </details>
                              )}

                              {/* Detalle de gastos de meses anteriores */}
                              {cliente.gastosAnteriores && cliente.gastosAnteriores.length > 0 && (
                                <details style={{ marginBottom: '0.75rem' }}>
                                  <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '0.5rem', color: '#d32f2f' }}>
                                    ⚠️ Gastos de Meses Anteriores ({cliente.gastosAnteriores.length}) - {formatCurrency(cliente.gastosPendientesAnteriores || 0)}
                                  </summary>
                                  <div style={{ maxHeight: '200px', overflow: 'auto', background: 'rgba(244, 67, 54, 0.08)', border: '1px solid rgba(244, 67, 54, 0.3)', padding: '0.75rem', borderRadius: '6px' }}>
                                    <table style={{ width: '100%', fontSize: '0.85rem' }}>
                                      <thead>
                                        <tr>
                                          <th style={{ textAlign: 'left', padding: '0.25rem' }}>Fecha</th>
                                          <th style={{ textAlign: 'left', padding: '0.25rem' }}>Producto</th>
                                          <th style={{ textAlign: 'right', padding: '0.25rem' }}>Monto</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {cliente.gastosAnteriores.map((g: any, idx: number) => (
                                          <tr key={idx}>
                                            <td style={{ padding: '0.25rem' }}>{g.fecha ? new Date(g.fecha).toLocaleDateString('es-CR') : '—'}</td>
                                            <td style={{ padding: '0.25rem' }}>{g.producto || '—'}</td>
                                            <td style={{ textAlign: 'right', padding: '0.25rem' }}>{formatCurrency(g.total_cobro || 0)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </details>
                              )}

                              {/* Detalle de servicios profesionales */}
                              {cliente.serviciosProfesionales && cliente.serviciosProfesionales.length > 0 && (
                                <details style={{ marginBottom: '0.75rem' }}>
                                  <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '0.5rem' }}>
                                    🔧 Servicios Profesionales ({cliente.serviciosProfesionales.length}) - {formatCurrency(cliente.totalServiciosProfesionales || 0)}
                                  </summary>
                                  <div style={{ maxHeight: '200px', overflow: 'auto', background: 'rgba(0, 0, 0, 0.04)', border: '1px solid rgba(0, 0, 0, 0.08)', padding: '0.75rem', borderRadius: '6px' }}>
                                    <table style={{ width: '100%', fontSize: '0.85rem' }}>
                                      <thead>
                                        <tr>
                                          <th style={{ textAlign: 'left', padding: '0.25rem' }}>Fecha</th>
                                          <th style={{ textAlign: 'left', padding: '0.25rem' }}>Servicio</th>
                                          <th style={{ textAlign: 'left', padding: '0.25rem' }}>Responsable</th>
                                          <th style={{ textAlign: 'right', padding: '0.25rem' }}>Total</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {cliente.serviciosProfesionales.map((sp: any, idx: number) => (
                                          <tr key={idx}>
                                            <td style={{ padding: '0.25rem' }}>{sp.fecha ? new Date(sp.fecha).toLocaleDateString('es-CR') : '—'}</td>
                                            <td style={{ padding: '0.25rem' }}>{sp.lista_servicios?.titulo || '—'}</td>
                                            <td style={{ padding: '0.25rem' }}>{sp.funcionarios?.nombre || '—'}</td>
                                            <td style={{ textAlign: 'right', padding: '0.25rem' }}>{formatCurrency(sp.total || 0)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </details>
                              )}

                              {/* Detalle de solicitudes/mensualidades */}
                              {cliente.solicitudes && cliente.solicitudes.length > 0 && (
                                <details style={{ marginBottom: '0.75rem' }}>
                                  <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '0.5rem' }}>
                                    📝 Solicitudes ({cliente.solicitudes.length})
                                  </summary>
                                  <div style={{ maxHeight: '200px', overflow: 'auto', background: 'rgba(0, 0, 0, 0.04)', border: '1px solid rgba(0, 0, 0, 0.08)', padding: '0.75rem', borderRadius: '6px' }}>
                                    <table style={{ width: '100%', fontSize: '0.85rem' }}>
                                      <thead>
                                        <tr>
                                          <th style={{ textAlign: 'left', padding: '0.25rem' }}>Título</th>
                                          <th style={{ textAlign: 'left', padding: '0.25rem' }}>Modalidad</th>
                                          <th style={{ textAlign: 'right', padding: '0.25rem' }}>Monto Cuota</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {cliente.solicitudes.map((s: any, idx: number) => (
                                          <tr key={idx}>
                                            <td style={{ padding: '0.25rem' }}>{s.titulo || '—'}</td>
                                            <td style={{ padding: '0.25rem' }}>{s.modalidad_pago || '—'}</td>
                                            <td style={{ textAlign: 'right', padding: '0.25rem' }}>{formatCurrency(s.monto_por_cuota || 0)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </details>
                              )}

                              {/* Notas internas */}
                              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(255, 235, 59, 0.15)', border: '1px solid rgba(255, 235, 59, 0.3)', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <strong style={{ fontSize: '0.9rem' }}>📝 Notas internas</strong>
                                  {editandoNota !== cliente.id && (
                                    <button 
                                      className={styles.buttonSecondary}
                                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                      onClick={(e) => { 
                                        e.stopPropagation()
                                        setEditandoNota(cliente.id)
                                        setNotaTemp(cliente.notaInterna || '')
                                      }}
                                    >
                                      {cliente.notaInterna ? 'Editar' : 'Agregar nota'}
                                    </button>
                                  )}
                                </div>
                                
                                {editandoNota === cliente.id ? (
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <textarea
                                      className={styles.input}
                                      value={notaTemp}
                                      onChange={(e) => setNotaTemp(e.target.value)}
                                      placeholder="Escribe una nota interna sobre este cliente..."
                                      rows={3}
                                      style={{ width: '100%', marginBottom: '0.5rem' }}
                                    />
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                      <button 
                                        className={styles.button}
                                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
                                        onClick={() => guardarNotaInterna(cliente.id, cliente.tipo)}
                                      >
                                        Guardar
                                      </button>
                                      <button 
                                        className={styles.buttonSecondary}
                                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
                                        onClick={() => { setEditandoNota(null); setNotaTemp('') }}
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <p style={{ margin: 0, fontSize: '0.9rem', opacity: cliente.notaInterna ? 0.9 : 0.5, fontStyle: cliente.notaInterna ? 'normal' : 'italic' }}>
                                    {cliente.notaInterna || 'Sin notas'}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Totales por grupo dentro de esta modalidad */}
                      {totalesPorGrupoPago && Object.entries(totalesPorGrupoPago)
                        .filter(([_, g]) => clientesDeEstaModalidad.some(c => c.grupoId && clientesVistaPago.find(cv => cv.id === c.id)?.grupoNombre === g.grupoNombre))
                        .map(([grupoId, grupo]) => (
                          <div 
                            key={grupoId}
                            style={{ 
                              marginTop: '0.5rem',
                              padding: '0.75rem 1rem',
                              background: 'rgba(33, 150, 243, 0.15)',
                              border: '1px solid rgba(33, 150, 243, 0.3)',
                              borderRadius: '6px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>
                              🏢 Total Grupo: {grupo.grupoNombre} ({grupo.empresas.length} empresas)
                            </span>
                            <span style={{ fontWeight: 700, color: '#2196f3', fontSize: '1.1rem' }}>
                              {formatCurrency(grupo.total)}
                            </span>
                          </div>
                        ))
                      }
                    </div>
                  )
                })}
              </div>
            )}

            {/* Info */}
            <div className={styles.infoBox} style={{ marginTop: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>ℹ️ Información</h4>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                <li><strong>Mensualidad:</strong> Clientes con solicitudes de pago mensual fijo</li>
                <li><strong>Etapa Finalizada:</strong> Clientes que pagan al completar etapas del proceso</li>
                <li><strong>Único Pago:</strong> Clientes con pago único al finalizar</li>
                <li><strong>Cobro por hora:</strong> Clientes que pagan según horas trabajadas</li>
                <li><strong>Solo gastos-servicios:</strong> Clientes sin solicitudes activas, solo gastos o servicios</li>
                <li>Si el <strong>modo pago</strong> se activó en el mes actual, se muestran datos del mes anterior</li>
              </ul>
            </div>
          </div>
        )}

        {/* CONFIGURACIÓN */}
        {activeSection === 'config' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Configuración del Sistema</h2>
                <p className={styles.sectionDescription}>Validación de variables de entorno y gestión de sesión</p>
              </div>
            </div>

            {/* Validación de Configuración */}
            <div className={styles.card} style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>🔍 Validación de Configuración</h3>
              <p style={{ color: '#666', marginBottom: '1rem' }}>Verifica que todas las variables de entorno estén configuradas correctamente</p>
              <button className={styles.button} onClick={validateConfig} disabled={loading}>
                Validar Configuración
              </button>
            </div>

            {/* Gestión de Sesión */}
            <div className={styles.card} style={{ marginBottom: '2rem', borderLeft: '4px solid #d32f2f' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>🚪 Gestión de Sesión</h3>
              <p style={{ color: '#666', marginBottom: '1rem' }}>Cerrar sesión del panel de administración</p>
              <button 
                className={styles.deleteButton} 
                onClick={handleLogout}
                style={{ 
                  background: '#d32f2f',
                  color: 'white',
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '1rem',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#b71c1c'}
                onMouseOut={(e) => e.currentTarget.style.background = '#d32f2f'}
              >
                🔒 Cerrar Sesión
              </button>
            </div>
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
