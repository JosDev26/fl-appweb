'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import styles from './caso.module.css'

interface Caso {
  id: string
  nombre: string
  estado: string | null
  expediente: string | null
  id_cliente: string | null
  created_at: string
  updated_at: string
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

interface User {
  id: number
  id_sheets?: string
  nombre: string
  cedula?: number
  tipo: 'cliente' | 'empresa'
}

export default function CasoDetalle() {
  const [caso, setCaso] = useState<Caso | null>(null)
  const [trabajos, setTrabajos] = useState<Trabajo[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const params = useParams()
  const casoId = params.id as string

  useEffect(() => {
    // Verificar autenticación
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/login')
      return
    }

    loadCasoDetalle()
  }, [casoId, router])

  const loadCasoDetalle = async () => {
    try {
      // Obtener usuario actual
      const userData = localStorage.getItem('user')
      if (!userData) {
        router.push('/login')
        return
      }

      const user: User = JSON.parse(userData)
      const userIdCliente = user.id_sheets || String(user.id)

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
      </main>
    </div>
  )
}
