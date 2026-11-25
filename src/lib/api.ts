// Todas as chamadas ao Supabase ficam aqui. As telas só chamam estas funções.
import { BUCKET_ANEXOS, BUCKET_AUDITORIAS } from './constants'
import { supabase } from './supabase'
import type {
  DocAuditoria,
  Loja,
  LogItem,
  NotaAuditoria,
  Prioridade,
  Solicitacao,
  Status,
  Tag,
  TipoAuditoria,
  TipoSupervisao,
  Usuario,
} from './types'

/** Erro com mensagem já pronta para mostrar ao usuário */
export class ErroApp extends Error {}

function falhar(contexto: string, error: { message: string } | null): never {
  console.error(contexto, error)
  throw new ErroApp(`${contexto}: ${error?.message ?? 'erro desconhecido'}`)
}

// ---------------------------------------------------------------- perfil

export async function buscarPerfil(id: string): Promise<Usuario | null> {
  const { data, error } = await supabase.from('usuarios').select('*').eq('id', id).maybeSingle()
  if (error) falhar('Erro ao carregar perfil', error)
  return data as Usuario | null
}

export async function atualizarMeuNome(nome: string): Promise<void> {
  const { error } = await supabase.rpc('atualizar_meu_nome', { p_nome: nome })
  if (error) falhar('Não foi possível salvar o nome', error)
}

/** Grava um log. Usuário e IP são preenchidos pelo servidor. Nunca lança erro. */
export async function registrarLog(acao: string): Promise<void> {
  const { error } = await supabase.rpc('registrar_log', { p_acao: acao })
  if (error) console.error('Erro ao registrar log:', error)
}

// ---------------------------------------------------------------- lojas

export async function listarLojas(): Promise<Loja[]> {
  const { data, error } = await supabase.from('lojas').select('nome, ativo').order('nome')
  if (error) falhar('Erro ao carregar lojas', error)
  return (data ?? []) as Loja[]
}

export async function salvarLoja(nome: string, ativo = true): Promise<void> {
  const { error } = await supabase.from('lojas').upsert({ nome, ativo })
  if (error) falhar('Não foi possível salvar a loja', error)
  await registrarLog(`${ativo ? 'Cadastrou/reativou' : 'Desativou'} a loja ${nome}`)
}

// ---------------------------------------------------------------- anexos

async function urlAssinada(bucket: string, caminho: string | null): Promise<string | undefined> {
  if (!caminho) return undefined
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(caminho, 3600)
  if (error) {
    console.error('Erro ao gerar link do arquivo:', error)
    return undefined
  }
  return data.signedUrl
}

export async function comImagem(s: Solicitacao): Promise<Solicitacao> {
  return s.imagem ? { ...s, imagemUrl: await urlAssinada(BUCKET_ANEXOS, s.imagem) } : s
}

