import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface UsuarioData {
  id: string
  nombre: string
  cedula: number
  modoPago: boolean
  tipo: 'cliente'
  correo?: string
}

export interface EmpresaData {
  id: string
  nombre: string
  cedula: number
  tipo: 'empresa'
  modoPago?: boolean
  tarifa_hora?: number
  iva_perc?: number
}

/**
 * Obtiene el usuario actual desde Supabase Auth y la base de datos
 * Este método debe usarse en Server Components o API routes
 */
export async function getCurrentUser(accessToken: string): Promise<UsuarioData | EmpresaData | null> {
  try {
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Verificar el token con Supabase Auth
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(accessToken)

    if (authError || !user) {
      return null
    }

    // Obtener metadata del usuario
    const metadata = user.user_metadata
    const userId = metadata.user_id // Puede ser string (UUID) o number
    const tipo = metadata.tipo as 'cliente' | 'empresa'

    if (tipo === 'cliente') {
      // Buscar en tabla usuarios
      const { data: usuario, error } = await supabase
        .from('usuarios')
        .select('id, nombre, cedula, modoPago, correo')
        .eq('id', String(userId))
        .single()

      if (error || !usuario) {
        return null
      }

      return {
        id: usuario.id,
        nombre: usuario.nombre,
        cedula: usuario.cedula || 0,
        modoPago: usuario.modoPago || false,
        correo: usuario.correo || undefined,
        tipo: 'cliente'
      }
    } else {
      // Buscar en tabla empresas
      const { data: empresa, error } = await supabase
        .from('empresas')
        .select('id, nombre, cedula, modoPago, tarifa_hora, iva_perc')
        .eq('id', String(userId))
        .single()

      if (error || !empresa) {
        return null
      }

      return {
        id: empresa.id,
        nombre: empresa.nombre,
        cedula: empresa.cedula || 0,
        modoPago: empresa.modoPago || false,
        tarifa_hora: empresa.tarifa_hora || undefined,
        iva_perc: empresa.iva_perc || undefined,
        tipo: 'empresa'
      }
    }
  } catch (error) {
    console.error('Error obteniendo usuario actual:', error)
    return null
  }
}
