// Dashboard da Diretoria
//   • Números gerais do período (7, 30 ou 90 dias)
//   • "Precisa de atenção": urgentes paradas há mais de 72h, lojas com nota
//     caindo 2 semanas seguidas e avaliações ruins (nota ≤ 2) de hoje
//   • Acompanhamento por setor e por loja (com a nota dos clientes do Avalia
//     e a última auditoria); clicar num número abre a lista
// As notas do Avalia são buscadas ao entrar e no botão "Atualizar".
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SolicitacaoCard } from '../../components/SolicitacaoCard'
import { Vazio } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import * as api from '../../lib/api'
import { buscarResumoAvalia, chaveSemana, hojeISO, rotuloSemana, semanaAnterior, type FeedbackResumo } from '../../lib/avalia'
import { MESES, SETORES_CENTRAL } from '../../lib/constants'
import type { NotaAuditoria, Solicitacao } from '../../lib/types'

const HORA = 3600 * 1000
const LIMITE_URGENTE_H = 72
const PERIODOS = [7, 30, 90] as const
type Periodo = (typeof PERIODOS)[number]

// ---------------------------------------------------------------- cálculos

const inicioDe = (s: Solicitacao) => s.timestamp ?? (s.criado_em ? Date.parse(s.criado_em) : 0)

/** Última movimentação: troca de status, resposta ou encaminhamento */
const ultimoMovimento = (s: Solicitacao) => Math.max(inicioDe(s), s.atualizado_em ? Date.parse(s.atualizado_em) : 0)

/** Quando foi concluída (as antigas, sem registro, usam a última movimentação) */
const conclusaoDe = (s: Solicitacao) =>
  s.status !== 'concluido' ? null : s.concluido_em ? Date.parse(s.concluido_em) : ultimoMovimento(s) || null

function duracao(ms: number): string {
  const h = Math.round(ms / HORA)
  if (h < 1) return 'menos de 1h'
  if (h < 48) return `${h}h`
  const d = Math.floor(h / 24)
  const r = h % 24
  return r ? `${d}d ${r}h` : `${d}d`
}

const fmtNota = (n: number | null | undefined, casas = 2) => (n == null ? '–' : n.toFixed(casas).replace('.', ','))

function media(itens: FeedbackResumo[], semana: string): number | null {
  const da = itens.filter((f) => chaveSemana(f.data) === semana)
  if (!da.length) return null
  return da.reduce((t, f) => t + Number(f.nota), 0) / da.length
}

