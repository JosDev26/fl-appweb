'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  nombre: string
  cedula: string
  tipo: 'cliente' | 'empresa'
  modoPago?: boolean
  tarifa_hora?: number
  iva_perc?: number
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchUser()
  }, [])

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (!response.ok) {
        router.push('/login')
        return
      }

      const data = await response.json()
      setUser(data.user)
    } catch (error) {
      console.error('Error al obtener usuario:', error)
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' })
      router.push('/login')
    } catch (error) {
      console.error('Error al cerrar sesión:', error)
      router.push('/login')
    }
  }

  return { user, loading, logout, refetch: fetchUser }
}
