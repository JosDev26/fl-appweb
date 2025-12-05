'use client'

import { useState } from 'react'
import Link from 'next/link'
import styles from './recuperar.module.css'

export default function RecuperarPassword() {
  const [correo, setCorreo] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!correo.trim()) {
      setError('Por favor ingresa tu correo electrónico')
      return
    }

    // Validación básica de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(correo.trim())) {
      setError('Por favor ingresa un correo electrónico válido')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/recuperar-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ correoReportes: correo.trim() }),
      })

      const data = await response.json()

      if (data.success) {
        setEnviado(true)
      } else {
        setError(data.error || 'Ocurrió un error. Intenta nuevamente.')
      }
    } catch (err) {
      console.error('Error:', err)
      setError('Error de conexión. Intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  if (enviado) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.successIcon}>✉️</div>
          <h1 className={styles.title}>Revisa tu correo</h1>
          <p className={styles.message}>
            Si el correo está registrado en nuestro sistema, recibirás un enlace 
            para restablecer tu contraseña.
          </p>
          <p className={styles.hint}>
            Revisa también tu carpeta de spam o correo no deseado.
          </p>
          <Link href="/login" className={styles.backButton}>
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoSection}>
          <div className={styles.logoCircle}>
            <span className={styles.logoText}>FL</span>
          </div>
          <h1 className={styles.title}>¿Olvidaste tu contraseña?</h1>
          <p className={styles.subtitle}>
            Ingresa el correo electrónico de reportes asociado a tu cuenta
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="correo" className={styles.label}>
              Correo de reportes
            </label>
            <input
              id="correo"
              name="correo"
              type="email"
              required
              className={styles.input}
              placeholder="ejemplo@correo.com"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
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
                Enviando...
              </div>
            ) : (
              'Enviar enlace de recuperación'
            )}
          </button>
        </form>
        
        <div className={styles.footer}>
          <Link href="/login" className={styles.link}>
            ← Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  )
}
