import { useState } from 'react'
import { Campo, useAcao, usePaginacao } from '../../components/ui'
import { useData } from '../../context/DataContext'
import * as api from '../../lib/api'
import type { Loja } from '../../lib/types'

/** Lojas agora ficam no banco. "Excluir" vira desativar, para não perder o histórico. */
export function Lojas() {
  const { lojas, solicitacoes, recarregar } = useData()
  const [nome, setNome] = useState('')
  const { ocupado, executar } = useAcao()
  const { visiveis, barra } = usePaginacao<Loja>(lojas, (l) => l.nome, 10)

  return (
    <div className="grid">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault()
          const n = nome.trim()
          if (!n) return
          if (lojas.some((l) => l.nome.toLowerCase() === n.toLowerCase() && l.ativo)) {
            window.alert('Essa loja já existe.')
            return
          }
          void executar(async () => {
            await api.salvarLoja(n, true)
            setNome('')
            await recarregar()
          })
        }}
      >
        <h2>Cadastrar Nova Loja</h2>
        <Campo rotulo="Nome da unidade">
          <input value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <button className="submit-btn" disabled={ocupado}>
          Salvar Loja
        </button>
      </form>

      <div>
        {barra}
        <div className="table-responsive">
          <table className="table-list">
            <thead>
              <tr>
                <th>LOJA</th>
                <th>HISTÓRICO</th>
                <th>STATUS</th>
                <th>AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr key={l.nome}>
                  <td>{l.nome}</td>
                  <td>{solicitacoes.filter((s) => s.loja === l.nome).length} solicitações</td>
                  <td>
                    <span className="tag">{l.ativo ? 'Ativa' : 'Desativada'}</span>
                  </td>
                  <td>
<div className="table-actions">
                    <button
                      className={'btn-sm' + (l.ativo ? ' danger' : '')}
                      disabled={ocupado}
                      onClick={() => {
                        if (l.ativo && !window.confirm(`Desativar a loja ${l.nome}? O histórico é mantido.`)) return
                        void executar(async () => {
                          await api.salvarLoja(l.nome, !l.ativo)
                          await recarregar()
                        })
                      }}
                    >
                      {l.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                  </div>
</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
