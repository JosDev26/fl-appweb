import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET - Obtener ingresos con filtros opcionales
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mes = searchParams.get('mes') // formato: YYYY-MM
    const year = searchParams.get('year')
    const moneda = searchParams.get('moneda')
    const resumen = searchParams.get('resumen') === 'true'
    
    // Si piden solo resumen mensual
    if (resumen) {
      return await getResumenMensual(year, moneda)
    }
    
    // Query base
    let query = (supabase as any)
      .from('ingresos')
      .select('*')
      .order('fecha_aprobacion', { ascending: false })
    
    // Filtrar por mes si se especifica
    if (mes) {
      const [yearPart, monthPart] = mes.split('-')
      const startDate = `${yearPart}-${monthPart}-01`
      const endDate = new Date(parseInt(yearPart), parseInt(monthPart), 0).toISOString().split('T')[0]
      
      query = query
        .gte('fecha_aprobacion', startDate)
        .lte('fecha_aprobacion', endDate)
    }
    
    // Filtrar por año si se especifica
    if (year && !mes) {
      query = query
        .gte('fecha_aprobacion', `${year}-01-01`)
        .lte('fecha_aprobacion', `${year}-12-31`)
    }
    
    // Filtrar por moneda
    if (moneda) {
      query = query.eq('moneda', moneda)
    }
    
    const { data: ingresos, error } = await query
    
    if (error) {
      console.error('Error obteniendo ingresos:', error)
      return NextResponse.json({ 
        success: false, 
        error: error.message 
      }, { status: 500 })
    }
    
    // Calcular totales
    const totales = calcularTotales(ingresos || [])
    
    return NextResponse.json({
      success: true,
      data: ingresos,
      totales,
      count: ingresos?.length || 0
    })
    
  } catch (error) {
    console.error('Error en API ingresos:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Error obteniendo ingresos' 
    }, { status: 500 })
  }
}

// Calcular totales por moneda
function calcularTotales(ingresos: any[]) {
  const totales = {
    colones: {
      honorarios: 0,
      servicios: 0,
      reembolso_gastos: 0,
      total: 0,
      cantidad: 0
    },
    dolares: {
      honorarios: 0,
      servicios: 0,
      reembolso_gastos: 0,
      total: 0,
      cantidad: 0
    },
    general: {
      cantidad: ingresos.length
    }
  }
  
  for (const ingreso of ingresos) {
    const moneda = ingreso.moneda?.toLowerCase() === 'dolares' ? 'dolares' : 'colones'
    
    totales[moneda].honorarios += parseFloat(ingreso.honorarios) || 0
    totales[moneda].servicios += parseFloat(ingreso.servicios) || 0
    totales[moneda].reembolso_gastos += parseFloat(ingreso.reembolso_gastos) || 0
    totales[moneda].total += parseFloat(ingreso.total_ingreso) || 0
    totales[moneda].cantidad++
  }
  
  return totales
}

// Obtener resumen mensual del año
async function getResumenMensual(year: string | null, moneda: string | null) {
  const targetYear = year || new Date().getFullYear().toString()
  
  let query = (supabase as any)
    .from('ingresos')
    .select('*')
    .gte('fecha_aprobacion', `${targetYear}-01-01`)
    .lte('fecha_aprobacion', `${targetYear}-12-31`)
  
  if (moneda) {
    query = query.eq('moneda', moneda)
  }
  
  const { data: ingresos, error } = await query
  
  if (error) {
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
  
  // Agrupar por mes
  const resumenPorMes: { [key: string]: any } = {}
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  
  // Inicializar todos los meses
  for (let i = 1; i <= 12; i++) {
    const mesKey = `${targetYear}-${i.toString().padStart(2, '0')}`
    resumenPorMes[mesKey] = {
      mes: meses[i - 1],
      mesNumero: i,
      year: targetYear,
      colones: { honorarios: 0, servicios: 0, gastos: 0, total: 0, cantidad: 0 },
      dolares: { honorarios: 0, servicios: 0, gastos: 0, total: 0, cantidad: 0 }
    }
  }
  
  // Agregar los ingresos a cada mes
  for (const ingreso of (ingresos || [])) {
    if (!ingreso.fecha_aprobacion) continue
    
    const fecha = new Date(ingreso.fecha_aprobacion)
    const mesKey = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`
    
    if (resumenPorMes[mesKey]) {
      const monedaKey = ingreso.moneda?.toLowerCase() === 'dolares' ? 'dolares' : 'colones'
      
      resumenPorMes[mesKey][monedaKey].honorarios += parseFloat(ingreso.honorarios) || 0
      resumenPorMes[mesKey][monedaKey].servicios += parseFloat(ingreso.servicios) || 0
      resumenPorMes[mesKey][monedaKey].gastos += parseFloat(ingreso.reembolso_gastos) || 0
      resumenPorMes[mesKey][monedaKey].total += parseFloat(ingreso.total_ingreso) || 0
      resumenPorMes[mesKey][monedaKey].cantidad++
    }
  }
  
  // Convertir a array ordenado
  const resumenArray = Object.values(resumenPorMes).sort((a: any, b: any) => a.mesNumero - b.mesNumero)
  
  // Calcular totales anuales
  const totalesAnuales = {
    colones: { honorarios: 0, servicios: 0, gastos: 0, total: 0, cantidad: 0 },
    dolares: { honorarios: 0, servicios: 0, gastos: 0, total: 0, cantidad: 0 }
  }
  
  for (const mes of resumenArray) {
    for (const monedaKey of ['colones', 'dolares'] as const) {
      totalesAnuales[monedaKey].honorarios += (mes as any)[monedaKey].honorarios
      totalesAnuales[monedaKey].servicios += (mes as any)[monedaKey].servicios
      totalesAnuales[monedaKey].gastos += (mes as any)[monedaKey].gastos
      totalesAnuales[monedaKey].total += (mes as any)[monedaKey].total
      totalesAnuales[monedaKey].cantidad += (mes as any)[monedaKey].cantidad
    }
  }
  
  return NextResponse.json({
    success: true,
    year: targetYear,
    resumenMensual: resumenArray,
    totalesAnuales
  })
}
