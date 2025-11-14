'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import styles from './solicitud.module.css'

interface Solicitud {
  id: string
  id_cliente: string | null
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
  created_at: string
  updated_at: string
}

interface User {
  id: number
  id_sheets?: string
  nombre: string
  cedula?: number
  tipo: 'cliente' | 'empresa'
}

export default function SolicitudDetalle() {
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const params = useParams()
  const solicitudId = params.id as string

  useEffect(() => {
    // Verificar autenticación
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/login')
      return
    }

    loadSolicitudDetalle()
  }, [solicitudId, router])

  const loadSolicitudDetalle = async () => {
    try {
      // Obtener usuario actual
      const userData = localStorage.getItem('user')
      if (!userData) {
        router.push('/login')
        return
      }

      const user: User = JSON.parse(userData)
      const userIdCliente = user.id_sheets || String(user.id)

      console.log('👤 Usuario actual:', user)
      console.log('🔑 ID Cliente del usuario:', userIdCliente)

      // Obtener información de la solicitud
      const response = await fetch(`/api/solicitudes/${solicitudId}`)
      const data = await response.json()
      
      console.log('📋 Datos de la solicitud:', data)
      
      if (data.solicitud) {
        console.log('🔍 ID Cliente de la solicitud:', data.solicitud.id_cliente)
        console.log('🔍 Comparación:', data.solicitud.id_cliente, '===', userIdCliente)
        
        // Verificar que el usuario tenga acceso a esta solicitud
        if (data.solicitud.id_cliente !== userIdCliente) {
          console.warn('❌ Acceso denegado: IDs no coinciden')
          console.warn('   Solicitud ID Cliente:', data.solicitud.id_cliente)
          console.warn('   Usuario ID Cliente:', userIdCliente)
          router.push('/home')
          return
        }

        console.log('✅ Acceso permitido')
        setSolicitud(data.solicitud)
      } else {
        router.push('/home')
        return
      }
    } catch (error) {
      console.error('Error al cargar detalle de la solicitud:', error)
      router.push('/home')
      return
    } finally {
      setLoading(false)
    }
  }

  const formatMonto = (monto: number | null) => {
    if (monto === null || monto === undefined) return '-'
    return `₡${monto.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const getEstadoPagoColor = (estado: string | null) => {
    switch (estado?.toLowerCase()) {
      case 'pagado':
        return '#4ade80'
      case 'en proceso':
        return '#FAD02C'
      default:
        return '#94a3b8'
    }
  }

  const calcularProgresoPago = () => {
    if (!solicitud?.total_a_pagar || solicitud.total_a_pagar === 0) return 0
    const pagado = solicitud.monto_pagado || 0
    return Math.min((pagado / solicitud.total_a_pagar) * 100, 100)
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Cargando solicitud...</p>
        </div>
      </div>
    )
  }

  if (!solicitud) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>Solicitud no encontrada</p>
          <button onClick={() => router.push('/home')} className={styles.backButton}>
            Volver al inicio
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <button onClick={() => router.push('/home')} className={styles.backButton}>
            ← Volver
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className={styles.main}>
        {/* Información de la solicitud */}
        <div className={styles.solicitudInfo}>
          <div className={styles.solicitudHeader}>
            <div>
              <h1 className={styles.solicitudTitulo}>{solicitud.titulo || 'Sin título'}</h1>
              {solicitud.expediente && (
                <p className={styles.solicitudExpediente}>Expediente: {solicitud.expediente}</p>
              )}
            </div>
            <span
              className={styles.estadoPago}
              style={{ backgroundColor: getEstadoPagoColor(solicitud.estado_pago) }}
            >
              {solicitud.estado_pago || 'Sin estado'}
            </span>
          </div>

          {solicitud.descripcion && (
            <div className={styles.descripcion}>
              <h3>Descripción</h3>
              <p>{solicitud.descripcion}</p>
            </div>
          )}

          <div className={styles.detallesGrid}>
            <div className={styles.detalleItem}>
              <span className={styles.detalleLabel}>Materia</span>
              <span className={styles.detalleValor}>{solicitud.materia || '-'}</span>
            </div>
            <div className={styles.detalleItem}>
              <span className={styles.detalleLabel}>Etapa Actual</span>
              <span className={styles.detalleValor}>{solicitud.etapa_actual || '-'}</span>
            </div>
            <div className={styles.detalleItem}>
              <span className={styles.detalleLabel}>Modalidad de Pago</span>
              <span className={styles.detalleValor}>{solicitud.modalidad_pago || '-'}</span>
            </div>
            <div className={styles.detalleItem}>
              <span className={styles.detalleLabel}>Cantidad de Cuotas</span>
              <span className={styles.detalleValor}>{solicitud.cantidad_cuotas || '-'}</span>
            </div>
          </div>
        </div>

        {/* Información de pago */}
        <div className={styles.pagoSection}>
          <h2 className={styles.sectionTitle}>Información de Pago</h2>
          
          <div className={styles.montosGrid}>
            <div className={styles.montoCard}>
              <span className={styles.montoLabel}>Costo Neto</span>
              <span className={styles.montoValor}>{formatMonto(solicitud.costo_neto)}</span>
            </div>
            <div className={styles.montoCard}>
              <span className={styles.montoLabel}>Total a Pagar</span>
              <span className={styles.montoValor}>{formatMonto(solicitud.total_a_pagar)}</span>
            </div>
            <div className={styles.montoCard}>
              <span className={styles.montoLabel}>Monto por Cuota</span>
              <span className={styles.montoValor}>{formatMonto(solicitud.monto_por_cuota)}</span>
            </div>
          </div>

          <div className={styles.progresoSection}>
            <div className={styles.progresoHeader}>
              <span className={styles.progresoLabel}>Progreso de Pago</span>
              <span className={styles.progresoPercentaje}>{calcularProgresoPago().toFixed(1)}%</span>
            </div>
            <div className={styles.progresoBar}>
              <div 
                className={styles.progresoFill}
                style={{ width: `${calcularProgresoPago()}%` }}
              ></div>
            </div>
            <div className={styles.progresoMontosRow}>
              <div className={styles.progresoMonto}>
                <span className={styles.progresoMontoLabel}>Pagado</span>
                <span className={styles.progresoMontoValor} style={{ color: '#4ade80' }}>
                  {formatMonto(solicitud.monto_pagado)}
                </span>
              </div>
              <div className={styles.progresoMonto}>
                <span className={styles.progresoMontoLabel}>Saldo Pendiente</span>
                <span className={styles.progresoMontoValor} style={{ color: '#f87171' }}>
                  {formatMonto(solicitud.saldo_pendiente)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
