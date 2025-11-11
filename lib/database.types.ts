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
          id: number
          id_usuario: number | null
          nombre: string
          estado: string | null
          expediente: string | null
        }
        Insert: {
          id?: never
          id_usuario?: number | null
          nombre?: string
          estado?: string | null
          expediente?: string | null
        }
        Update: {
          id?: never
          id_usuario?: number | null
          nombre?: string
          estado?: string | null
          expediente?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "casos_id_usuario_fkey"
            columns: ["id_usuario"]
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          }
        ]
      }
      contactos: {
        Row: {
          id: number
          nombre: string | null
        }
        Insert: {
          id?: never
          nombre?: string | null
        }
        Update: {
          id?: never
          nombre?: string | null
        }
        Relationships: []
      }
      funcionarios: {
        Row: {
          id: number
          nombre: string | null
          cargo: string | null
        }
        Insert: {
          id?: never
          nombre?: string | null
          cargo?: string | null
        }
        Update: {
          id?: never
          nombre?: string | null
          cargo?: string | null
        }
        Relationships: []
      }
      trabajos_por_hora: {
        Row: {
          id: number
          caso_asignado: number | null
          responsable: number | null
          solicitante: number | null
          titulo: string | null
          descripcion: string | null
          fecha: string | null
          duracion: number | null
        }
        Insert: {
          id?: never
          caso_asignado?: number | null
          responsable?: number | null
          solicitante?: number | null
          titulo?: string | null
          descripcion?: string | null
          fecha?: string | null
          duracion?: number | null
        }
        Update: {
          id?: never
          caso_asignado?: number | null
          responsable?: number | null
          solicitante?: number | null
          titulo?: string | null
          descripcion?: string | null
          fecha?: string | null
          duracion?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trabajos_por_hora_caso_asignado_fkey"
            columns: ["caso_asignado"]
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajos_por_hora_responsable_fkey"
            columns: ["responsable"]
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajos_por_hora_solicitante_fkey"
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