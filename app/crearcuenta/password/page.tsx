'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface PasswordValidation {
  hasMinLength: boolean
  hasUpperCase: boolean
  hasLowerCase: boolean
  hasNumber: boolean
  hasSpecialChar: boolean
}

function CrearPasswordForm() {
  const [identificacion, setIdentificacion] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [validation, setValidation] = useState<PasswordValidation>({
    hasMinLength: false,
    hasUpperCase: false,
    hasLowerCase: false,
    hasNumber: false,
    hasSpecialChar: false
  })
  
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const id = searchParams.get('id')
    if (!id) {
      router.push('/crearcuenta')
      return
    }
    setIdentificacion(id)
  }, [searchParams, router])

  const validatePassword = (pwd: string): PasswordValidation => {
    return {
      hasMinLength: pwd.length >= 8,
      hasUpperCase: /[A-Z]/.test(pwd),
      hasLowerCase: /[a-z]/.test(pwd),
      hasNumber: /\d/.test(pwd),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(pwd)
    }
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value
    setPassword(newPassword)
    setValidation(validatePassword(newPassword))
    setError('')
  }

  const isPasswordValid = (): boolean => {
    return Object.values(validation).every(Boolean)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!password || !confirmPassword) {
      setError('Por favor complete todos los campos')
      return
    }

    if (!isPasswordValid()) {
      setError('La contraseña no cumple con los requisitos de seguridad')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/crear-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          identificacion,
          password 
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear contraseña')
      }

      // Mostrar mensaje de éxito y redirigir
      alert('Contraseña creada exitosamente. Su cuenta ha sido activada.')
      router.push('/')
      
    } catch (error) {
      console.error('Error:', error)
      setError(error instanceof Error ? error.message : 'Error al crear contraseña')
    } finally {
      setLoading(false)
    }
  }

  const ValidationItem = ({ isValid, text }: { isValid: boolean; text: string }) => (
    <div className={`flex items-center text-sm ${isValid ? 'text-green-600' : 'text-red-600'}`}>
      <span className="mr-2">{isValid ? '✓' : '✗'}</span>
      {text}
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Crear Contraseña
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Configure una contraseña segura para su cuenta
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Campo de identificación (solo lectura) */}
            <div>
              <label htmlFor="identificacion-readonly" className="block text-sm font-medium text-gray-700">
                Identificación
              </label>
              <input
                id="identificacion-readonly"
                type="text"
                value={identificacion}
                readOnly
                className="mt-1 appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 bg-gray-100 text-gray-900 sm:text-sm"
              />
            </div>

            {/* Campo de contraseña */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="mt-1 appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Ingrese su contraseña"
                value={password}
                onChange={handlePasswordChange}
                disabled={loading}
              />
            </div>

            {/* Campo de confirmar contraseña */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirmar Contraseña
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className="mt-1 appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Confirme su contraseña"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setError('')
                }}
                disabled={loading}
              />
            </div>
          </div>

          {/* Validaciones de contraseña */}
          {password && (
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Requisitos de contraseña:</h4>
              <div className="space-y-1">
                <ValidationItem isValid={validation.hasMinLength} text="Mínimo 8 caracteres" />
                <ValidationItem isValid={validation.hasUpperCase} text="Una letra mayúscula" />
                <ValidationItem isValid={validation.hasLowerCase} text="Una letra minúscula" />
                <ValidationItem isValid={validation.hasNumber} text="Un número" />
                <ValidationItem isValid={validation.hasSpecialChar} text="Un carácter especial (!@#$%^&*)" />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading || !isPasswordValid() || !password || !confirmPassword}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creando contraseña...' : 'Crear Contraseña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CrearPassword() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    }>
      <CrearPasswordForm />
    </Suspense>
  )
}