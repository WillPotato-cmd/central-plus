import { useState, type FormEvent, type ReactNode } from 'react'
import { Campo, Mensagem } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { SENHA_MINIMA } from '../lib/constants'

type Tela = 'login' | 'esqueci'

export function Login() {
  const { fase, aviso, setAviso, entrar, enviarRecuperacao, salvarNovaSenha } = useAuth()
  const [tela, setTela] = useState<Tela>('login')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [enviando, setEnviando] = useState(false)

  const trocar = (t: Tela) => {
    setTela(t)
    setErro('')
    setInfo('')
    setAviso('')
  }

  async function enviar(e: FormEvent, fn: () => Promise<void>) {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    setErro('')
    try {
      await fn()
    } catch {
      setErro('Erro ao conectar com o servidor.')
    } finally {
      setEnviando(false)
    }
  }

  if (fase === 'redefinir') {
    return (
      <Cartao titulo="Nova senha" subtitulo="Defina uma nova senha para a sua conta.">
        <form
          onSubmit={(e) =>
            enviar(e, async () => {
              const r = await salvarNovaSenha(senha, confirmar)
              if (r) setErro(r)
            })
          }
        >
          <Mensagem tipo="erro">{erro}</Mensagem>
          <Campo rotulo="Nova senha">
            <input type="password" autoComplete="new-password" placeholder={`Mínimo ${SENHA_MINIMA} caracteres`} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
          <Campo rotulo="Confirmar nova senha">
            <input type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
          </Campo>
          <button className="submit-btn" disabled={enviando}>Salvar nova senha</button>
        </form>
      </Cartao>
    )
  }

  if (tela === 'esqueci') {
    return (
      <Cartao titulo="Recuperar senha" subtitulo="Informe seu e-mail corporativo. Se ele estiver cadastrado, você vai receber um link para criar uma nova senha.">
        <form
          onSubmit={(e) =>
            enviar(e, async () => {
              const r = await enviarRecuperacao(email)
              setErro(r.erro ?? '')
              setInfo(r.info ?? '')
            })
          }
        >
          <Mensagem tipo="erro">{erro}</Mensagem>
          <Mensagem tipo="info">{info}</Mensagem>
          <Campo rotulo="E-mail corporativo">
            <input type="email" autoComplete="email" placeholder="seuemail@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <button className="submit-btn" disabled={enviando}>Enviar link de recuperação</button>
          <button type="button" className="submit-btn secundario" onClick={() => trocar('login')}>
            Voltar ao login
          </button>
        </form>
      </Cartao>
    )
  }

  return (
    <Cartao titulo="Central+" subtitulo="Central de Solicitações e Operações">
      <form
        onSubmit={(e) =>
          enviar(e, async () => {
            const r = await entrar(email, senha)
            if (r) setErro(r)
          })
        }
      >
        <Mensagem tipo="erro">{erro}</Mensagem>
        <Mensagem tipo="info">{aviso}</Mensagem>
        <Campo rotulo="E-mail corporativo">
          <input type="email" autoComplete="username" placeholder="seuemail@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo rotulo="Senha">
          <input type="password" autoComplete="current-password" placeholder="Sua senha" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <button className="submit-btn" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="submit-btn secundario pequeno" onClick={() => trocar('esqueci')}>
          Esqueci minha senha
        </button>
      </form>
    </Cartao>
  )
}

function Cartao({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: ReactNode }) {
  return (
    <div className="login-wrapper">
      <div className="login-card">
        <h2>{titulo}</h2>
        <p>{subtitulo}</p>
        {children}
      </div>
    </div>
  )
}
