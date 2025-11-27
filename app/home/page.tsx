'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import styles from './home.module.css'

interface User {
  id: string
  nombre: string
  cedula: number
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
  const [showPendingNotification, setShowPendingNotification] = useState(false)
  const [showRejectedNotification, setShowRejectedNotification] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!loading && user) {
      loadData(user)
      loadPaymentStatus(user)
      
      // Mostrar notificación solo si viene del upload de comprobante
      const fromUpload = searchParams.get('fromUpload')
      if (fromUpload === 'true') {
        setShowPendingNotification(true)
        // Limpiar el parámetro de la URL sin recargar
        window.history.replaceState({}, '', '/home')
      }
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

  if (loading) {
    return null
  }

  if (!user) {
    return null
  }

  return (
    <div className={styles.container}>
      {/* Notificación de pago pendiente */}
      {lastPaymentReceipt?.estado === 'pendiente' && showPendingNotification && (
        <div className={styles.notification}>
          <div className={styles.notificationContent}>
            <span className={styles.notificationIcon}>✓</span>
            <span className={styles.notificationText}>
              Su pago está pendiente de revisión
            </span>
            <button 
              className={styles.notificationClose}
              onClick={() => setShowPendingNotification(false)}
              aria-label="Cerrar notificación"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Notificación de pago rechazado */}
      {lastPaymentReceipt?.estado === 'rechazado' && showRejectedNotification && (
        <div className={styles.rejectedNotifications}>
          <div className={styles.rejectedNotification}>
            <div className={styles.rejectedContent}>
              <span className={styles.rejectedIcon}>✕</span>
              <div className={styles.rejectedInfo}>
                <strong>Pago Rechazado</strong>
                <p>{lastPaymentReceipt.nota_revision}</p>
                {lastPaymentReceipt.monto_declarado && (
                  <span className={styles.rejectedMonto}>
                    Monto: ₡{lastPaymentReceipt.monto_declarado.toLocaleString('es-CR', { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: 2 
                    })}
                  </span>
                )}
              </div>
              <button 
                onClick={() => router.push('/pago/comprobante')}
                className={styles.rejectedRetry}
              >
                Reintentar
              </button>
              <button 
                className={styles.rejectedClose}
                onClick={() => setShowRejectedNotification(false)}
                aria-label="Cerrar notificación"
              >
                ✕
              </button>
            </div>
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