function nomeSeguro(arquivo: File): string {
  const ext = (arquivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
}

async function enviarAnexo(arquivo: File, userId: string): Promise<string> {
  if (!arquivo.type.startsWith('image/')) throw new ErroApp('O anexo precisa ser uma imagem.')
  if (arquivo.size > 10 * 1024 * 1024) throw new ErroApp('A imagem pode ter no máximo 10 MB.')
  const caminho = `${userId}/${nomeSeguro(arquivo)}`
  const { data, error } = await supabase.storage
    .from(BUCKET_ANEXOS)
    .upload(caminho, arquivo, { cacheControl: '3600', upsert: false, contentType: arquivo.type })
  if (error) falhar('Não foi possível enviar a foto', error)
  return data.path
}

// ---------------------------------------------------------------- solicitações

export async function listarSolicitacoes(): Promise<Solicitacao[]> {
  // O RLS já devolve só o que este usuário pode ver
  const { data, error } = await supabase
    .from('solicitacoes')
    .select('*')
    .order('timestamp', { ascending: false })
  if (error) falhar('Erro ao carregar solicitações', error)
  return Promise.all(((data ?? []) as Solicitacao[]).map(comImagem))
}

export interface NovaSolicitacao {
  loja: string
  setor: string
  titulo: string
  descricao: string
  prioridade: Prioridade
  arquivo: File | null
}

export async function criarSolicitacao(nova: NovaSolicitacao, userId: string): Promise<Solicitacao> {
  const imagem = nova.arquivo ? await enviarAnexo(nova.arquivo, userId) : ''

  const { data, error } = await supabase
    .from('solicitacoes')
    .insert({
      loja: nova.loja,
      setor: nova.setor,
      titulo: nova.titulo.trim(),
      descricao: nova.descricao.trim(),
      prioridade: nova.prioridade,
      imagem,
      status: 'pendente',
      resposta: '',
      criador_id: userId,
    })
    .select()
    .single()

  if (error) {
    if (imagem) await supabase.storage.from(BUCKET_ANEXOS).remove([imagem]) // evita foto órfã
    falhar('Não foi possível enviar a solicitação', error)
  }
  const criada = data as Solicitacao
  await registrarLog(`Criou a solicitação ${criada.id} para ${criada.loja}`)
  return comImagem(criada)
}

export async function mudarStatus(id: string, status: Status): Promise<Solicitacao> {
  const { data, error } = await supabase.rpc('mudar_status_solicitacao', { p_id: id, p_status: status })
  if (error) falhar('Não foi possível mudar o status', error)
  return comImagem(data as Solicitacao)
}

export async function responder(id: string, texto: string): Promise<Solicitacao> {
  const { data, error } = await supabase.rpc('responder_solicitacao', { p_id: id, p_texto: texto })
  if (error) falhar('Não foi possível salvar a resposta', error)
  return comImagem(data as Solicitacao)
}

export async function excluirSolicitacao(s: Solicitacao): Promise<void> {
  const { error } = await supabase.from('solicitacoes').delete().eq('id', s.id)
  if (error) falhar('Não foi possível excluir', error)
  if (s.imagem) await supabase.storage.from(BUCKET_ANEXOS).remove([s.imagem])
  await registrarLog(`Excluiu a solicitação ${s.id}`)
}

// ---------------------------------------------------------------- usuários (Diretoria)

export async function listarUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase.from('usuarios').select('*').order('nome')
  if (error) falhar('Erro ao carregar usuários', error)
  return (data ?? []) as Usuario[]
}

export interface DadosUsuario {
  nome: string
  tag: Tag
  lojas_acesso: string[]
  setores_acesso: string[]
  tipo_supervisao: TipoSupervisao
}

function normalizarAcessos(d: DadosUsuario): DadosUsuario {
  // Monta o objeto campo a campo: nunca envia ao banco campos extras do formulário
  return {
    tag: d.tag,
    nome: d.nome.trim(),
    lojas_acesso: d.tag === 'Líder' ? d.lojas_acesso : [],
    setores_acesso: d.tag === 'Central' ? d.setores_acesso : [],
    tipo_supervisao: d.tag === 'Supervisão' ? d.tipo_supervisao || 'operacao' : '',
  }
}

/** Lê a mensagem de erro que a Edge Function devolveu no corpo */
async function erroDaFuncao(error: unknown): Promise<string> {
  const e = error as { message?: string; context?: { json?: () => Promise<{ error?: string }> } }
  try {
    const corpo = await e.context?.json?.()
    if (corpo?.error) return corpo.error
  } catch {
    /* mantém a mensagem genérica */
  }
  return e.message ?? 'erro desconhecido'
}

export async function criarUsuario(email: string, senha: string, dados: DadosUsuario): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: { email: email.trim().toLowerCase(), senha, ...normalizarAcessos(dados) },
  })
  if (error) throw new ErroApp('Não foi possível cadastrar: ' + (await erroDaFuncao(error)))
  if (data?.error) throw new ErroApp('Não foi possível cadastrar: ' + data.error)
  await registrarLog(`Cadastrou novo usuário: ${email.trim().toLowerCase()}`)
}

export async function atualizarUsuario(id: string, email: string, dados: DadosUsuario): Promise<void> {
  const { error } = await supabase.from('usuarios').update(normalizarAcessos(dados)).eq('id', id)
  if (error) falhar('Não foi possível salvar as alterações', error)
  await registrarLog(`Editou o usuário ${email}`)
}

