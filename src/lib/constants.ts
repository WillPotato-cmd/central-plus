import type { Prioridade, Status } from './types'

export const SETORES_CENTRAL = [
  'Recursos Humanos',
  'Departamento Pessoal',
  'Administrativo',
  'Compras',
  'Manutenção',
  'Logistica',
  'Marketing',
  'TI',
] as const

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export const STATUS_LABEL: Record<Status, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  aguardando: 'Aguardando',
  concluido: 'Concluído',
}

export const STATUS_ORDEM: Status[] = ['pendente', 'em_andamento', 'aguardando', 'concluido']

export const PRIORIDADES: Prioridade[] = ['baixa', 'normal', 'urgente']
export const PESO_PRIORIDADE: Record<Prioridade, number> = { urgente: 1, normal: 2, baixa: 3 }

export const BUCKET_ANEXOS = 'anexos-solicitacoes'
export const BUCKET_AUDITORIAS = 'auditorias'

export const SENHA_MINIMA = 8
export const INATIVIDADE_MS = 30 * 60 * 1000
export const ITENS_POR_PAGINA = 5
