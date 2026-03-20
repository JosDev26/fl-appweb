'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import styles from './comprobantes.module.css'

interface Comprobante {
  id: string
  file_name: string
  file_path: string
  file_size: number
  mes_pago: string
  monto_declarado: number | null
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  nota_revision: string | null
  uploaded_at: string
}

interface Factura {
  id: string
  mes_factura: string
  file_path: string
  fecha_emision: string
  estado_pago: 'pendiente' | 'pagado'
}

export default function ComprobantesPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([])
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'aprobado' | 'rechazado'>('todos')
  const [filtroMes, setFiltroMes] = useState<string>('todos')
  const [mesesDisponibles, setMesesDisponibles] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'comprobantes' | 'facturas'>('comprobantes')

  useEffect(() => {
    if (!authLoading && user) {
      loadComprobantes()
      loadFacturas()
    }
  }, [authLoading, user])

  const loadFacturas = async () => {
    if (!user) return

    try {
      const response = await fetch(
        `/api/invoice-payment-status?clientId=${user.id}&clientType=${user.tipo || 'cliente'}`
      )
      const data = await response.json()

      if (response.ok && data.deadlines) {
        setFacturas(data.deadlines)
      }
    } catch (err) {
      console.error('Error cargando facturas:', err)
    }
  }

  const loadComprobantes = async () => {
    if (!user) {
      router.push('/login')
      return
    }

    try {
      setLoading(true)
      
      const response = await fetch('/api/payment-receipts/history', {
        headers: {
          'x-user-id': String(user.id),
          'x-user-type': user.tipo || 'cliente'
        }
      })
      const data = await response.json()

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login')
          return
        }
        throw new Error(data.error || 'Error al cargar comprobantes')
      }

      setComprobantes(data.comprobantes || [])
      
      // Extraer meses únicos
      const meses = [...new Set(data.comprobantes.map((c: Comprobante) => c.mes_pago))]
        .filter((m): m is string => typeof m === 'string')
        .sort()
        .reverse()
      setMesesDisponibles(meses)
    } catch (err) {
      console.error('Error:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar comprobantes')
    } finally {
      setLoading(false)
    }
  }

  const downloadComprobante = async (filePath: string, fileName: string) => {
    if (!user) {
      router.push('/login')
      return
    }

    try {
      const response = await fetch(`/api/payment-receipts/download?path=${encodeURIComponent(filePath)}`, {
        headers: {
          'x-user-id': String(user.id)
        }
      })
      
      if (!response.ok) {
        throw new Error('Error al descargar archivo')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error:', error)
      alert('Error al descargar el comprobante')
    }
  }

  const downloadFactura = async (filePath: string) => {
    if (!user) {
      router.push('/login')
      return
    }

    try {
      const response = await fetch(`/api/upload-invoice/download?path=${encodeURIComponent(filePath)}`, {
        headers: {
          'x-user-id': String(user.id)
        }
      })
      
      if (!response.ok) {
        throw new Error('Error al descargar factura')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const fileName = filePath.split('/').pop() || 'factura.xml'
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error:', error)
      alert('Error al descargar la factura')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
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

  const formatMesDisplay = (mes: string) => {
    const [year, month] = mes.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long' })
  }

  // Filtrar comprobantes
  const comprobantesFiltrados = comprobantes.filter(c => {
    const matchEstado = filtroEstado === 'todos' || c.estado === filtroEstado
    const matchMes = filtroMes === 'todos' || c.mes_pago === filtroMes
    return matchEstado && matchMes
  })

  // Agrupar por estado
  const pendientes = comprobantesFiltrados.filter(c => c.estado === 'pendiente')
  const aprobados = comprobantesFiltrados.filter(c => c.estado === 'aprobado')
  const rechazados = comprobantesFiltrados.filter(c => c.estado === 'rechazado')

  if (authLoading || loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Cargando comprobantes...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={loadComprobantes} className={styles.retryButton}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <button onClick={() => router.back()} className={styles.backButton}>
            ← Volver
          </button>
          <h1 className={styles.title}>Mis Documentos</h1>
          <p className={styles.subtitle}>Comprobantes de pago y facturas recibidas</p>
        </div>
      </div>

      <div className={styles.content}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid #e5e7eb', paddingBottom: '0' }}>
          <button
            onClick={() => setActiveTab('comprobantes')}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: activeTab === 'comprobantes' ? '#2563eb' : 'transparent',
              color: activeTab === 'comprobantes' ? 'white' : '#6b7280',
              borderRadius: '8px 8px 0 0',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            📄 Comprobantes de Pago
          </button>
          <button
            onClick={() => setActiveTab('facturas')}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: activeTab === 'facturas' ? '#2563eb' : 'transparent',
              color: activeTab === 'facturas' ? 'white' : '#6b7280',
              borderRadius: '8px 8px 0 0',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            🧾 Facturas Electrónicas ({facturas.length})
          </button>
        </div>

        {activeTab === 'comprobantes' && (
          <>
            {/* Filtros */}
            <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Estado:</label>
            <select 
              value={filtroEstado} 
              onChange={(e) => setFiltroEstado(e.target.value as any)}
              className={styles.filterSelect}
            >
              <option value="todos">Todos</option>
              <option value="pendiente">Pendientes</option>
              <option value="aprobado">Aprobados</option>
              <option value="rechazado">Rechazados</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Mes:</label>
            <select 
              value={filtroMes} 
              onChange={(e) => setFiltroMes(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="todos">Todos los meses</option>
              {mesesDisponibles.map(mes => (
                <option key={mes} value={mes}>{formatMesDisplay(mes)}</option>
              ))}
            </select>
          </div>

          <button onClick={loadComprobantes} className={styles.refreshButton}>
            🔄 Actualizar
          </button>
        </div>

        {/* Resumen */}
        <div className={styles.summary}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon} style={{ backgroundColor: '#fef3c7' }}>⏳</div>
            <div className={styles.summaryContent}>
              <div className={styles.summaryNumber}>{pendientes.length}</div>
              <div className={styles.summaryLabel}>Pendientes</div>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon} style={{ backgroundColor: '#d1fae5' }}>✓</div>
            <div className={styles.summaryContent}>
              <div className={styles.summaryNumber}>{aprobados.length}</div>
              <div className={styles.summaryLabel}>Aprobados</div>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon} style={{ backgroundColor: '#fee2e2' }}>✗</div>
            <div className={styles.summaryContent}>
              <div className={styles.summaryNumber}>{rechazados.length}</div>
              <div className={styles.summaryLabel}>Rechazados</div>
            </div>
          </div>
        </div>

        {comprobantesFiltrados.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📄</div>
            <h3>No hay comprobantes</h3>
            <p>No se encontraron comprobantes con los filtros seleccionados</p>
          </div>
        ) : (
          <div className={styles.comprobantesGrid}>
            {comprobantesFiltrados.map((comprobante) => (
              <div key={comprobante.id} className={styles.comprobanteCard}>
                <div className={styles.cardHeader}>
                  <span className={`${styles.estadoBadge} ${styles[`estado${comprobante.estado.charAt(0).toUpperCase() + comprobante.estado.slice(1)}`]}`}>
                    {comprobante.estado === 'pendiente' ? '⏳ Pendiente' :
                     comprobante.estado === 'aprobado' ? '✓ Aprobado' :
                     '✗ Rechazado'}
                  </span>
                  <span className={styles.mesBadge}>{formatMesDisplay(comprobante.mes_pago)}</span>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.cardField}>
                    <span className={styles.fieldLabel}>Archivo:</span>
                    <span className={styles.fieldValue}>{comprobante.file_name}</span>
                  </div>
                  <div className={styles.cardField}>
                    <span className={styles.fieldLabel}>Tamaño:</span>
                    <span className={styles.fieldValue}>{formatFileSize(comprobante.file_size)}</span>
                  </div>
                  <div className={styles.cardField}>
                    <span className={styles.fieldLabel}>Monto:</span>
                    <span className={styles.fieldValue}>{formatMonto(comprobante.monto_declarado)}</span>
                  </div>
                  <div className={styles.cardField}>
                    <span className={styles.fieldLabel}>Subido:</span>
                    <span className={styles.fieldValue}>{formatDate(comprobante.uploaded_at)}</span>
                  </div>

                  {comprobante.nota_revision && (
                    <div className={styles.nota}>
                      <strong>Nota de revisión:</strong>
                      <p>{comprobante.nota_revision}</p>
                    </div>
                  )}
                </div>

                <div className={styles.cardFooter}>
                  <button
                    onClick={() => downloadComprobante(comprobante.file_path, comprobante.file_name)}
                    className={styles.downloadButton}
                  >
                    ⬇️ Descargar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
          </>
        )}

        {activeTab === 'facturas' && (
          <>
            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: '#6b7280', fontSize: '14px' }}>
                Facturas electrónicas emitidas a tu nombre. Estas son las facturas XML que corresponden a los servicios del bufete.
              </p>
            </div>

            {facturas.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>🧾</div>
                <h3>No hay facturas</h3>
                <p>No se han emitido facturas electrónicas a tu nombre todavía</p>
              </div>
            ) : (
              <div className={styles.comprobantesGrid}>
                {facturas.map((factura) => (
                  <div key={factura.id} className={styles.comprobanteCard}>
                    <div className={styles.cardHeader}>
                      <span className={`${styles.estadoBadge} ${factura.estado_pago === 'pagado' ? styles.estadoAprobado : styles.estadoPendiente}`}>
                        {factura.estado_pago === 'pagado' ? '✓ Pagado' : '⏳ Pendiente'}
                      </span>
                      <span className={styles.mesBadge}>{formatMesDisplay(factura.mes_factura)}</span>
                    </div>

                    <div className={styles.cardBody}>
                      <div className={styles.cardField}>
                        <span className={styles.fieldLabel}>Mes de servicios:</span>
                        <span className={styles.fieldValue}>{formatMesDisplay(factura.mes_factura)}</span>
                      </div>
                      <div className={styles.cardField}>
                        <span className={styles.fieldLabel}>Fecha emisión:</span>
                        <span className={styles.fieldValue}>{formatDate(factura.fecha_emision)}</span>
                      </div>
                      <div className={styles.cardField}>
                        <span className={styles.fieldLabel}>Archivo:</span>
                        <span className={styles.fieldValue}>{factura.file_path?.split('/').pop() || 'factura.xml'}</span>
                      </div>
                    </div>

                    <div className={styles.cardFooter}>
                      <button
                        onClick={() => downloadFactura(factura.file_path)}
                        className={styles.downloadButton}
                      >
                        ⬇️ Descargar XML
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
