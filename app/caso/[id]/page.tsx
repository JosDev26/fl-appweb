'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import styles from './caso.module.css'

interface Caso {
  id: string
  nombre: string
  estado: string | null
  expediente: string | null
  id_cliente: string | null
  created_at: string
  updated_at: string
  materias?: {
    nombre: string | null
  } | null
}

interface Trabajo {
  id: string
  titulo: string | null
  descripcion: string | null
  fecha: string | null
  duracion: string | null
  responsable: string | null
  solicitante: string | null
}

interface Gasto {
  id: string
  fecha: string | null
  producto: string | null
  total_cobro: number | null
  id_responsable: string | null
  mes_gasto?: string | null
  estado_pago?: 'pagado' | 'pendiente_mes_actual' | 'pendiente_anterior'
  funcionarios?: {
    nombre: string | null
  } | null
}

interface ServicioProfesional {
  id: string
  fecha: string | null
  costo: number | null
  gastos: number | null
  iva: number | null
  total: number | null
  estado_pago: string | null
  funcionarios?: {
    nombre: string | null
  } | null
  lista_servicios?: {
    titulo: string | null
  } | null
}

interface User {
  id: string
  nombre: string
  cedula?: string
  tipo: 'cliente' | 'empresa'
}

export default function CasoDetalle() {
  const { user, loading: authLoading } = useAuth()
  const [caso, setCaso] = useState<Caso | null>(null)
  const [trabajos, setTrabajos] = useState<Trabajo[]>([])
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [servicios, setServicios] = useState<ServicioProfesional[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const params = useParams()
  const casoId = params.id as string

  useEffect(() => {
    if (!authLoading && user) {
      loadCasoDetalle()
    }
  }, [authLoading, user, casoId])

  const loadCasoDetalle = async () => {
    if (!user) return

    try {
      const userIdCliente = String(user.id)

      // Obtener información del caso
      const casoResponse = await fetch(`/api/casos/${casoId}`)
      const casoData = await casoResponse.json()
      
      if (casoData.caso) {
        // Verificar que el usuario tenga acceso a este caso
        if (casoData.caso.id_cliente !== userIdCliente) {
          console.warn('Acceso denegado: Redirigiendo al home')
          router.push('/home')
          return
        }

        setCaso(casoData.caso)

        // Obtener trabajos del caso solo si tiene acceso
        const trabajosResponse = await fetch(`/api/casos/${casoId}/trabajos`)
        const trabajosData = await trabajosResponse.json()
        
        if (trabajosData.trabajos) {
          setTrabajos(trabajosData.trabajos)
        }

        // Obtener gastos del caso con información de pago
        const gastosResponse = await fetch(`/api/casos/${casoId}/gastos?clienteId=${userIdCliente}&tipoCliente=${user.tipo}`)
        const gastosData = await gastosResponse.json()
        
        if (gastosData.gastos) {
          setGastos(gastosData.gastos)
        }

        // Obtener servicios profesionales del caso
        const serviciosResponse = await fetch(`/api/casos/${casoId}/servicios`)
        const serviciosData = await serviciosResponse.json()
        
        if (serviciosData.servicios) {
          setServicios(serviciosData.servicios)
        }
      } else {
        router.push('/home')
        return
      }
    } catch (error) {
      console.error('Error al cargar detalle del caso:', error)
      router.push('/home')
      return
    } finally {
      setLoading(false)
    }
  }

  const formatDuracion = (duracion: string | null) => {
    if (!duracion) return '-'
    // Duracion viene como "HH:MM:SS"
    return duracion
  }

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return '-'
    try {
      const date = new Date(fecha)
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    } catch {
      return fecha
    }
  }

  const getEstadoColor = (estado: string | null) => {
    switch (estado?.toLowerCase()) {
      case 'en proceso':
        return '#FAD02C'
      case 'finalizado':
        return '#4ade80'
      case 'abandonado':
        return '#f87171'
      default:
        return '#94a3b8'
    }
  }

  const calcularTotalHoras = () => {
    let totalMinutes = 0
    trabajos.forEach(trabajo => {
      if (trabajo.duracion) {
        const parts = trabajo.duracion.split(':')
        const hours = parseInt(parts[0] || '0')
        const minutes = parseInt(parts[1] || '0')
        totalMinutes += (hours * 60) + minutes
      }
    })
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}h ${minutes}m`
  }

  const calcularTotalGastos = () => {
    return gastos.reduce((total, gasto) => total + (gasto.total_cobro || 0), 0)
  }

  const formatMonto = (monto: number | null) => {
    if (monto === null || monto === undefined) return '₡0.00'
    return `₡${monto.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Cargando caso...</p>
        </div>
      </div>
    )
  }

  if (!caso) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>Caso no encontrado</p>
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
        {/* Información del caso */}
        <div className={styles.casoInfo}>
          <div className={styles.casoHeader}>
            <div>
              <h1 className={styles.casoTitulo}>{caso.nombre}</h1>
              {caso.expediente && (
                <p className={styles.casoExpediente}>Expediente: {caso.expediente}</p>
              )}
              {caso.materias?.nombre && (
                <p className={styles.casoExpediente}>Materia: {caso.materias.nombre}</p>
              )}
            </div>
            <span
              className={styles.casoEstado}
              style={{ backgroundColor: getEstadoColor(caso.estado) }}
            >
              {caso.estado || 'Sin estado'}
            </span>
          </div>

          <div className={styles.estadisticas}>
            <div className={styles.estadistica}>
              <span className={styles.estadisticaLabel}>Total de tareas</span>
              <span className={styles.estadisticaValor}>{trabajos.length}</span>
            </div>
            <div className={styles.estadistica}>
              <span className={styles.estadisticaLabel}>Horas trabajadas</span>
              <span className={styles.estadisticaValor}>{calcularTotalHoras()}</span>
            </div>
            <div className={styles.estadistica}>
              <span className={styles.estadisticaLabel}>Total Gastos</span>
              <span className={styles.estadisticaValor}>{formatMonto(calcularTotalGastos())}</span>
            </div>
          </div>
        </div>

        {/* Tabla de trabajos */}
        <div className={styles.trabajosSection}>
          <h2 className={styles.sectionTitle}>Registro de Horas</h2>
          
          {trabajos.length === 0 ? (
            <div className={styles.emptyTrabajos}>
              <p>No hay tareas registradas para este caso</p>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Título</th>
                    <th>Descripción</th>
                    <th>Duración</th>
                  </tr>
                </thead>
                <tbody>
                  {trabajos.map((trabajo) => (
                    <tr key={trabajo.id}>
                      <td className={styles.cellFecha}>
                        {formatFecha(trabajo.fecha)}
                      </td>
                      <td className={styles.cellTitulo}>
                        {trabajo.titulo || '-'}
                      </td>
                      <td className={styles.cellDescripcion}>
                        {trabajo.descripcion || '-'}
                      </td>
                      <td className={styles.cellDuracion}>
                        {formatDuracion(trabajo.duracion)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sección de Gastos */}
        <div className={styles.trabajosSection}>
          <h2 className={styles.sectionTitle}>Gastos del Caso</h2>
          
          {gastos.length === 0 ? (
            <div className={styles.emptyTrabajos}>
              <p>No hay gastos registrados para este caso</p>
            </div>
          ) : (
            <>
              {/* Gastos Pagados */}
              {gastos.filter(g => g.estado_pago === 'pagado').length > 0 && (
                <div className={styles.gastosCategoria}>
                  <h3 className={styles.gastosSubtitulo}>
                    <span className={styles.iconoPagado}>✓</span> Gastos Pagados
                  </h3>
                  <div className={styles.tableContainer}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Producto/Servicio</th>
                          <th>Responsable</th>
                          <th>Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gastos.filter(g => g.estado_pago === 'pagado').map((gasto) => (
                          <tr key={gasto.id} className={styles.filaPagado}>
                            <td className={styles.cellFecha}>{formatFecha(gasto.fecha)}</td>
                            <td className={styles.cellDescripcion}>{gasto.producto || '-'}</td>
                            <td className={styles.cellTitulo}>{gasto.funcionarios?.nombre || '-'}</td>
                            <td className={styles.cellDuracion}>{formatMonto(gasto.total_cobro)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Gastos Pendientes del Mes Actual */}
              {gastos.filter(g => g.estado_pago === 'pendiente_mes_actual').length > 0 && (
                <div className={styles.gastosCategoria}>
                  <h3 className={styles.gastosSubtitulo}>
                    <span className={styles.iconoPendiente}>⏳</span> Gastos del Mes Actual (Pendientes)
                  </h3>
                  <div className={styles.tableContainer}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Producto/Servicio</th>
                          <th>Responsable</th>
                          <th>Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gastos.filter(g => g.estado_pago === 'pendiente_mes_actual').map((gasto) => (
                          <tr key={gasto.id} className={styles.filaPendiente}>
                            <td className={styles.cellFecha}>{formatFecha(gasto.fecha)}</td>
                            <td className={styles.cellDescripcion}>{gasto.producto || '-'}</td>
                            <td className={styles.cellTitulo}>{gasto.funcionarios?.nombre || '-'}</td>
                            <td className={styles.cellDuracion}>{formatMonto(gasto.total_cobro)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Gastos Pendientes de Meses Anteriores */}
              {gastos.filter(g => g.estado_pago === 'pendiente_anterior').length > 0 && (
                <div className={styles.gastosCategoria}>
                  <h3 className={styles.gastosSubtitulo}>
                    <span className={styles.iconoAtrasado}>⚠️</span> Gastos de Meses Anteriores (Por Pagar)
                  </h3>
                  <div className={styles.tableContainer}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Producto/Servicio</th>
                          <th>Responsable</th>
                          <th>Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gastos.filter(g => g.estado_pago === 'pendiente_anterior').map((gasto) => (
                          <tr key={gasto.id} className={styles.filaAtrasado}>
                            <td className={styles.cellFecha}>{formatFecha(gasto.fecha)}</td>
                            <td className={styles.cellDescripcion}>{gasto.producto || '-'}</td>
                            <td className={styles.cellTitulo}>{gasto.funcionarios?.nombre || '-'}</td>
                            <td className={styles.cellDuracion}>{formatMonto(gasto.total_cobro)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sección de Servicios Profesionales */}
        {servicios.length > 0 && (
          <div className={styles.trabajosSection}>
            <h2 className={styles.sectionTitle}>Servicios Profesionales</h2>
            
            {/* Servicios Pagados */}
            {servicios.filter(s => s.estado_pago === 'pagado').length > 0 && (
              <div className={styles.gastosCategoria}>
                <h3 className={styles.gastosSubtitulo}>
                  <span className={styles.iconoPagado}>✓</span> Servicios Pagados
                </h3>
                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Servicio</th>
                        <th>Responsable</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servicios.filter(s => s.estado_pago === 'pagado').map((servicio) => (
                        <tr key={servicio.id} className={styles.filaPagado}>
                          <td className={styles.cellFecha}>{formatFecha(servicio.fecha)}</td>
                          <td className={styles.cellDescripcion}>{servicio.lista_servicios?.titulo || '-'}</td>
                          <td className={styles.cellTitulo}>{servicio.funcionarios?.nombre || '-'}</td>
                          <td className={styles.cellDuracion}>{formatMonto(servicio.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Servicios Pendientes */}
            {servicios.filter(s => s.estado_pago === 'pendiente').length > 0 && (
              <div className={styles.gastosCategoria}>
                <h3 className={styles.gastosSubtitulo}>
                  <span className={styles.iconoPendiente}>⏳</span> Servicios Pendientes
                </h3>
                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Servicio</th>
                        <th>Responsable</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servicios.filter(s => s.estado_pago === 'pendiente').map((servicio) => (
                        <tr key={servicio.id} className={styles.filaPendiente}>
                          <td className={styles.cellFecha}>{formatFecha(servicio.fecha)}</td>
                          <td className={styles.cellDescripcion}>{servicio.lista_servicios?.titulo || '-'}</td>
                          <td className={styles.cellTitulo}>{servicio.funcionarios?.nombre || '-'}</td>
                          <td className={styles.cellDuracion}>{formatMonto(servicio.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
