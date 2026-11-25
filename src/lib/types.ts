export type Tag = 'Diretoria' | 'Central' | 'Líder' | 'Supervisão'
export type TipoSupervisao = 'operacao' | 'administrativa' | ''
export type Status = 'pendente' | 'em_andamento' | 'aguardando' | 'concluido'
export type Prioridade = 'baixa' | 'normal' | 'urgente'
export type TipoAuditoria = 'presencial' | 'adm'

export interface Usuario {
  id: string
  nome: string
  email: string
  tag: Tag
  lojas_acesso: string[] | null
  setores_acesso: string[] | null
  tipo_supervisao: TipoSupervisao | null
  ativo: boolean | null
}

export interface Loja {
  nome: string
  ativo: boolean
}

export interface Solicitacao {
  id: string
  loja: string
  setor: string
  titulo: string
  descricao: string | null
  prioridade: Prioridade
  imagem: string | null
  status: Status
  resposta: string | null
  criador_id: string | null
  criado_em: string | null
  timestamp: number | null
  /** URL assinada (temporária) da imagem; só existe no app, não no banco */
  imagemUrl?: string
}

export interface LogItem {
  id: number
  usuario_nome: string | null
  ip: string | null
  acao: string
  criado_em: string | null
}

export interface NotaAuditoria {
  loja: string
  ano: number
  mes: number
  tipo: TipoAuditoria
  nota: number | null
}

export interface DocAuditoria {
  loja: string
  ano: number
  tipo: TipoAuditoria
  caminho: string
  nome_arquivo: string
}

export interface Resposta {
  id: number
  solicitacao_id: string
  autor_nome: string
  autor_tag: string | null
  tipo: 'resposta' | 'encaminhamento'
  texto: string
  criado_em: string
}
