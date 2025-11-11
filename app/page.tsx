'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            FL App
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Sistema de Gestión de Casos
          </p>
        </div>

        <div className="space-y-4">
          <Link 
            href="/login"
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            Iniciar Sesión
          </Link>

          <Link 
            href="/crearcuenta"
            className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            Crear Cuenta
          </Link>
        </div>

        <div className="text-center">
          <p className="text-sm text-gray-500">
            ¿Ya tienes cuenta? Usa "Iniciar Sesión"
          </p>
          <p className="text-sm text-gray-500">
            ¿Primera vez? Crea tu cuenta primero
          </p>
        </div>
      </div>
    </div>
  )
}