import { useMemo, useState } from 'react'
import { SolicitacaoCard } from '../components/SolicitacaoCard'
import { Vazio } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { PESO_PRIORIDADE, STATUS_LABEL, STATUS_ORDEM } from '../lib/constants'
import { setoresPermitidos } from '../lib/permissions'
import type { Status } from '../lib/types'

/** Quadro (kanban) de atendimento da Central */
export function CentralView() {
  const { usuario } = useAuth()
  const { solicitacoes, nomesLojasAtivas } = useData()
  const setores = useMemo(() => setoresPermitidos(usuario), [usuario])
  const [filtroSetor, setFiltroSetor] = useState('todos')
  const [filtroLoja, setFiltroLoja] = useState('todas')
  const [busca, setBusca] = useState('')
  // No celular as 4 colunas não cabem: mostra uma por vez
  const [colunaMobile, setColunaMobile] = useState<Status>('pendente')

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return solicitacoes
      .filter(
        (s) =>
          setores.includes(s.setor) &&
          (filtroSetor === 'todos' || s.setor === filtroSetor) &&
          (filtroLoja === 'todas' || s.loja === filtroLoja) &&
          (!q || [s.id, s.titulo, s.loja, s.descricao ?? ''].join(' ').toLowerCase().includes(q)),
      )
      .sort((a, b) => PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade] || (a.timestamp ?? 0) - (b.timestamp ?? 0))
  }, [solicitacoes, setores, filtroSetor, filtroLoja, busca])

  if (!setores.length) {
    return <Vazio>Você não possui setores vinculados. Contate a Diretoria.</Vazio>
  }

  const porStatus = (st: Status) => filtradas.filter((s) => s.status === st)

  return (
    <>
      <div className="filter-row">
        <label>
          Setor:{' '}
          <select value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)}>
            <option value="todos">Todos os meus setores</option>
            {setores.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Loja:{' '}
          <select value={filtroLoja} onChange={(e) => setFiltroLoja(e.target.value)}>
            <option value="todas">Todas as lojas</option>
            {nomesLojasAtivas.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <input type="search" placeholder="Pesquisar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <div className="kanban-seletor" role="tablist">
        {STATUS_ORDEM.map((st) => (
          <button key={st} className={colunaMobile === st ? 'active' : ''} onClick={() => setColunaMobile(st)}>
            {STATUS_LABEL[st]} <small>{porStatus(st).length}</small>
          </button>
        ))}
      </div>

      <div className="kanban">
        {STATUS_ORDEM.map((st) => {
          const lista = porStatus(st)
          return (
            <section key={st} className={colunaMobile === st ? 'coluna ativa' : 'coluna'}>
              <div className="col-head">
                {STATUS_LABEL[st]} <small>{lista.length}</small>
              </div>
              {lista.length ? lista.map((s) => <SolicitacaoCard key={s.id} s={s} mostrarLoja />) : <Vazio>Vazio</Vazio>}
            </section>
          )
        })}
      </div>
    </>
  )
}
