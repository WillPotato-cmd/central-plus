import { useState } from 'react'
import { Campo, useAcao } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import * as api from '../lib/api'
import { aplicarAparencia, grupoDoLider, NOMES_MODO, NOMES_TEMA, podeEscolherTema, temaDoUsuario } from '../lib/aparencia'
import type { Modo, Tema } from '../lib/types'

const TEMAS: Tema[] = ['centralplus', 'potato', 'kanpek']
const MODOS: Modo[] = ['auto', 'claro', 'escuro']

function Aparencia() {
  const { usuario, recarregarPerfil } = useAuth()
  const { lojas } = useData()
  const { executar } = useAcao()
  // Guarda a escolha aqui também, para dois cliques seguidos não se atropelarem
  const [escolha, setEscolha] = useState<{ tema: Tema; modo: Modo } | null>(null)
  if (!usuario) return null
  const tema = escolha?.tema ?? temaDoUsuario(usuario, lojas)
  const modo: Modo = escolha?.modo ?? usuario.modo ?? 'auto'
  const escolhe = podeEscolherTema(usuario)

  function salvar(novoTema: Tema, novoModo: Modo) {
    setEscolha({ tema: novoTema, modo: novoModo })
    aplicarAparencia(novoTema, novoModo) // muda na hora; salva em seguida
    void executar(async () => {
      await api.salvarMinhaAparencia(escolhe ? novoTema : null, novoModo)
      await recarregarPerfil()
    })
  }

  return (
    <section className="card form-estreito aparencia">
      <h2>Aparência</h2>
      <Campo rotulo="Cores">
        {escolhe ? (
          <div className="opcoes-tema" role="radiogroup" aria-label="Cores">
            {TEMAS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tema === t}
                className={`opcao-tema${tema === t ? ' active' : ''}`}
                data-amostra={t}
                onClick={() => salvar(t, modo)}
              >
                <span className="amostra" aria-hidden="true">
                  <i /> <i />
                </span>
                {NOMES_TEMA[t]}
              </button>
            ))}
          </div>
        ) : (
          <p className="suave">
            {NOMES_TEMA[tema]} — segue o grupo das suas lojas
            {grupoDoLider(usuario, lojas) ? '' : ' (nenhuma loja vinculada ainda)'}.
          </p>
        )}
      </Campo>
      <Campo rotulo="Modo">
        <div className="seletor" role="radiogroup" aria-label="Modo">
          {MODOS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={modo === m}
              className={modo === m ? 'active' : ''}
              onClick={() => salvar(tema, m)}
            >
              {NOMES_MODO[m]}
            </button>
          ))}
        </div>
      </Campo>
      <p className="suave">“Automático” acompanha o modo claro/escuro do seu aparelho.</p>
    </section>
  )
}

export function Perfil({ aoFechar }: { aoFechar: () => void }) {
  const { usuario, recarregarPerfil } = useAuth()
  const [nome, setNome] = useState(usuario?.nome ?? '')
  const { ocupado, executar } = useAcao()
  if (!usuario) return null

  return (
    <>
    <form
      className="card form-estreito"
      onSubmit={(e) => {
        e.preventDefault()
        void executar(async () => {
          await api.atualizarMeuNome(nome)
          await api.registrarLog('Atualizou o próprio nome de exibição')
          await recarregarPerfil()
          aoFechar()
        })
      }}
    >
      <h2>Meu Perfil</h2>
      <Campo rotulo="Nome exibido">
        <input value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Campo rotulo="E-mail">
        <input value={usuario.email} disabled />
      </Campo>
      <Campo rotulo="Cargo">
        <input value={usuario.tag} disabled />
      </Campo>
      <p className="suave">Para trocar a senha, saia e use “Esqueci minha senha”.</p>
      <button className="submit-btn" disabled={ocupado || !nome.trim()}>
        Salvar
      </button>
      <button type="button" className="submit-btn secundario" onClick={aoFechar}>
        Voltar
      </button>
    </form>
    <Aparencia />
    </>
  )
}
