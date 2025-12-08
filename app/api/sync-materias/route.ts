import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { GoogleSheetsService } from '@/lib/googleSheets';

export async function GET() {
  return syncMaterias()
}

export async function POST() {
  return syncMaterias()
}

async function syncMaterias() {
  try {
    console.log('🔄 Iniciando sincronización de Materias...');

    // 1. Leer datos de Google Sheets
    const materiasSheets = await GoogleSheetsService.readMaterias();
    console.log(`📖 Leídos ${materiasSheets.length} registros de la hoja Materia`);

    // 1.1 Obtener materias existentes en Supabase
    const { data: existingMaterias, error: fetchError } = await supabase
      .from('materias')
      .select('id')

    if (fetchError) throw fetchError

    // Crear set de IDs de Sheets
    const sheetsIdSet = new Set(materiasSheets.map((m: any) => m.id))

    // 1.2 Eliminar de Supabase los que no están en Sheets
    let eliminados = 0
    for (const existing of existingMaterias || []) {
      if (existing.id && !sheetsIdSet.has(existing.id)) {
        const { error: deleteError } = await supabase
          .from('materias')
          .delete()
          .eq('id', existing.id)
        
        if (!deleteError) {
          eliminados++
          console.log(`🗑️ Materia eliminada: ${existing.id}`)
        }
      }
    }

    if (materiasSheets.length === 0) {
      return NextResponse.json({
        success: true,
        message: `Materias: 0 leídos, 0 insertados, 0 actualizados, ${eliminados} eliminados, 0 errores`,
        stats: { leidos: 0, insertados: 0, actualizados: 0, omitidos: eliminados, errores: 0 },
        code: 200
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

    const mensaje = `Materias: ${materiasSheets.length} leídos, ${insertados} insertados, ${actualizados} actualizados, ${eliminados} eliminados, ${errores} errores`;
    console.log(`✅ ${mensaje}`);

    return NextResponse.json({
      success: true,
      message: mensaje,
      stats: {
        leidos: materiasSheets.length,
        insertados,
        actualizados,
        omitidos: eliminados,
        errores
      },
      code: 200
    });

  } catch (error) {
    console.error('❌ Error al sincronizar Materias:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        message: `Materias: Error - ${errorMessage}`,
        error: errorMessage,
        code: 500
      },
      { status: 500 }
    );
  }
}
