'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import styles from './home.module.css'

interface User {
  id: number
  id_sheets?: string
  nombre: string
  cedula: number
  tipo?: 'cliente' | 'empresa'
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

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [casos, setCasos] = useState<Caso[]>([])
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCasos, setLoadingCasos] = useState(false)
  const [loadingSolicitudes, setLoadingSolicitudes] = useState(false)
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
      loadCasos(parsedUser)
      loadSolicitudes(parsedUser)
    } catch (error) {
      console.error('Error al parsear datos del usuario:', error)
      localStorage.removeItem('user')
      router.push('/login')
    }
  }, [router])

  const loadCasos = async (userData: User) => {
    setLoadingCasos(true)
    try {
      // Obtener el id_cliente correcto
      const idCliente = userData.id_sheets || userData.id?.toString()
      
      // Buscar casos donde id_cliente coincida
      const response = await fetch(`/api/casos?id_cliente=${idCliente}`)
      const data = await response.json()
      
      if (data.casos) {
        setCasos(data.casos)
      }
    } catch (error) {
      console.error('Error al cargar casos:', error)
    } finally {
      setLoadingCasos(false)
    }
  }

  const loadSolicitudes = async (userData: User) => {
    setLoadingSolicitudes(true)
    try {
      // Obtener el id_cliente correcto
      const idCliente = userData.id_sheets || userData.id?.toString()
      
      // Buscar solicitudes donde id_cliente coincida
      const response = await fetch(`/api/solicitudes?id_cliente=${idCliente}`)
      const data = await response.json()
      
      if (data.solicitudes) {
        setSolicitudes(data.solicitudes)
      }
    } catch (error) {
      console.error('Error al cargar solicitudes:', error)
    } finally {
      setLoadingSolicitudes(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('user')
    router.push('/login')
  }

  const handleCasoClick = (casoId: string) => {
    router.push(`/caso/${casoId}`)
  }

  const handleSolicitudClick = (solicitudId: string) => {
    router.push(`/solicitud/${solicitudId}`)
  }

  const getEstadoColor = (estado: string) => {
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
          <button onClick={handleLogout} className={styles.logoutButton}>
            Cerrar Sesión
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className={styles.main}>
        {/* Sección de Solicitudes */}
        <div className={styles.casosSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Mis Solicitudes</h2>
            <span className={styles.casosCount}>{solicitudes.length} {solicitudes.length === 1 ? 'solicitud' : 'solicitudes'}</span>
          </div>

          {loadingSolicitudes ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>Cargando solicitudes...</p>
            </div>
          ) : solicitudes.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyText}>No tienes solicitudes asignadas</p>
            </div>
          ) : (
            <div className={styles.casosGrid}>
              {solicitudes.map((solicitud) => (
                <div
                  key={solicitud.id}
                  className={styles.casoCard}
                  onClick={() => handleSolicitudClick(solicitud.id)}
                >
                  <div className={styles.casoHeader}>
                    <h3 className={styles.casoNombre}>{solicitud.titulo || 'Sin título'}</h3>
                    <span
                      className={styles.casoEstado}
                      style={{ 
                        backgroundColor: solicitud.estado_pago === 'Pagado' ? '#4ade80' : 
                                        solicitud.estado_pago === 'En Proceso' ? '#FAD02C' : '#94a3b8'
                      }}
                    >
                      {solicitud.estado_pago || 'Sin estado'}
                    </span>
                  </div>
                  {solicitud.etapa_actual && (
                    <p className={styles.casoExpediente}>
                      Etapa: {solicitud.etapa_actual}
                    </p>
                  )}
                  {solicitud.total_a_pagar && (
                    <p className={styles.casoExpediente}>
                      Total: ₡{solicitud.total_a_pagar.toLocaleString('es-CR')}
                    </p>
                  )}
                  <div className={styles.casoFooter}>
                    <span className={styles.verDetalle}>Ver detalles →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sección de Casos */}
        <div className={styles.casosSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Mis Casos</h2>
            <span className={styles.casosCount}>{casos.length} {casos.length === 1 ? 'caso' : 'casos'}</span>
          </div>

          {loadingCasos ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>Cargando casos...</p>
            </div>
          ) : casos.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyText}>No tienes casos asignados</p>
            </div>
          ) : (
            <div className={styles.casosGrid}>
              {casos.map((caso) => (
                <div
                  key={caso.id}
                  className={styles.casoCard}
                  onClick={() => handleCasoClick(caso.id)}
                >
                  <div className={styles.casoHeader}>
                    <h3 className={styles.casoNombre}>{caso.nombre}</h3>
                    <span
                      className={styles.casoEstado}
                      style={{ backgroundColor: getEstadoColor(caso.estado) }}
                    >
                      {caso.estado || 'Sin estado'}
                    </span>
                  </div>
                  {caso.expediente && (
                    <p className={styles.casoExpediente}>
                      Expediente: {caso.expediente}
                    </p>
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