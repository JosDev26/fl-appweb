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
          id: number
          caso_asociado: number | null
          comenario: string
          fecha: string | null
          hora: string | null
        }
        Insert: {
          id?: never
          caso_asociado?: number | null
          comenario?: string
          fecha?: string | null
          hora?: string | null
        }
        Update: {
          id?: never
          caso_asociado?: number | null
          comenario?: string
          fecha?: string | null
          hora?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actualizaciones_caso_asociado_fkey"
            columns: ["caso_asociado"]
            referencedRelation: "casos"
            referencedColumns: ["id"]
          }
        ]
      }
      casos: {
        Row: {
          id: string
          nombre: string
          estado: string | null
          expediente: string | null
          id_cliente: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nombre: string
          estado?: string | null
          expediente?: string | null
          id_cliente?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          estado?: string | null
          expediente?: string | null
          id_cliente?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
          estaRegistrado: boolean | null
          password: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nombre: string
          cedula?: number | null
          esDolar?: boolean | null
          iva_perc?: number | null
          estaRegistrado?: boolean | null
          password?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          cedula?: number | null
          esDolar?: boolean | null
          iva_perc?: number | null
          estaRegistrado?: boolean | null
          password?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
          id: number
          id_sheets: string | null
          nombre: string
          tipo_cedula: string | null
          cedula: number | null
          telefono: string | null
          correo: string | null
          esDolar: boolean | null
          estaRegistrado: boolean | null
          password: string | null
        }
        Insert: {
          id?: never
          id_sheets?: string | null
          nombre?: string
          tipo_cedula?: string | null
          cedula?: number | null
          telefono?: string | null
          correo?: string | null
          esDolar?: boolean | null
          estaRegistrado?: boolean | null
          password?: string | null
        }
        Update: {
          id?: never
          id_sheets?: string | null
          nombre?: string
          tipo_cedula?: string | null
          cedula?: number | null
          telefono?: string | null
          correo?: string | null
          esDolar?: boolean | null
          estaRegistrado?: boolean | null
          password?: string | null
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