'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import styles from './pago.module.css'

interface User {
  id: string
  nombre: string
  cedula: string
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
  se_cobra_iva: boolean | null
  monto_iva: number | null
  costo_neto: number | null
  cantidad_cuotas: number | null
  expediente: string | null
}

interface Gasto {
  id: string
  producto: string | null
  fecha: string | null
  total_cobro: number | null
  estado_pago?: string | null
  funcionarios?: {
    nombre: string | null
  } | null
}

interface ServicioProfesional {
  id: string
  id_caso: string | null
  id_servicio: string | null
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

interface DatosPago {
  success: boolean
  tipoCliente: string
  nombreCliente: string
  darVistoBueno: boolean
  trabajosPorHora: TrabajoPorCaso[]
  solicitudesMensuales: SolicitudMensual[]
  totalMensualidades: number
  totalIVAMensualidades: number
  gastos: Gasto[]
  totalGastos: number
  gastosPendientesAnteriores: Gasto[]
  totalGastosPendientesAnteriores: number
  serviciosProfesionales: ServicioProfesional[]
  totalServiciosProfesionales: number
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
  mesActualISO: string
  // Datos de grupo
  esGrupoPrincipal?: boolean
  empresasDelGrupo?: DatosEmpresaGrupo[]
  totalGrupoSubtotal?: number
  totalGrupoIVA?: number
  totalGrupoAPagar?: number
  granTotalSubtotal?: number
  granTotalIVA?: number
  granTotalAPagar?: number
}

interface DatosEmpresaGrupo {
  empresaId: string
  empresaNombre: string
  ivaPerc: number
  trabajosPorHora: any[]
  gastos: any[]
  gastosPendientesAnteriores: Gasto[]
  solicitudes: any[]
  serviciosProfesionales: ServicioProfesional[]
  totalServiciosProfesionales: number
  totalMinutos: number
  totalHoras: number
  tarifaHora: number
  costoServicios: number
  totalGastos: number
  totalGastosPendientesAnteriores: number
  totalMensualidades: number
  totalIVAMensualidades: number
  subtotal: number
  ivaServicios: number
  montoIVA: number
  total: number
}

// Estado del visto bueno
type EstadoVistoBueno = 'pendiente' | 'aprobado' | 'rechazado'

export default function PagoPage() {
  const { user, loading: authLoading } = useAuth()
  const [datosPago, setDatosPago] = useState<DatosPago | null>(null)
  const [loading, setLoading] = useState(true)
  const [vistoBuenoDado, setVistoBuenoDado] = useState(false)
  const [estadoVistoBueno, setEstadoVistoBueno] = useState<EstadoVistoBueno>('pendiente')
  const [loadingVistoBueno, setLoadingVistoBueno] = useState(false)
  const [simulatedDate, setSimulatedDate] = useState<string | null>(null)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const router = useRouter()

  // Estados para modal de rechazo
  const [showRechazoModal, setShowRechazoModal] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [archivoRechazo, setArchivoRechazo] = useState<File | null>(null)
  const [loadingRechazo, setLoadingRechazo] = useState(false)
  const [errorRechazo, setErrorRechazo] = useState('')

  // Estados para modal de confirmación de re-aprobación
  const [showReaprobarModal, setShowReaprobarModal] = useState(false)

  // Cargar fecha simulada global desde API al montar
  useEffect(() => {
    const loadSimulatedDate = async () => {
      try {
        const res = await fetch('/api/simulated-date')
        const data = await res.json()
        if (data.simulated && data.date) {
          setSimulatedDate(data.date)
        }
      } catch (err) {
        // No hay fecha simulada activa
      }
    }
    loadSimulatedDate()
  }, [])

  useEffect(() => {
    if (!authLoading && user) {
      // Verificar que tenga modoPago activado
      if (!user.modoPago) {
        router.push('/home')
        return
      }

      loadDatosPago(user)
    }
  }, [authLoading, user, router, simulatedDate])

  const loadDatosPago = async (userData: any) => {
    setLoading(true)
    try {
      // Enviar fecha simulada global si existe
      const simulatedDateParam = simulatedDate ? `?simulatedDate=${simulatedDate}` : ''
      
      const response = await fetch(`/api/datos-pago${simulatedDateParam}`, {
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

      // Si requiere dar visto bueno, verificar el estado actual
      if (data.darVistoBueno) {
        // Usar el mes actual de datos de pago (mes de las horas trabajadas)
        const mes = data.mesActualISO
        
        const checkResponse = await fetch(`/api/visto-bueno?mes=${mes}`, {
          headers: {
            'x-user-id': String(userData.id),
            'x-tipo-cliente': userData.tipo || 'cliente'
          }
        })

        if (checkResponse.ok) {
          const checkData = await checkResponse.json()
          // Usar el nuevo campo estado
          const estado = checkData.estado as EstadoVistoBueno || 'pendiente'
          setEstadoVistoBueno(estado)
          setVistoBuenoDado(estado === 'aprobado')
        }
      }
    } catch (error) {
      alert('Error al cargar los datos de pago')
    } finally {
      setLoading(false)
    }
  }

  const handleDarVistoBueno = async () => {
    if (!user || !datosPago) return

    // Si el estado era rechazado, mostrar modal de confirmación
    if (estadoVistoBueno === 'rechazado') {
      setShowReaprobarModal(true)
      return
    }

    await ejecutarAprobacion()
  }

  const ejecutarAprobacion = async () => {
    if (!user || !datosPago) return

    setLoadingVistoBueno(true)
    setShowReaprobarModal(false)
    
    try {
      // Usar el mes de las horas trabajadas
      const mes = datosPago.mesActualISO
      // Usar fecha simulada si existe, sino fecha actual
      const fechaActual = simulatedDate ? new Date(simulatedDate + 'T12:00:00') : new Date()
      
      const response = await fetch('/api/visto-bueno', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(user.id),
          'x-tipo-cliente': user.tipo || 'cliente'
        },
        body: JSON.stringify({ 
          mes,
          fechaSimulada: fechaActual.toISOString()
        })
      })

      if (!response.ok) {
        throw new Error('Error al dar visto bueno')
      }

      const data = await response.json()
      if (data.success) {
        setVistoBuenoDado(true)
        setEstadoVistoBueno('aprobado')
        setToastMessage('Visto bueno registrado correctamente')
        setShowToast(true)
        setTimeout(() => setShowToast(false), 3000)
      }
    } catch (error) {
      setToastMessage('Error al registrar el visto bueno')
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3000)
    } finally {
      setLoadingVistoBueno(false)
    }
  }

