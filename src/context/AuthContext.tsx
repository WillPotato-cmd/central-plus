import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { buscarPerfil, registrarLog } from '../lib/api'
import { INATIVIDADE_MS, SENHA_MINIMA } from '../lib/constants'
import { SITE_URL, supabase, VEIO_DO_LINK_DE_RECUPERACAO } from '../lib/supabase'
import type { Usuario } from '../lib/types'

type Fase = 'carregando' | 'deslogado' | 'redefinir' | 'logado'

interface AuthValue {
  fase: Fase
  usuario: Usuario | null
  aviso: string
  setAviso: (m: string) => void
  entrar: (email: string, senha: string) => Promise<string | null>
  sair: (motivo?: string) => Promise<void>
  enviarRecuperacao: (email: string) => Promise<{ erro?: string; info?: string }>
  salvarNovaSenha: (senha: string, confirmar: string) => Promise<string | null>
  recarregarPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fora do AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [fase, setFase] = useState<Fase>('carregando')
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [aviso, setAviso] = useState('')
  const ultimaAtividade = useRef(Date.now())

  /** Carrega o perfil da sessão atual. Sem perfil ou desativado = sem acesso. */
  const abrirSessao = useCallback(async (userId: string): Promise<string | null> => {
    let perfil: Usuario | null = null
    try {
      perfil = await buscarPerfil(userId)
    } catch {
      await supabase.auth.signOut()
      return 'Erro ao conectar com o servidor.'
    }
    if (!perfil) {
      await supabase.auth.signOut()
      return 'Sua conta não tem perfil no Central+. Fale com a Diretoria.'
    }
    if (perfil.ativo === false) {
      await supabase.auth.signOut()
      return 'Sua conta está desativada. Fale com a Diretoria.'
    }
    ultimaAtividade.current = Date.now()
    setUsuario(perfil)
    setFase('logado')
    return null
  }, [])

  // Sessão salva + link de recuperação de senha vindo do e-mail
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') {
        setUsuario(null)
        setFase('redefinir')
      }
    })

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      // Chegou pelo link do e-mail: vai direto para "nova senha"
      if (VEIO_DO_LINK_DE_RECUPERACAO && session) {
        setFase('redefinir')
        return
      }
      if (session?.user) {
        const erro = await abrirSessao(session.user.id)
        if (erro) {
          setAviso(erro)
          setFase('deslogado')
        }
      } else {
        setFase('deslogado')
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [abrirSessao])

  const entrar = useCallback(
    async (email: string, senha: string) => {
      setAviso('')
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha,
      })
      if (error || !data.user) return 'E-mail ou senha inválidos.'
      const erro = await abrirSessao(data.user.id)
      if (!erro) await registrarLog('Realizou login')
      return erro
    },
    [abrirSessao],
  )

  const sair = useCallback(async (motivo?: string) => {
    await registrarLog(motivo ? `Sessão encerrada: ${motivo}` : 'Realizou logout')
    await supabase.auth.signOut()
    setUsuario(null)
    setFase('deslogado')
    setAviso(motivo ?? '')
  }, [])

  const enviarRecuperacao = useCallback(async (email: string) => {
    const limpo = email.trim().toLowerCase()
    if (!limpo) return { erro: 'Informe seu e-mail para recuperar a senha.' }
    const { error } = await supabase.auth.resetPasswordForEmail(limpo, { redirectTo: SITE_URL })
    if (error) return { erro: 'Não foi possível enviar o e-mail de recuperação: ' + error.message }
    // Mensagem genérica de propósito: não revela se o e-mail existe
    return { info: 'Se esse e-mail estiver cadastrado, você vai receber um link para redefinir a senha.' }
  }, [])

  const salvarNovaSenha = useCallback(async (senha: string, confirmar: string) => {
    if (senha.length < SENHA_MINIMA) return `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`
    if (senha !== confirmar) return 'As senhas não coincidem.'
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) return 'Não foi possível redefinir a senha: ' + error.message
    await supabase.auth.signOut()
    history.replaceState(null, '', window.location.pathname)
    setFase('deslogado')
    setAviso('Senha redefinida! Faça login com a nova senha.')
    return null
  }, [])

  const recarregarPerfil = useCallback(async () => {
    if (!usuario) return
    const p = await buscarPerfil(usuario.id)
    if (p) setUsuario(p)
  }, [usuario])

  // Logout automático por inatividade (30 min)
  useEffect(() => {
    if (fase !== 'logado') return
    const marcar = () => {
      ultimaAtividade.current = Date.now()
    }
    const eventos = ['click', 'keydown', 'touchstart', 'scroll'] as const
    eventos.forEach((e) => window.addEventListener(e, marcar, { passive: true }))
    const timer = window.setInterval(() => {
      if (Date.now() - ultimaAtividade.current > INATIVIDADE_MS) {
        void sair('Sua sessão expirou por inatividade. Faça login novamente.')
      }
    }, 60_000)
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, marcar))
      window.clearInterval(timer)
    }
  }, [fase, sair])

  return (
    <AuthContext.Provider
      value={{ fase, usuario, aviso, setAviso, entrar, sair, enviarRecuperacao, salvarNovaSenha, recarregarPerfil }}
    >
      {children}
    </AuthContext.Provider>
  )
}
