import { useEffect, useMemo, useState } from 'react'
import { Abas, Campo, Vazio } from '../components/ui'
import {
  buscarDadosLoja,
  chaveSemana,
  diaMes,
  hojeISO,
  mesesComDados,
  notasTotais,
  panoramaMes,
  primeiroEUltimoDiaDoMesAtual,
  resumoSemana,
  rotuloMes,
  rotuloSemana,
  semanaAnterior,
  semanasComDados,
  textoNotasTotais,
  textoPanorama,
  textoSemana,
  totalCancelamentos,
  type DadosAvalia,
  type Feedback,
  type FiltroOrigem,
} from '../lib/avalia'

// ---------------------------------------------------------------- busca (com cache por loja)

const cache = new Map<string, { quando: number; dados: DadosAvalia }>()
const emAndamento = new Map<string, Promise<DadosAvalia>>()
const VALIDADE_MS = 5 * 60 * 1000

/** Evita duas buscas iguais ao mesmo tempo (Dashboard e aba abrindo juntos) */
function buscar(loja: string): Promise<DadosAvalia> {
  const atual = emAndamento.get(loja)
  if (atual) return atual
  const p = buscarDadosLoja(loja)
    .then((d) => {
      cache.set(loja, { quando: Date.now(), dados: d })
      return d
    })
    .finally(() => emAndamento.delete(loja))
  emAndamento.set(loja, p)
  return p
}

/** Esquece os dados guardados (ex.: depois de mudar a ligação da loja) */
export function limparCacheAvalia(loja?: string) {
  if (loja) cache.delete(loja)
  else cache.clear()
}

export function useAvalia(loja: string) {
  const [dados, setDados] = useState<DadosAvalia | null>(cache.get(loja)?.dados ?? null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    if (!loja) return
    const guardado = cache.get(loja)
    if (guardado && Date.now() - guardado.quando < VALIDADE_MS && versao === 0) {
      setDados(guardado.dados)
      setErro('')
      return
    }
    let vivo = true
    setDados(guardado?.dados ?? null) // não mostra dados de outra loja enquanto carrega
    setCarregando(true)
    setErro('')
    buscar(loja)
      .then((d) => {
        if (vivo) setDados(d)
      })
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [loja, versao])

  return { dados, erro, carregando, atualizar: () => setVersao((v) => v + 1) }
}

// ---------------------------------------------------------------- peças

function Estrelas({ nota }: { nota: number }) {
  return <span className={`nota-badge n${nota}`}>{nota}★</span>
}

function Origem({ o }: { o: Feedback['origem'] }) {
  if (!o) return null
  return <span className={`tag origem-${o}`}>{o === 'ifood' ? 'iFood' : '99Food'}</span>
}

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false)
  if (!texto) return null
  return (
    <details className="texto-pronto">
      <summary>Texto pronto para enviar</summary>
      <textarea readOnly value={texto} />
      <button
        className="btn-sm"
        onClick={() =>
          navigator.clipboard.writeText(texto).then(() => {
            setOk(true)
            window.setTimeout(() => setOk(false), 1500)
          })
        }
      >
        {ok ? 'Copiado!' : 'Copiar texto'}
      </button>
    </details>
  )
}

const fmt = (n: number | null, casas = 2) => (n == null ? '–' : n.toFixed(casas).replace('.', ','))

// ---------------------------------------------------------------- cartão do Dashboard

