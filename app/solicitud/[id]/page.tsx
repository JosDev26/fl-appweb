'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
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
  se_cobra_iva: boolean | null
  monto_iva: number | null
  cantidad_cuotas: number | null
  monto_por_cuota: number | null
  total_a_pagar: number | null
  estado_pago: string | null
  monto_pagado: number | null
  saldo_pendiente: number | null
  expediente: string | null
  created_at: string
  updated_at: string
  materias?: {
    nombre: string | null
  } | null
  cliente?: {
    iva_perc: number | null
  } | null
}

interface Actualizacion {
  id: string
  tipo_cliente: string | null
  id_cliente: string | null
  id_solicitud: string | null
  comentario: string | null
  tiempo: string | null
  etapa_actual: string | null
  created_at: string
  updated_at: string
}

interface User {
  id: string
  nombre: string
  cedula?: number
  tipo: 'cliente' | 'empresa'
  iva_perc?: number
}

export default function SolicitudDetalle() {
  const { user, loading: authLoading } = useAuth()
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  const [actualizaciones, setActualizaciones] = useState<Actualizacion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingActualizaciones, setLoadingActualizaciones] = useState(false)
  const router = useRouter()
  const params = useParams()
  const solicitudId = params.id as string

  useEffect(() => {
    if (!authLoading && user) {
      loadSolicitudDetalle()
    }
  }, [authLoading, user, solicitudId])

  const loadSolicitudDetalle = async () => {
    if (!user) return

    try {
      const userIdCliente = String(user.id)

      // Obtener información de la solicitud
      const response = await fetch(`/api/solicitudes/${solicitudId}`)
      const data = await response.json()
      
      if (data.solicitud) {
        // Verificar que el usuario tenga acceso a esta solicitud
        if (data.solicitud.id_cliente !== userIdCliente) {
          console.warn('Acceso denegado: Redirigiendo al home')
          router.push('/home')
          return
        }

        console.log('✅ Acceso permitido')
        setSolicitud(data.solicitud)
        
        // Cargar actualizaciones de la solicitud
        loadActualizaciones()
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

  const loadActualizaciones = async () => {
    setLoadingActualizaciones(true)
    try {
      const response = await fetch(`/api/solicitudes/${solicitudId}/actualizaciones`)
      const data = await response.json()
      
      if (data.actualizaciones) {
        setActualizaciones(data.actualizaciones)
      }
    } catch (error) {
      console.error('Error al cargar actualizaciones:', error)
    } finally {
      setLoadingActualizaciones(false)
    }
  }

  const formatMonto = (monto: number | null) => {
    if (monto === null || monto === undefined) return '-'
    return `₡${monto.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return '-'
    try {
      const date = new Date(fecha)
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return fecha
    }
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
    const total = calcularTotal()
    if (!total || total === 0) return 0
    const pagado = solicitud?.monto_pagado || 0
    return Math.min((pagado / total) * 100, 100)
  }

  const agruparPorEtapa = () => {
    // Agrupar actualizaciones por etapa_actual
    const grupos: { [key: string]: Actualizacion[] } = {}
    const sinEtapa: Actualizacion[] = []

    actualizaciones.forEach(act => {
      const etapa = act.etapa_actual
      if (!etapa) {
        sinEtapa.push(act)
      } else {
        if (!grupos[etapa]) {
          grupos[etapa] = []
        }
        grupos[etapa].push(act)
      }
    })

    // Convertir a array y ordenar por fecha más reciente de cada grupo
    const gruposArray = Object.entries(grupos).map(([etapa, acts]) => ({
      etapa,
      actualizaciones: acts.sort((a, b) => 
        new Date(b.tiempo || '').getTime() - new Date(a.tiempo || '').getTime()
      ),
      fechaMasReciente: acts.reduce((max, act) => {
        const fecha = new Date(act.tiempo || '').getTime()
        return fecha > max ? fecha : max
      }, 0)
    }))

    // Ordenar grupos por fecha más reciente (más reciente primero)
    gruposArray.sort((a, b) => b.fechaMasReciente - a.fechaMasReciente)

    return { grupos: gruposArray, sinEtapa }
  }

  const calcularIVA = () => {
    if (!solicitud?.costo_neto) return 0
    // Si la solicitud tiene monto_iva, usarlo
    if (solicitud.monto_iva) return solicitud.monto_iva
    // Si no, calcular basado en el iva_perc del cliente
    const ivaPerc = solicitud.cliente?.iva_perc || 0.13
    return solicitud.costo_neto * ivaPerc
  }

  const calcularTotal = () => {
    const costoNeto = solicitud?.costo_neto || 0
    const iva = calcularIVA()
    return costoNeto + iva
  }

  if (authLoading || loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Cargando solicitud...</p>
        </div>
      </div>
    )
  }

  if (!user || !solicitud) {
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
              <span className={styles.detalleValor}>{solicitud.materias?.nombre || '-'}</span>
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
            {calcularIVA() > 0 && (
              <div className={styles.montoCard}>
                <span className={styles.montoLabel}>IVA ({((solicitud.cliente?.iva_perc || 0.13) * 100).toFixed(0)}%)</span>
                <span className={styles.montoValor}>{formatMonto(calcularIVA())}</span>
              </div>
            )}
            <div className={styles.montoCard} style={{ backgroundColor: '#19304B' }}>
              <span className={styles.montoLabel} style={{ color: '#fff' }}>Total a Pagar</span>
              <span className={styles.montoValor} style={{ color: '#FAD02C', fontSize: '1.5rem', fontWeight: '700' }}>
                {formatMonto(calcularTotal())}
              </span>
            </div>
            {solicitud.cantidad_cuotas && solicitud.cantidad_cuotas > 1 && (
              <div className={styles.montoCard}>
                <span className={styles.montoLabel}>Monto por Cuota ({solicitud.cantidad_cuotas} cuotas)</span>
                <span className={styles.montoValor}>{formatMonto(calcularTotal() / solicitud.cantidad_cuotas)}</span>
              </div>
            )}
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
                  {formatMonto(calcularTotal() - (solicitud.monto_pagado || 0))}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Sección de Actualizaciones */}
        <div className={styles.actualizacionesSection}>
          <h2 className={styles.sectionTitle}>Actualizaciones del Caso</h2>
          
          {loadingActualizaciones ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>Cargando actualizaciones...</p>
            </div>
          ) : actualizaciones.length === 0 ? (
            <div className={styles.emptyActualizaciones}>
              <p>No hay actualizaciones registradas para esta solicitud</p>
            </div>
          ) : (
            <div className={styles.timelineContainer}>
              {(() => {
                const { grupos, sinEtapa } = agruparPorEtapa()
                return (
                  <>
                    {/* Grupos por etapa */}
                    {grupos.map((grupo, index) => (
                      <div key={grupo.etapa} className={styles.etapaGroup}>
                        <div className={styles.etapaHeader}>
                          <div className={styles.etapaBadge}>
                            <span className={styles.etapaTitulo}>{grupo.etapa}</span>
                          </div>
                        </div>
                        <div className={styles.etapaComentarios}>
                          {grupo.actualizaciones.map((actualizacion) => (
                            <div key={actualizacion.id} className={styles.comentarioItem}>
                              <div className={styles.comentarioBullet}></div>
                              <div className={styles.comentarioContent}>
                                <div className={styles.comentarioHeader}>
                                  <span className={styles.comentarioFecha}>
                                    {formatFecha(actualizacion.tiempo)}
                                  </span>
                                </div>
                                <p className={styles.comentarioTexto}>
                                  {actualizacion.comentario || 'Sin comentario'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Actualizaciones sin etapa */}
                    {sinEtapa.length > 0 && (
                      <div className={styles.etapaGroup}>
                        <div className={styles.etapaHeader}>
                          <div className={styles.etapaBadge} style={{ opacity: 0.6 }}>
                            <span className={styles.etapaTitulo}>Sin etapa definida</span>
                          </div>
                        </div>
                        <div className={styles.etapaComentarios}>
                          {sinEtapa.map((actualizacion) => (
                            <div key={actualizacion.id} className={styles.comentarioItem}>
                              <div className={styles.comentarioBullet}></div>
                              <div className={styles.comentarioContent}>
                                <div className={styles.comentarioHeader}>
                                  <span className={styles.comentarioFecha}>
                                    {formatFecha(actualizacion.tiempo)}
                                  </span>
                                </div>
                                <p className={styles.comentarioTexto}>
                                  {actualizacion.comentario || 'Sin comentario'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
