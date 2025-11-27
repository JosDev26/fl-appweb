import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { GoogleSheetsService } from "@/lib/googleSheets";
import { getTableMapping } from "@/lib/sync-config";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log('=== INICIANDO SINCRONIZACIÓN DE HISTORIAL DE REPORTES ===');

  try {
    // Obtener datos de Google Sheets
    const sheetName = "Historial de reportes";
    const range = "A:C"; // ID_Click, Fecha, Hora
    
    console.log(`Obteniendo datos de la hoja "${sheetName}"...`);
    const sheetData = await GoogleSheetsService.getSheetData(sheetName, range);
    
    if (!sheetData || sheetData.length === 0) {
      console.log('No se encontraron datos en la hoja');
      return NextResponse.json({
        success: true,
        message: "No hay datos para sincronizar",
        inserted: 0,
        updated: 0,
        deleted: 0,
      });
    }

    // Obtener la configuración de mapeo
    const mapping = getTableMapping(sheetName);
    if (!mapping) {
      throw new Error(`No se encontró configuración para la hoja "${sheetName}"`);
    }

    console.log(`Total de filas en la hoja: ${sheetData.length}`);

    // Procesar headers (primera fila) - case insensitive
    const headers = sheetData[0].map((h: string) => String(h || '').toLowerCase().trim());
    console.log('Headers encontrados:', headers);

    // Función helper para encontrar índice de columna
    const findHeader = (columnName: string): number => {
      const normalized = columnName.toLowerCase().trim();
      const index = headers.indexOf(normalized);
      if (index === -1) {
        console.warn(`⚠️ Columna "${columnName}" no encontrada en headers`);
      }
      return index;
    };

    // Mapear índices de columnas
    const columnIndices: { [key: string]: number } = {};
    mapping.columns.forEach(col => {
      columnIndices[col.supabaseColumn] = findHeader(col.sheetsColumn);
    });

    console.log('Índices de columnas mapeados:', columnIndices);

    // Procesar datos (desde la fila 2)
    const dataRows = sheetData.slice(1);
    console.log(`Procesando ${dataRows.length} filas de datos...`);

    // Transformar datos según la configuración
    const transformedData = dataRows
      .map((row: any[], rowIndex: number) => {
        const record: any = {};
        let hasData = false;

        mapping.columns.forEach(col => {
          const colIndex = columnIndices[col.supabaseColumn];
          if (colIndex !== -1 && colIndex < row.length) {
            const value = row[colIndex];
            if (value !== undefined && value !== null && value !== '') {
              hasData = true;
            }
            record[col.supabaseColumn] = col.transform ? col.transform(value) : value;
          } else {
            record[col.supabaseColumn] = null;
          }
        });

        // Solo incluir registros que tengan al menos un campo con datos
        if (!hasData) {
          console.log(`Fila ${rowIndex + 2}: Sin datos, omitiendo`);
          return null;
        }

        // Validar que tenga ID
        if (!record[mapping.idColumn]) {
          console.log(`Fila ${rowIndex + 2}: Sin ID, omitiendo`);
          return null;
        }

        return record;
      })
      .filter(record => record !== null);

    console.log(`Registros válidos a sincronizar: ${transformedData.length}`);

    // Obtener IDs actuales en Supabase
    const { data: existingRecords, error: fetchError } = await supabase
      .from(mapping.supabaseTable as any)
      .select(mapping.idColumn);

    if (fetchError) {
      console.error('Error al obtener registros existentes:', fetchError);
      throw fetchError;
    }

    const existingIds = new Set(
      existingRecords?.map((record: any) => record[mapping.idColumn]) || []
    );
    const sheetIds = new Set(
      transformedData.map((record: any) => record[mapping.idColumn])
    );

    console.log(`IDs en Supabase: ${existingIds.size}`);
    console.log(`IDs en Sheets: ${sheetIds.size}`);
    console.log(`Primeros 5 IDs en Supabase:`, [...existingIds].slice(0, 5));
    console.log(`Primeros 5 IDs en Sheets:`, [...sheetIds].slice(0, 5));

    // Determinar operaciones
    const toInsert = transformedData.filter(
      (record: any) => !existingIds.has(record[mapping.idColumn])
    );
    const toUpdate = transformedData.filter(
      (record: any) => existingIds.has(record[mapping.idColumn])
    );
    const toDelete = [...existingIds].filter(id => !sheetIds.has(id));

    console.log(`\n📊 RESUMEN DE OPERACIONES:`);
    console.log(`A insertar: ${toInsert.length}`);
    console.log(`A actualizar: ${toUpdate.length}`);
    console.log(`A eliminar: ${toDelete.length}`);
    
    if (toUpdate.length > 0) {
      console.log(`\n🔍 IDs a actualizar:`, toUpdate.map((r: any) => r[mapping.idColumn]).slice(0, 10));
    }

    let insertCount = 0;
    let updateCount = 0;
    let deleteCount = 0;

    // Insertar nuevos registros
    if (toInsert.length > 0) {
      console.log(`\n📝 Insertando ${toInsert.length} registros nuevos...`);
      console.log(`Primeros 3 registros a insertar:`, JSON.stringify(toInsert.slice(0, 3), null, 2));
      
      const { error: insertError } = await supabase
        .from(mapping.supabaseTable as any)
        .insert(toInsert);

      if (insertError) {
        console.error('❌ Error al insertar registros:', JSON.stringify(insertError, null, 2));
        throw insertError;
      }
      insertCount = toInsert.length;
      console.log(`✅ ${insertCount} registros insertados`);
    }

    // Actualizar registros existentes
    if (toUpdate.length > 0) {
      console.log(`🔄 Procesando ${toUpdate.length} actualizaciones...`);
      
      for (let i = 0; i < toUpdate.length; i++) {
        const record = toUpdate[i];
        const recordId = record[mapping.idColumn];
        
        console.log(`\n--- Actualizando registro ${i + 1}/${toUpdate.length} ---`);
        console.log(`ID Column Name: "${mapping.idColumn}"`);
        console.log(`Record ID Value: "${recordId}" (type: ${typeof recordId})`);
        console.log(`Record completo:`, JSON.stringify(record, null, 2));
        
        // Validar que el ID exista y no sea null/undefined/vacío
        if (!recordId || recordId === '' || recordId === null || recordId === undefined) {
          console.error(`❌ Error: Registro sin ID válido, omitiendo actualización`);
          continue;
        }
        
        // Crear objeto sin el ID para el update
        const { [mapping.idColumn]: _, ...updateData } = record;
        console.log(`Datos a actualizar:`, JSON.stringify(updateData, null, 2));
        console.log(`WHERE ${mapping.idColumn} = "${recordId}"`);
        
        try {
          const { error: updateError, data } = await supabase
            .from(mapping.supabaseTable as any)
            .update(updateData)
            .eq(mapping.idColumn, recordId)
            .select();

          if (updateError) {
            console.error(`❌ Error al actualizar registro ${recordId}:`, JSON.stringify(updateError, null, 2));
            throw updateError; // Lanzar error para detener y mostrar el problema
          } else {
            console.log(`✅ Registro actualizado exitosamente`);
            console.log(`Resultado:`, JSON.stringify(data, null, 2));
            updateCount++;
          }
        } catch (err: any) {
          console.error(`❌ Excepción al actualizar:`, err);
          throw err; // Re-lanzar para que se capture arriba
        }
      }
      console.log(`✓ ${updateCount} registros actualizados de ${toUpdate.length} intentos`);
    }

    // Eliminar registros que ya no están en Sheets
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from(mapping.supabaseTable as any)
        .delete()
        .in(mapping.idColumn, toDelete);

      if (deleteError) {
        console.error('Error al eliminar registros:', deleteError);
      } else {
        deleteCount = toDelete.length;
        console.log(`✓ ${deleteCount} registros eliminados`);
      }
    }

    console.log('=== SINCRONIZACIÓN COMPLETADA ===');

    return NextResponse.json({
      success: true,
      message: "Sincronización completada",
      inserted: insertCount,
      updated: updateCount,
      deleted: deleteCount,
    });

  } catch (error: any) {
    console.error('Error en la sincronización:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido",
      },
      { status: 500 }
    );
  }
}
