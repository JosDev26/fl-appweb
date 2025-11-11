'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: number
  nombre: string
  cedula: number
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Verificar si hay un usuario logueado
    const userData = localStorage.getItem('user')
    
    if (!userData) {
      // Si no hay usuario, redirigir al login
      router.push('/login')
      return
    }

    try {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
    } catch (error) {
      console.error('Error al parsear datos del usuario:', error)
      localStorage.removeItem('user')
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('user')
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // El useEffect se encargará de redirigir
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header con botón de logout */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-xl font-semibold text-gray-900">Panel de Usuario</h1>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 80px)' }}>
        <div className="text-center">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
            <div className="mb-4">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
              </div>
            </div>
            
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Bienvenido
            </h1>
            
            <p className="text-2xl text-indigo-600 font-semibold">
              {user.nombre}
            </p>
            
            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Identificación: {user.cedula}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}