  // Abrir modal de rechazo
  const handleAbrirRechazoModal = () => {
    setMotivoRechazo('')
    setArchivoRechazo(null)
    setErrorRechazo('')
    setShowRechazoModal(true)
  }

  // Enviar rechazo
  const handleEnviarRechazo = async () => {
    if (!user || !datosPago) return

    // Validar motivo
    if (motivoRechazo.trim().length < 20) {
      setErrorRechazo('El motivo debe tener al menos 20 caracteres')
      return
    }

    if (motivoRechazo.trim().length > 500) {
      setErrorRechazo('El motivo no puede exceder 500 caracteres')
      return
    }

    // Validar archivo si existe
    if (archivoRechazo) {
      const maxSize = 3 * 1024 * 1024 // 3MB
      if (archivoRechazo.size > maxSize) {
        setErrorRechazo('El archivo es demasiado grande. Máximo 3MB')
        return
      }

      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
      if (!allowedTypes.includes(archivoRechazo.type)) {
        setErrorRechazo('Solo se permiten archivos PDF, JPG o PNG')
        return
      }
    }

    setLoadingRechazo(true)
    setErrorRechazo('')

    try {
      const mes = datosPago.mesActualISO
      const fechaActual = simulatedDate ? new Date(simulatedDate + 'T12:00:00') : new Date()

      const formData = new FormData()
      formData.append('mes', mes)
      formData.append('motivo', motivoRechazo.trim())
      formData.append('fechaSimulada', fechaActual.toISOString())
      
      if (archivoRechazo) {
        formData.append('archivo', archivoRechazo)
      }

      const response = await fetch('/api/visto-bueno/rechazar', {
        method: 'POST',
        headers: {
          'x-user-id': String(user.id),
          'x-tipo-cliente': user.tipo || 'cliente'
        },
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        setErrorRechazo(data.error || 'Error al registrar el rechazo')
        return
      }

      if (data.success) {
        setShowRechazoModal(false)
        setEstadoVistoBueno('rechazado')
        setVistoBuenoDado(false)
        setToastMessage('Rechazo registrado. Un administrador revisará tu caso.')
        setShowToast(true)
        setTimeout(() => setShowToast(false), 4000)
      }
    } catch (error) {
      setErrorRechazo('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoadingRechazo(false)
    }
  }

  // Manejar selección de archivo
  const handleArchivoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setArchivoRechazo(file)
      setErrorRechazo('')
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
  const tieneGastos = datosPago.gastos && datosPago.gastos.length > 0
  const tieneGastosAnteriores = datosPago.gastosPendientesAnteriores && datosPago.gastosPendientesAnteriores.length > 0
  const tieneServiciosProfesionales = datosPago.serviciosProfesionales && datosPago.serviciosProfesionales.length > 0
  // Mostrar contenido si hay cualquier tipo de dato de pago (incluyendo gastos de meses anteriores)
  const tieneContenidoPago = tieneTrabajosHora || tieneMensualidades || tieneGastos || tieneGastosAnteriores || tieneServiciosProfesionales

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
        {tieneContenidoPago && (
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
              
              {/* Gastos del Mes - solo mostrar si hay gastos o si no hay gastos anteriores */}
              {(tieneGastos || !tieneGastosAnteriores) && (
                <div className={styles.costoItem}>
                  <span>Gastos del Mes:</span>
                  <strong>{formatMonto(datosPago.totalGastos)}</strong>
                </div>
              )}
              
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
              
              {/* Gastos de meses anteriores (pendientes de pago) */}
              {tieneGastosAnteriores && (
                <>
                  {tieneGastos && <div className={styles.divider} />}
                  <div className={`${styles.costoItem} ${styles.costoItemAlerta}`}>
                    <span>⚠️ Gastos de Meses Anteriores:</span>
                    <strong className={styles.montoAlerta}>{formatMonto(datosPago.totalGastosPendientesAnteriores)}</strong>
                  </div>
                  
                  {/* Detalle de gastos pendientes anteriores */}
                  <div className={`${styles.detalleGastos} ${styles.gastosAnteriores}`}>
                    {datosPago.gastosPendientesAnteriores.map((gasto) => (
                      <div key={gasto.id} className={`${styles.gastoItem} ${styles.gastoItemAnterior}`}>
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
                </>
              )}
              
              {/* Servicios Profesionales */}
              {datosPago.serviciosProfesionales && datosPago.serviciosProfesionales.length > 0 && (
                <>
                  <div className={styles.divider} />
                  <div className={styles.costoItem}>
                    <span>Servicios Profesionales:</span>
                    <strong>{formatMonto(datosPago.totalServiciosProfesionales)}</strong>
                  </div>
                  
                  {/* Detalle de servicios profesionales */}
                  <div className={styles.detalleGastos}>
                    {datosPago.serviciosProfesionales.map((servicio) => (
                      <div key={servicio.id} className={styles.gastoItem}>
                        <div className={styles.gastoInfo}>
                          <span className={styles.gastoProducto}>
                            {servicio.lista_servicios?.titulo || 'Servicio sin título'}
                          </span>
                          <span className={styles.gastoMeta}>
                            {formatFecha(servicio.fecha)} • {servicio.funcionarios?.nombre || 'Sin responsable'}
                          </span>
                        </div>
                        <span className={styles.gastoMonto}>{formatMonto(servicio.total)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              
              <div className={styles.divider} />
              
              {/* Subtotal */}
              <div className={styles.costoItem + ' ' + styles.destacado}>
                <span>Subtotal:</span>
                <strong>{formatMonto(datosPago.subtotal)}</strong>
              </div>
              
              {/* IVA - solo mostrar si hay IVA */}
              {datosPago.montoIVA > 0 && (
                <div className={styles.costoItem}>
                  <span>IVA ({(datosPago.ivaPerc * 100).toFixed(0)}%):</span>
                  <strong>{formatMonto(datosPago.montoIVA)}</strong>
                </div>
              )}
              
              <div className={styles.divider + ' ' + styles.dividerBold} />
              
              {/* Total de esta empresa */}
              <div className={styles.costoItem + ' ' + styles.total}>
                <span>{datosPago.esGrupoPrincipal ? `TOTAL ${datosPago.nombreCliente?.toUpperCase() || 'EMPRESA PRINCIPAL'}:` : 'TOTAL A PAGAR:'}</span>
                <strong>{formatMonto(datosPago.totalAPagar)}</strong>
              </div>
            </div>
          </section>
        )}
        
        {/* Sección de Empresas del Grupo */}
        {datosPago && datosPago.esGrupoPrincipal && datosPago.empresasDelGrupo && datosPago.empresasDelGrupo.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>📊 Empresas Asociadas al Grupo</h2>
            <p className={styles.sectionSubtitle}>
              Como empresa principal del grupo, también se incluyen los costos de las siguientes empresas:
            </p>
            
            {datosPago.empresasDelGrupo.map((empresaGrupo) => (
              <div key={empresaGrupo.empresaId} className={styles.empresaGrupoCard}>
                <div className={styles.empresaGrupoHeader}>
                  <h3 className={styles.empresaGrupoNombre}>{empresaGrupo.empresaNombre}</h3>
                  <span className={styles.empresaGrupoIva}>IVA: {(empresaGrupo.ivaPerc * 100).toFixed(0)}%</span>
                </div>
                
                <div className={styles.empresaGrupoDetalles}>
                  {/* Trabajos por hora */}
                  {empresaGrupo.totalHoras > 0 && (
                    <div className={styles.costoItem}>
                      <span>Horas trabajadas ({empresaGrupo.totalHoras.toFixed(1)}h):</span>
                      <strong>{formatMonto(empresaGrupo.costoServicios)}</strong>
                    </div>
                  )}
                  
                  {/* Mensualidades */}
                  {empresaGrupo.totalMensualidades > 0 && (
                    <div className={styles.costoItem}>
                      <span>Mensualidades:</span>
                      <strong>{formatMonto(empresaGrupo.totalMensualidades)}</strong>
                    </div>
                  )}
                  
                  {/* Gastos */}
                  {empresaGrupo.totalGastos > 0 && (
                    <div className={styles.costoItem}>
                      <span>Gastos:</span>
                      <strong>{formatMonto(empresaGrupo.totalGastos)}</strong>
                    </div>
                  )}
                  
                  {/* Gastos de meses anteriores */}
                  {empresaGrupo.totalGastosPendientesAnteriores > 0 && (
                    <div className={`${styles.costoItem} ${styles.costoItemAlerta}`}>
                      <span>⚠️ Gastos de Meses Anteriores:</span>
                      <strong className={styles.montoAlerta}>{formatMonto(empresaGrupo.totalGastosPendientesAnteriores)}</strong>
                    </div>
                  )}
                  
                  {/* Servicios Profesionales */}
                  {empresaGrupo.totalServiciosProfesionales > 0 && (
                    <div className={styles.costoItem}>
                      <span>Servicios Profesionales:</span>
                      <strong>{formatMonto(empresaGrupo.totalServiciosProfesionales)}</strong>
                    </div>
                  )}
                  
                  <div className={styles.divider} />
                  
                  {/* Subtotal de la empresa */}
                  <div className={styles.costoItem}>
                    <span>Subtotal:</span>
                    <strong>{formatMonto(empresaGrupo.subtotal)}</strong>
                  </div>
                  
                  {/* IVA de la empresa */}
                  {empresaGrupo.montoIVA > 0 && (
                    <div className={styles.costoItem}>
                      <span>IVA ({(empresaGrupo.ivaPerc * 100).toFixed(0)}%):</span>
                      <strong>{formatMonto(empresaGrupo.montoIVA)}</strong>
                    </div>
                  )}
                  
                  {/* Total de la empresa */}
                  <div className={styles.costoItem + ' ' + styles.destacado}>
                    <span>Total {empresaGrupo.empresaNombre}:</span>
                    <strong>{formatMonto(empresaGrupo.total)}</strong>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Total del Grupo */}
            <div className={styles.granTotalGrupo}>
              <div className={styles.divider + ' ' + styles.dividerBold} />
              <div className={styles.costoItem + ' ' + styles.total + ' ' + styles.granTotal}>
                <span>🏢 TOTAL DEL GRUPO:</span>
                <strong>
                  {formatMonto(datosPago.granTotalAPagar || 0)}
                </strong>
              </div>
              <p className={styles.granTotalDetalle}>
                Incluye: {datosPago.nombreCliente} + {datosPago.empresasDelGrupo?.map(eg => eg.empresaNombre).join(' + ')}
              </p>
            </div>
          </section>
        )}

        {/* Mensualidades */}
        {tieneMensualidades && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Mensualidades</h2>
            
            <div className={styles.mensualidadesGrid}>
              {datosPago.solicitudesMensuales.map((solicitud) => {
                const montoCuota = solicitud.monto_por_cuota || 0
                
                // Si se_cobra_iva = true, el monto incluye IVA, extraerlo para mostrar
                let subtotalCuota = montoCuota
                let ivaCuota = 0
                
                if (solicitud.se_cobra_iva) {
                  subtotalCuota = montoCuota / (1 + datosPago.ivaPerc)
                  ivaCuota = montoCuota - subtotalCuota
                }
                
                return (
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
                    
                    <div className={styles.mensualidadDetalle}>
                      {solicitud.se_cobra_iva ? (
                        <>
                          <div className={styles.mensualidadMontoRow}>
                            <span>Subtotal:</span>
                            <span>{formatMonto(subtotalCuota)}</span>
                          </div>
                          <div className={styles.mensualidadMontoRow}>
                            <span>IVA ({(datosPago.ivaPerc * 100).toFixed(0)}%):</span>
                            <span>{formatMonto(ivaCuota)}</span>
                          </div>
                        </>
                      ) : (
                        <div className={styles.mensualidadMontoRow}>
                          <span>Cuota:</span>
                          <span>{formatMonto(montoCuota)}</span>
                        </div>
                      )}
                      <div className={styles.mensualidadMonto}>
                        {formatMonto(montoCuota)}
                      </div>
                    </div>
                  </div>
                )
              })}
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

        {/* Mensaje de rechazo activo */}
        {estadoVistoBueno === 'rechazado' && datosPago?.darVistoBueno && (
          <div className={styles.rechazoActivo}>
            <div className={styles.rechazoActivoIcon}>⚠️</div>
            <div className={styles.rechazoActivoContent}>
              <h3>Has rechazado las horas registradas</h3>
              <p>
                Revisa nuevamente los detalles y vuelve a aprobar si todo está correcto,
                o espera a que un administrador resuelva tu caso.
              </p>
            </div>
          </div>
        )}

        {/* Botón de acción */}
        {tieneContenidoPago && (
          <div className={styles.actionSection}>
            {/* Estado: Rechazado - mostrar botón para re-aprobar */}
            {datosPago?.darVistoBueno && estadoVistoBueno === 'rechazado' && (
              <div className={styles.vistoBuenoContainer}>
                <button 
                  className={styles.vistoBuenoButtonReaprobar}
                  onClick={handleDarVistoBueno}
                  disabled={loadingVistoBueno}
                >
                  {loadingVistoBueno ? 'Procesando...' : '🔄 Re-aprobar Horas (Revisa Cuidadosamente)'}
                </button>
              </div>
            )}

            {/* Estado: Pendiente - mostrar botones de confirmar/rechazar */}
            {datosPago?.darVistoBueno && estadoVistoBueno === 'pendiente' && (
              <div className={styles.vistoBuenoContainer}>
                <button 
                  className={styles.vistoBuenoButtonConfirm}
                  onClick={handleDarVistoBueno}
                  disabled={loadingVistoBueno}
                >
                  {loadingVistoBueno ? 'Procesando...' : 'Confirmar Horas'}
                </button>
                <button 
                  className={styles.vistoBuenoButtonCancel}
                  onClick={handleAbrirRechazoModal}
                  disabled={loadingVistoBueno}
                >
                  No Confirmar
                </button>
              </div>
            )}

            {/* Estado: Aprobado o no requiere visto bueno - mostrar botón de pago */}
            {(!datosPago?.darVistoBueno || estadoVistoBueno === 'aprobado') && (
              <button 
                className={styles.pagarButton}
                onClick={() => router.push('/pago/comprobante')}
              >
                Proceder al Pago
              </button>
            )}
          </div>
        )}

        {/* Modal de Rechazo */}
        {showRechazoModal && (
          <div className={styles.modalOverlay} onClick={() => setShowRechazoModal(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>¿Por qué rechazas estas horas?</h2>
                <button 
                  className={styles.modalClose} 
                  onClick={() => setShowRechazoModal(false)}
                  disabled={loadingRechazo}
                >
                  ✕
                </button>
              </div>
              
              <div className={styles.modalBody}>
                <p className={styles.modalDescription}>
                  Describe el problema que encontraste con las horas registradas.
                  Un administrador revisará tu caso.
                </p>
                
                <div className={styles.formGroup}>
                  <label htmlFor="motivo">Motivo del rechazo *</label>
                  <textarea
                    id="motivo"
                    className={styles.textarea}
                    placeholder="Describe detalladamente el problema encontrado..."
                    value={motivoRechazo}
                    onChange={(e) => setMotivoRechazo(e.target.value)}
                    maxLength={500}
                    rows={4}
                    disabled={loadingRechazo}
                  />
                  <div className={styles.charCount}>
                    {motivoRechazo.length}/500 caracteres
                    {motivoRechazo.length < 20 && motivoRechazo.length > 0 && (
                      <span className={styles.charCountWarning}> (mínimo 20)</span>
                    )}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="archivo">Archivo de respaldo (opcional)</label>
                  <input
                    type="file"
                    id="archivo"
                    className={styles.fileInput}
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleArchivoChange}
                    disabled={loadingRechazo}
                  />
                  <p className={styles.fileHint}>
                    Máximo 3MB. Solo PDF, JPG o PNG.
                  </p>
                  {archivoRechazo && (
                    <div className={styles.filePreview}>
                      📎 {archivoRechazo.name} ({(archivoRechazo.size / 1024).toFixed(1)} KB)
                      <button 
                        type="button" 
                        className={styles.fileRemove}
                        onClick={() => setArchivoRechazo(null)}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {errorRechazo && (
                  <div className={styles.errorMessage}>
                    {errorRechazo}
                  </div>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button 
                  className={styles.modalButtonCancel}
                  onClick={() => setShowRechazoModal(false)}
                  disabled={loadingRechazo}
                >
                  Cancelar
                </button>
                <button 
                  className={styles.modalButtonSubmit}
                  onClick={handleEnviarRechazo}
                  disabled={loadingRechazo || motivoRechazo.trim().length < 20}
                >
                  {loadingRechazo ? 'Enviando...' : 'Enviar Rechazo'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Confirmación para Re-aprobar */}
        {showReaprobarModal && (
          <div className={styles.modalOverlay} onClick={() => setShowReaprobarModal(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>⚠️ Confirmar Re-aprobación</h2>
                <button 
                  className={styles.modalClose} 
                  onClick={() => setShowReaprobarModal(false)}
                  disabled={loadingVistoBueno}
                >
                  ✕
                </button>
              </div>
              
              <div className={styles.modalBody}>
                <div className={styles.warningBox}>
                  <p><strong>Anteriormente rechazaste estas horas.</strong></p>
                  <p>
                    Por favor, revisa <strong>COMPLETAMENTE</strong> todos los detalles 
                    de las horas trabajadas antes de aprobar.
                  </p>
                  <p>¿Estás seguro de que ahora todo está correcto?</p>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button 
                  className={styles.modalButtonCancel}
                  onClick={() => setShowReaprobarModal(false)}
                  disabled={loadingVistoBueno}
                >
                  Cancelar
                </button>
                <button 
                  className={styles.modalButtonConfirm}
                  onClick={ejecutarAprobacion}
                  disabled={loadingVistoBueno}
                >
                  {loadingVistoBueno ? 'Procesando...' : 'Sí, Aprobar Ahora'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {showToast && (
          <div className={styles.toast}>
            {toastMessage}
          </div>
        )}
      </main>
    </div>
  )
}
