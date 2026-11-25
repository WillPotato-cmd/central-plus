// Utilidades compartilhadas pelas Edge Functions administrativas.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type Resultado =
  | { ok: true; admin: SupabaseClient; chamadorId: string }
  | { ok: false; resposta: Response }

/**
 * Confere se quem chamou é um usuário ATIVO com tag "Diretoria".
 * Só depois disso devolve o cliente com a service_role, que nunca sai do
 * servidor.
 */
export async function exigirDiretoria(req: Request): Promise<Resultado> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { ok: false, resposta: json({ error: 'Não autenticado.' }, 401) }

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const clienteChamador = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error } = await clienteChamador.auth.getUser()
  if (error || !user) return { ok: false, resposta: json({ error: 'Sessão inválida.' }, 401) }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const { data: perfil } = await admin
    .from('usuarios')
    .select('tag, ativo')
    .eq('id', user.id)
    .maybeSingle()

  if (!perfil || perfil.tag !== 'Diretoria' || perfil.ativo === false) {
    return { ok: false, resposta: json({ error: 'Apenas a Diretoria pode fazer isso.' }, 403) }
  }
  return { ok: true, admin, chamadorId: user.id }
}
