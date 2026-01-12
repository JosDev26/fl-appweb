// ===== INTERFACES COMPARTIDAS PARA /dev =====

export interface SyncResult {
  success: boolean
  message: string
  details?: any
}

export interface PaymentReceipt {
  id: string
  user_id: string
  tipo_cliente: string
  file_path: string
  file_name: string
  file_size: number
  file_type: string
  mes_pago: string
  monto_declarado: number | null
  estado: string
  nota_revision: string | null
  uploaded_at: string
}

export interface ClienteModoPago {
  id: string
  id_sheets?: string | null
  nombre: string
  cedula: string
  correo: string | null
  modoPago: boolean
  tipo: 'cliente' | 'empresa'
}

export interface InvitationCode {
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
  notes: string | null
}

export interface InvoiceFile {
  name: string
  id: string
  created_at: string
  updated_at: string
  clientId: string
  clientType: 'cliente' | 'empresa'
  clientName: string
  clientCedula: string
  path: string
}

export interface ClientVistoBueno {
  id: string
  nombre: string
  cedula: string
  darVistoBueno: boolean
  tipo: 'cliente' | 'empresa'
}

export interface GrupoEmpresa {
  id: string
  nombre: string
  empresa_principal_id: string
  empresa_principal?: { id: string; nombre: string }
  empresas_asociadas: { id: string; nombre: string; iva_perc?: number }[]
  created_at: string
}

export interface EmpresaDisponible {
  id: string
  nombre: string
  iva_perc: number
}

export interface DeudaCliente {
  id: string
  nombre: string
  cedula: string
  tipo: 'usuario' | 'empresa'
  grupoId?: string
  grupoNombre?: string
  esGrupoPrincipal?: boolean
  tarifa_hora: number
  iva_perc: number
  mesAnterior: {
    mes: string
    totalHoras: number
    montoHoras: number
    totalGastos: number
    totalMensualidades: number
    subtotal: number
    iva: number
    total: number
  }
}

export interface IngresoResumen {
  mes: string
  total: number
  count: number
}

export interface IngresoDetalle {
  id: string
  user_id: string
  nombre: string
  cedula: string
  tipo_cliente: string
  monto_declarado: number
  mes_pago: string
  approved_at: string
}

export interface PaymentDeadline {
  id: string
  mes: string
  fecha_limite: string
  fecha_inicio: string | null
  created_at: string
  updated_at: string | null
}

export interface GastoEstado {
  id: string
  id_caso: string
  caso_titulo?: string
  id_cliente: string
  cliente_nombre?: string
  descripcion: string
  monto: number
  fecha: string
  estado_pago: 'pendiente' | 'pagado' | 'cancelado'
  id_responsable: string
  responsable_nombre?: string
}

export type SectionType = 
  | 'comprobantes' 
  | 'facturas' 
  | 'plazos' 
  | 'visto-bueno' 
  | 'invitaciones' 
  | 'ingresos' 
  | 'fecha' 
  | 'sync' 
  | 'config' 
  | 'grupos' 
  | 'deudas' 
  | 'gastos-estado' 
  | 'vista-pago'

export type TipoModalidadPago = 'honorarios' | 'mensualidades' | 'tarifa_hora'
