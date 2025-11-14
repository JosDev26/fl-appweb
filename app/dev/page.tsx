'use client'

import { useState } from 'react'
import styles from './dev.module.css'

interface SyncResult {
  success: boolean
  message: string
  details?: any
}

export default function DevPage() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SyncResult[]>([])
  const [activeTab, setActiveTab] = useState<'sync' | 'config' | 'test'>('sync')

  const addResult = (result: SyncResult) => {
    setResults(prev => [result, ...prev])
  }

  const syncClientes = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Clientes completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Clientes',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncEmpresas = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-empresas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Empresas completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Empresas',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncContactos = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-contactos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Contactos completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Contactos',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncCasos = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-casos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Casos completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Casos',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncFuncionarios = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-funcionarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Funcionarios completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Funcionarios',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncControlHoras = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-control-horas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Control de Horas completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Control de Horas',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncSolicitudes = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización de Solicitudes completada' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar Solicitudes',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const syncAll = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Sincronización completa exitosa' : 'Error en sincronización',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al sincronizar todo',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const validateConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/validate-config', {
        method: 'GET',
      })
      const data = await response.json()
      
      addResult({
        success: response.ok,
        message: response.ok ? 'Configuración válida' : 'Error en configuración',
        details: data
      })
    } catch (error) {
      addResult({
        success: false,
        message: 'Error al validar configuración',
        details: error
      })
    } finally {
      setLoading(false)
    }
  }

  const clearResults = () => {
    setResults([])
  }

  return (
    <div className={styles.container}>
      <div className={styles.panel}>
        <header className={styles.header}>
          <h1 className={styles.title}>🔧 Panel de Desarrollo</h1>
          <p className={styles.subtitle}>Gestión de sincronización Google Sheets ↔ Supabase</p>
        </header>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'sync' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            Sincronización
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'config' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('config')}
          >
            Configuración
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'test' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('test')}
          >
            Pruebas
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === 'sync' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Sincronización Manual</h2>
              <p className={styles.description}>
                Ejecuta la sincronización de datos entre Google Sheets y la base de datos
              </p>

              <div className={styles.buttonGrid}>
                <button
                  onClick={syncClientes}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? '⏳ Procesando...' : '👤 Sincronizar Clientes'}
                </button>

                <button
                  onClick={syncEmpresas}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? '⏳ Procesando...' : '🏢 Sincronizar Empresas'}
                </button>

                <button
                  onClick={syncContactos}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? '⏳ Procesando...' : '👥 Sincronizar Contactos'}
                </button>

                <button
                  onClick={syncCasos}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? '⏳ Procesando...' : '📁 Sincronizar Casos'}
                </button>

                <button
                  onClick={syncFuncionarios}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? '⏳ Procesando...' : '👨‍💼 Sincronizar Funcionarios'}
                </button>

                <button
                  onClick={syncControlHoras}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? '⏳ Procesando...' : '⏰ Sincronizar Control Horas'}
                </button>

                <button
                  onClick={syncSolicitudes}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? '⏳ Procesando...' : '📋 Sincronizar Solicitudes'}
                </button>

                <button
                  onClick={syncAll}
                  disabled={loading}
                  className={`${styles.actionButton} ${styles.primary}`}
                >
                  {loading ? '⏳ Procesando...' : '🔄 Sincronizar Todo'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Validación de Configuración</h2>
              <p className={styles.description}>
                Verifica que las credenciales y configuración estén correctas
              </p>

              <div className={styles.buttonGrid}>
                <button
                  onClick={validateConfig}
                  disabled={loading}
                  className={styles.actionButton}
                >
                  {loading ? '⏳ Validando...' : '✅ Validar Configuración'}
                </button>
              </div>

              <div className={styles.infoBox}>
                <h3>Variables de Entorno Requeridas:</h3>
                <ul>
                  <li>NEXT_PUBLIC_SUPABASE_URL</li>
                  <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
                  <li>GOOGLE_SERVICE_ACCOUNT_EMAIL</li>
                  <li>GOOGLE_PRIVATE_KEY</li>
                  <li>GOOGLE_SPREADSHEET_ID</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'test' && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Información del Sistema</h2>
              
              <div className={styles.infoBox}>
                <h3>Tablas Configuradas:</h3>
                <ul>
                  <li><strong>Clientes</strong> → tabla: usuarios</li>
                  <li><strong>Empresas</strong> → tabla: empresas</li>
                </ul>
              </div>

              <div className={styles.infoBox}>
                <h3>Mapeo de Columnas - Clientes:</h3>
                <ul>
                  <li>A: ID_Cliente → id_sheets</li>
                  <li>B: Nombre → nombre</li>
                  <li>C: Correo → correo</li>
                  <li>D: Telefono → telefono</li>
                  <li>E: Tipo_Identificación → tipo_cedula</li>
                  <li>F: Identificacion → cedula</li>
                  <li>H: Moneda → esDolar</li>
                  <li>J: Cuenta → estaRegistrado</li>
                </ul>
              </div>

              <div className={styles.infoBox}>
                <h3>Mapeo de Columnas - Empresas:</h3>
                <ul>
                  <li>A: ID_Cliente → id_sheets</li>
                  <li>B: Nombre → nombre</li>
                  <li>C: Cedula → cedula</li>
                  <li>G: IVA_Perc → iva_perc</li>
                  <li>H: Moneda → esDolar</li>
                  <li>J: Cuenta → estaRegistrado</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className={styles.resultsSection}>
            <div className={styles.resultsHeader}>
              <h2 className={styles.sectionTitle}>Resultados</h2>
              <button onClick={clearResults} className={styles.clearButton}>
                Limpiar
              </button>
            </div>

            <div className={styles.results}>
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`${styles.result} ${result.success ? styles.resultSuccess : styles.resultError}`}
                >
                  <div className={styles.resultHeader}>
                    <span className={styles.resultIcon}>
                      {result.success ? '✅' : '❌'}
                    </span>
                    <span className={styles.resultMessage}>{result.message}</span>
                  </div>
                  {result.details && (
                    <pre className={styles.resultDetails}>
                      {JSON.stringify(result.details, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
