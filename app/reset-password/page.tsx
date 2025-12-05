'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import styles from './reset.module.css'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [validando, setValidando] = useState(true)
  const [tokenValido, setTokenValido] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState(false)

  // Validar token al cargar
  useEffect(() => {
    const validarToken = async () => {
      if (!token) {
        setValidando(false)
        return
      }

      try {
        const response = await fetch(`/api/reset-password?token=${token}`)
        const data = await response.json()

        if (data.valid) {
          setTokenValido(true)
        }
      } catch (err) {
        console.error('Error validando token:', err)
      } finally {
        setValidando(false)
      }
    }

    validarToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!password.trim() || !confirmPassword.trim()) {
      setError('Por favor completa todos los campos')
      return
    }

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password }),
      })

      const data = await response.json()

      if (data.success) {
        setExito(true)
      } else {
        setError(data.error || 'Error al cambiar la contraseña')
      }
    } catch (err) {
      console.error('Error:', err)
      setError('Error de conexión. Intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  // Estado de carga inicial
  if (validando) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.loadingState}>
            <div className={styles.spinnerLarge}></div>
            <p>Validando enlace...</p>
          </div>
        </div>
      </div>
    )
  }

  // Token inválido o no proporcionado
  if (!token || !tokenValido) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.errorIcon}>⚠️</div>
          <h1 className={styles.title}>Enlace inválido</h1>
          <p className={styles.message}>
            El enlace de recuperación ha expirado o no es válido.
            Por favor solicita uno nuevo.
          </p>
          <Link href="/recuperar-password" className={styles.backButton}>
            Solicitar nuevo enlace
          </Link>
        </div>
      </div>
    )
  }

  // Éxito al cambiar contraseña
  if (exito) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.successIcon}>✅</div>
          <h1 className={styles.title}>¡Contraseña actualizada!</h1>
          <p className={styles.message}>
            Tu contraseña ha sido cambiada exitosamente.
            Ya puedes iniciar sesión con tu nueva contraseña.
          </p>
          <Link href="/login" className={styles.backButton}>
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    )
  }

  // Formulario de nueva contraseña
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoSection}>
          <div className={styles.logoCircle}>
            <span className={styles.logoText}>FL</span>
          </div>
          <h1 className={styles.title}>Nueva contraseña</h1>
          <p className={styles.subtitle}>
            Ingresa tu nueva contraseña
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>
              Nueva contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className={styles.input}
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="confirmPassword" className={styles.label}>
              Confirmar contraseña
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              className={styles.input}
              placeholder="Repite la contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={styles.submitButton}
          >
            {loading ? (
              <div className={styles.loadingSpinner}>
                <div className={styles.spinner}></div>
                Guardando...
              </div>
            ) : (
              'Cambiar contraseña'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ResetPassword() {
  return (
    <Suspense fallback={
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.loadingState}>
            <div className={styles.spinnerLarge}></div>
            <p>Cargando...</p>
          </div>
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
