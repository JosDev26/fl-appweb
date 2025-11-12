'use client'

import { useState, useEffect } from 'react'

export default function InitialLoader() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Ocultar el loader después de que el componente se monte
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 100)

    return () => clearTimeout(timer)
  }, [])

  if (!isLoading) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #19304B 0%, #0f1419 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        opacity: isLoading ? 1 : 0,
        transition: 'opacity 0.3s ease',
        pointerEvents: 'none'
      }}
    >
      <div
        style={{
          width: '50px',
          height: '50px',
          border: '4px solid rgba(250, 208, 44, 0.3)',
          borderTop: '4px solid #FAD02C',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}
      />
    </div>
  )
}
