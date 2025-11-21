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

export default function DevPage() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SyncResult[]>([])
  const [activeView, setActiveView] = useState<'principal' | 'avanzado'>('principal')
  const [activeTab, setActiveTab] = useState<'sync' | 'config' | 'test'>('sync')
  
  // Estados para vista principal
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([])
  const [clientesModoPago, setClientesModoPago] = useState<ClienteModoPago[]>([])
  const [loadingReceipts, setLoadingReceipts] = useState(false)
  const [reviewingReceipt, setReviewingReceipt] = useState<string | null>(null)
  const [rejectNota, setRejectNota] = useState<string>('')

  // Cargar datos de pagos
  useEffect(() => {
    if (activeView === 'principal') {
      loadPaymentData()
    }
  }, [activeView])

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
                            <th>Correo</th>
                            <th>ID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientesModoPago.map((cliente) => (
                            <tr key={`${cliente.tipo}-${cliente.id}`}>
                              <td>{cliente.tipo === 'empresa' ? 'Empresa' : 'Cliente'}</td>
                              <td>{cliente.nombre}</td>
                              <td>{cliente.cedula}</td>
                              <td>{cliente.correo || 'N/A'}</td>
                              <td className={styles.idCell}>{cliente.id}</td>
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

        {/* VISTA AVANZADO - Sincronización (contenido original) */}
        {activeView === 'avanzado' && (
          <>
            <div className={styles.tabs}>
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
