import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    console.log('=== DEBUG: Verificando bucket electronic-invoices ===')
    
    // 1. Verificar que el bucket existe
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
    console.log('Buckets disponibles:', buckets?.map(b => b.name))
    console.log('Error en buckets:', bucketsError)
    
    // 2. Listar contenido raíz del bucket
    const { data: rootFiles, error: rootError } = await supabase.storage
      .from('electronic-invoices')
      .list('', { limit: 100 })
    
    console.log('Archivos/carpetas en raíz:', rootFiles)
    console.log('Error en raíz:', rootError)
    
    // 3. Intentar listar carpeta cliente
    const { data: clienteFolder, error: clienteError } = await supabase.storage
      .from('electronic-invoices')
      .list('cliente', { limit: 100 })
    
    console.log('Contenido de carpeta cliente:', clienteFolder)
    console.log('Error en cliente:', clienteError)
    
    // 4. Intentar listar carpeta empresa
    const { data: empresaFolder, error: empresaError } = await supabase.storage
      .from('electronic-invoices')
      .list('empresa', { limit: 100 })
    
    console.log('Contenido de carpeta empresa:', empresaFolder)
    console.log('Error en empresa:', empresaError)
    
    return NextResponse.json({
      success: true,
      debug: {
        buckets: buckets?.map(b => b.name) || [],
        bucketsError,
        rootFiles: rootFiles || [],
        rootError,
        clienteFolder: clienteFolder || [],
        clienteError,
        empresaFolder: empresaFolder || [],
        empresaError
      }
    })
    
  } catch (error) {
    console.error('Error en debug:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    })
  }
}
