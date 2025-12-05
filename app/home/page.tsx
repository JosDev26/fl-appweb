'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import styles from './home.module.css'

interface User {
  id: string
  nombre: string
  cedula: string
  tipo?: 'cliente' | 'empresa'
  modoPago?: boolean
}

interface Caso {
  id: string
  nombre: string
  estado: string
  expediente: string | null
}

interface Solicitud {
  id: string
  titulo: string | null
  descripcion: string | null
  materia: string | null
  etapa_actual: string | null
  modalidad_pago: string | null
  costo_neto: number | null
  cantidad_cuotas: number | null
  monto_por_cuota: number | null
  total_a_pagar: number | null
  estado_pago: string | null
  monto_pagado: number | null
  saldo_pendiente: number | null
  expediente: string | null
}

// Tipo unificado para mostrar en la UI
interface CasoUnificado {
  id: string
  tipo: 'caso' | 'solicitud'
  titulo: string
  estado: string
  expediente: string | null
  subtitulo?: string
}

interface PaymentReceipt {
  id: string
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  nota_revision: string | null
  monto_declarado: number | null
  mes_pago: string | null
  uploaded_at: string
  reviewed_at: string | null
}

function HomeContent() {
  const { user, loading, logout } = useAuth()
  const [casos, setCasos] = useState<Caso[]>([])
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [casosUnificados, setCasosUnificados] = useState<CasoUnificado[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [lastPaymentReceipt, setLastPaymentReceipt] = useState<PaymentReceipt | null>(null)
  const [showPaymentBanner, setShowPaymentBanner] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!loading && user) {
      loadData(user)
      loadPaymentStatus(user)
    }
  }, [loading, user, searchParams])

  const loadPaymentStatus = async (userData: User) => {
    try {
      const response = await fetch('/api/payment-status', {
        headers: {
          'x-user-id': String(userData.id)
        }
      })

      const data = await response.json()
      
      if (data.success) {
        setLastPaymentReceipt(data.lastReceipt)
      }
    } catch (error) {
      console.error('Error loading payment status:', error)
    }
  }

  const loadData = async (userData: User) => {
    setLoadingData(true)
    try {
      // Obtener el id_cliente correcto (ahora solo id)
      const idCliente = String(userData.id)
      
      // Cargar casos y solicitudes en paralelo
      const [casosResponse, solicitudesResponse] = await Promise.all([
        fetch(`/api/casos?id_cliente=${idCliente}`),
        fetch(`/api/solicitudes?id_cliente=${idCliente}`)
      ])
      
      const casosData = await casosResponse.json()
      const solicitudesData = await solicitudesResponse.json()
      
      const casosArray = casosData.casos || []
      const solicitudesArray = solicitudesData.solicitudes || []
      
      setCasos(casosArray)
      setSolicitudes(solicitudesArray)
      
      // Unificar casos y solicitudes
      const unificados: CasoUnificado[] = [
        ...casosArray.map((caso: Caso) => ({
          id: caso.id,
          tipo: 'caso' as const,
          titulo: caso.nombre,
          estado: caso.estado || 'Sin estado',
          expediente: caso.expediente,
          subtitulo: caso.expediente ? `Expediente: ${caso.expediente}` : undefined
        })),
        ...solicitudesArray.map((solicitud: Solicitud) => ({
          id: solicitud.id,
          tipo: 'solicitud' as const,
          titulo: solicitud.titulo || 'Sin título',
          estado: solicitud.estado_pago || 'Sin estado',
          expediente: solicitud.expediente,
          subtitulo: solicitud.etapa_actual ? `Etapa: ${solicitud.etapa_actual}` : 
                     (solicitud.total_a_pagar ? `Total: ₡${solicitud.total_a_pagar.toLocaleString('es-CR')}` : undefined)
        }))
      ]
      
      setCasosUnificados(unificados)
    } catch (error) {
      console.error('Error al cargar datos:', error)
    } finally {
      setLoadingData(false)
    }
  }

  const handleCasoClick = (caso: CasoUnificado) => {
    if (caso.tipo === 'caso') {
      router.push(`/caso/${caso.id}`)
    } else {
      router.push(`/solicitud/${caso.id}`)
    }
  }

  const getEstadoColor = (estado: string) => {
    switch (estado?.toLowerCase()) {
      case 'en proceso':
        return '#FAD02C'
      case 'finalizado':
      case 'pagado':
        return '#4ade80'
      case 'abandonado':
        return '#f87171'
      default:
        return '#94a3b8'
    }
  }

  const formatMesPago = (mes: string | null) => {
    if (!mes) return ''
    const [year, month] = mes.split('-')
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    const nombreMes = meses[parseInt(month) - 1] || month
    return `${nombreMes} ${year}`
  }

  if (loading) {
    return null
  }

  if (!user) {
    return null
  }

  return (
    <div className={styles.container}>
      {/* Banner de estado de comprobante */}
      {lastPaymentReceipt && showPaymentBanner && (
        <div className={`${styles.paymentBanner} ${
          lastPaymentReceipt.estado === 'pendiente' ? styles.paymentBannerPending :
          lastPaymentReceipt.estado === 'aprobado' ? styles.paymentBannerApproved :
          styles.paymentBannerRejected
        }`}>
          <div className={styles.paymentBannerContent}>
            <span className={styles.paymentBannerIcon}>
              {lastPaymentReceipt.estado === 'pendiente' ? '⏳' :
               lastPaymentReceipt.estado === 'aprobado' ? '✓' : '✕'}
            </span>
            <div className={styles.paymentBannerInfo}>
              <strong>
                {lastPaymentReceipt.estado === 'pendiente' 
                  ? `Comprobante en Revisión${lastPaymentReceipt.mes_pago ? ` - ${formatMesPago(lastPaymentReceipt.mes_pago)}` : ''}`
                  : lastPaymentReceipt.estado === 'aprobado' 
                  ? `Pago Aprobado${lastPaymentReceipt.mes_pago ? ` - ${formatMesPago(lastPaymentReceipt.mes_pago)}` : ''}`
                  : `Comprobante Rechazado${lastPaymentReceipt.mes_pago ? ` - ${formatMesPago(lastPaymentReceipt.mes_pago)}` : ''}`}
              </strong>
              <p>
                {lastPaymentReceipt.estado === 'pendiente' 
                  ? 'Su comprobante está siendo revisado. Le notificaremos cuando sea procesado.'
                  : lastPaymentReceipt.estado === 'aprobado'
                  ? 'Su pago ha sido verificado y aprobado exitosamente.'
                  : lastPaymentReceipt.nota_revision || 'Su comprobante fue rechazado. Por favor, suba uno nuevo.'}
              </p>
              {lastPaymentReceipt.monto_declarado && (
                <span className={styles.paymentBannerMonto}>
                  Monto: ₡{lastPaymentReceipt.monto_declarado.toLocaleString('es-CR', { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 2 
                  })}
                </span>
              )}
            </div>
            {lastPaymentReceipt.estado === 'rechazado' && (
              <button 
                onClick={() => router.push('/pago/comprobante')}
                className={styles.paymentBannerRetry}
              >
                Subir Nuevo Comprobante
              </button>
            )}
            <button 
              className={styles.paymentBannerClose}
              onClick={() => setShowPaymentBanner(false)}
              aria-label="Cerrar banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div>
            <h1 className={styles.headerTitle}>
              Panel de {user.tipo === 'empresa' ? 'Empresa' : 'Cliente'}
            </h1>
            <p className={styles.headerSubtitle}>{user.nombre}</p>
          </div>
          <div className={styles.headerActions}>
            <button onClick={() => router.push('/comprobantes')} className={styles.comprobantesButton}>
              📄 Mis Comprobantes
            </button>
            {user.modoPago && (
              <button onClick={() => router.push('/pago')} className={styles.pagoButton}>
                💳 Ir a pagar
              </button>
            )}
            <button onClick={logout} className={styles.logoutButton}>
              Cerrar Sesión
            </button>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className={styles.main}>
        {/* Sección Unificada de Casos */}
        <div className={styles.casosSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Mis Casos</h2>
            <span className={styles.casosCount}>
              {casosUnificados.length} {casosUnificados.length === 1 ? 'caso' : 'casos'}
            </span>
          </div>

          {loadingData ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>Cargando casos...</p>
            </div>
          ) : casosUnificados.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyText}>No tienes casos asignados</p>
            </div>
          ) : (
            <div className={styles.casosGrid}>
              {casosUnificados.map((caso) => (
                <div
                  key={`${caso.tipo}-${caso.id}`}
                  className={styles.casoCard}
                  onClick={() => handleCasoClick(caso)}
                >
                  <div className={styles.casoHeader}>
                    <h3 className={styles.casoNombre}>{caso.titulo}</h3>
                    <span
                      className={styles.casoEstado}
                      style={{ backgroundColor: getEstadoColor(caso.estado) }}
                    >
                      {caso.estado}
                    </span>
                  </div>
                  {caso.subtitulo && (
                    <p className={styles.casoExpediente}>{caso.subtitulo}</p>
                  )}
                  <div className={styles.casoFooter}>
                    <span className={styles.verDetalle}>Ver detalles →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <HomeContent />
    </Suspense>
  )
}