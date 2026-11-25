// Central+ · admin-set-password
// Redefine a senha de outro usuário. Só a Diretoria.
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
      return json({ error: 'Apenas a Diretoria pode redefinir senhas.' }, 403)
    }

    // 2. Valida e troca a senha
    const { userId, novaSenha } = await req.json()
    if (!userId || typeof novaSenha !== 'string' || novaSenha.length < 8) {
      return json({ error: 'Informe o usuário e uma senha com pelo menos 8 caracteres.' }, 400)
    }

    const { error } = await admin.auth.admin.updateUserById(userId, { password: novaSenha })
    if (error) return json({ error: error.message }, 400)

    return json({ success: true })
  } catch (e) {
    return json({ error: 'Erro inesperado: ' + (e as Error).message }, 500)
  }
})
