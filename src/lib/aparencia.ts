// Aparência: tema de cores (Central+, Toasted Potato, Kanpek) e modo (claro/escuro).
//   • Líder: sempre as cores do grupo das lojas dele.
//   • Central, Supervisão e Diretoria: escolhem em "Meu Perfil" (padrão: Central+).
//   • Modo: automático (segue o aparelho), claro ou escuro, para todos.
// A escolha fica na conta da pessoa (vale em todos os aparelhos) e uma cópia
// fica no aparelho, para a tela de login já abrir com as cores certas.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
import type { Grupo, Loja, Modo, Tema, Usuario } from './types'

export const NOMES_TEMA: Record<Tema, string> = {
  centralplus: 'Central+',
  potato: 'Toasted Potato',
  kanpek: 'Kanpek',
}

export const NOMES_MODO: Record<Modo, string> = {
  auto: 'Automático',
  claro: 'Claro',
  escuro: 'Escuro',
}

const CHAVE = 'centralplus:aparencia'

/** Grupo das lojas do Líder (um líder só tem lojas de um grupo) */
export function grupoDoLider(u: Usuario, lojas: Loja[]): Grupo | null {
  const primeira = lojas.find((l) => (u.lojas_acesso ?? []).includes(l.nome))
  return primeira?.grupo ?? null
}

/** Tema que vale para a pessoa */
export function temaDoUsuario(u: Usuario, lojas: Loja[]): Tema {
  if (u.tag === 'Líder') return grupoDoLider(u, lojas) ?? 'centralplus'
  return u.tema ?? 'centralplus'
}

export function podeEscolherTema(u: Usuario): boolean {
  return u.tag !== 'Líder'
}

const consultaEscuro = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined

function resolverModo(modo: Modo): 'claro' | 'escuro' {
  if (modo === 'auto') return consultaEscuro?.matches ? 'escuro' : 'claro'
  return modo
}

let atual: { tema: Tema; modo: Modo } = { tema: 'centralplus', modo: 'auto' }

/** Aplica no documento: cores, cor da barra do navegador e ícones da barra do celular */
export function aplicarAparencia(tema: Tema, modo: Modo): void {
  atual = { tema, modo }
  const efetivo = resolverModo(modo)
  const raiz = document.documentElement
  raiz.dataset.tema = tema
  raiz.dataset.modo = efetivo

  // Cor da barra do navegador / barra de status do iPhone na Tela de Início
  const fundo = getComputedStyle(raiz).getPropertyValue('--paper').trim()
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', fundo || '#ECE6D8')

  if (Capacitor.isNativePlatform()) {
    void SystemBars.setStyle({ style: efetivo === 'escuro' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined)
  }

  try {
    localStorage.setItem(CHAVE, JSON.stringify(atual))
  } catch {
    /* sem armazenamento: só não lembra na próxima abertura */
  }
}

/** Na abertura do app: usa a última aparência deste aparelho (antes mesmo do login) */
export function aplicarAparenciaGuardada(): void {
  let guardada: { tema?: Tema; modo?: Modo } = {}
  try {
    guardada = JSON.parse(localStorage.getItem(CHAVE) ?? '{}')
  } catch {
    /* usa o padrão */
  }
  aplicarAparencia(guardada.tema ?? 'centralplus', guardada.modo ?? 'auto')
}

// No modo automático, acompanha quando o aparelho troca entre claro e escuro
consultaEscuro?.addEventListener?.('change', () => {
  if (atual.modo === 'auto') aplicarAparencia(atual.tema, 'auto')
})
