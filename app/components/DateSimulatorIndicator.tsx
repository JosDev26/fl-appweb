'use client'

import { useEffect, useState } from 'react'
import { getCurrentDate, isDateSimulated } from '@/lib/dateSimulator'
import styles from './DateSimulatorIndicator.module.css'

export default function DateSimulatorIndicator() {
  const [isSimulated, setIsSimulated] = useState(false)
  const [currentDate, setCurrentDate] = useState<Date>(new Date())

  useEffect(() => {
    // Actualizar estado inicial
    updateDateState()

    // Escuchar cambios en localStorage (cuando se activa/desactiva desde /dev)
    const handleStorageChange = () => {
      updateDateState()
    }

    window.addEventListener('storage', handleStorageChange)

    // También verificar cada segundo por si cambia la fecha simulada
    const interval = setInterval(updateDateState, 1000)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
    }
  }, [])

  const updateDateState = () => {
    setIsSimulated(isDateSimulated())
    setCurrentDate(getCurrentDate())
  }

  if (!isSimulated) {
    return null // No mostrar nada si no hay simulación activa
  }

  return (
    <div className={styles.indicator}>
      <div className={styles.icon}>🕐</div>
      <div className={styles.content}>
        <div className={styles.title}>Fecha Simulada</div>
        <div className={styles.date}>
          {currentDate.toLocaleDateString('es-ES', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          })}
        </div>
      </div>
      <a href="/dev" className={styles.link} title="Ir al panel de desarrollo">
        ⚙️
      </a>
    </div>
  )
}
