'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import styles from './comprobante.module.css'

export default function ComprobantePage() {
  const { user } = useAuth()
  const router = useRouter()
  
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [montoPago, setMontoPago] = useState<number | null>(null)
  const [loadingMonto, setLoadingMonto] = useState(true)

  // Obtener el monto del pago desde el servidor (no desde URL)
  useEffect(() => {
    if (user) {
      fetchMontoPago()
    }
  }, [user])

  const fetchMontoPago = async () => {
    if (!user) return
    
    setLoadingMonto(true)
    try {
      const response = await fetch('/api/datos-pago', {
        headers: {
          'x-user-id': String(user.id),
          'x-tipo-cliente': user.tipo || 'cliente'
        }
      })

      if (!response.ok) {
        throw new Error('Error al obtener datos de pago')
      }

      const data = await response.json()
      setMontoPago(data.totalAPagar)
    } catch (err) {
      console.error('Error fetching monto:', err)
      setError('No se pudo cargar el monto a pagar')
    } finally {
      setLoadingMonto(false)
    }
  }

  const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
  const MAX_SIZE = 5 * 1024 * 1024 // 5MB

  const validateFile = (file: File): string | null => {
    // Validar tipo
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Solo se permiten archivos PDF, JPG, JPEG o PNG'
    }

    // Validar tamaño
    if (file.size > MAX_SIZE) {
      return 'El archivo es demasiado grande. Máximo 5MB'
    }

    // Validar extensión
    const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0]
    if (!extension || !['.pdf', '.jpg', '.jpeg', '.png'].includes(extension)) {
      return 'Extensión de archivo no permitida'
    }

    return null
  }

  const handleFileSelect = (selectedFile: File) => {
    setError(null)
    
    const validationError = validateFile(selectedFile)
    if (validationError) {
      setError(validationError)
      setFile(null)
      setPreview(null)
      return
    }

    setFile(selectedFile)

    // Generar preview si es imagen
    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(selectedFile)
    } else {
      setPreview(null)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFileSelect(selectedFile)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }

  const handleUpload = async () => {
    if (!file || !user) return

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (montoPago) {
        formData.append('monto', String(montoPago))
      }

      const response = await fetch('/api/upload-comprobante', {
        method: 'POST',
        headers: {
          'x-user-id': String(user.id),
          'x-tipo-cliente': user.tipo || 'cliente'
        },
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al subir el comprobante')
      }

      // Redirigir al home sin query parameters
      router.push('/home')

    } catch (err: any) {
      console.error('Error uploading:', err)
      setError(err.message || 'Error al subir el comprobante')
    } finally {
      setUploading(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  if (loadingMonto) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Cargando información de pago...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <button 
          onClick={() => router.back()} 
          className={styles.backButton}
          disabled={uploading}
        >
          ← Volver
        </button>
        <h1 className={styles.title}>Subir Comprobante de Pago</h1>
      </header>

      {/* Main Content */}
      <main className={styles.main}>
        {montoPago && (
          <div className={styles.montoInfo}>
            <span className={styles.montoLabel}>Monto a pagar:</span>
            <span className={styles.montoValue}>
              ₡{montoPago.toLocaleString('es-CR', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
            </span>
          </div>
        )}

        <div className={styles.uploadSection}>
          {/* Instrucciones */}
          <div className={styles.instructions}>
            <h2>Instrucciones</h2>
            <ul>
              <li>Suba el comprobante de su transferencia bancaria o depósito</li>
              <li>Solo se aceptan archivos <strong>PDF, JPG, JPEG o PNG</strong></li>
              <li>Tamaño máximo: <strong>5MB</strong></li>
              <li>Su pago será revisado y confirmado por nuestro equipo</li>
            </ul>
          </div>

          {/* Zona de subida */}
          <div
            className={`${styles.dropzone} ${dragActive ? styles.dragActive : ''} ${file ? styles.hasFile : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-input"
              className={styles.fileInput}
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={handleFileChange}
              disabled={uploading}
            />

            {!file ? (
              <label htmlFor="file-input" className={styles.dropzoneLabel}>
                <div className={styles.uploadIcon}>📁</div>
                <p className={styles.dropzoneText}>
                  Arrastra tu archivo aquí o haz clic para seleccionar
                </p>
                <p className={styles.dropzoneSubtext}>
                  PDF, JPG, JPEG o PNG (máx. 5MB)
                </p>
              </label>
            ) : (
              <div className={styles.filePreview}>
                {preview ? (
                  <img src={preview} alt="Preview" className={styles.previewImage} />
                ) : (
                  <div className={styles.pdfIcon}>📄</div>
                )}
                <div className={styles.fileInfo}>
                  <p className={styles.fileName}>{file.name}</p>
                  <p className={styles.fileSize}>{formatFileSize(file.size)}</p>
                  <button
                    onClick={() => {
                      setFile(null)
                      setPreview(null)
                      setError(null)
                    }}
                    className={styles.removeButton}
                    disabled={uploading}
                  >
                    Cambiar archivo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mensajes de error */}
          {error && (
            <div className={styles.errorMessage}>
              <span className={styles.errorIcon}>⚠️</span>
              {error}
            </div>
          )}

          {/* Botón de envío */}
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className={styles.submitButton}
          >
            {uploading ? (
              <>
                <span className={styles.spinner}></span>
                Subiendo comprobante...
              </>
            ) : (
              'Enviar Comprobante'
            )}
          </button>

          {/* Nota de seguridad */}
          <p className={styles.securityNote}>
            🔒 Su archivo será validado y almacenado de forma segura
          </p>
        </div>
      </main>
    </div>
  )
}
