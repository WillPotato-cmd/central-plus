// Central+ · admin-create-user
// Cria um usuário (login no Auth + perfil na tabela `usuarios`). Só a Diretoria.
// Arquivo único: pode ser colado direto no editor de Edge Functions do Supabase.
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

const TAGS = ['Diretoria', 'Central', 'Líder', 'Supervisão']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Quem está chamando? Precisa ser Diretoria ativa.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const clienteChamador = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await clienteChamador.auth.getUser()
    if (userError || !user) return json({ error: 'Sessão inválida.' }, 401)

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data: chamador } = await admin.from('usuarios').select('tag, ativo').eq('id', user.id).maybeSingle()
    if (!chamador || chamador.tag !== 'Diretoria' || chamador.ativo === false) {
      return json({ error: 'Apenas a Diretoria pode cadastrar usuários.' }, 403)
    }

    // 2. Valida os dados recebidos
    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const senha = String(body.senha ?? '')
    const nome = String(body.nome ?? '').trim()
    const tag = String(body.tag ?? '')

    if (!email || !nome || senha.length < 8 || !TAGS.includes(tag)) {
      return json({ error: 'Preencha nome, e-mail, cargo e uma senha com pelo menos 8 caracteres.' }, 400)
    }

    // 3. Cria o login
    const { data: criado, error: authError } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    })
    if (authError || !criado.user) {
      const jaExiste = authError?.message?.toLowerCase().includes('already')
      return json({ error: jaExiste ? 'Já existe um usuário com esse e-mail.' : (authError?.message ?? 'Falha ao criar.') }, 400)
    }

    // 4. Cria o perfil
    const perfil = {
      id: criado.user.id,
      nome,
      email,
      tag,
      lojas_acesso: tag === 'Líder' ? (body.lojas_acesso ?? []) : [],
      setores_acesso: tag === 'Central' ? (body.setores_acesso ?? []) : [],
      tipo_supervisao: tag === 'Supervisão' ? (body.tipo_supervisao ?? 'operacao') : '',
      ativo: true,
    }
    const { error: dbError } = await admin.from('usuarios').insert(perfil)
    if (dbError) {
      // Desfaz o login para não deixar usuário sem perfil
      await admin.auth.admin.deleteUser(criado.user.id)
      return json({ error: 'Erro ao salvar o perfil: ' + dbError.message }, 400)
    }

    return json({ success: true, id: criado.user.id })
  } catch (e) {
    return json({ error: 'Erro inesperado: ' + (e as Error).message }, 500)
  }
})
