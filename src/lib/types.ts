export type StatusRecurso = 'livre' | 'ocupado' | 'manutencao'

// Atualizado para refletir o novo ENUM do PostgreSQL
export type StatusReserva = 'pendente' | 'aprovada' | 'cancelada'

export interface Usuario {
  id_usuario: number
  uuid: string | null
  nome: string
  email: string
  matricula: string | null
}

export interface Administrador {
  id_adm: number
  uuid: string | null
  nome: string
  email: string
  codigo: string | null
}

export interface Sala {
  id_sala: number
  nome: string
  lotacao: number
  status: StatusRecurso
}

export interface Equipamento {
  id: number
  nome: string
  quantidade: number
  status: StatusRecurso
}

export interface ReservaSala {
  id: number
  id_sala: number
  id_usuario: number
  id_adm: number | null
  inicio: string
  fim: string
  motivo: string | null
  quantidade_pessoas: number | null
  observacao: string | null
  status: StatusReserva
}

export interface ReservaEquipamento {
  id: number
  id_equipamento: number
  id_usuario: number
  id_adm: number | null
  inicio: string
  fim: string
  observacao: string | null
  status: StatusReserva
}

export type TipoRecurso = 'sala' | 'equipamento'

export type Role = 'admin' | 'aluno' | null

export interface PreCadastro {
  tipo: 'usuario' | 'administrador'
  nome: string
  email: string
  identificador: string
  criado_em: string
}