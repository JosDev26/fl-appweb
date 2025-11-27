'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from './crearcuenta.module.css'

export default function CrearCuenta() {
  const [identificacion, setIdentificacion] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tipoUsuario, setTipoUsuario] = useState<'cliente' | 'empresa'>('cliente')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!identificacion.trim()) {
      setError('Por favor ingrese su identificación')
      return
    }

    if (!invitationCode.trim()) {
      setError('Por favor ingrese un código de invitación válido')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Primero validar el código de invitación
      const codeResponse = await fetch(`/api/invitation-codes?code=${encodeURIComponent(invitationCode.trim())}&type=${tipoUsuario}`)
      const codeData = await codeResponse.json()

      if (!codeResponse.ok || !codeData.valid) {
        throw new Error(codeData.error || 'Código de invitación inválido')
      }

      // Si el código es válido, continuar con la validación de identificación
      const endpoint = tipoUsuario === 'cliente' 
        ? '/api/validar-identificacion' 
        : '/api/validar-identificacion-empresa'
      
      const response = await fetch(endpoint, {
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
        // Guardar la identificación, tipo y código en sessionStorage
        sessionStorage.setItem('tempIdentificacion', identificacion.trim())
        sessionStorage.setItem('tempTipoUsuario', tipoUsuario)
        sessionStorage.setItem('tempInvitationCode', invitationCode.trim())
        // Redirigir a la página para crear contraseña
        router.push('/crearcuenta/password')
      } else {
        if (data.hasAccount) {
          setError('Ya tiene una cuenta. Por favor inicie sesión.')
        } else {
          setError(`La identificación no se encuentra registrada en el sistema de ${tipoUsuario}s`)
        }
      }
    } catch (error) {
      console.error('Error:', error)
      setError(error instanceof Error ? error.message : 'Error al validar información')
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
          <h1 className={styles.title}>Crear Cuenta</h1>
          <p className={styles.subtitle}>Ingrese su número de identificación para continuar</p>
        </div>
        
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Tipo de cedula</label>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  value="cliente"
                  checked={tipoUsuario === 'cliente'}
                  onChange={(e) => setTipoUsuario(e.target.value as 'cliente')}
                  style={{ cursor: 'pointer' }}
                  disabled={loading}
                />
                <span style={{ color: '#19304B', fontSize: '0.9375rem' }}>Físico</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  value="empresa"
                  checked={tipoUsuario === 'empresa'}
                  onChange={(e) => setTipoUsuario(e.target.value as 'cliente')}
                  style={{ cursor: 'pointer' }}
                  disabled={loading}
                />
                <span style={{ color: '#19304B', fontSize: '0.9375rem' }}>Jurídico</span>
              </label>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="invitationCode" className={styles.label}>
              Código de Invitación
            </label>
            <input
              id="invitationCode"
              name="invitationCode"
              type="text"
              required
              className={styles.input}
              placeholder="Ingrese su código de invitación"
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value)}
              disabled={loading}
            />
            <small style={{ 
              color: '#64748b', 
              fontSize: '0.875rem', 
              marginTop: '0.5rem',
              display: 'block' 
            }}>
              Debe tener un código de invitación válido para registrarse
            </small>
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
              placeholder="Número de identificación"
              value={identificacion}
              onChange={(e) => setIdentificacion(e.target.value)}
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
            {loading ? 'Verificando...' : 'Continuar'}
          </button>
        </form>

        <div className={styles.footer}>
          <p className={styles.footerText}>
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className={styles.link}>
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}