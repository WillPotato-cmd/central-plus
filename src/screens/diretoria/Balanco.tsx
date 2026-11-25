import { useData } from '../../context/DataContext'
import { STATUS_LABEL, STATUS_ORDEM } from '../../lib/constants'

const COR: Record<string, string> = {
  pendente: 'var(--mustard)',
  em_andamento: 'var(--steel)',
  aguardando: 'var(--rust)',
  concluido: 'var(--moss)',
}

export function Balanco() {
  const { solicitacoes, nomesLojasAtivas } = useData()

  return (
    <>
      <h2 className="titulo-secao">Balanço Executivo de Rede</h2>
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-title">TOTAL</span>
          <span className="kpi-value">{solicitacoes.length}</span>
        </div>
        {STATUS_ORDEM.map((st) => (
          <div className="kpi-card" key={st}>
            <span className="kpi-title">{STATUS_LABEL[st].toUpperCase()}</span>
            <span className="kpi-value" style={{ color: COR[st] }}>
              {solicitacoes.filter((s) => s.status === st).length}
            </span>
          </div>
        ))}
      </div>

      <h2 className="titulo-secao">Desempenho por Unidade</h2>
      <div className="store-summary-grid">
        {nomesLojasAtivas.map((loja) => {
          const daLoja = solicitacoes.filter((s) => s.loja === loja)
          const concluidas = daLoja.filter((s) => s.status === 'concluido').length
          const abertas = daLoja.length - concluidas
          const pct = daLoja.length ? Math.round((concluidas / daLoja.length) * 100) : 0
          return (
            <div className="store-card" key={loja}>
              <div className="store-card-header">
                <div className="store-card-title">{loja}</div>
                <span className="tag">{pct}% resolvido</span>
              </div>
              <small className="suave">
                {abertas} em aberto · {concluidas} concluídas
              </small>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
