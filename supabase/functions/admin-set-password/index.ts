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

/**
 * Chave secreta do projeto. Usa a chave nova (sb_secret_...) quando existe;
 * a antiga (service_role) só como reserva, porque ela para de funcionar
 * quando as chaves antigas são desativadas no Supabase.
 */
function chaveSecreta(): string {
  try {
    const novas = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    const chave = novas['default'] ?? Object.values(novas)[0]
    if (chave) return chave
  } catch {
    /* segue para a chave antiga */
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Quem está chamando? Precisa ser Diretoria ativa.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      chaveSecreta(),
      { auth: { persistSession: false, autoRefreshToken: false } },
    )

    // O token precisa ser passado aqui: no servidor não existe sessão salva,
    // então getUser() sem o token sempre falha com "sessão ausente".
    const { data: { user }, error: userError } = await admin.auth.getUser(token)
    if (userError || !user) {
      console.error('Falha ao validar sessão:', userError?.message)
      return json({ error: 'Sessão inválida (' + (userError?.message ?? 'sem usuário') + '). Saia e entre de novo no Central+.' }, 401)
    }
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
