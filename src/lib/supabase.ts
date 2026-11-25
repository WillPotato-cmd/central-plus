import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env')
}

/**
 * Capturado ANTES de criar o cliente: o Supabase limpa o endereço depois de
 * ler o token do link "esqueci minha senha".
 */
export const VEIO_DO_LINK_DE_RECUPERACAO =
  window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery')

/**
 * A chave "publishable" foi feita para ficar no app. Quem protege os dados
 * são as políticas RLS do banco (supabase/migrations).
 */
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || window.location.origin
