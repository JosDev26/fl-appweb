'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import styles from './home.module.css'

interface User {
  id: number
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

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [casos, setCasos] = useState<Caso[]>([])
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [casosUnificados, setCasosUnificados] = useState<CasoUnificado[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Verificar si hay un usuario logueado
    const userData = localStorage.getItem('user')
    
    if (!userData) {
      router.push('/login')
      return
    }

    try {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      setLoading(false)
      
      // Cargar casos y solicitudes del usuario
      loadData(parsedUser)
    } catch (error) {
      console.error('Error al parsear datos del usuario:', error)
      localStorage.removeItem('user')
      router.push('/login')
    }
  }, [router])

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

  const handleLogout = () => {
    localStorage.removeItem('user')
    router.push('/login')
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
            {user.modoPago && (
              <button onClick={() => router.push('/pago')} className={styles.pagoButton}>
                💳 Ir a pagar
              </button>
            )}
            <button onClick={handleLogout} className={styles.logoutButton}>
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