// Ponte com o Avalia Potato: busca (pela Edge Function "avalia") e cálculos.
// Os cálculos reproduzem os do Avalia (RelatorioSemanal, PanoramaMensal,
// NotasTotais), para os números baterem com os de lá.
import { ErroApp } from './api'
import { supabase } from './supabase'

export type Origem = 'ifood' | '99food'

export interface Feedback {
  id: string
  data: string // 'YYYY-MM-DD'
  nota: number
  texto: string | null
  origem: Origem | null
  pedido: string | null
  cliente: string | null
  criado_em: string | null
}

export interface NotaSeca {
  id: string
  mes: string // 'YYYY-MM'
  origem: Origem | null
  nota: number
  quantidade: number
}

export interface MotivoCancelamento {
  motivo: string
  quantidade: number
}

export interface OperacaoMes {
  mes: string
  motivos_cancelamento: MotivoCancelamento[] | null
  tempo_func: string | null
  tempo_pct: number | null
  log_entrega: number | null
  log_preparo: number | null
  log_espera: number | null
}

export interface DadosAvalia {
  vinculada: boolean
  loja?: { nome: string; regiao: string | null } | null
  feedbacks: Feedback[]
  notasSecas: NotaSeca[]
  operacao: OperacaoMes[]
}

export interface LojaAvalia {
  id: string
  nome: string
  regiao: string | null
}

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('avalia', { body })
  if (error) {
    let msg = error.message
    try {
      const corpo = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.()
      if (corpo?.error) msg = corpo.error
    } catch {
      /* mantém a mensagem genérica */
    }
    throw new ErroApp('Avalia: ' + msg)
  }
  if (data?.error) throw new ErroApp('Avalia: ' + data.error)
  return data as T
}

export async function buscarDadosLoja(loja: string): Promise<DadosAvalia> {
  const r = await chamar<Partial<DadosAvalia>>({ acao: 'dados', loja })
  return {
    vinculada: !!r.vinculada,
    loja: r.loja ?? null,
    feedbacks: r.feedbacks ?? [],
    notasSecas: r.notasSecas ?? [],
    operacao: r.operacao ?? [],
  }
}

export async function listarLojasAvalia(): Promise<LojaAvalia[]> {
  const r = await chamar<{ lojas: LojaAvalia[] }>({ acao: 'lojas' })
  return r.lojas ?? []
}

// ---------------------------------------------------------------- datas
// Semana de segunda a domingo, como no Avalia (dateUtils.getWeekRange).

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function hojeISO(): string {
  return isoLocal(new Date())
}

export function intervaloSemana(dataISO: string): { inicio: Date; fim: Date } {
  const d = new Date(dataISO + 'T00:00:00')
  const dia = (d.getDay() + 6) % 7 // 0 = segunda
  const inicio = new Date(d)
  inicio.setDate(d.getDate() - dia)
  const fim = new Date(inicio)
  fim.setDate(inicio.getDate() + 6)
  return { inicio, fim }
}

/** Segunda-feira da semana, 'YYYY-MM-DD' */
export function chaveSemana(dataISO: string): string {
  return isoLocal(intervaloSemana(dataISO).inicio)
}

export function chaveMes(dataISO: string): string {
  return dataISO.slice(0, 7)
}

