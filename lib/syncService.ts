import { supabase } from './supabase';
import { GoogleSheetsService } from './googleSheets';
import { Database } from './database.types';

type Usuario = Database['public']['Tables']['usuarios']['Row'];

export class SyncService {
  
  // 🔄 Sincronizar desde Google Sheets (Clientes) a Supabase (usuarios)
  static async syncClientesToUsuarios(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      console.log('🔄 Iniciando sincronización Clientes → usuarios...');

      // Leer datos de Google Sheets
      const clientesData = await GoogleSheetsService.readClientes();
      
      // Obtener usuarios existentes de Supabase
      const { data: existingUsuarios, error: fetchError } = await supabase
        .from('usuarios')
        .select('*');

      if (fetchError) throw fetchError;

      // Crear mapas para comparación
      const existingUsuariosMap = new Map((existingUsuarios || []).map(user => [user.id_sheets, user]));
      const clientesIdSheetsSet = new Set(clientesData.map(cliente => cliente.id_sheets));
      
      let inserted = 0, updated = 0, deleted = 0, errors = 0;
      const errorDetails: any[] = [];

      // 🗑️ PASO 1: Detectar y eliminar registros que ya no están en Google Sheets
      console.log('🗑️ Detectando eliminaciones...');
      for (const [idSheets, usuario] of existingUsuariosMap) {
        if (idSheets && !clientesIdSheetsSet.has(idSheets)) {
          try {
            console.log(`🗑️ Eliminando usuario ${idSheets} (${usuario.nombre}) - ya no está en Sheets`);
            
            const { error } = await supabase
              .from('usuarios')
              .delete()
              .eq('id_sheets', idSheets);
            
            if (error) throw error;
            deleted++;
            console.log(`✅ Usuario ${idSheets} eliminado de Supabase`);
          } catch (deleteError: any) {
            console.error(`❌ Error eliminando usuario ${idSheets}:`, deleteError);
            errors++;
            errorDetails.push({
              id_sheets: idSheets,
              nombre: usuario.nombre,
              operation: 'delete',
              error: deleteError.message
            });
          }
        }
      }

      // 📝 PASO 2: Procesar inserciones y actualizaciones desde Google Sheets
      console.log('📝 Procesando inserciones y actualizaciones...');
      for (const cliente of clientesData) {
        try {
          if (existingUsuariosMap.has(cliente.id_sheets)) {
            // Actualizar usuario existente
            const { error } = await supabase
              .from('usuarios')
              .update(cliente)
              .eq('id_sheets', cliente.id_sheets);
            
            if (error) throw error;
            updated++;
            console.log(`✅ Usuario ${cliente.id_sheets} actualizado: ${cliente.nombre}`);
          } else {
            // Insertar nuevo usuario
            const { error } = await supabase
              .from('usuarios')
              .insert([cliente]);
            
            if (error) throw error;
            inserted++;
            console.log(`✅ Usuario ${cliente.id_sheets} insertado: ${cliente.nombre}`);
          }
        } catch (recordError: any) {
          console.error(`❌ Error procesando cliente ${cliente.id_sheets}:`, recordError);
          errors++;
          errorDetails.push({
            id_sheets: cliente.id_sheets,
            nombre: cliente.nombre,
            operation: cliente.id_sheets && existingUsuariosMap.has(cliente.id_sheets) ? 'update' : 'insert',
            error: recordError.message
          });
        }
      }

      const success = errors === 0;
      const message = `Clientes→usuarios: ${inserted} insertados, ${updated} actualizados, ${deleted} eliminados, ${errors} errores`;
      
      console.log(`📊 Resultado: ${message}`);

      return {
        success,
        message,
        details: {
          processed: clientesData.length,
          inserted,
          updated,
          deleted,
          errors,
          errorDetails: errors > 0 ? errorDetails : undefined
        }
      };

    } catch (error) {
      console.error('❌ Error en syncClientesToUsuarios:', error);
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        details: null
      };
    }
  }

  // 🔄 Sincronizar desde Supabase (usuarios) a Google Sheets (Clientes)
  static async syncUsuariosToClientes(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      console.log('🔄 Iniciando sincronización usuarios → Clientes...');

      // Leer usuarios de Supabase
      const { data: usuarios, error } = await supabase
        .from('usuarios')
        .select('*')
        .order('id');

      if (error) throw error;

      // Leer datos actuales de Google Sheets para detectar eliminaciones
      const currentClientes = await GoogleSheetsService.readClientes();
      
      // Crear sets para comparación
      const usuariosIdSheetsSet = new Set((usuarios || []).map(u => u.id_sheets).filter(id => id));
      const clientesIdSheetsSet = new Set(currentClientes.map(c => c.id_sheets));
      
      let syncedRecords = 0;
      let deletedFromSheets = 0;

      // 🗑️ PASO 1: Detectar registros en Sheets que ya no están en Supabase
      console.log('🗑️ Detectando registros para eliminar de Google Sheets...');
      const clientesToKeep = currentClientes.filter(cliente => {
        if (usuariosIdSheetsSet.has(cliente.id_sheets)) {
          return true; // Mantener este registro
        } else {
          console.log(`🗑️ Registro ${cliente.id_sheets} (${cliente.nombre}) será eliminado de Sheets`);
          deletedFromSheets++;
          return false; // Eliminar este registro
        }
      });

      // 📝 PASO 2: Escribir datos actualizados (solo los que deben mantenerse + actualizaciones)
      const usuariosToWrite = usuarios || [];
      await GoogleSheetsService.writeClientes(usuariosToWrite);
      
      syncedRecords = usuariosToWrite.length;
      
      console.log(`📊 ${syncedRecords} usuarios sincronizados a Clientes, ${deletedFromSheets} eliminados`);

      return {
        success: true,
        message: `usuarios→Clientes: ${syncedRecords} sincronizados, ${deletedFromSheets} eliminados`,
        details: { 
          records: syncedRecords,
          deleted: deletedFromSheets,
          totalInSupabase: usuariosToWrite.length,
          totalInSheetsBefore: currentClientes.length
        }
      };

    } catch (error) {
      console.error('❌ Error en syncUsuariosToClientes:', error);
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        details: null
      };
    }
  }

  // 🔄 Sincronización bidireccional con prioridad a eliminaciones desde AppSheet
  static async syncBidirectional(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      console.log('🔄 Iniciando sincronización bidireccional (AppSheet tiene prioridad)...');
      
      // PASO 1: Sincronizar desde Clientes a usuarios (Google Sheets/AppSheet tiene prioridad)
      // Esto incluye eliminaciones, inserciones y actualizaciones
      const clientesToUsuarios = await this.syncClientesToUsuarios();
      
      // PASO 2: Sincronizar desde usuarios a Clientes solo para mantener consistencia
      // (en caso de que haya cambios directos en Supabase)
      const usuariosToClientes = await this.syncUsuariosToClientes();

      const totalInserted = (clientesToUsuarios.details?.inserted || 0);
      const totalUpdated = (clientesToUsuarios.details?.updated || 0);
      const totalDeleted = (clientesToUsuarios.details?.deleted || 0) + (usuariosToClientes.details?.deleted || 0);

      return {
        success: clientesToUsuarios.success && usuariosToClientes.success,
        message: `Bidireccional: ${totalInserted} insertados, ${totalUpdated} actualizados, ${totalDeleted} eliminados`,
        details: {
          clientesToUsuarios: clientesToUsuarios.details,
          usuariosToClientes: usuariosToClientes.details,
          summary: {
            totalInserted,
            totalUpdated,
            totalDeleted,
            errors: (clientesToUsuarios.details?.errors || 0)
          }
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Error en sincronización bidireccional: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        details: null
      };
    }
  }

  // 📊 Obtener estadísticas de ambas fuentes
  static async getStats(): Promise<{
    supabaseUsuarios: number;
    sheetsClientes: number;
    lastSyncTime: string;
    error?: string;
  }> {
    try {
      // Contar usuarios en Supabase
      const { count: supabaseCount, error: supabaseError } = await supabase
        .from('usuarios')
        .select('*', { count: 'exact', head: true });

      if (supabaseError) throw supabaseError;

      // Contar clientes en Google Sheets
      const sheetsCount = await GoogleSheetsService.getClientesStats();

      return {
        supabaseUsuarios: supabaseCount || 0,
        sheetsClientes: sheetsCount,
        lastSyncTime: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      return {
        supabaseUsuarios: 0,
        sheetsClientes: 0,
        lastSyncTime: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }

  // 🔍 Validar configuración
  static async validateConfiguration(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // Validar conexión a Supabase
      const { error: supabaseError } = await supabase
        .from('usuarios')
        .select('count', { count: 'exact', head: true });

      if (supabaseError) {
        issues.push(`❌ Error conectando a Supabase: ${supabaseError.message}`);
      } else {
        issues.push('✅ Conexión a Supabase OK');
      }

      // Validar Google Sheets
      const sheetsValidation = await GoogleSheetsService.validateClientesConfiguration();
      issues.push(...sheetsValidation.issues);

      if (sheetsValidation.valid) {
        issues.push('✅ Configuración de Google Sheets OK');
      }

      // Mostrar headers de la hoja
      try {
        const headers = await GoogleSheetsService.getClientesHeaders();
        if (headers.length > 0) {
          issues.push(`📋 Headers encontrados en Clientes: ${headers.join(', ')}`);
        }
      } catch (headerError) {
        issues.push(`⚠️ No se pudieron leer los headers de Clientes`);
      }

    } catch (error) {
      issues.push(`❌ Error en validación: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }

    const valid = !issues.some(issue => issue.startsWith('❌'));

    return { valid, issues };
  }

  // 🧪 Método de prueba para leer algunos registros
  static async testRead(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log('🧪 Probando lectura de datos...');

      // Leer primeros 3 usuarios de Supabase
      const { data: usuarios, error: supabaseError } = await supabase
        .from('usuarios')
        .select('*')
        .limit(3);

      if (supabaseError) throw supabaseError;

      // Leer primeros registros de Google Sheets
      const clientes = await GoogleSheetsService.readClientes();

      return {
        success: true,
        message: `Supabase: ${usuarios?.length || 0} usuarios, Sheets: ${clientes.length} clientes`,
        data: {
          supabaseUsuarios: usuarios?.slice(0, 2) || [],
          sheetsClientes: clientes.slice(0, 2) || []
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Error en prueba: ${error instanceof Error ? error.message : 'Error desconocido'}`
      };
    }
  }
}