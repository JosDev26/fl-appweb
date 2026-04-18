'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import styles from './comprobante.module.css'

export default function ComprobantePage() {
  return (
    <Suspense fallback={
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Cargando...</p>
        </div>
      </div>
    }>
      <ComprobanteContent />
    </Suspense>
  )
}

function ComprobanteContent() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const mesParamRaw = searchParams.get('mes') // e.g. "2025-02"
  const [mesParam, setMesParam] = useState<string | null>(mesParamRaw)
  
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [montoPago, setMontoPago] = useState<number | null>(null)
  const [loadingMonto, setLoadingMonto] = useState(true)
  const [invoiceFiles, setInvoiceFiles] = useState<Array<{name: string, created_at: string}>>([])
  const [invoiceEditada, setInvoiceEditada] = useState(false)
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null)
  const [simulatedDate, setSimulatedDate] = useState<string | null>(null)

  // Cargar fecha simulada global desde API
  useEffect(() => {
    const loadSimulatedDate = async () => {
      try {
        const res = await fetch('/api/simulated-date')
        const data = await res.json()
        if (data.simulated && data.date) {
          setSimulatedDate(data.date)
        }
      } catch (err) {
        // No hay fecha simulada activa
      }
    }
    loadSimulatedDate()
  }, [])

  // Cargar información del mes (monto e invoices opcionales)
  useEffect(() => {
    if (user) {
      loadDataAndInvoices()
    }
  }, [user, simulatedDate])

  const loadDataAndInvoices = async () => {
    if (!user) return

    setLoadingMonto(true)

    try {
      // Cargar el monto del pago y obtener el mes de facturación
      const resolvedMes = await fetchMontoPago()

      // Intentar cargar facturas electrónicas (opcional, no bloquea)
      // Usar el mes resuelto (de URL o de datos-pago) para filtrar correctamente
      const mesParaFacturas = mesParam || resolvedMes
      try {
        const invoiceResponse = await fetch('/api/upload-invoice', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clientId: user.id,
            clientType: user.tipo || 'cliente',
            ...(mesParaFacturas ? { mes: mesParaFacturas } : {})
          })
        })

        if (invoiceResponse.ok) {
          const invoiceData = await invoiceResponse.json()
          if (invoiceData.hasInvoice && invoiceData.invoices) {
            setInvoiceFiles(invoiceData.invoices)
            setInvoiceEditada(invoiceData.editada || false)
          }
        }
      } catch (err) {
        // No bloquear si falla la carga de facturas
      }
    } catch (err) {
      // Error loading data
      setError('No se pudo cargar la información. Por favor, intente más tarde.')
    } finally {
      setLoadingMonto(false)
    }
  }

  const fetchMontoPago = async (): Promise<string | null> => {
    if (!user) return null
    
    setLoadingMonto(true)
    try {
      const params = new URLSearchParams()
      if (mesParam) params.set('mes', mesParam)
      const qs = params.toString() ? `?${params.toString()}` : ''
      const response = await fetch(`/api/datos-pago${qs}`, {
        headers: {
          'x-user-id': String(user.id),
          'x-tipo-cliente': user.tipo || 'cliente'
        }
      })

      if (!response.ok) {
        throw new Error('Error al obtener datos de pago')
      }

      const data = await response.json()
      // Si no se pasó mes por URL, usar el mes que devuelve datos-pago
      let resolvedMes: string | null = null
      if (!mesParam && data.mesActualISO) {
        setMesParam(data.mesActualISO)
        resolvedMes = data.mesActualISO
      }
      // Si es empresa principal de grupo, usar el total que incluye todas las empresas
      const totalFinal = data.esGrupoPrincipal && data.granTotalAPagar 
        ? data.granTotalAPagar 
        : data.totalAPagar
      setMontoPago(totalFinal)
      return resolvedMes
    } catch (err) {
      setError('No se pudo cargar el monto a pagar')
      return null
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
      if (mesParam) {
        formData.append('mes_pago', mesParam)
      }
      
      // Enviar fecha simulada global si está activa
      if (simulatedDate) {
        formData.append('simulatedDate', simulatedDate)
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

      // Redirigir al home con parámetro para mostrar notificación
      router.push('/home?fromUpload=true')

    } catch (err: any) {
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

  const downloadInvoice = async (fileName: string) => {
    if (!user) return
    
    setDownloadingInvoice(fileName)
    try {
      const { supabase } = await import('@/lib/supabase')
      const filePath = `${user.tipo || 'cliente'}/${user.id}/${fileName}`
      
      const { data, error } = await supabase
        .storage
        .from('electronic-invoices')
        .download(filePath)
      
      if (error) throw error
      
      if (data) {
        const url = URL.createObjectURL(data)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      alert('Error al descargar la factura')
    } finally {
      setDownloadingInvoice(null)
    }
  }

  const getFileExtension = (fileName: string): string => {
    return fileName.split('.').pop()?.toUpperCase() || ''
  }

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('es-ES', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateString
    }
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
        <h1 className={styles.title}>
          Subir Comprobante de Pago
          {mesParam && (() => {
            const [y, m] = mesParam.split('-').map(Number)
            const mesTexto = new Date(y, m - 1, 1).toLocaleString('es-CR', { month: 'long', year: 'numeric' })
            return <span style={{ display: 'block', fontSize: '0.65em', opacity: 0.7, textTransform: 'capitalize', marginTop: '0.25rem' }}>{mesTexto}</span>
          })()}
        </h1>
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

        {/* Sección de facturas electrónicas (opcional) */}
        {invoiceFiles.length > 0 && (
          <div className={styles.invoiceSection}>
            <h2 className={styles.invoiceTitle}>📄 Su Factura Electrónica</h2>
            <p className={styles.invoiceSubtitle}>
              Descargue su factura electrónica (si está disponible)
            </p>
            {invoiceEditada && (
              <div style={{ background: '#dbeafe', border: '1px solid #93c5fd', padding: '0.5rem 0.75rem', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.85rem', color: '#1e40af' }}>
                Esta factura fue actualizada. Por favor descargue la versión más reciente.
              </div>
            )}
            
            <div className={styles.invoicesList}>
              {invoiceFiles.map((invoice, index) => (
                <div key={index} className={styles.invoiceCard}>
                  <div className={styles.invoiceIcon}>
                    {getFileExtension(invoice.name) === 'PDF' ? '📕' : '📄'}
                  </div>
                  <div className={styles.invoiceDetails}>
                    <p className={styles.invoiceFileName}>{invoice.name}</p>
                    <p className={styles.invoiceDate}>
                      Subida: {formatDate(invoice.created_at)}
                    </p>
                    <span className={styles.invoiceType}>
                      {getFileExtension(invoice.name)}
                    </span>
                  </div>
                  <button
                    onClick={() => downloadInvoice(invoice.name)}
                    disabled={downloadingInvoice === invoice.name}
                    className={styles.downloadInvoiceButton}
                  >
                    {downloadingInvoice === invoice.name ? (
                      <>
                        <span className={styles.spinner}></span>
                        Descargando...
                      </>
                    ) : (
                      <>
                        ⬇️ Descargar
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
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