/** Nota da semana atual (e a anterior para comparar), para o Dashboard da loja */
export function NotaDaSemana({ loja }: { loja: string }) {
  const { dados, erro, carregando } = useAvalia(loja)
  if (erro) return <p className="suave">{erro}</p>
  if (carregando && !dados) return <p className="suave">Carregando avaliações…</p>
  if (!dados) return null
  if (!dados.vinculada) return <p className="suave">Esta loja ainda não foi ligada ao Avalia Potato.</p>

  const atual = resumoSemana(dados.feedbacks, chaveSemana(hojeISO()))
  const anterior = resumoSemana(dados.feedbacks, semanaAnterior(atual.chave))
  const diff = atual.media != null && anterior.media != null ? atual.media - anterior.media : null

  return (
    <div className="scores">
      <div>
        <small>Nota da semana ({rotuloSemana(atual.chave)})</small>
        <div className="audit-score rust">{fmt(atual.media)}</div>
        <small className="suave">
          {atual.itens.length} avaliação(ões)
          {diff != null && ` · ${diff >= 0 ? '▲' : '▼'} ${fmt(Math.abs(diff))} vs. semana anterior`}
        </small>
      </div>
      <div>
        <small>Semana anterior</small>
        <div className="audit-score steel">{fmt(anterior.media)}</div>
        <small className="suave">{anterior.itens.length} avaliação(ões)</small>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- tela de Avaliações

type Aba = 'semana' | 'mes' | 'totais' | 'operacao'

export function Avaliacoes({ loja }: { loja: string }) {
  const { dados, erro, carregando, atualizar } = useAvalia(loja)
  const [aba, setAba] = useState<Aba>('semana')

  if (erro)
    return (
      <Vazio>
        {erro}
        <br />
        <button className="btn-sm" onClick={atualizar}>
          Tentar de novo
        </button>
      </Vazio>
    )
  if (!dados) return <div className="loading">Carregando avaliações…</div>
  if (!dados.vinculada)
    return <Vazio>Esta loja ainda não foi ligada ao Avalia Potato. A Diretoria faz isso na aba “Lojas”.</Vazio>

  return (
    <>
      <div className="linha-titulo">
        <Abas
          ativa={aba}
          onChange={setAba}
          abas={[
            { id: 'semana', rotulo: 'Semana' },
            { id: 'mes', rotulo: 'Panorama mensal' },
            { id: 'totais', rotulo: 'Notas totais' },
            { id: 'operacao', rotulo: 'Operação mensal' },
          ]}
        />
        <button className="btn-sm" disabled={carregando} onClick={atualizar}>
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>
      {aba === 'semana' && <Semana loja={loja} dados={dados} />}
      {aba === 'mes' && <Mes loja={loja} dados={dados} />}
      {aba === 'totais' && <Totais loja={loja} dados={dados} />}
      {aba === 'operacao' && <Operacao dados={dados} />}
    </>
  )
}

function Semana({ loja, dados }: { loja: string; dados: DadosAvalia }) {
  const atual = chaveSemana(hojeISO())
  const opcoes = useMemo(() => {
    const s = semanasComDados(dados.feedbacks)
    return s.includes(atual) ? s : [atual, ...s]
  }, [dados, atual])
  const [chave, setChave] = useState(opcoes[0])
  const r = resumoSemana(dados.feedbacks, chave)

  return (
    <div className="card">
      <div className="linha-titulo">
        <h2>Relatório semanal</h2>
        <select value={chave} onChange={(e) => setChave(e.target.value)} aria-label="Semana">
          {opcoes.map((k) => (
            <option key={k} value={k}>
              {rotuloSemana(k)}
              {k === atual ? ' (atual)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-title">MÉDIA DA SEMANA</span>
          <span className="kpi-value">{fmt(r.media)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">FEEDBACKS NA SEMANA</span>
          <span className="kpi-value">{r.itens.length}</span>
        </div>
      </div>
      {r.itens.length === 0 ? (
        <Vazio>Nenhum feedback registrado nessa semana.</Vazio>
      ) : (
        <div className="feedbacks">
          {[...r.itens].reverse().map((f) => (
            <article key={f.id} className={`feedback n${f.nota}`}>
              <div className="feedback-topo">
                <Estrelas nota={f.nota} />
                <strong>{f.cliente || 'Cliente'}</strong>
                <Origem o={f.origem} />
                <span className="suave">
                  {diaMes(new Date(f.data + 'T00:00:00'))}
                  {f.pedido && ` · pedido ${f.pedido}`}
                </span>
              </div>
              {f.texto ? <p>{f.texto}</p> : <p className="suave">(sem comentário)</p>}
            </article>
          ))}
        </div>
      )}
      <Copiar texto={textoSemana(dados.loja?.nome ?? loja, r)} />
    </div>
  )
}

function Mes({ loja, dados }: { loja: string; dados: DadosAvalia }) {
  const meses = useMemo(() => mesesComDados(dados.feedbacks), [dados])
  const [mes, setMes] = useState(meses[0] ?? hojeISO().slice(0, 7))
  const p = panoramaMes(dados.feedbacks, mes)

  return (
    <div className="card">
      <div className="linha-titulo">
        <h2>Panorama mensal</h2>
        <select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
          {(meses.length ? meses : [mes]).map((m) => (
            <option key={m} value={m}>
              {rotuloMes(m)}
            </option>
          ))}
        </select>
      </div>
      {!p ? (
        <Vazio>Nenhum feedback registrado nesse mês.</Vazio>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-title">MÉDIA DO MÊS</span>
              <span className="kpi-value">{fmt(p.media)}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-title">AVALIAÇÕES</span>
              <span className="kpi-value">{p.total}</span>
              <small className="suave">
                {p.comTexto} com comentário · {p.semTexto} só nota
              </small>
            </div>
            <div className="kpi-card">
              <span className="kpi-title">POR PLATAFORMA</span>
              <span className="kpi-value">
                {p.ifood} <small>iFood</small> · {p.noventaENove} <small>99</small>
              </span>
            </div>
          </div>
          <div className="table-responsive">
            <table className="table-list compacta">
              <thead>
                <tr>
                  <th>SEMANA</th>
                  <th>PERÍODO</th>
                  <th>AVALIAÇÕES</th>
                  <th>MÉDIA</th>
                </tr>
              </thead>
              <tbody>
                {p.semanas.map((s, i) => (
                  <tr key={s.chave}>
                    <td>Semana {i + 1}</td>
                    <td>{rotuloSemana(s.chave)}</td>
                    <td>{s.quantidade}</td>
                    <td>
                      <strong>{fmt(s.media)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Copiar texto={textoPanorama(dados.loja?.nome ?? loja, p)} />
        </>
      )}
    </div>
  )
}

function Totais({ loja, dados }: { loja: string; dados: DadosAvalia }) {
  const padrao = primeiroEUltimoDiaDoMesAtual()
  const [inicio, setInicio] = useState(padrao.inicio)
  const [fim, setFim] = useState(padrao.fim)
  const [origem, setOrigem] = useState<FiltroOrigem>('ambos')
  const n = notasTotais(dados.feedbacks, dados.notasSecas, inicio, fim, origem)
  const maior = Math.max(1, ...Object.values(n.contagem))

  return (
    <div className="card">
      <h2>Notas totais</h2>
      <p className="suave">Todas as notas do período (com e sem comentário, incluindo as notas lançadas em massa) e a média ponderada.</p>
      <div className="filtros-avalia">
        <Campo rotulo="De">
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Campo>
        <Campo rotulo="Até">
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </Campo>
        <Campo rotulo="Origem">
          <select value={origem} onChange={(e) => setOrigem(e.target.value as FiltroOrigem)}>
            <option value="ambos">iFood + 99Food</option>
            <option value="ifood">Somente iFood</option>
            <option value="99food">Somente 99Food</option>
          </select>
        </Campo>
      </div>
      {n.total === 0 ? (
        <Vazio>Nenhuma nota nesse período.</Vazio>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-title">MÉDIA</span>
              <span className="kpi-value">{fmt(n.media)} ⭐</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-title">TOTAL DE NOTAS</span>
              <span className="kpi-value">{n.total}</span>
            </div>
          </div>
          <div className="barras-notas">
            {([5, 4, 3, 2, 1] as const).map((k) => (
              <div className="barra-linha" key={k}>
                <span className="barra-rotulo">Nota {k}</span>
                <div className="barra-fundo">
                  <div className={`barra n${k}`} style={{ width: `${(n.contagem[k] / maior) * 100}%` }} />
                </div>
                <span className="barra-valor">{n.contagem[k]}</span>
              </div>
            ))}
          </div>
          <Copiar texto={textoNotasTotais(dados.loja?.nome ?? loja, inicio, fim, origem, n)} />
        </>
      )}
    </div>
  )
}

function Operacao({ dados }: { dados: DadosAvalia }) {
  const meses = dados.operacao.map((o) => o.mes)
  const [mes, setMes] = useState(meses[0] ?? '')
  const o = dados.operacao.find((x) => x.mes === mes)

  if (!meses.length) return <Vazio>Nenhum dado de operação lançado para esta loja.</Vazio>

  const motivos = [...(o?.motivos_cancelamento ?? [])].sort((a, b) => b.quantidade - a.quantidade)

  return (
    <div className="card">
      <div className="linha-titulo">
        <h2>Operação mensal</h2>
        <select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
          {meses.map((m) => (
            <option key={m} value={m}>
              {rotuloMes(m)}
            </option>
          ))}
        </select>
      </div>
      {o && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-title">CANCELAMENTOS</span>
              <span className="kpi-value">{totalCancelamentos(o)}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-title">TEMPO DE FUNCIONAMENTO</span>
              <span className="kpi-value">{o.tempo_func || '–'}</span>
              {o.tempo_pct != null && <small className="suave">{fmt(Number(o.tempo_pct))}% do tempo</small>}
            </div>
          </div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-title">ENTREGA</span>
              <span className="kpi-value">{o.log_entrega ?? '–'} <small>min</small></span>
            </div>
            <div className="kpi-card">
              <span className="kpi-title">PREPARO</span>
              <span className="kpi-value">{o.log_preparo ?? '–'} <small>min</small></span>
            </div>
            <div className="kpi-card">
              <span className="kpi-title">ESPERA</span>
              <span className="kpi-value">{o.log_espera ?? '–'} <small>min</small></span>
            </div>
          </div>
          <h2>Motivos de cancelamento</h2>
          {motivos.length ? (
            <div className="table-responsive">
              <table className="table-list compacta">
                <thead>
                  <tr>
                    <th>MOTIVO</th>
                    <th>QUANTIDADE</th>
                  </tr>
                </thead>
                <tbody>
                  {motivos.map((m, i) => (
                    <tr key={i}>
                      <td>{m.motivo}</td>
                      <td>{m.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="suave">Nenhum cancelamento registrado nesse mês.</p>
          )}
        </>
      )}
    </div>
  )
}
