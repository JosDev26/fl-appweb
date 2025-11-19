'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import styles from './pago.module.css'

interface User {
  id: string
  nombre: string
  cedula: number
  tipo?: 'cliente' | 'empresa'
  modoPago?: boolean
}

interface Trabajo {
  id: string
  titulo: string | null
  descripcion: string | null
  fecha: string | null
  duracion: string | null
}

interface TrabajoPorCaso {
  caso: {
    nombre: string
    expediente: string | null
  }
  trabajos: Trabajo[]
  totalHoras: string
  totalMinutos?: number
}

interface SolicitudMensual {
  id: string
  titulo: string | null
  descripcion: string | null
  materia: string | null
  monto_por_cuota: number | null
  expediente: string | null
}

interface Gasto {
  id: string
  producto: string | null
  fecha: string | null
  total_cobro: number | null
  funcionarios?: {
    nombre: string | null
  } | null
}

interface DatosPago {
  success: boolean
  tipoCliente: string
  trabajosPorHora: TrabajoPorCaso[]
  solicitudesMensuales: SolicitudMensual[]
  totalMensualidades: number
  gastos: Gasto[]
  totalGastos: number
  totalMinutosGlobal: number
  totalHorasDecimal: number
  tarifaHora: number
  tarifaEstandar: number
  costoServiciosTarifa: number
  costoServiciosEstandar: number
  ahorroComparativo: number
  subtotal: number
  ivaPerc: number
  montoIVA: number
  totalAPagar: number
  mesActual: string
}

