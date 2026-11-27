// Central+ · notificar
// Envia as notificações com o app fechado (push).
// Arquivo único: pode ser colado direto no editor de Edge Functions do Supabase.
// IMPORTANTE: nesta função, DESLIGUE "Verify JWT" (quem chama é o banco de
// dados, que se identifica pelo segredo NOTIFICAR_SEGREDO).
//
// Segredos (Edge Functions → Secrets, no projeto do CENTRAL+):
//   NOTIFICAR_SEGREDO     senha longa, a mesma gravada em privado.config no banco
//   VAPID_PRIVATE_JWK     chave privada VAPID (JSON) para iPhone e navegadores
//   VAPID_CONTATO         opcional: mailto:seu-email ou https://seu-site
//   FCM_SERVICE_ACCOUNT   JSON da conta de serviço do Firebase (app Android)
//
// Chamadas:
//   do banco:  { tipo: 'nova' | 'encaminhada' | 'status' | 'resposta' | 'avaliacao_ruim', ... }
//   do app:    { acao: 'chave_publica' }  → chave pública VAPID (precisa estar logado)
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildPushHTTPRequest } from 'npm:@pushforge/builder@2.0.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function chaveSecretaCentral(): string {
  try {
    const novas = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    const chave = novas['default'] ?? Object.values(novas)[0]
    if (chave) return chave
  } catch {
    /* segue para a chave antiga */
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

// ---------------------------------------------------------------- quem recebe

interface Perfil {
  id: string
  tag: string
  ativo: boolean | null
  lojas_acesso: string[] | null
  setores_acesso: string[] | null
  tipo_supervisao: string | null
}

interface Solicitacao {
  id: string
  loja: string
  setor: string
  titulo: string
  prioridade: string
  status: string
  criador_id: string | null
}

interface Mensagem {
  titulo: string
  corpo: string
  url: string
  tag: string
}

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  aguardando: 'Aguardando',
  concluido: 'Concluído',
}

const ativo = (p: Perfil) => p.ativo !== false

// Regras de quem recebe cada aviso:
//   Nova / encaminhada  → Central do setor (+ Supervisão op. e adm. se urgente)
//   Status / resposta   → Líderes da loja (+ Supervisão op. e adm. se urgente)
//   Avaliação ruim      → Líderes da loja + Supervisão operacional

/** Central cadastrada no setor */
function centralDoSetor(perfis: Perfil[], setor: string): string[] {
  return perfis.filter((p) => ativo(p) && p.tag === 'Central' && (p.setores_acesso ?? []).includes(setor)).map((p) => p.id)
}

/** Todos os líderes cadastrados na loja (algumas lojas têm mais de um) */
function lideresDaLoja(perfis: Perfil[], loja: string): string[] {
  return perfis.filter((p) => ativo(p) && p.tag === 'Líder' && (p.lojas_acesso ?? []).includes(loja)).map((p) => p.id)
}

/** Supervisão; sem tipo = operacional e administrativa */
function supervisao(perfis: Perfil[], tipo?: 'operacao' | 'administrativa'): string[] {
  return perfis
    .filter((p) => ativo(p) && p.tag === 'Supervisão' && (!tipo || p.tipo_supervisao === tipo))
    .map((p) => p.id)
}

function encurtar(texto: string, max = 180): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

type Evento = Record<string, unknown> & { tipo?: string }