export function diaMes(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function rotuloSemana(chave: string): string {
  const { inicio, fim } = intervaloSemana(chave)
  return `${diaMes(inicio)} a ${diaMes(fim)}`
}

const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function rotuloMes(mk: string): string {
  const [y, m] = mk.split('-')
  return NOMES_MES[parseInt(m, 10) - 1] + '/' + y
}

export function semanaAnterior(chave: string): string {
  const d = new Date(chave + 'T00:00:00')
  d.setDate(d.getDate() - 7)
  return isoLocal(d)
}

const virgula = (n: number, casas: number) => n.toFixed(casas).replace('.', ',')

// ---------------------------------------------------------------- semana

export interface ResumoSemana {
  chave: string
  itens: Feedback[]
  media: number | null
}

export function resumoSemana(feedbacks: Feedback[], chave: string): ResumoSemana {
  const itens = feedbacks.filter((f) => chaveSemana(f.data) === chave).sort((a, b) => a.data.localeCompare(b.data))
  const media = itens.length ? itens.reduce((s, f) => s + f.nota, 0) / itens.length : null
  return { chave, itens, media }
}

export function semanasComDados(feedbacks: Feedback[]): string[] {
  return [...new Set(feedbacks.map((f) => chaveSemana(f.data)))].sort().reverse()
}

/** Mesmo texto do "Relatório semanal" do Avalia */
export function textoSemana(nomeLoja: string, r: ResumoSemana): string {
  if (!r.itens.length || r.media == null) return ''
  let t = `"${nomeLoja}":\n\n`
  r.itens.forEach((f) => {
    const d = new Date(f.data + 'T00:00:00')
    const origem = f.origem === 'ifood' ? ' [iFood]' : f.origem === '99food' ? ' [99food]' : ''
    t += f.pedido ? `🧾 ${f.pedido} | 📅 ${diaMes(d)}\n` : `📅 ${diaMes(d)}\n`
    t += `🧑🏽 *${f.cliente || 'Cliente'}${origem}* | ⭐ ${f.nota}\n`
    t += f.texto ? `🗣️ _${f.texto}_\n\n` : `\n`
  })
  t += `> *Média das notas: ${virgula(r.media, 1)}*`
  return t
}

// ---------------------------------------------------------------- mês (panorama)

export interface Panorama {
  mes: string
  total: number
  media: number
  comTexto: number
  semTexto: number
  ifood: number
  noventaENove: number
  semanas: { chave: string; media: number; quantidade: number }[]
}

export function mesesComDados(feedbacks: Feedback[]): string[] {
  return [...new Set(feedbacks.map((f) => chaveMes(f.data)))].sort().reverse()
}

export function panoramaMes(feedbacks: Feedback[], mes: string): Panorama | null {
  const itens = feedbacks.filter((f) => chaveMes(f.data) === mes)
  if (!itens.length) return null
  const porSemana: Record<string, Feedback[]> = {}
  itens.forEach((f) => {
    const k = chaveSemana(f.data)
    ;(porSemana[k] ??= []).push(f)
  })
  const semanas = Object.keys(porSemana)
    .sort()
    .map((k) => ({
      chave: k,
      media: porSemana[k].reduce((s, f) => s + f.nota, 0) / porSemana[k].length,
      quantidade: porSemana[k].length,
    }))
  const comTexto = itens.filter((f) => f.texto).length
  return {
    mes,
    total: itens.length,
    media: itens.reduce((s, f) => s + f.nota, 0) / itens.length,
    comTexto,
    semTexto: itens.length - comTexto,
    ifood: itens.filter((f) => f.origem === 'ifood').length,
    noventaENove: itens.filter((f) => f.origem === '99food').length,
    semanas,
  }
}

/** Mesmo texto do "Panorama mensal" do Avalia */
export function textoPanorama(nomeLoja: string, p: Panorama): string {
  let t = `Panorama mensal — ${nomeLoja}\n`
  t += `Mês: ${rotuloMes(p.mes)}\n\n`
  p.semanas.forEach((s, i) => {
    t += `Semana ${i + 1} (${rotuloSemana(s.chave)}): média ${s.media.toFixed(2)} — ${s.quantidade} avaliação(ões)\n`
  })
  t += `\nTotal de avaliações no mês: ${p.total} (${p.comTexto} com comentário, ${p.semTexto} só com nota)\n`
  t += `Por plataforma: ${p.ifood} do iFood, ${p.noventaENove} do 99Food\n`
  t += `Média geral do mês: ${p.media.toFixed(2)}`
  return t
}

// ---------------------------------------------------------------- notas totais

export type FiltroOrigem = 'ambos' | Origem

export interface NotasTotais {
  contagem: Record<1 | 2 | 3 | 4 | 5, number>
  total: number
  media: number
}

function ultimoDiaDoMes(mk: string): string {
  const [y, m] = mk.split('-').map(Number)
  return isoLocal(new Date(y, m, 0))
}

/**
 * Como no Avalia: feedbacks com data no período + notas secas dos meses que
 * encostam no período; média ponderada das notas 1 a 5.
 */
export function notasTotais(
  feedbacks: Feedback[],
  notasSecas: NotaSeca[],
  inicio: string,
  fim: string,
  origem: FiltroOrigem,
): NotasTotais {
  let fb = feedbacks.filter((f) => f.data >= inicio && f.data <= fim)
  let ns = notasSecas.filter((n) => ultimoDiaDoMes(n.mes) >= inicio && `${n.mes}-01` <= fim)
  if (origem !== 'ambos') {
    fb = fb.filter((f) => f.origem === origem)
    ns = ns.filter((n) => n.origem === origem)
  }
  const contagem = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>
  fb.forEach((f) => {
    if (f.nota >= 1 && f.nota <= 5) contagem[f.nota as 1 | 2 | 3 | 4 | 5]++
  })
  ns.forEach((n) => {
    if (n.nota >= 1 && n.nota <= 5) contagem[n.nota as 1 | 2 | 3 | 4 | 5] += n.quantidade
  })
  const total = contagem[1] + contagem[2] + contagem[3] + contagem[4] + contagem[5]
  const soma = contagem[1] + contagem[2] * 2 + contagem[3] * 3 + contagem[4] * 4 + contagem[5] * 5
  return { contagem, total, media: total ? soma / total : 0 }
}

export function textoNotasTotais(nomeLoja: string, inicio: string, fim: string, origem: FiltroOrigem, n: NotasTotais): string {
  const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  const rotuloOrigem = origem === 'ifood' ? ' (somente iFood)' : origem === '99food' ? ' (somente 99Food)' : ''
  let t = `Média${rotuloOrigem} com base em todas as avaliações _(*com* e *sem comentários*)_ entre ${br(inicio)} e ${br(fim)}:\n`
  t += `*${nomeLoja}:*\n`
  t += `Nota 5: ${n.contagem[5]}\nNota 4: ${n.contagem[4]}\nNota 3: ${n.contagem[3]}\nNota 2: ${n.contagem[2]}\nNota 1: ${n.contagem[1]}\n`
  t += `> *Média: ${virgula(n.media, 2)}* ⭐`
  return t
}

export function primeiroEUltimoDiaDoMesAtual(): { inicio: string; fim: string } {
  const h = new Date()
  return { inicio: isoLocal(new Date(h.getFullYear(), h.getMonth(), 1)), fim: isoLocal(new Date(h.getFullYear(), h.getMonth() + 1, 0)) }
}

// ---------------------------------------------------------------- operação

export function totalCancelamentos(o: OperacaoMes): number {
  return (o.motivos_cancelamento ?? []).reduce((s, m) => s + (Number(m.quantidade) || 0), 0)
}