export async function redefinirSenhaDeUsuario(id: string, email: string, senha: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-set-password', {
    body: { userId: id, novaSenha: senha },
  })
  if (error) throw new ErroApp('Não foi possível redefinir a senha: ' + (await erroDaFuncao(error)))
  if (data?.error) throw new ErroApp('Não foi possível redefinir a senha: ' + data.error)
  await registrarLog(`Redefiniu a senha do usuário ${email}`)
}

export async function definirAtivo(u: Usuario, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('usuarios').update({ ativo }).eq('id', u.id)
  if (error) falhar(`Não foi possível ${ativo ? 'reativar' : 'desativar'} o usuário`, error)
  await registrarLog(`${ativo ? 'Reativou' : 'Desativou'} o usuário ${u.email}`)
}

// ---------------------------------------------------------------- logs (Diretoria)

export async function listarLogs(limite = 1000): Promise<LogItem[]> {
  const { data, error } = await supabase
    .from('logs')
    .select('id, usuario_nome, ip, acao, criado_em')
    .order('id', { ascending: false })
    .limit(limite)
  if (error) falhar('Erro ao carregar logs', error)
  return (data ?? []) as LogItem[]
}

// ---------------------------------------------------------------- auditorias

export async function listarNotas(ano: number): Promise<NotaAuditoria[]> {
  const { data, error } = await supabase
    .from('auditorias')
    .select('loja, ano, mes, tipo, nota')
    .eq('ano', ano)
  if (error) falhar('Erro ao carregar auditorias', error)
  return (data ?? []) as NotaAuditoria[]
}

export async function salvarNota(
  loja: string,
  ano: number,
  mes: number,
  tipo: TipoAuditoria,
  nota: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('auditorias')
    .upsert({ loja, ano, mes, tipo, nota, atualizado_em: new Date().toISOString() })
  if (error) falhar('Não foi possível salvar a nota', error)
  await registrarLog(
    `Atualizou nota de ${String(mes).padStart(2, '0')}/${ano} (${tipo}) da loja ${loja} para ${nota ?? 'vazio'}`,
  )
}

export async function listarDocumentos(ano: number): Promise<DocAuditoria[]> {
  const { data, error } = await supabase
    .from('auditoria_documentos')
    .select('loja, ano, tipo, caminho, nome_arquivo')
    .eq('ano', ano)
  if (error) falhar('Erro ao carregar documentos', error)
  return (data ?? []) as DocAuditoria[]
}

export async function enviarDocumento(
  loja: string,
  ano: number,
  tipo: TipoAuditoria,
  arquivo: File,
  anterior?: DocAuditoria,
): Promise<void> {
  if (arquivo.size > 25 * 1024 * 1024) throw new ErroApp('O arquivo pode ter no máximo 25 MB.')
  const caminho = `${ano}/${tipo}/${nomeSeguro(arquivo)}`
  const { error: upErr } = await supabase.storage
    .from(BUCKET_AUDITORIAS)
    .upload(caminho, arquivo, { upsert: false, contentType: arquivo.type || undefined })
  if (upErr) falhar('Não foi possível enviar o arquivo', upErr)

  const { error } = await supabase
    .from('auditoria_documentos')
    .upsert({ loja, ano, tipo, caminho, nome_arquivo: arquivo.name, enviado_em: new Date().toISOString() })
  if (error) {
    await supabase.storage.from(BUCKET_AUDITORIAS).remove([caminho])
    falhar('Não foi possível registrar o arquivo', error)
  }
  if (anterior) await supabase.storage.from(BUCKET_AUDITORIAS).remove([anterior.caminho])
  await registrarLog(`Enviou relatório de auditoria (${tipo}, ${ano}) da loja ${loja}: ${arquivo.name}`)
}

export async function abrirDocumento(doc: DocAuditoria): Promise<void> {
  const url = await urlAssinada(BUCKET_AUDITORIAS, doc.caminho)
  if (!url) throw new ErroApp('Não foi possível abrir o arquivo.')
  window.open(url, '_blank', 'noopener')
}
