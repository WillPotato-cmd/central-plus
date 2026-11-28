import { useEffect, useMemo, useState } from 'react'
import { LineChart } from '../components/LineChart'
import { SolicitacaoCard } from '../components/SolicitacaoCard'
import { Abas, Campo, Vazio, useAcao, usePaginacao } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import * as api from '../lib/api'
import { ITENS_POR_PAGINA, PRIORIDADES, SETORES_CENTRAL } from '../lib/constants'
import { lojasPermitidas } from '../lib/permissions'
import { Avaliacoes, NotaDaSemana } from './Avaliacoes'
import type { DocAuditoria, NotaAuditoria, Prioridade, Solicitacao } from '../lib/types'

type AbaLider = 'dashboard' | 'avaliacoes' | 'nova' | 'abertas' | 'historico'

const textoBusca = (s: Solicitacao) => [s.id, s.titulo, s.setor, s.descricao ?? '', s.resposta ?? ''].join(' ')

export function LiderView() {
  const { usuario } = useAuth()
  const { solicitacoes, nomesLojasAtivas } = useData()
  const permitidas = useMemo(() => lojasPermitidas(usuario, nomesLojasAtivas), [usuario, nomesLojasAtivas])
  const [loja, setLoja] = useState(permitidas[0] ?? '')
  const [aba, setAba] = useState<AbaLider>('dashboard')

  useEffect(() => {
    if (!permitidas.includes(loja) && permitidas.length) setLoja(permitidas[0])
  }, [permitidas, loja])

  const daLoja = useMemo(() => solicitacoes.filter((s) => s.loja === loja), [solicitacoes, loja])
  const abertas = useMemo(() => daLoja.filter((s) => s.status !== 'concluido'), [daLoja])
  const historico = useMemo(() => daLoja.filter((s) => s.status === 'concluido'), [daLoja])

  if (!permitidas.length) {
    return <Vazio>Nenhuma loja atribuída ao seu perfil. Solicite acesso à Diretoria.</Vazio>
  }

  return (
    <>
      <div className="store-row">
        <label htmlFor="loja-select">Unidade em atendimento:</label>
        <select id="loja-select" value={loja} onChange={(e) => setLoja(e.target.value)}>
          {permitidas.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <Abas
        ativa={aba}
        onChange={setAba}
        abas={[
          { id: 'dashboard', rotulo: 'Dashboard' },
          { id: 'avaliacoes', rotulo: 'Avaliações' },
          { id: 'nova', rotulo: 'Nova Solicitação' },
          { id: 'abertas', rotulo: `Em Aberto (${abertas.length})` },
          { id: 'historico', rotulo: `Concluídas (${historico.length})` },
        ]}
      />

      {aba === 'dashboard' && <DashboardLoja loja={loja} abertas={abertas.length} />}
      {aba === 'avaliacoes' && <Avaliacoes key={loja} loja={loja} />}
      {aba === 'nova' && <NovaSolicitacaoForm loja={loja} aoCriar={() => setAba('abertas')} />}
      {aba === 'abertas' && <ListaSolicitacoes key={'a' + loja} itens={abertas} />}
      {aba === 'historico' && <ListaSolicitacoes key={'h' + loja} itens={historico} />}
    </>
  )
}

function ListaSolicitacoes({ itens }: { itens: Solicitacao[] }) {
  const { visiveis, barra } = usePaginacao(itens, textoBusca, ITENS_POR_PAGINA)
  return (
    <>
      {barra}
      {visiveis.length ? (
        visiveis.map((s) => <SolicitacaoCard key={s.id} s={s} mostrarLoja={false} />)
      ) : (
        <Vazio>Nenhuma solicitação encontrada.</Vazio>
      )}
    </>
  )
}

function DashboardLoja({ loja, abertas }: { loja: string; abertas: number }) {
  const ano = new Date().getFullYear()
  const [notas, setNotas] = useState<NotaAuditoria[]>([])
  const [docs, setDocs] = useState<DocAuditoria[]>([])
  const [erro, setErro] = useState('')

  useEffect(() => {
    Promise.all([api.listarNotas(ano), api.listarDocumentos(ano)])
      .then(([n, d]) => {
        setNotas(n)
        setDocs(d)
      })
      .catch((e: Error) => setErro(e.message))
  }, [ano])

  const serie = (tipo: 'presencial' | 'adm') =>
    Array.from({ length: 12 }, (_, i) => notas.find((n) => n.loja === loja && n.tipo === tipo && n.mes === i + 1)?.nota ?? null)
  const presencial = serie('presencial')
  const adm = serie('adm')
  const ultima = (v: (number | null)[]) => {
    const n = [...v].reverse().find((x) => x != null)
    return n == null ? '–' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  }
  const doc = (tipo: 'presencial' | 'adm') => docs.find((d) => d.loja === loja && d.tipo === tipo)
  const { executar } = useAcao()

  return (
    <div className="grid">
      <div>
        <div className="card">
          <h2>Desempenho Atual da Unidade</h2>
          {erro && <p className="error-msg">{erro}</p>}
          <div className="scores">
            <div>
              <small>Auditoria Presencial</small>
              <div className="audit-score moss">{ultima(presencial)}</div>
            </div>
            <div>
              <small>Auditoria Adm</small>
              <div className="audit-score steel">{ultima(adm)}</div>
            </div>
          </div>
        </div>
        <div className="card">
          <h2>Evolução {ano}</h2>
          <LineChart
            series={[
              { nome: 'Auditoria Presencial', cor: 'var(--moss)', valores: presencial },
              { nome: 'Auditoria Administrativa', cor: 'var(--steel)', valores: adm },
            ]}
          />
        </div>
      </div>
      <div>
        <div className="card">
          <h2>Avaliações de clientes</h2>
          <NotaDaSemana loja={loja} />
        </div>
        <div className="card">
          <h2>Resumo Operacional</h2>
          <p>
            Você possui <strong>{abertas}</strong> solicitações em aberto nesta unidade.
          </p>
        </div>
        <div className="card">
          <h2>Relatórios de Auditoria {ano}</h2>
          {(['presencial', 'adm'] as const).map((t) => {
            const d = doc(t)
            return (
              <div className="history-box" key={t}>
                <strong>{t === 'presencial' ? 'Presencial' : 'Administrativo'}:</strong>{' '}
                {d ? (
                  <button className="link" onClick={() => executar(() => api.abrirDocumento(d))}>
                    {d.nome_arquivo}
                  </button>
                ) : (
                  'Nenhum enviado'
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function NovaSolicitacaoForm({ loja, aoCriar }: { loja: string; aoCriar: () => void }) {
  const { criar } = useData()
  const { ocupado, executar } = useAcao()
  const [setor, setSetor] = useState<string>('Manutenção')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prioridade, setPrioridade] = useState<Prioridade>('normal')
  const [arquivo, setArquivo] = useState<File | null>(null)

  return (
    <form
      className="card form-estreito"
      onSubmit={(e) => {
        e.preventDefault()
        if (!titulo.trim()) return
        void executar(async () => {
          await criar({ loja, setor, titulo, descricao, prioridade, arquivo })
          aoCriar()
        })
      }}
    >
      <h2>Nova Solicitação para {loja}</h2>
      <Campo rotulo="Setor de destino">
        <select value={setor} onChange={(e) => setSetor(e.target.value)}>
          {SETORES_CENTRAL.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Título da demanda">
        <input required maxLength={150} placeholder="Ex: Manutenção no forno" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </Campo>
      <Campo rotulo="Detalhes">
        <textarea maxLength={4000} placeholder="Descreva a demanda" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </Campo>
      <Campo rotulo="Foto (opcional)">
        {/* No celular, oferece câmera ou galeria */}
        <input type="file" accept="image/*" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
      </Campo>
      <div className="field">
        <span>Prioridade</span>
        <div className="priority-row">
          {PRIORIDADES.map((p) => (
            <button type="button" key={p} data-p={p} className={prioridade === p ? 'active' : ''} onClick={() => setPrioridade(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <button className="submit-btn" disabled={ocupado || !titulo.trim()}>
        {ocupado ? 'Enviando…' : 'Enviar para a Central'}
      </button>
    </form>
  )
}
