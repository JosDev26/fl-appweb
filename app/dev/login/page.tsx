'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './login.module.css'

type Step = 'credentials' | 'code'

export default function DevLogin() {
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [adminId, setAdminId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const router = useRouter()

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccessMessage('')

    try {
      const response = await fetch('/api/dev-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (data.success) {
        setAdminId(data.adminId)
        setSuccessMessage(`${data.message}. Revisa tu correo y copia el código.`)
        setStep('code')
      } else {
        setError(data.error || 'Credenciales inválidas')
      }
    } catch (error) {
      setError('Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (code.trim().length !== 64) {
      setError('El código debe tener 64 caracteres')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/dev-auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), adminId })
      })

      const data = await response.json()

      if (data.success) {
        router.push('/dev')
        router.refresh()
      } else {
        setError(data.error || 'Código inválido o expirado')
      }
    } catch (error) {
      setError('Error al verificar código')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    setStep('credentials')
    setCode('')
    setError('')
    setSuccessMessage('')
  }

  return (
    <div className={styles.container}>
      <div className={styles.loginBox}>
        <div className={styles.logo}>
          <div className={styles.lockIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
            </svg>
          </div>
        </div>
        
        <h1 className={styles.title}>Panel de Administración</h1>
        
        {step === 'credentials' ? (
          <>
            <p className={styles.subtitle}>
              Ingresa tus credenciales de administrador
            </p>
            
            <form onSubmit={handleCredentialsSubmit} className={styles.form}>
              <div className={styles.inputGroup}>
                <label htmlFor="email" className={styles.label}>
                  Correo Electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@tuempresa.com"
                  className={styles.input}
                  disabled={loading}
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>
              
              <div className={styles.inputGroup}>
                <label htmlFor="password" className={styles.label}>
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={styles.input}
                  disabled={loading}
                  required
                  autoComplete="current-password"
                />
              </div>
              
              {error && <div className={styles.error}>{error}</div>}
              {successMessage && <div className={styles.success}>{successMessage}</div>}
              
              <button 
                type="submit" 
                className={styles.button}
                disabled={loading || !email || !password}
              >
                {loading ? (
                  <>
                    <span className={styles.spinner}></span>
                    Verificando...
                  </>
                ) : (
                  <>
                    <span>→</span>
                    Continuar
                  </>
                )}
              </button>
            </form>

            <div className={styles.infoBox}>
              <p className={styles.infoTitle}>Autenticación de 3 factores</p>
              <ol className={styles.infoList}>
                <li>Ingresa tu correo y contraseña</li>
                <li>Recibirás un código de autenticación por correo</li>
                <li>Ingresa el código para completar el acceso</li>
              </ol>
            </div>
          </>
        ) : (
          <>
            <p className={styles.subtitle}>
              Se envió un código de 64 caracteres a <strong>{email}</strong>
            </p>
            
            <form onSubmit={handleCodeSubmit} className={styles.form}>
              <div className={styles.inputGroup}>
                <label htmlFor="code" className={styles.label}>
                  Código de Autenticación
                </label>
                <textarea
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Pega aquí el código de 64 caracteres que recibiste por correo"
                  className={styles.codeInput}
                  disabled={loading}
                  required
                  autoFocus
                  rows={3}
                />
                <small className={styles.charCount}>
                  {code.length}/64 caracteres
                  {code.length === 64 && ' (correcto)'}
                </small>
              </div>
              
              {error && <div className={styles.error}>{error}</div>}
              
              <button 
                type="submit" 
                className={styles.button}
                disabled={loading || code.length !== 64}
              >
                {loading ? (
                  <>
                    <span className={styles.spinner}></span>
                    Verificando...
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    Verificar y Acceder
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleBack}
                className={styles.backButton}
                disabled={loading}
              >
                ← Volver
              </button>
            </form>

            <div className={styles.infoBox}>
              <p className={styles.infoTitle}>Instrucciones</p>
              <ul className={styles.infoList}>
                <li>Revisa tu bandeja de entrada (y spam)</li>
                <li>Copia el código completo del correo</li>
                <li>Pégalo en el campo de arriba</li>
                <li>El código expira en <strong>10 minutos</strong></li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