async function montar(evento: Evento, db: SupabaseClient): Promise<{ ids: string[]; msg: Mensagem } | null> {
  const { data: perfisDb } = await db
    .from('usuarios')
    .select('id, tag, ativo, lojas_acesso, setores_acesso, tipo_supervisao')
  const perfis = (perfisDb ?? []) as Perfil[]
  const ativos = new Set(perfis.filter(ativo).map((p) => p.id))
  const autor = typeof evento.autor === 'string' ? evento.autor : null
  const final = (ids: string[]) => [...new Set(ids)].filter((id) => id !== autor && ativos.has(id))

  if (evento.tipo === 'avaliacao_ruim') {
    const { data: loja } = await db
      .from('lojas')
      .select('nome')
      .eq('avalia_loja_id', String(evento.avalia_loja_id ?? ''))
      .maybeSingle()
    if (!loja) return null // loja do Avalia não ligada a nenhuma loja do Central+
    const origem = evento.origem === 'ifood' ? ' (iFood)' : evento.origem === '99food' ? ' (99Food)' : ''
    const texto = String(evento.texto ?? '').trim() || '(sem comentário)'
    return {
      ids: final([...lideresDaLoja(perfis, loja.nome), ...supervisao(perfis, 'operacao')]),
      msg: {
        titulo: `Avaliação ${evento.nota}★ · ${loja.nome}`,
        corpo: encurtar(`${evento.cliente || 'Cliente'}${origem}: ${texto}`),
        url: '/',
        tag: `avaliacao-${loja.nome}`,
      },
    }
  }

  const id = String(evento.id ?? '')
  if (!id) return null
  const { data: solDb } = await db
    .from('solicitacoes')
    .select('id, loja, setor, titulo, prioridade, status, criador_id')
    .eq('id', id)
    .maybeSingle()
  if (!solDb) return null
  const s = solDb as Solicitacao
  const urgente = s.prioridade === 'urgente'
  const supUrgente = urgente ? supervisao(perfis) : []
  const doSetor = [...centralDoSetor(perfis, s.setor), ...supUrgente]
  const daLoja = [...lideresDaLoja(perfis, s.loja), ...supUrgente]

  switch (evento.tipo) {
    case 'nova':
      return {
        ids: final(doSetor),
        msg: {
          titulo: `Nova solicitação${urgente ? ' URGENTE' : ''} · ${s.setor}`,
          corpo: encurtar(`${s.loja}: ${s.titulo}`),
          url: '/',
          tag: s.id,
        },
      }
    case 'encaminhada':
      return {
        ids: final(doSetor),
        msg: {
          titulo: `${urgente ? 'URGENTE · ' : ''}Solicitação encaminhada para ${s.setor}`,
          corpo: encurtar(`${s.loja}: ${s.titulo}${evento.de ? ` (veio de ${evento.de})` : ''}`),
          url: '/',
          tag: s.id,
        },
      }
    case 'status':
      return {
        ids: final(daLoja),
        msg: {
          titulo: `${urgente ? 'URGENTE · ' : ''}${s.id} · ${STATUS_LABEL[s.status] ?? s.status}`,
          corpo: encurtar(s.titulo),
          url: '/',
          tag: s.id,
        },
      }
    case 'resposta':
      return {
        ids: final(daLoja),
        msg: {
          titulo: `${urgente ? 'URGENTE · ' : ''}Nova resposta em ${s.id}`,
          corpo: encurtar(`${evento.autor_nome || 'Central'}: ${evento.texto ?? ''}`),
          url: '/',
          tag: s.id,
        },
      }
    default:
      return null
  }
}

// ---------------------------------------------------------------- Web Push (iPhone e navegadores)

interface Inscricao {
  id: number
  plataforma: 'web' | 'android'
  endpoint: string
  p256dh: string | null
  auth: string | null
}

type Resultado = 'ok' | 'remover' | 'erro'

/**
 * Lê a chave VAPID. Aceita o JSON colado de vários jeitos (com espaços,
 * com aspas em volta, ou "escapado" duas vezes) e confere se está completa.
 */
function lerJwkVapid(): { jwk: JsonWebKey | null; problema?: string } {
  const bruto = (Deno.env.get('VAPID_PRIVATE_JWK') ?? '').trim()
  if (!bruto) return { jwk: null, problema: 'o segredo VAPID_PRIVATE_JWK não existe' }
  try {
    let valor: unknown = JSON.parse(bruto)
    if (typeof valor === 'string') valor = JSON.parse(valor) // colado com aspas em volta
    const jwk = valor as JsonWebKey
    if (jwk?.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y || !jwk.d) {
      return { jwk: null, problema: 'o segredo VAPID_PRIVATE_JWK está incompleto (precisa ter kty, crv, x, y e d)' }
    }
    return { jwk }
  } catch {
    return { jwk: null, problema: 'o segredo VAPID_PRIVATE_JWK não é um JSON válido (copie de { até } inteiro)' }
  }
}

function base64urlParaBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function bytesParaBase64url(b: Uint8Array): string {
  let s = ''
  b.forEach((x) => (s += String.fromCharCode(x)))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Chave pública (formato do navegador) a partir da JWK privada: 0x04 || x || y */
function chavePublicaVapid(jwk: JsonWebKey): string {
  const x = base64urlParaBytes(jwk.x ?? '')
  const y = base64urlParaBytes(jwk.y ?? '')
  const bytes = new Uint8Array(1 + x.length + y.length)
  bytes[0] = 4
  bytes.set(x, 1)
  bytes.set(y, 1 + x.length)
  return bytesParaBase64url(bytes)
}

async function enviarWeb(insc: Inscricao, msg: Mensagem, jwk: JsonWebKey, contato: string): Promise<Resultado> {
  try {
    const req = await buildPushHTTPRequest({
      privateJWK: jwk,
      subscription: { endpoint: insc.endpoint, keys: { p256dh: insc.p256dh ?? '', auth: insc.auth ?? '' } },
      message: { payload: msg, adminContact: contato, options: { ttl: 86400, urgency: 'high' } },
    })
    const r = await fetch(req.endpoint, { method: 'POST', headers: req.headers, body: req.body })
    if (r.status === 404 || r.status === 410) return 'remover' // inscrição expirou ou foi cancelada
    if (!r.ok) console.error('Web Push recusado', r.status, await r.text().catch(() => ''))
    return r.ok ? 'ok' : 'erro'
  } catch (e) {
    console.error('Erro no Web Push:', (e as Error).message)
    return 'erro'
  }
}

// ---------------------------------------------------------------- Firebase (app Android)

interface ContaServico {
  project_id: string
  client_email: string
  private_key: string
  token_uri?: string
}

function lerContaServico(): ContaServico | null {
  try {
    const bruto = Deno.env.get('FCM_SERVICE_ACCOUNT')
    return bruto ? (JSON.parse(bruto) as ContaServico) : null
  } catch {
    return null
  }
}

let tokenGoogle: { valor: string; expira: number } | null = null
let pedindoToken: Promise<string> | null = null

function textoParaBase64url(s: string): string {
  return bytesParaBase64url(new TextEncoder().encode(s))
}

/** Token OAuth do Google; vários envios ao mesmo tempo compartilham um único pedido */
function obterTokenGoogle(sa: ContaServico): Promise<string> {
  if (tokenGoogle && tokenGoogle.expira > Date.now() + 60_000) return Promise.resolve(tokenGoogle.valor)
  if (!pedindoToken) pedindoToken = pedirTokenGoogle(sa).finally(() => (pedindoToken = null))
  return pedindoToken
}

/** Pede o token OAuth ao Google com a conta de serviço (JWT assinado com RS256) */
async function pedirTokenGoogle(sa: ContaServico): Promise<string> {

  const agora = Math.floor(Date.now() / 1000)
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token'
  const cabecalho = textoParaBase64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const corpo = textoParaBase64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud,
      iat: agora,
      exp: agora + 3600,
    }),
  )
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const chave = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const assinatura = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(`${cabecalho}.${corpo}`)),
  )
  const jwt = `${cabecalho}.${corpo}.${bytesParaBase64url(assinatura)}`

  const r = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const dados = await r.json()
  if (!r.ok || !dados.access_token) throw new Error('Google recusou a conta de serviço: ' + JSON.stringify(dados))
  tokenGoogle = { valor: dados.access_token, expira: Date.now() + (Number(dados.expires_in) || 3600) * 1000 }
  return tokenGoogle.valor
}

