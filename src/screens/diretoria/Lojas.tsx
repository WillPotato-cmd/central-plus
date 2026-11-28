import { useEffect, useState } from 'react'
import { Campo, useAcao, usePaginacao } from '../../components/ui'
import { useData } from '../../context/DataContext'
import * as api from '../../lib/api'
import { listarLojasAvalia, type LojaAvalia } from '../../lib/avalia'
import type { Grupo, Loja } from '../../lib/types'
import { limparCacheAvalia } from '../Avaliacoes'

/** Lojas agora ficam no banco. "Excluir" vira desativar, para não perder o histórico. */
export function Lojas() {
  const { lojas, solicitacoes, recarregar } = useData()
  const [nome, setNome] = useState('')
  const [grupo, setGrupo] = useState<Grupo>('potato')
  const { ocupado, executar } = useAcao()
  const { visiveis, barra } = usePaginacao<Loja>(lojas, (l) => l.nome, 10)
  const [lojasAvalia, setLojasAvalia] = useState<LojaAvalia[] | null>(null)
  const [erroAvalia, setErroAvalia] = useState('')

  useEffect(() => {
    listarLojasAvalia()
      .then(setLojasAvalia)
      .catch((e: Error) => setErroAvalia(e.message))
  }, [])

  const nomeAvalia = (id?: string | null) => lojasAvalia?.find((x) => x.id === id)?.nome

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
            await api.salvarLoja(n, true, grupo)
            setNome('')
            setGrupo('potato')
            await recarregar()
          })
        }}
      >
        <h2>Cadastrar Nova Loja</h2>
        <Campo rotulo="Nome da unidade">
          <input
            value={nome}
            maxLength={80}
            onChange={(e) => {
              setNome(e.target.value)
              if (/^\s*kanpek/i.test(e.target.value)) setGrupo('kanpek')
            }}
          />
        </Campo>
        <Campo rotulo="Grupo (define as cores dos líderes)">
          <select value={grupo} onChange={(e) => setGrupo(e.target.value as Grupo)}>
            <option value="potato">Toasted Potato</option>
            <option value="kanpek">Kanpek</option>
          </select>
        </Campo>
        <button className="submit-btn" disabled={ocupado}>
          Salvar Loja
        </button>
      </form>

      <div>
        {erroAvalia && <p className="error-msg">{erroAvalia}</p>}
        {barra}
        <div className="table-responsive">
          <table className="table-list">
            <thead>
              <tr>
                <th>LOJA</th>
                <th>GRUPO</th>
                <th>HISTÓRICO</th>
                <th>AVALIA POTATO</th>
                <th>STATUS</th>
                <th>AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr key={l.nome}>
                  <td>{l.nome}</td>
                  <td>
                    <select
                      aria-label={`Grupo da loja ${l.nome}`}
                      value={l.grupo}
                      disabled={ocupado}
                      onChange={(e) => {
                        const g = e.target.value as Grupo
                        void executar(async () => {
                          await api.definirGrupoLoja(l.nome, g)
                          await recarregar()
                        })
                      }}
                    >
                      <option value="potato">Potato</option>
                      <option value="kanpek">Kanpek</option>
                    </select>
                  </td>
                  <td>{solicitacoes.filter((s) => s.loja === l.nome).length} solicitações</td>
                  <td>
                    {lojasAvalia ? (
                      <select
                        aria-label={`Loja do Avalia ligada a ${l.nome}`}
                        value={l.avalia_loja_id ?? ''}
                        disabled={ocupado}
                        onChange={(e) => {
                          const id = e.target.value || null
                          void executar(async () => {
                            await api.vincularLojaAvalia(l.nome, id, nomeAvalia(id))
                            limparCacheAvalia(l.nome)
                            await recarregar()
                          })
                        }}
                      >
                        <option value="">— não ligada —</option>
                        {lojasAvalia.map((a) => {
                          const usadaPor = lojas.find((x) => x.avalia_loja_id === a.id && x.nome !== l.nome)
                          return (
                            <option key={a.id} value={a.id} disabled={!!usadaPor}>
                              {a.nome}
                              {a.regiao ? ` (${a.regiao})` : ''}
                              {usadaPor ? ` — já ligada a ${usadaPor.nome}` : ''}
                            </option>
                          )
                        })}
                      </select>
                    ) : (
                      <small className="suave">{erroAvalia ? '–' : 'carregando…'}</small>
                    )}
                  </td>
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
