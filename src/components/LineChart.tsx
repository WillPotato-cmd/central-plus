import { MESES } from '../lib/constants'

interface Serie {
  nome: string
  cor: string
  valores: (number | null)[]
}

/** Gráfico de linhas simples em SVG (escala de 5 a 10, como no sistema antigo) */
export function LineChart({ series }: { series: Serie[] }) {
  const W = 340
  const H = 220
  const esq = 30
  const dir = 12
  const topo = 16
  const base = 28
  const min = 5
  const max = 10
  const passoX = (W - esq - dir) / 11
  const x = (i: number) => esq + i * passoX
  const y = (v: number) => topo + (1 - (Math.max(min, Math.min(max, v)) - min) / (max - min)) * (H - topo - base)

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolução das notas de auditoria por mês">
        {[5, 6, 7, 8, 9, 10].map((v) => (
          <g key={v}>
            <line x1={esq} x2={W - dir} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={esq - 6} y={y(v) + 3} textAnchor="end" className="chart-axis">
              {v}
            </text>
          </g>
        ))}
        {MESES.map((m, i) => (
          <text key={m} x={x(i)} y={H - 8} textAnchor="middle" className="chart-axis">
            {m}
          </text>
        ))}
        {series.map((s) => {
          const pontos = s.valores
            .map((v, i) => (v == null ? null : ([x(i), y(v), v] as const)))
            .filter((p): p is readonly [number, number, number] => p !== null)
          return (
            <g key={s.nome}>
              <polyline
                points={pontos.map(([px, py]) => `${px},${py}`).join(' ')}
                fill="none"
                style={{ stroke: s.cor }}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
              {pontos.map(([px, py, v], i) => (
                <circle key={i} cx={px} cy={py} r={3.5} style={{ fill: s.cor }}>
                  <title>{`${s.nome}: ${v}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
      </svg>
      <figcaption className="chart-legend">
        {series.map((s) => (
          <span key={s.nome}>
            <i className="legend-box" style={{ background: s.cor }} /> {s.nome}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
