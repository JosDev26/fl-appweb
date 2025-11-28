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

type SectionType = 'comprobantes' | 'facturas' | 'plazos' | 'visto-bueno' | 'invitaciones' | 'fecha' | 'sync' | 'config'

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
  
  // Estados para simulador de fecha
  const [simulatedDate, setSimulatedDate] = useState<string>('')
  const [isDateSimulated, setIsDateSimulated] = useState(false)
  const [currentRealDate, setCurrentRealDate] = useState<string>('')
  
  // Estados para plazos de facturas
  const [invoiceDeadlines, setInvoiceDeadlines] = useState<any[]>([])

  // Montaje del componente
  useEffect(() => {
    setIsMounted(true)
    const now = new Date()
    setCurrentRealDate(now.toISOString().split('T')[0])
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
      // Usar el endpoint original que carga todas las facturas del mes actual
      const simulatedDateStr = typeof window !== 'undefined' ? localStorage.getItem('simulatedDate') : null
      const url = simulatedDateStr 
        ? `/api/upload-invoice?getAllMonth=true&simulatedDate=${simulatedDateStr}`
        : '/api/upload-invoice?getAllMonth=true'
      
      const response = await fetch(url)
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
      { url: '/api/sync-materias', label: 'Materias' }
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

  // SIMULADOR DE FECHA
  const setSimulatedDateHandler = async () => {
    if (!simulatedDate) {
      alert('Selecciona una fecha')
      return
    }
    // TODO: Implementar API /api/admin/simulate-date
    // Por ahora solo simula localmente
    setIsDateSimulated(true)
    alert(`⚠️ Simulación de fecha solo local\nFecha simulada: ${simulatedDate}\n\nNOTA: Necesitas implementar /api/admin/simulate-date para que funcione en el servidor`)
  }

  const resetSimulatedDate = async () => {
    // TODO: Implementar API /api/admin/simulate-date DELETE
    // Por ahora solo resetea localmente
    setIsDateSimulated(false)
    setSimulatedDate('')
    alert('Fecha real restaurada (solo local)')
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

        {/* SIMULADOR DE FECHA */}
        {activeSection === 'fecha' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Simulador de Fecha del Sistema</h2>
            </div>
            <div className={styles.infoBox}>
              <h3>Fecha Real del Sistema</h3>
              <p><strong>{currentRealDate}</strong></p>
            </div>
            {isDateSimulated && (
              <div className={styles.infoBox} style={{ borderLeft: '4px solid #f57c00' }}>
                <h3>⚠️ Fecha Simulada Activa</h3>
                <p><strong>{simulatedDate}</strong></p>
              </div>
            )}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Simular Fecha</label>
              <input 
                type="date"
                className={styles.input}
                value={simulatedDate}
                onChange={(e) => setSimulatedDate(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className={styles.button} onClick={setSimulatedDateHandler}>
                Activar Simulación
              </button>
              <button className={`${styles.button} ${styles.buttonDanger}`} onClick={resetSimulatedDate}>
                Restaurar Fecha Real
              </button>
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
                  >
                    <span className={styles.syncResultIcon}>{result.success ? '✅' : '❌'}</span>
                    <span>{result.message}</span>
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
