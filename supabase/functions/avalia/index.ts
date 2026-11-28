// Central+ · avalia
// Ponte com o Avalia Potato (outro projeto Supabase).
// Arquivo único: pode ser colado direto no editor de Edge Functions do Supabase.
//
// Segredos necessários (Edge Functions → Secrets, no projeto do CENTRAL+):
//   AVALIA_URL         = https://zqfznjkeqidpnznqjevv.supabase.co
//   AVALIA_SECRET_KEY  = chave secreta (sb_secret_...) do projeto do AVALIA
//
// Ações:
//   { acao: 'lojas' }               → lista as lojas do Avalia (só Diretoria)
//   { acao: 'dados', loja: 'Nome' } → avaliações e operação da loja do Central+
//   { acao: 'resumo' }              → notas dos últimos 35 dias de todas as lojas
//                                     ligadas (Diretoria e Supervisão; dashboard)
//
// IMPORTANTE: esta função NUNCA consulta a tabela vendas_diarias.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

/** Chave secreta do Central+ (nova sb_secret_..., ou a antiga service_role como reserva) */
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

const semSessao = { auth: { persistSession: false, autoRefreshToken: false } }

/** Mesma regra de pode_ver_auditoria no banco: Diretoria, Supervisão, ou Líder da loja */
function podeVerLoja(u: { tag: string; ativo: boolean | null; lojas_acesso: string[] | null }, loja: string) {
  if (u.ativo === false) return false
  if (u.tag === 'Diretoria' || u.tag === 'Supervisão') return true
  return u.tag === 'Líder' && (u.lojas_acesso ?? []).includes(loja)
}

/** 'YYYY-MM' de N meses atrás */
function mesAtras(n: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Quem está chamando?
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    const central = createClient(Deno.env.get('SUPABASE_URL') ?? '', chaveSecretaCentral(), semSessao)
    const { data: { user }, error: userError } = await central.auth.getUser(token)
    if (userError || !user) {
      return json({ error: 'Sessão inválida (' + (userError?.message ?? 'sem usuário') + '). Saia e entre de novo no Central+.' }, 401)
    }
    const { data: perfil } = await central
      .from('usuarios')
      .select('tag, ativo, lojas_acesso')
      .eq('id', user.id)
      .maybeSingle()
    if (!perfil || perfil.ativo === false) return json({ error: 'Sem acesso.' }, 403)

    // 2. Conexão com o Avalia
    const avaliaUrl = Deno.env.get('AVALIA_URL') ?? ''
    const avaliaKey = Deno.env.get('AVALIA_SECRET_KEY') ?? ''
    if (!avaliaUrl || !avaliaKey) {
      return json({ error: 'A ponte com o Avalia não está configurada (faltam os segredos AVALIA_URL e AVALIA_SECRET_KEY).' }, 500)
    }
    const avalia = createClient(avaliaUrl, avaliaKey, semSessao)

    const body = await req.json().catch(() => ({}))
    const acao = String(body.acao ?? '')

    // 3a. Lista de lojas do Avalia, para a Diretoria fazer a ligação
    if (acao === 'lojas') {
      if (perfil.tag !== 'Diretoria') return json({ error: 'Apenas a Diretoria.' }, 403)
      const { data, error } = await avalia.from('lojas').select('id, nome, regiao').order('nome')
      if (error) return json({ error: 'Erro ao ler lojas do Avalia: ' + error.message }, 502)
      return json({ lojas: data ?? [] })
    }

    // 3b. Dados de uma loja
    if (acao === 'dados') {
      const loja = String(body.loja ?? '')
      if (!loja) return json({ error: 'Informe a loja.' }, 400)
      if (!podeVerLoja(perfil, loja)) return json({ error: 'Sem acesso a esta loja.' }, 403)

      const { data: ligacao } = await central
        .from('lojas')
        .select('avalia_loja_id')
        .eq('nome', loja)
        .maybeSingle()
      const avaliaId = ligacao?.avalia_loja_id
      if (!avaliaId) return json({ vinculada: false })

      // Últimos 13 meses (dá para comparar com o mesmo mês do ano anterior)
      const desdeMes = mesAtras(13)
      const desdeData = desdeMes + '-01'

      const [lojaAv, feedbacks, notasSecas, operacao] = await Promise.all([
        avalia.from('lojas').select('nome, regiao').eq('id', avaliaId).maybeSingle(),
        avalia
          .from('feedbacks')
          .select('id, data, nota, texto, origem, pedido, cliente, criado_em')
          .eq('loja_id', avaliaId)
          .gte('data', desdeData)
          .order('data', { ascending: false }),
        avalia
          .from('notas_secas')
          .select('id, mes, origem, nota, quantidade')
          .eq('loja_id', avaliaId)
          .gte('mes', desdeMes),
        avalia
          .from('operacao_mensal')
          .select('mes, motivos_cancelamento, tempo_func, tempo_pct, log_entrega, log_preparo, log_espera')
          .eq('loja_id', avaliaId)
          .gte('mes', desdeMes)
          .order('mes', { ascending: false }),
      ])

      const erro = [lojaAv, feedbacks, notasSecas, operacao].find((r) => r.error)?.error
      if (erro) return json({ error: 'Erro ao ler dados do Avalia: ' + erro.message }, 502)

      return json({
        vinculada: true,
        loja: lojaAv.data,
        feedbacks: feedbacks.data ?? [],
        notasSecas: notasSecas.data ?? [],
        operacao: operacao.data ?? [],
      })
    }

    // 3c. Resumo de todas as lojas ligadas (dashboard da Diretoria)
    //     Só nota e data de cada avaliação; o texto vem apenas das ruins (nota ≤ 2).
    if (acao === 'resumo') {
      if (perfil.tag !== 'Diretoria' && perfil.tag !== 'Supervisão') return json({ error: 'Sem acesso.' }, 403)

      const { data: ligadas, error: errLig } = await central
        .from('lojas')
        .select('nome, avalia_loja_id')
        .eq('ativo', true)
        .not('avalia_loja_id', 'is', null)
      if (errLig) return json({ error: 'Erro ao ler lojas: ' + errLig.message }, 500)
      const porId = new Map((ligadas ?? []).map((l) => [l.avalia_loja_id as string, l.nome as string]))
      if (porId.size === 0) return json({ lojas: {} })

      const desde = new Date()
      desde.setDate(desde.getDate() - 35)
      const desdeData = desde.toISOString().slice(0, 10)

      const { data, error } = await avalia
        .from('feedbacks')
        .select('id, loja_id, data, nota, texto, origem, criado_em')
        .in('loja_id', [...porId.keys()])
        .gte('data', desdeData)
        .order('data', { ascending: false })
        .limit(20000)
      if (error) return json({ error: 'Erro ao ler dados do Avalia: ' + error.message }, 502)

      const lojas: Record<string, unknown[]> = {}
      for (const nome of porId.values()) lojas[nome] = []
      for (const f of data ?? []) {
        const nome = porId.get(f.loja_id)
        if (!nome) continue
        const ruim = Number(f.nota) <= 2
        lojas[nome].push({
          id: f.id,
          data: f.data,
          nota: f.nota,
          origem: f.origem,
          criado_em: f.criado_em,
          texto: ruim ? f.texto : null,
        })
      }
      return json({ lojas })
    }

    return json({ error: 'Ação desconhecida.' }, 400)
  } catch (e) {
    return json({ error: 'Erro inesperado: ' + (e as Error).message }, 500)
  }
})
