'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import styles from './password.module.css'

interface PasswordValidation {
  hasMinLength: boolean
  hasUpperCase: boolean
  hasLowerCase: boolean
  hasNumber: boolean
  hasSpecialChar: boolean
}

function CrearPasswordForm() {
  const [identificacion, setIdentificacion] = useState('')
  const [tipoUsuario, setTipoUsuario] = useState<'cliente' | 'empresa'>('cliente')
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

  useEffect(() => {
    // Obtener la identificación, tipo y código de sessionStorage
    const tempId = sessionStorage.getItem('tempIdentificacion')
    const tempTipo = sessionStorage.getItem('tempTipoUsuario') as 'cliente' | 'empresa'
    const tempCode = sessionStorage.getItem('tempInvitationCode')
    
    if (!tempId || !tempTipo || !tempCode) {
      // Si falta información, redirigir al inicio
      router.push('/crearcuenta')
      return
    }
    setIdentificacion(tempId)
    setTipoUsuario(tempTipo)
  }, [router])

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
      // Usar la API correspondiente según el tipo de usuario
      const endpoint = tipoUsuario === 'cliente' 
        ? '/api/crear-password' 
        : '/api/crear-password-empresa'
      
      const response = await fetch(endpoint, {
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

      // Marcar el código de invitación como usado
      const invitationCode = sessionStorage.getItem('tempInvitationCode')
      if (invitationCode) {
        try {
          await fetch('/api/invitation-codes', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              code: invitationCode,
              usedBy: identificacion 
            })
          })
        } catch (codeError) {
          console.error('Error al marcar código como usado:', codeError)
          // No fallar el proceso si esto falla
        }
      }

      // Limpiar sessionStorage
      sessionStorage.removeItem('tempIdentificacion')
      sessionStorage.removeItem('tempTipoUsuario')
      sessionStorage.removeItem('tempInvitationCode')
      
      // Mostrar mensaje de éxito y redirigir
      alert('Contraseña creada exitosamente. Su cuenta ha sido activada.')
      router.push('/login')
      
    } catch (error) {
      console.error('Error:', error)
      setError(error instanceof Error ? error.message : 'Error al crear contraseña')
    } finally {
      setLoading(false)
    }
  }

  const ValidationItem = ({ isValid, text }: { isValid: boolean; text: string }) => (
    <div className={`${styles.validationItem} ${isValid ? styles.valid : styles.invalid}`}>
      <span>{isValid ? '✓' : '✗'}</span>
      <span>{text}</span>
    </div>
  )

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoSection}>
          <div className={styles.logoCircle}>
            <span className={styles.logoText}>FL</span>
          </div>
          <h1 className={styles.title}>Crear Contraseña</h1>
          <p className={styles.subtitle}>Configure una contraseña segura para su cuenta de {tipoUsuario}</p>
        </div>
        
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="identificacion-readonly" className={styles.label}>
              Identificación
            </label>
            <input
              id="identificacion-readonly"
              type="text"
              value={identificacion}
              readOnly
              className={styles.input}
              disabled
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
              placeholder="Ingrese su contraseña"
              value={password}
              onChange={handlePasswordChange}
              disabled={loading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="confirmPassword" className={styles.label}>
              Confirmar Contraseña
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              className={styles.input}
              placeholder="Confirme su contraseña"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                setError('')
              }}
              disabled={loading}
            />
          </div>

          {password && (
            <div className={styles.validationBox}>
              <h4 className={styles.validationTitle}>Requisitos de contraseña:</h4>
              <div className={styles.validationList}>
                <ValidationItem isValid={validation.hasMinLength} text="Mínimo 8 caracteres" />
                <ValidationItem isValid={validation.hasUpperCase} text="Una letra mayúscula" />
                <ValidationItem isValid={validation.hasLowerCase} text="Una letra minúscula" />
                <ValidationItem isValid={validation.hasNumber} text="Un número" />
                <ValidationItem isValid={validation.hasSpecialChar} text="Un carácter especial (!@#$%^&*)" />
              </div>
            </div>
          )}

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !isPasswordValid() || !password || !confirmPassword}
            className={styles.submitButton}
          >
            {loading ? 'Creando contraseña...' : 'Crear Contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function CrearPassword() {
  return <CrearPasswordForm />
}