'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from './login.module.css'

export default function Login() {
  const [identificacion, setIdentificacion] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tipoUsuario, setTipoUsuario] = useState<'cliente' | 'empresa'>('cliente')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!identificacion.trim() || !password.trim()) {
      setError('Por favor ingrese su identificación y contraseña')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Usar la API correspondiente según el tipo de usuario
      const endpoint = tipoUsuario === 'cliente' ? '/api/login' : '/api/login-empresa'
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          identificacion: identificacion.trim(), 
          password: password.trim() 
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al iniciar sesión')
      }

      if (data.success) {
        // Ya no guardamos en localStorage - las cookies HTTP-Only se manejan automáticamente
        // Redirigir al home
        router.push('/home')
      }
    } catch (error) {
      console.error('Error:', error)
      setError(error instanceof Error ? error.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoSection}>
          <div className={styles.logoCircle}>
            <span className={styles.logoText}>FL</span>
          </div>
          <h1 className={styles.title}>Bienvenido</h1>
          <p className={styles.subtitle}>Ingresa tus credenciales para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Tipo de Usuario</label>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  value="cliente"
                  checked={tipoUsuario === 'cliente'}
                  onChange={(e) => setTipoUsuario(e.target.value as 'cliente')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ color: '#19304B', fontSize: '0.9375rem' }}>Cliente</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  value="empresa"
                  checked={tipoUsuario === 'empresa'}
                  onChange={(e) => setTipoUsuario(e.target.value as 'empresa')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ color: '#19304B', fontSize: '0.9375rem' }}>Empresa</span>
              </label>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="identificacion" className={styles.label}>
              Identificación
            </label>
            <input
              id="identificacion"
              name="identificacion"
              type="text"
              required
              className={styles.input}
              placeholder="Ingresa tu número de identificación"
              value={identificacion}
              onChange={(e) => setIdentificacion(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className={styles.input}
              placeholder="Ingresa tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
                Iniciando sesión...
              </div>
            ) : (
              'Iniciar Sesión'
            )}
          </button>
        </form>
        
        <div className={styles.footer}>
          <p className={styles.footerText}>
            ¿No tienes una cuenta?{' '}
            <Link href="/crearcuenta" className={styles.link}>
              Crear cuenta
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}