function dataLocal(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Contagem {
  pendente: Solicitacao[]
  andamento: Solicitacao[]
  aguardando: Solicitacao[]
  concluidas: Solicitacao[]
  tempoMedio: number | null
}

function contar(lista: Solicitacao[], desde: number): Contagem {
  const concluidas = lista.filter((s) => (conclusaoDe(s) ?? 0) >= desde)
  const comTempo = concluidas.filter((s) => s.concluido_em)
  return {
    pendente: lista.filter((s) => s.status === 'pendente'),
    andamento: lista.filter((s) => s.status === 'em_andamento'),
    aguardando: lista.filter((s) => s.status === 'aguardando'),
    concluidas,
    tempoMedio: comTempo.length
      ? comTempo.reduce((t, s) => t + (Date.parse(s.concluido_em!) - inicioDe(s)), 0) / comTempo.length
      : null,
  }
}

// ---------------------------------------------------------------- notas do Avalia (guardadas até sair)

let cacheAvalia: { usuario: string; quando: Date; lojas: Record<string, FeedbackResumo[]> } | null = null

function useResumoAvalia() {
  const { usuario } = useAuth()
  const id = usuario?.id ?? ''
  const valido = cacheAvalia?.usuario === id ? cacheAvalia : null
  const [estado, setEstado] = useState({ dados: valido?.lojas ?? null, quando: valido?.quando ?? null, erro: '', carregando: false })

  const atualizar = useCallback(async () => {
    setEstado((e) => ({ ...e, carregando: true, erro: '' }))
    try {
      const lojas = await buscarResumoAvalia()
      cacheAvalia = { usuario: id, quando: new Date(), lojas }
      setEstado({ dados: lojas, quando: cacheAvalia.quando, erro: '', carregando: false })
    } catch (e) {
      setEstado((s) => ({ ...s, erro: (e as Error).message, carregando: false }))
    }
  }, [id])

  // Ao entrar no sistema (primeira abertura do dashboard nesta sessão)
  useEffect(() => {
    if (!valido && id) void atualizar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return { ...estado, atualizar }
}

function useUltimasAuditorias() {
  const [notas, setNotas] = useState<NotaAuditoria[]>([])
  useEffect(() => {
    const ano = new Date().getFullYear()
    Promise.all([api.listarNotas(ano), api.listarNotas(ano - 1)])
      .then(([a, b]) => setNotas([...a, ...b]))
      .catch(() => setNotas([]))
  }, [])
  return useCallback(
    (loja: string) => {
      const da = notas
        .filter((n) => n.loja === loja && n.nota != null)
        .sort((x, y) => y.ano * 12 + y.mes - (x.ano * 12 + x.mes))
      const ultima = (tipo: 'presencial' | 'adm') => da.find((n) => n.tipo === tipo) ?? null
      return { presencial: ultima('presencial'), adm: ultima('adm') }
    },
    [notas],
  )
}

// ---------------------------------------------------------------- tela

interface Lista {
  titulo: string
  itens: Solicitacao[]
}

type Ordem = 'nome' | 'abertas' | 'concluidas' | 'nota'

export function Balanco() {
  const { solicitacoes, nomesLojasAtivas, recarregar } = useData()
  const [periodo, setPeriodo] = useState<Periodo>(30)
  const [lista, setLista] = useState<Lista | null>(null)
  const [ordem, setOrdem] = useState<Ordem>('nota')
  const avalia = useResumoAvalia()
  const ultimaAuditoria = useUltimasAuditorias()
  const refLista = useRef<HTMLDivElement>(null)

  const agora = Date.now()
  const desde = agora - periodo * 24 * HORA
  const hoje = hojeISO()
  const semanaAtual = chaveSemana(hoje)
  const s1 = semanaAnterior(semanaAtual)
  const s2 = semanaAnterior(s1)
  const s3 = semanaAnterior(s2)

  const abrir = (titulo: string, itens: Solicitacao[]) => {
    setLista({ titulo, itens: [...itens].sort((a, b) => inicioDe(b) - inicioDe(a)) })
    setTimeout(() => refLista.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const geral = useMemo(() => contar(solicitacoes, desde), [solicitacoes, desde])
  const novas = solicitacoes.filter((s) => inicioDe(s) >= desde)
  const abertas = solicitacoes.filter((s) => s.status !== 'concluido')
  const urgentesAbertas = abertas.filter((s) => s.prioridade === 'urgente')

  // ---- precisa de atenção
  const urgentesParadas = urgentesAbertas
    .filter((s) => agora - ultimoMovimento(s) > LIMITE_URGENTE_H * HORA)
    .sort((a, b) => ultimoMovimento(a) - ultimoMovimento(b))

  const porLojaAvalia = avalia.dados ?? {}
  const notaCaindo = nomesLojasAtivas
    .map((loja) => {
      const fb = porLojaAvalia[loja]
      if (!fb) return null
      const [m1, m2, m3] = [media(fb, s1), media(fb, s2), media(fb, s3)]
      return m1 != null && m2 != null && m3 != null && m1 < m2 && m2 < m3 ? { loja, m1, m2, m3 } : null
    })
    .filter((x): x is { loja: string; m1: number; m2: number; m3: number } => !!x)

  const ruinsHoje = Object.entries(porLojaAvalia)
    .flatMap(([loja, fb]) =>
      fb.filter((f) => Number(f.nota) <= 2 && (f.data === hoje || dataLocal(f.criado_em) === hoje)).map((f) => ({ loja, f })),
    )
    .sort((a, b) => a.loja.localeCompare(b.loja))

  const totalAtencao = urgentesParadas.length + notaCaindo.length + ruinsHoje.length

  // ---- nota da rede
  const todasAtual = Object.values(porLojaAvalia).flatMap((fb) => fb.filter((f) => chaveSemana(f.data) === semanaAtual))
  const mediaRede = todasAtual.length ? todasAtual.reduce((t, f) => t + Number(f.nota), 0) / todasAtual.length : null

  // ---- setores
  const setores = useMemo(() => {
    const nomes = new Set<string>(SETORES_CENTRAL)
    solicitacoes.forEach((s) => nomes.add(s.setor))
    return [...nomes].map((setor) => ({ setor, c: contar(solicitacoes.filter((s) => s.setor === setor), desde) }))
  }, [solicitacoes, desde])

  // ---- lojas
  const lojas = nomesLojasAtivas.map((loja) => {
    const daLoja = solicitacoes.filter((s) => s.loja === loja)
    const fb = porLojaAvalia[loja]
    const nota = fb ? media(fb, semanaAtual) : null
    const anterior = fb ? media(fb, s1) : null
    return { loja, c: contar(daLoja, desde), nota, anterior, ligada: !!fb, aud: ultimaAuditoria(loja) }
  })
  const lojasOrdenadas = [...lojas].sort((a, b) => {
    if (ordem === 'nome') return a.loja.localeCompare(b.loja)
    if (ordem === 'abertas') {
      const ab = (x: typeof a) => x.c.pendente.length + x.c.andamento.length + x.c.aguardando.length
      return ab(b) - ab(a)
    }
    if (ordem === 'concluidas') return b.c.concluidas.length - a.c.concluidas.length
    return (b.nota ?? -1) - (a.nota ?? -1)
  })

  const comNota = lojas.filter((l) => l.nota != null).sort((a, b) => b.nota! - a.nota!)
  const melhores = comNota.slice(0, 3)
  const piores = comNota.length > 3 ? comNota.slice(-3).reverse() : []

  const Num = ({ itens, titulo, classe = '' }: { itens: Solicitacao[]; titulo: string; classe?: string }) =>
    itens.length ? (
      <button type="button" className={`num-btn ${classe}`} onClick={() => abrir(titulo, itens)} title="Ver a lista">
        {itens.length}
      </button>
    ) : (
      <span className="num-zero">0</span>
    )

  const Cabecalho = ({ id, children }: { id: Ordem; children: string }) => (
    <th aria-sort={ordem === id ? 'descending' : undefined}>
      <button type="button" className={`th-ordem${ordem === id ? ' active' : ''}`} onClick={() => setOrdem(id)}>
        {children}
        {ordem === id ? ' ▾' : ''}
      </button>
    </th>
  )

  const rotuloPeriodo = `últimos ${periodo} dias`

  return (
    <div className="dashboard">
      <div className="dash-toolbar">
        <h2 className="titulo-secao">Visão geral da rede</h2>
        <div className="dash-acoes">
          <div className="seletor" role="radiogroup" aria-label="Período">
            {PERIODOS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={periodo === p}
                className={periodo === p ? 'active' : ''}
                onClick={() => setPeriodo(p)}
              >
                {p} dias
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-sm"
            disabled={avalia.carregando}
            onClick={() => {
              void recarregar()
              void avalia.atualizar()
            }}
          >
            {avalia.carregando ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
      </div>
      <p className="suave dash-legenda">
        {avalia.quando
          ? `Notas dos clientes (Avalia) atualizadas às ${avalia.quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`
          : avalia.carregando
            ? 'Buscando as notas dos clientes no Avalia…'
            : ''}
        {avalia.erro && <span className="error-msg"> {avalia.erro}</span>}
      </p>

      {/* ---------------------------------------------------- números gerais */}
      <div className="kpi-grid">
        <button type="button" className="kpi-card kpi-click" onClick={() => abrir('Em aberto agora', abertas)}>
          <span className="kpi-title">EM ABERTO AGORA</span>
          <span className="kpi-value">{abertas.length}</span>
          <small className="suave">{urgentesAbertas.length} urgente(s)</small>
        </button>
        <button type="button" className="kpi-card kpi-click" onClick={() => abrir(`Novas nos ${rotuloPeriodo}`, novas)}>
          <span className="kpi-title">NOVAS</span>
          <span className="kpi-value">{novas.length}</span>
          <small className="suave">{rotuloPeriodo}</small>
        </button>
        <button
          type="button"
          className="kpi-card kpi-click"
          onClick={() => abrir(`Concluídas nos ${rotuloPeriodo}`, geral.concluidas)}
        >
          <span className="kpi-title">CONCLUÍDAS</span>
          <span className="kpi-value" style={{ color: 'var(--moss)' }}>
            {geral.concluidas.length}
          </span>
          <small className="suave">{rotuloPeriodo}</small>
        </button>
        <div className="kpi-card">
          <span className="kpi-title">TEMPO MÉDIO P/ CONCLUIR</span>
          <span className="kpi-value kpi-texto">{geral.tempoMedio == null ? '–' : duracao(geral.tempoMedio)}</span>
          <small className="suave">{rotuloPeriodo}</small>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">NOTA DOS CLIENTES</span>
          <span className="kpi-value" style={{ color: 'var(--destaque)' }}>
            {fmtNota(mediaRede)}
          </span>
          <small className="suave">
            semana {rotuloSemana(semanaAtual)} · {todasAtual.length} avaliações
          </small>
        </div>
      </div>

      {/* ---------------------------------------------------- precisa de atenção */}
      <section className={`card atencao${totalAtencao ? ' tem' : ''}`}>
        <h3>
          Precisa de atenção <span className="tag">{totalAtencao}</span>
        </h3>
        {totalAtencao === 0 && <p className="suave">Nada fora do normal agora. 👍</p>}

        {urgentesParadas.length > 0 && (
          <div className="atencao-grupo">
            <h4>Urgentes sem movimento há mais de {LIMITE_URGENTE_H}h</h4>
            <ul>
              {urgentesParadas.map((s) => (
                <li key={s.id}>
                  <button type="button" className="link-btn" onClick={() => abrir(s.titulo, [s])}>
                    <strong>{s.loja}</strong> · {s.setor} — {s.titulo}
                  </button>
                  <span className="atencao-meta">parada há {duracao(agora - ultimoMovimento(s))}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {notaCaindo.length > 0 && (
          <div className="atencao-grupo">
            <h4>Nota dos clientes caindo há 2 semanas</h4>
            <ul>
              {notaCaindo.map((n) => (
                <li key={n.loja}>
                  <strong>{n.loja}</strong>
                  <span className="atencao-meta">
                    {fmtNota(n.m3)} → {fmtNota(n.m2)} → {fmtNota(n.m1)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ruinsHoje.length > 0 && (
          <div className="atencao-grupo">
            <h4>Avaliações ruins de hoje</h4>
            <ul>
              {ruinsHoje.map(({ loja, f }) => (
                <li key={f.id}>
                  <span className={`nota-badge n${Math.round(Number(f.nota))}`}>{Number(f.nota)}★</span>{' '}
                  <strong>{loja}</strong>
                  {f.origem && <span className={`tag origem-${f.origem}`}>{f.origem === 'ifood' ? 'iFood' : '99Food'}</span>}
                  {f.texto && <span className="atencao-texto">“{f.texto}”</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------- por setor */}
      <h2 className="titulo-secao">Por setor</h2>
      <div className="table-responsive">
        <table className="table-list tabela-dash">
          <thead>
            <tr>
              <th>SETOR</th>
              <th>PENDENTES</th>
              <th>EM ANDAMENTO</th>
              <th>AGUARDANDO</th>
              <th>CONCLUÍDAS ({periodo}D)</th>
              <th>TEMPO MÉDIO</th>
            </tr>
          </thead>
          <tbody>
            {setores.map(({ setor, c }) => (
              <tr key={setor}>
                <td>{setor}</td>
                <td>
                  <Num itens={c.pendente} titulo={`${setor} · pendentes`} />
                </td>
                <td>
                  <Num itens={c.andamento} titulo={`${setor} · em andamento`} />
                </td>
                <td>
                  <Num itens={c.aguardando} titulo={`${setor} · aguardando`} />
                </td>
                <td>
                  <Num itens={c.concluidas} titulo={`${setor} · concluídas (${rotuloPeriodo})`} classe="ok" />
                </td>
                <td className="suave">{c.tempoMedio == null ? '–' : duracao(c.tempoMedio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------- por loja */}
      <h2 className="titulo-secao">Por loja</h2>
      {comNota.length > 0 && (
        <div className="ranking">
          <div className="card">
            <h3>Melhores notas da semana</h3>
            <ol>
              {melhores.map((l) => (
                <li key={l.loja}>
                  {l.loja} <strong>{fmtNota(l.nota)}</strong>
                </li>
              ))}
            </ol>
          </div>
          {piores.length > 0 && (
            <div className="card">
              <h3>Menores notas da semana</h3>
              <ol>
                {piores.map((l) => (
                  <li key={l.loja}>
                    {l.loja} <strong>{fmtNota(l.nota)}</strong>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
      <div className="table-responsive">
        <table className="table-list tabela-dash">
          <thead>
            <tr>
              <Cabecalho id="nome">LOJA</Cabecalho>
              <Cabecalho id="abertas">EM ABERTO</Cabecalho>
              <Cabecalho id="concluidas">{`CONCLUÍDAS (${periodo}D)`}</Cabecalho>
              <Cabecalho id="nota">NOTA DA SEMANA</Cabecalho>
              <th>ÚLTIMA AUDITORIA</th>
            </tr>
          </thead>
          <tbody>
            {lojasOrdenadas.map(({ loja, c, nota, anterior, ligada, aud }) => {
              const emAberto = [...c.pendente, ...c.andamento, ...c.aguardando]
              const diff = nota != null && anterior != null ? nota - anterior : null
              return (
                <tr key={loja}>
                  <td>{loja}</td>
                  <td>
                    <Num itens={emAberto} titulo={`${loja} · em aberto`} />
                    {emAberto.length > 0 && (
                      <small className="suave detalhe">
                        {' '}
                        {c.pendente.length} pend. · {c.andamento.length} and. · {c.aguardando.length} ag.
                      </small>
                    )}
                  </td>
                  <td>
                    <Num itens={c.concluidas} titulo={`${loja} · concluídas (${rotuloPeriodo})`} classe="ok" />
                  </td>
                  <td>
                    {!avalia.dados ? (
                      <span className="suave">{avalia.carregando ? '…' : '–'}</span>
                    ) : !ligada ? (
                      <small className="suave">não ligada</small>
                    ) : (
                      <>
                        <strong>{fmtNota(nota)}</strong>
                        {diff != null && Math.abs(diff) >= 0.005 && (
                          <span className={`delta ${diff > 0 ? 'sobe' : 'desce'}`}>
                            {diff > 0 ? '▲' : '▼'} {fmtNota(Math.abs(diff))}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="suave">
                    {aud.presencial || aud.adm ? (
                      <>
                        {aud.presencial && `Presencial ${fmtNota(aud.presencial.nota, 1)} (${MESES[aud.presencial.mes - 1]})`}
                        {aud.presencial && aud.adm && <br />}
                        {aud.adm && `ADM ${fmtNota(aud.adm.nota, 1)} (${MESES[aud.adm.mes - 1]})`}
                      </>
                    ) : (
                      '–'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------- lista ao clicar */}
      <div ref={refLista}>
        {lista && (
          <section className="card lista-dash">
            <div className="lista-dash-topo">
              <h3>
                {lista.titulo} <span className="tag">{lista.itens.length}</span>
              </h3>
              <button type="button" className="btn-sm" onClick={() => setLista(null)}>
                Fechar
              </button>
            </div>
            {lista.itens.length === 0 ? (
              <Vazio>Nenhuma solicitação.</Vazio>
            ) : (
              lista.itens.map((s) => <SolicitacaoCard key={s.id} s={s} mostrarLoja />)
            )}
          </section>
        )}
      </div>
    </div>
  )
}
