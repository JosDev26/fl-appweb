import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { GoogleSheetsService } from '@/lib/googleSheets';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Iniciando sincronización de Materias...');

    // 1. Leer datos de Google Sheets
    const materiasSheets = await GoogleSheetsService.readMaterias();
    console.log(`📖 Leídos ${materiasSheets.length} registros de la hoja Materia`);

    if (materiasSheets.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No hay datos para sincronizar en la hoja Materia',
        stats: { leidos: 0, insertados: 0, actualizados: 0, errores: 0 }
      });
    }

    let insertados = 0;
    let actualizados = 0;
    let errores = 0;

    // 2. Procesar cada materia
    for (const materia of materiasSheets) {
      try {
        // Verificar si el registro ya existe
        const { data: existente, error: errorBusqueda } = await supabase
          .from('materias')
          .select('id')
          .eq('id', materia.id)
          .single();

        if (errorBusqueda && errorBusqueda.code !== 'PGRST116') {
          console.error(`❌ Error buscando materia ${materia.id}:`, errorBusqueda);
          errores++;
          continue;
        }

        if (existente) {
          // Actualizar registro existente
          const { error: errorUpdate } = await supabase
            .from('materias')
            .update({
              nombre: materia.nombre
            })
            .eq('id', materia.id);

          if (errorUpdate) {
            console.error(`❌ Error actualizando materia ${materia.id}:`, errorUpdate);
            errores++;
          } else {
            console.log(`✅ Materia actualizada: ${materia.id}`);
            actualizados++;
          }
        } else {
          // Insertar nuevo registro
          const { error: errorInsert } = await supabase
            .from('materias')
            .insert({
              id: materia.id,
              nombre: materia.nombre
            });

          if (errorInsert) {
            console.error(`❌ Error insertando materia ${materia.id}:`, errorInsert);
            errores++;
          } else {
            console.log(`✅ Materia insertada: ${materia.id}`);
            insertados++;
          }
        }
      } catch (error) {
        console.error(`❌ Error procesando materia ${materia.id}:`, error);
        errores++;
      }
    }

    const mensaje = `Sincronización de Materias completada: ${insertados} insertados, ${actualizados} actualizados, ${errores} errores`;
    console.log(`✅ ${mensaje}`);

    return NextResponse.json({
      success: true,
      message: mensaje,
      stats: {
        leidos: materiasSheets.length,
        insertados,
        actualizados,
        errores
      }
    });

  } catch (error) {
    console.error('❌ Error en sincronización de Materias:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Error al sincronizar materias',
        error: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Obtener estadísticas de la tabla materias
    const { count, error } = await supabase
      .from('materias')
      .select('*', { count: 'exact', head: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      total: count || 0
    });

  } catch (error) {
    console.error('❌ Error obteniendo estadísticas de materias:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Error al obtener estadísticas',
        error: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}