async function enviarAndroid(insc: Inscricao, msg: Mensagem, sa: ContaServico): Promise<Resultado> {
  try {
    const token = await obterTokenGoogle(sa)
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: insc.endpoint,
          notification: { title: msg.titulo, body: msg.corpo },
          data: { url: msg.url, tag: msg.tag },
          android: { priority: 'HIGH', notification: { tag: msg.tag, color: '#4B6B4F', default_sound: true } },
        },
      }),
    })
    if (r.ok) return 'ok'
    const texto = await r.text().catch(() => '')
    // Aparelho desinstalou o app ou o token expirou
    if (r.status === 404 || /UNREGISTERED|registration token/i.test(texto)) return 'remover'
    console.error('FCM recusou', r.status, texto)
    return 'erro'
  } catch (e) {
    console.error('Erro no FCM:', (e as Error).message)
    return 'erro'
  }
}

// ---------------------------------------------------------------- entrada

/** Compara sem vazar o tamanho do acerto pelo tempo de resposta */
function iguais(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let dif = 0
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return dif === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', chaveSecretaCentral(), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const evento = (await req.json().catch(() => ({}))) as Evento

    // 1. O app pedindo a chave pública para ativar o Web Push
    if (evento.acao === 'chave_publica') {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
      const { data: { user } } = await db.auth.getUser(token)
      if (!user) return json({ error: 'Não autenticado.' }, 401)
      const { jwk, problema } = lerJwkVapid()
      if (!jwk) {
        console.error('VAPID:', problema)
        return json({ error: 'Notificações do iPhone/navegador não configuradas: ' + problema + '.' }, 500)
      }
      return json({ chave: chavePublicaVapid(jwk) })
    }

    // 2. O banco avisando de um evento
    if (!iguais(req.headers.get('x-central-segredo') ?? '', Deno.env.get('NOTIFICAR_SEGREDO') ?? '')) {
      return json({ error: 'Não autorizado.' }, 401)
    }

    const alvo = await montar(evento, db)
    if (!alvo || !alvo.ids.length) return json({ enviados: 0, motivo: 'ninguém para avisar' })

    const { data: inscDb } = await db
      .from('push_inscricoes')
      .select('id, plataforma, endpoint, p256dh, auth')
      .in('usuario_id', alvo.ids)
    const inscricoes = (inscDb ?? []) as Inscricao[]
    if (!inscricoes.length) return json({ enviados: 0, motivo: 'nenhum aparelho inscrito' })

    const { jwk } = lerJwkVapid()
    const sa = lerContaServico()
    const contato = Deno.env.get('VAPID_CONTATO') || 'https://central-plus.vercel.app'

    const resultados = await Promise.all(
      inscricoes.map(async (i): Promise<Resultado> => {
        if (i.plataforma === 'web') return jwk ? enviarWeb(i, alvo.msg, jwk, contato) : 'erro'
        return sa ? enviarAndroid(i, alvo.msg, sa) : 'erro'
      }),
    )

    const mortas = inscricoes.filter((_, n) => resultados[n] === 'remover').map((i) => i.id)
    if (mortas.length) await db.from('push_inscricoes').delete().in('id', mortas)

    return json({
      enviados: resultados.filter((r) => r === 'ok').length,
      falhas: resultados.filter((r) => r === 'erro').length,
      removidas: mortas.length,
    })
  } catch (e) {
    console.error(e)
    return json({ error: 'Erro inesperado: ' + (e as Error).message }, 500)
  }
})
