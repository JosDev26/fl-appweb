'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function CrearCuenta() {
  const [identificacion, setIdentificacion] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!identificacion.trim()) {
      setError('Por favor ingrese su identificación')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/validar-identificacion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identificacion: identificacion.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al validar identificación')
      }

      if (data.exists) {
        // Redirigir a la página para crear contraseña
        router.push(`/crearcuenta/password?id=${encodeURIComponent(identificacion.trim())}`)
      } else {
        setError('La identificación no se encuentra registrada en el sistema')
      }
    } catch (error) {
      console.error('Error:', error)
      setError(error instanceof Error ? error.message : 'Error al validar identificación')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Crear Cuenta
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Ingrese su número de identificación para continuar
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="identificacion" className="sr-only">
              Identificación
            </label>
            <input
              id="identificacion"
              name="identificacion"
              type="text"
              required
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              placeholder="Número de identificación"
              value={identificacion}
              onChange={(e) => setIdentificacion(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Verificando...' : 'Continuar'}
            </button>
          </div>

          <div className="text-center">
            <Link 
              href="/login" 
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              ¿Ya tienes cuenta? Iniciar sesión
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}