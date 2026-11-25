import { useEffect, useState } from 'react'
import { usePaginacao } from '../../components/ui'
import * as api from '../../lib/api'
import type { LogItem } from '../../lib/types'

export function Logs() {
  const [logs, setLogs] = useState<LogItem[]>([])
  const [erro, setErro] = useState('')

  useEffect(() => {
    api.listarLogs().then(setLogs).catch((e: Error) => setErro(e.message))
  }, [])

  const { visiveis, barra } = usePaginacao(logs, (l) => `${l.usuario_nome ?? ''} ${l.acao} ${l.ip ?? ''}`, 15)

  return (
    <>
      <h2 className="titulo-secao">Registro de Ações do Sistema</h2>
      <p className="suave">Usuário e IP são gravados pelo servidor e não podem ser alterados pelo app. Últimos 1.000 registros.</p>
      {erro && <p className="error-msg">{erro}</p>}
      {barra}
      <div className="table-responsive">
        <table className="table-list">
          <thead>
            <tr>
              <th>QUANDO</th>
              <th>USUÁRIO</th>
              <th>IP</th>
              <th>AÇÃO</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length ? (
              visiveis.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{l.criado_em ? new Date(l.criado_em).toLocaleString('pt-BR') : '–'}</td>
                  <td>
                    <strong>{l.usuario_nome ?? 'Sistema'}</strong>
                  </td>
                  <td>
                    <span className="tag">{l.ip ?? '–'}</span>
                  </td>
                  <td>{l.acao}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="empty">
                  Nenhum log encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
