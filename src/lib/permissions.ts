// Regras de acesso do lado do app. Servem só para montar a tela certa:
// quem garante de verdade são as funções equivalentes no banco
// (pode_ver_loja, pode_gerenciar_setor, eh_diretoria).
import { SETORES_CENTRAL } from './constants'
import type { Usuario } from './types'

export type Visao = 'diretoria' | 'lider' | 'central'

export function lojasPermitidas(u: Usuario | null, todas: string[]): string[] {
  if (!u) return []
  if (u.tag === 'Diretoria') return todas
  if (u.tag === 'Supervisão' && u.tipo_supervisao === 'operacao') return todas
  if (u.tag === 'Líder') return (u.lojas_acesso ?? []).filter((l) => todas.includes(l))
  return []
}

export function setoresPermitidos(u: Usuario | null): string[] {
  if (!u) return []
  if (u.tag === 'Diretoria') return [...SETORES_CENTRAL]
  if (u.tag === 'Supervisão' && u.tipo_supervisao === 'administrativa') return [...SETORES_CENTRAL]
  if (u.tag === 'Central') return u.setores_acesso ?? []
  return []
}

export function podeGerenciar(u: Usuario | null, setor: string): boolean {
  return setoresPermitidos(u).includes(setor)
}

/** Pode trocar o setor responsável? Quem atende o setor atual, e a Supervisão de operação. */
export function podeEncaminhar(u: Usuario | null, setorAtual: string): boolean {
  if (podeGerenciar(u, setorAtual)) return true
  return u?.tag === 'Supervisão' && u.tipo_supervisao === 'operacao'
}

export function ehDiretoria(u: Usuario | null): boolean {
  return u?.tag === 'Diretoria'
}

/**
 * Tela principal de cada perfil.
 * Supervisão de operação acompanha as lojas (visão de Líder, todas as lojas);
 * Supervisão administrativa atende os setores (visão da Central).
 */
export function visaoPrincipal(u: Usuario): Visao {
  if (u.tag === 'Diretoria') return 'diretoria'
  if (u.tag === 'Líder') return 'lider'
  if (u.tag === 'Supervisão' && u.tipo_supervisao === 'operacao') return 'lider'
  return 'central'
}
