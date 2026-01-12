import { useState, useCallback } from 'react'

/**
 * Hook para copiar texto al clipboard con manejo de errores
 * @returns [copiedText, copyToClipboard, clearCopied]
 */
export function useClipboard(resetDelay = 2000) {
  const [copiedText, setCopiedText] = useState<string | null>(null)

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    if (!navigator.clipboard) {
      console.error('Clipboard API no disponible')
      alert('Clipboard API no disponible en este navegador')
      return false
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopiedText(text)
      
      if (resetDelay > 0) {
        setTimeout(() => setCopiedText(null), resetDelay)
      }
      
      return true
    } catch (error) {
      console.error('Error copiando al clipboard:', error)
      alert('Error al copiar el texto')
      return false
    }
  }, [resetDelay])

  const clearCopied = useCallback(() => {
    setCopiedText(null)
  }, [])

  return { copiedText, copyToClipboard, clearCopied }
}

export default useClipboard