export default function PagoPage() {
  const { user, loading: authLoading } = useAuth()
  const [datosPago, setDatosPago] = useState<DatosPago | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && user) {
      // Verificar que tenga modoPago activado
      if (!user.modoPago) {
        router.push('/home')
        return
      }

      loadDatosPago(user)
    }
  }, [authLoading, user, router])

  const loadDatosPago = async (userData: any) => {
    setLoading(true)
    try {
      const response = await fetch('/api/datos-pago', {
        headers: {
          'x-user-id': String(userData.id),
          'x-tipo-cliente': userData.tipo || 'cliente'
        }
      })

      if (!response.ok) {
        throw new Error('Error al cargar datos de pago')
      }

      const data = await response.json()
      setDatosPago(data)
    } catch (error) {
      console.error('Error al cargar datos de pago:', error)
      alert('Error al cargar los datos de pago')
    } finally {
      setLoading(false)
    }
  }

  const formatDuracion = (duracion: string | null): string => {
    if (!duracion) return '0h'
    
    if (duracion.includes(':')) {
      const [h, m] = duracion.split(':').map(Number)
      if (m === 0) return `${h}h`
      return `${h}h ${m}m`
    }
    
    const horas = parseFloat(duracion)
    const h = Math.floor(horas)
    const m = Math.round((horas - h) * 60)
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }

  const formatMonto = (monto: number | null): string => {
    if (!monto) return '₡0.00'
    return `₡${monto.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatFecha = (fecha: string | null): string => {
    if (!fecha) return '-'
    try {
      const date = new Date(fecha)
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
      return fecha
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Cargando información de pago...</p>
        </div>
      </div>
    )
  }

  if (!user || !datosPago) {
    return null
  }

  const tieneTrabajosHora = datosPago.trabajosPorHora.length > 0
  const tieneMensualidades = datosPago.solicitudesMensuales.length > 0

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <button onClick={() => router.push('/home')} className={styles.backButton}>
            ← Volver
          </button>
          <div>
            <h1 className={styles.headerTitle}>Información de Pago</h1>
            <p className={styles.headerSubtitle}>{datosPago.mesActual}</p>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className={styles.main}>
        {/* Trabajos por hora */}
        {tieneTrabajosHora && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Trabajos por Hora del Mes</h2>
            
            {/* Resumen total de horas */}
            <div className={styles.totalHorasResumen}>
              <span>Total de horas del mes:</span>
              <strong>
                {(() => {
                  const totalMinutos = datosPago.trabajosPorHora.reduce((total, item) => {
                    const [h, m] = item.totalHoras.split(':').map(Number);
                    return total + (h * 60) + m;
                  }, 0);
                  const horas = Math.floor(totalMinutos / 60);
                  const minutos = totalMinutos % 60;
                  return `${horas}:${minutos.toString().padStart(2, '0')}`;
                })()}
              </strong>
            </div>
            
            {datosPago.trabajosPorHora.map((item, index) => (
              <div key={index} className={styles.casoCard}>
                <div className={styles.casoHeader}>
                  <h3 className={styles.casoNombre}>{item.caso.nombre}</h3>
                  {item.caso.expediente && (
                    <span className={styles.expediente}>Exp: {item.caso.expediente}</span>
                  )}
                </div>

                <div className={styles.trabajosLista}>
                  {item.trabajos.map((trabajo) => (
                    <div key={trabajo.id} className={styles.trabajoItem}>
                      <div className={styles.trabajoInfo}>
                        <p className={styles.trabajoTitulo}>
                          {trabajo.titulo || 'Sin título'}
                        </p>
                        {trabajo.descripcion && (
                          <p className={styles.trabajoDescripcion}>{trabajo.descripcion}</p>
                        )}
                        <p className={styles.trabajoFecha}>
                          {trabajo.fecha ? new Date(trabajo.fecha).toLocaleDateString('es-ES') : 'Sin fecha'}
                        </p>
                      </div>
                      <div className={styles.trabajoDuracion}>
                        {formatDuracion(trabajo.duracion)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className={styles.totalHoras}>
                  <span>Total de horas:</span>
                  <strong>{item.totalHoras}</strong>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Resumen de Costos */}
        {(tieneTrabajosHora || tieneMensualidades) && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Resumen de Costos</h2>
            
            <div className={styles.resumenCostos}>
              {/* Servicios Profesionales */}
              {tieneTrabajosHora && (
                <>
                  <div className={styles.costoItem}>
                    <span>Total de Horas:</span>
                    <strong>
                      {(() => {
                        const horas = Math.floor(datosPago.totalMinutosGlobal / 60);
                        const minutos = datosPago.totalMinutosGlobal % 60;
                        return `${horas}:${minutos.toString().padStart(2, '0')}h`;
                      })()} ({datosPago.totalHorasDecimal.toFixed(2)}h decimal)
                    </strong>
                  </div>
                  
                  <div className={styles.costoItem}>
                    <span>Tu Tarifa por Hora:</span>
                    <strong>{formatMonto(datosPago.tarifaHora)}</strong>
                  </div>
                  
                  <div className={styles.costoItem}>
                    <span>Servicios Profesionales:</span>
                    <strong>{formatMonto(datosPago.costoServiciosTarifa)}</strong>
                  </div>
                  
                  {datosPago.tarifaHora !== datosPago.tarifaEstandar && (
                    <div className={styles.comparacionTarifa}>
                      <span className={styles.labelSecundario}>Tarifa Estándar: {formatMonto(datosPago.tarifaEstandar)}/h</span>
                      <span className={styles.labelSecundario}>Costo Estándar: {formatMonto(datosPago.costoServiciosEstandar)}</span>
                      {datosPago.ahorroComparativo > 0 ? (
                        <span className={styles.ahorro}>Ahorro: {formatMonto(datosPago.ahorroComparativo)}</span>
                      ) : (
                        <span className={styles.diferencia}>Diferencia: {formatMonto(Math.abs(datosPago.ahorroComparativo))}</span>
                      )}
                    </div>
                  )}
                  
                  <div className={styles.divider} />
                </>
              )}
              
              {/* Mensualidades */}
              {tieneMensualidades && (
                <>
                  <div className={styles.costoItem}>
                    <span>Mensualidades:</span>
                    <strong>{formatMonto(datosPago.totalMensualidades)}</strong>
                  </div>
                  <div className={styles.divider} />
                </>
              )}
              
              {/* Gastos */}
              <div className={styles.costoItem}>
                <span>Gastos del Mes:</span>
                <strong>{formatMonto(datosPago.totalGastos)}</strong>
              </div>
              
              {/* Detalle de gastos */}
              {datosPago.gastos && datosPago.gastos.length > 0 && (
                <div className={styles.detalleGastos}>
                  {datosPago.gastos.map((gasto) => (
                    <div key={gasto.id} className={styles.gastoItem}>
                      <div className={styles.gastoInfo}>
                        <span className={styles.gastoProducto}>{gasto.producto || 'Sin descripción'}</span>
                        <span className={styles.gastoMeta}>
                          {formatFecha(gasto.fecha)} • {gasto.funcionarios?.nombre || 'Sin responsable'}
                        </span>
                      </div>
                      <span className={styles.gastoMonto}>{formatMonto(gasto.total_cobro)}</span>
                    </div>
                  ))}
                </div>
              )}
              
              <div className={styles.divider} />
              
              {/* Subtotal */}
              <div className={styles.costoItem + ' ' + styles.destacado}>
                <span>Subtotal:</span>
                <strong>{formatMonto(datosPago.subtotal)}</strong>
              </div>
              
              {/* IVA */}
              <div className={styles.costoItem}>
                <span>IVA ({(datosPago.ivaPerc * 100).toFixed(0)}%):</span>
                <strong>{formatMonto(datosPago.montoIVA)}</strong>
              </div>
              
              <div className={styles.divider + ' ' + styles.dividerBold} />
              
              {/* Total */}
              <div className={styles.costoItem + ' ' + styles.total}>
                <span>TOTAL A PAGAR:</span>
                <strong>{formatMonto(datosPago.totalAPagar)}</strong>
              </div>
            </div>
          </section>
        )}

        {/* Mensualidades */}
        {tieneMensualidades && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Mensualidades</h2>
            
            <div className={styles.mensualidadesGrid}>
              {datosPago.solicitudesMensuales.map((solicitud) => (
                <div key={solicitud.id} className={styles.mensualidadCard}>
                  <h3 className={styles.mensualidadTitulo}>
                    {solicitud.titulo || 'Sin título'}
                  </h3>
                  
                  {solicitud.materia && (
                    <p className={styles.mensualidadMateria}>
                      Materia: {solicitud.materia}
                    </p>
                  )}
                  
                  {solicitud.expediente && (
                    <p className={styles.mensualidadExpediente}>
                      Expediente: {solicitud.expediente}
                    </p>
                  )}
                  
                  <div className={styles.mensualidadMonto}>
                    {formatMonto(solicitud.monto_por_cuota)}
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.totalMensualidades}>
              <span>Total a pagar este mes:</span>
              <strong>{formatMonto(datosPago.totalMensualidades)}</strong>
            </div>
          </section>
        )}

        {/* Estado vacío */}
        {!tieneTrabajosHora && !tieneMensualidades && (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              No tienes pagos pendientes en este momento
            </p>
          </div>
        )}

        {/* Botón de acción */}
        {(tieneTrabajosHora || tieneMensualidades) && (
          <div className={styles.actionSection}>
            <button className={styles.pagarButton}>
              Proceder al Pago
            </button>
            <p className={styles.nota}>
              * Los trabajos por hora serán facturados según la tarifa acordada
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
