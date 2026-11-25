import { useState } from 'react'
import { Campo, useAcao } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/api'

export function Perfil({ aoFechar }: { aoFechar: () => void }) {
  const { usuario, recarregarPerfil } = useAuth()
  const [nome, setNome] = useState(usuario?.nome ?? '')
  const { ocupado, executar } = useAcao()
  if (!usuario) return null

  return (
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
  )
}
