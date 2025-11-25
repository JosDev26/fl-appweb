export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      actualizaciones: {
        Row: {
          id: string
          tipo_cliente: string | null
          id_cliente: string | null
          id_solicitud: string | null
          comentario: string | null
          tiempo: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          tipo_cliente?: string | null
          id_cliente?: string | null
          id_solicitud?: string | null
          comentario?: string | null
          tiempo?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tipo_cliente?: string | null
          id_cliente?: string | null
          id_solicitud?: string | null
          comentario?: string | null
          tiempo?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_solicitud"
            columns: ["id_solicitud"]
            referencedRelation: "solicitudes"
            referencedColumns: ["id"]
          }
        ]
      }
      casos: {
        Row: {
          id: string
          nombre: string
          estado: string | null
          materia: string | null
          expediente: string | null
          id_cliente: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nombre: string
          estado?: string | null
          materia?: string | null
          expediente?: string | null
          id_cliente?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          estado?: string | null
          materia?: string | null
          expediente?: string | null
          id_cliente?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_materia"
            columns: ["materia"]
            referencedRelation: "materias"
            referencedColumns: ["id"]
          }
        ]
      }
      contactos: {
        Row: {
          id: string
          nombre: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nombre?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nombre?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      empresas: {
        Row: {
          id: string
          nombre: string
          cedula: number | null
          esDolar: boolean | null
          iva_perc: number | null
          tarifa_hora: number | null
          estaRegistrado: boolean | null
          password: string | null
          modoPago: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nombre: string
          cedula?: number | null
          esDolar?: boolean | null
          iva_perc?: number | null
          tarifa_hora?: number | null
          estaRegistrado?: boolean | null
          password?: string | null
          modoPago?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          cedula?: number | null
          esDolar?: boolean | null
          iva_perc?: number | null
          tarifa_hora?: number | null
          estaRegistrado?: boolean | null
          password?: string | null
          modoPago?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      gastos: {
        Row: {
          id: string
          id_asociacion: string | null
          id_caso: string | null
          id_responsable: string | null
          id_cliente: string | null
          fecha: string | null
          producto: string | null
          total_cobro: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          id_asociacion?: string | null
          id_caso?: string | null
          id_responsable?: string | null
          id_cliente?: string | null
          fecha?: string | null
          producto?: string | null
          total_cobro?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          id_asociacion?: string | null
          id_caso?: string | null
          id_responsable?: string | null
          id_cliente?: string | null
          fecha?: string | null
          producto?: string | null
          total_cobro?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_responsable"
            columns: ["id_responsable"]
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          }
        ]
      }
      funcionarios: {
        Row: {
          id: string
          nombre: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nombre?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nombre?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invitation_codes: {
        Row: {
          id: string
          code: string
          type: 'cliente' | 'empresa'
          created_at: string
          expires_at: string
          used_at: string | null
          used_by: string | null
          is_active: boolean
          max_uses: number
          current_uses: number
          created_by: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          code: string
          type: 'cliente' | 'empresa'
          created_at?: string
          expires_at: string
          used_at?: string | null
          used_by?: string | null
          is_active?: boolean
          max_uses?: number
          current_uses?: number
          created_by?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          code?: string
          type?: 'cliente' | 'empresa'
          created_at?: string
          expires_at?: string
          used_at?: string | null
          used_by?: string | null
          is_active?: boolean
          max_uses?: number
          current_uses?: number
          created_by?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      historial_reportes: {
        Row: {
          id: string
          fecha: string | null
          hora: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          fecha?: string | null
          hora?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          fecha?: string | null
          hora?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      materias: {
        Row: {
          id: string
          nombre: string | null
        }
        Insert: {
          id: string
          nombre?: string | null
        }
        Update: {
          id?: string
          nombre?: string | null
        }
        Relationships: []
      }
      solicitudes: {
        Row: {
          id: string
          id_cliente: string | null
          titulo: string | null
          descripcion: string | null
          materia: string | null
          etapa_actual: string | null
          modalidad_pago: string | null
          costo_neto: number | null
          se_cobra_iva: boolean | null
          monto_iva: number | null
          cantidad_cuotas: number | null
          monto_por_cuota: number | null
          total_a_pagar: number | null
          estado_pago: string | null
          monto_pagado: number | null
          saldo_pendiente: number | null
          expediente: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          id_cliente?: string | null
          titulo?: string | null
          descripcion?: string | null
          materia?: string | null
          etapa_actual?: string | null
          modalidad_pago?: string | null
          costo_neto?: number | null
          se_cobra_iva?: boolean | null
          monto_iva?: number | null
          cantidad_cuotas?: number | null
          monto_por_cuota?: number | null
          total_a_pagar?: number | null
          estado_pago?: string | null
          monto_pagado?: number | null
          saldo_pendiente?: number | null
          expediente?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          id_cliente?: string | null
          titulo?: string | null
          descripcion?: string | null
          materia?: string | null
          etapa_actual?: string | null
          modalidad_pago?: string | null
          costo_neto?: number | null
          se_cobra_iva?: boolean | null
          monto_iva?: number | null
          cantidad_cuotas?: number | null
          monto_por_cuota?: number | null
          total_a_pagar?: number | null
          estado_pago?: string | null
          monto_pagado?: number | null
          saldo_pendiente?: number | null
          expediente?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_cliente"
            columns: ["id_cliente"]
            referencedRelation: "usuarios"
            referencedColumns: ["id_sheets"]
          }
        ]
      }
      trabajos_por_hora: {
        Row: {
          id: string
          caso_asignado: string | null
          responsable: string | null
          solicitante: string | null
          id_cliente: string | null
          titulo: string | null
          descripcion: string | null
          fecha: string | null
          duracion: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          caso_asignado?: string | null
          responsable?: string | null
          solicitante?: string | null
          id_cliente?: string | null
          titulo?: string | null
          descripcion?: string | null
          fecha?: string | null
          duracion?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          caso_asignado?: string | null
          responsable?: string | null
          solicitante?: string | null
          id_cliente?: string | null
          titulo?: string | null
          descripcion?: string | null
          fecha?: string | null
          duracion?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_caso"
            columns: ["caso_asignado"]
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_responsable"
            columns: ["responsable"]
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_solicitante"
            columns: ["solicitante"]
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          }
        ]
      }
      usuarios: {
        Row: {
          id: string
          nombre: string
          tipo_cedula: string | null
          cedula: number | null
          telefono: string | null
          correo: string | null
          esDolar: boolean | null
          iva_perc: number | null
          estaRegistrado: boolean | null
          password: string | null
          modoPago: boolean | null
        }
        Insert: {
          id: string
          nombre: string
          tipo_cedula?: string | null
          cedula?: number | null
          telefono?: string | null
          correo?: string | null
          esDolar?: boolean | null
          iva_perc?: number | null
          estaRegistrado?: boolean | null
          password?: string | null
          modoPago?: boolean | null
        }
        Update: {
          id?: string
          nombre?: string
          tipo_cedula?: string | null
          cedula?: number | null
          telefono?: string | null
          correo?: string | null
          esDolar?: boolean | null
          iva_perc?: number | null
          estaRegistrado?: boolean | null
          password?: string | null
          modoPago?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}