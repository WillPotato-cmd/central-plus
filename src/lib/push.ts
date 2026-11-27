// Notificações com o app fechado (push).
//   • App Android: Firebase, pelo plugin @capacitor/push-notifications
//   • iPhone (ícone da Tela de Início) e navegadores: Web Push, pelo service worker
// O servidor (Edge Function "notificar") decide quem recebe cada aviso.
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

export type EstadoPush =
  | 'ativo' // inscrito e recebendo
  | 'pendente' // pode ativar (precisa de um toque da pessoa)
  | 'negado' // a pessoa bloqueou nas configurações do aparelho
  | 'instalar_iphone' // iPhone no Safari: precisa "Adicionar à Tela de Início" antes
  | 'indisponivel' // navegador sem suporte

const nativo = Capacitor.isNativePlatform()
const CHAVE_ENDPOINT = 'centralplus:push-endpoint'

function guardarEndpoint(e: string | null) {
  try {
    if (e) localStorage.setItem(CHAVE_ENDPOINT, e)
    else localStorage.removeItem(CHAVE_ENDPOINT)
  } catch {
    /* sem armazenamento: só não dá para limpar no "Sair" */
  }
}

function endpointGuardado(): string | null {
  try {
    return localStorage.getItem(CHAVE_ENDPOINT)
  } catch {
    return null
  }
}

function ehIphone(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function abertoPelaTelaDeInicio(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function webSuportado(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function descricaoAparelho(): string {
  if (nativo) return 'App Android'
  const ua = navigator.userAgent
  const sistema = ehIphone() ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Outro'
  const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  return `${sistema} · ${nav}${abertoPelaTelaDeInicio() ? ' (Tela de Início)' : ''}`
}

async function salvarNoServidor(plataforma: 'web' | 'android', endpoint: string, p256dh?: string, auth?: string) {
  const { error } = await supabase.rpc('registrar_push', {
    p_plataforma: plataforma,
    p_endpoint: endpoint,
    p_p256dh: p256dh ?? null,
    p_auth: auth ?? null,
    p_aparelho: descricaoAparelho(),
  })
  if (error) throw new Error('Não foi possível ativar as notificações: ' + error.message)
  guardarEndpoint(endpoint)
}

// ---------------------------------------------------------------- estado

export async function estadoPush(): Promise<EstadoPush> {
  if (nativo) {
    const { receive } = await PushNotifications.checkPermissions()
    return receive === 'granted' ? 'ativo' : receive === 'denied' ? 'negado' : 'pendente'
  }
  if (ehIphone() && !abertoPelaTelaDeInicio()) return 'instalar_iphone'
  if (!webSuportado()) return 'indisponivel'
  if (Notification.permission === 'granted') return 'ativo'
  if (Notification.permission === 'denied') return 'negado'
  return 'pendente'
}

// ---------------------------------------------------------------- Android (Firebase)

let ouvintesNativos = false

async function inscreverAndroid(): Promise<void> {
  if (!ouvintesNativos) {
    ouvintesNativos = true
    // Com o app aberto, o Android não mostra o aviso sozinho: mostramos nós
    await PushNotifications.addListener('pushNotificationReceived', (n) => {
      void LocalNotifications.schedule({
        notifications: [{ id: Math.floor(Date.now() % 2_000_000_000), title: n.title ?? 'Central+', body: n.body ?? '' }],
      }).catch(() => undefined)
    })
  }

  let resolver!: (token: string) => void
  let rejeitar!: (e: Error) => void
  const espera = new Promise<string>((res, rej) => {
    resolver = res
    rejeitar = rej
  })
  const okOuvinte = await PushNotifications.addListener('registration', (t) => resolver(t.value))
  const erroOuvinte = await PushNotifications.addListener('registrationError', (e) =>
    rejeitar(new Error('Erro no Firebase: ' + (e.error ?? 'desconhecido'))),
  )
  const limite = window.setTimeout(() => rejeitar(new Error('O Firebase não respondeu. Confira a internet e tente de novo.')), 20_000)
  try {
    await PushNotifications.register()
    const token = await espera
    await salvarNoServidor('android', token)
  } finally {
    window.clearTimeout(limite)
    void okOuvinte.remove()
    void erroOuvinte.remove()
  }
}

// ---------------------------------------------------------------- Web Push

let chavePublica: string | null = null

async function obterChavePublica(): Promise<string> {
  if (chavePublica) return chavePublica
  const { data, error } = await supabase.functions.invoke('notificar', { body: { acao: 'chave_publica' } })
  if (error || !data?.chave) {
    // Mostra o motivo que o servidor devolveu, para facilitar o diagnóstico
    let motivo = data?.error as string | undefined
    try {
      const corpo = await (error as { context?: { json?: () => Promise<{ error?: string }> } } | null)?.context?.json?.()
      motivo = corpo?.error ?? motivo
    } catch {
      /* mantém o motivo que tiver */
    }
    throw new Error(motivo ?? 'As notificações ainda não foram configuradas no servidor.')
  }
  chavePublica = data.chave as string
  return chavePublica
}

function base64urlParaBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function inscreverWeb(): Promise<void> {
  const registro = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  const chave = base64urlParaBytes(await obterChavePublica())

  let inscricao = await registro.pushManager.getSubscription()
  // Se a chave do servidor mudou, a inscrição antiga não serve mais
  const chaveAtual = inscricao?.options.applicationServerKey
  if (inscricao && chaveAtual && !iguaisBytes(new Uint8Array(chaveAtual), chave)) {
    await inscricao.unsubscribe()
    inscricao = null
  }
  inscricao ??= await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave })

  const j = inscricao.toJSON()
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error('O navegador não devolveu uma inscrição válida.')
  await salvarNoServidor('web', j.endpoint, j.keys.p256dh, j.keys.auth)
}

function iguaisBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

// ---------------------------------------------------------------- ações

/** Pede a permissão e inscreve o aparelho. Chame a partir de um toque da pessoa. */
export async function ativarPush(): Promise<EstadoPush> {
  if (nativo) {
    const { receive } = await PushNotifications.requestPermissions()
    if (receive !== 'granted') return 'negado'
    await LocalNotifications.requestPermissions().catch(() => undefined)
    await inscreverAndroid()
    return 'ativo'
  }
  const atual = await estadoPush()
  if (atual === 'instalar_iphone' || atual === 'indisponivel') return atual
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return permissao === 'denied' ? 'negado' : 'pendente'
  await inscreverWeb()
  return 'ativo'
}

/**
 * Depois do login: se este aparelho já tinha permitido, renova a inscrição em
 * silêncio (o token pode mudar, ou outra pessoa pode ter usado o aparelho).
 */
export async function sincronizarPush(): Promise<void> {
  try {
    if ((await estadoPush()) !== 'ativo') return
    if (nativo) await inscreverAndroid()
    else await inscreverWeb()
  } catch (e) {
    console.warn('Notificações: não foi possível renovar a inscrição.', e)
  }
}

/** No "Sair": este aparelho para de receber os avisos da conta. */
export async function desligarPushDesteAparelho(): Promise<void> {
  const endpoint = endpointGuardado()
  if (!endpoint) return
  try {
    await supabase.rpc('remover_push', { p_endpoint: endpoint })
  } catch {
    /* sem internet: o servidor limpa quando o aviso falhar */
  }
  guardarEndpoint(null)
}
