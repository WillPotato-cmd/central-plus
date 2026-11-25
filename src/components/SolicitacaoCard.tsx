import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { SETORES_CENTRAL, STATUS_LABEL } from '../lib/constants'
import { ehDiretoria, podeEncaminhar, podeGerenciar } from '../lib/permissions'
import type { Resposta, Solicitacao, Status } from '../lib/types'
import { Lightbox, useAcao } from './ui'

function dataCurta(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function SolicitacaoCard({ s, mostrarLoja }: { s: Solicitacao; mostrarLoja: boolean }) {
  const { usuario } = useAuth()
  const { mudarStatus, responder, encaminhar, excluir, respostas } = useData()
  const { ocupado, executar } = useAcao()
  const [resposta, setResposta] = useState('')
  const [zoom, setZoom] = useState(false)

  const gerencia = podeGerenciar(usuario, s.setor)
  const encaminha = podeEncaminhar(usuario, s.setor) && s.status !== 'concluido'

  const botoes: { rotulo: string; status: Status }[] = []
  if (gerencia) {
    if (s.status === 'pendente') botoes.push({ rotulo: 'Colocar em andamento', status: 'em_andamento' })
    if (s.status === 'em_andamento') botoes.push({ rotulo: 'Aguardar', status: 'aguardando' })
    if (s.status === 'aguardando') botoes.push({ rotulo: 'Voltar p/ andamento', status: 'em_andamento' })
    if (s.status !== 'concluido') botoes.push({ rotulo: 'Dar baixa', status: 'concluido' })
  }

  return (
    <article className={`slip ${s.prioridade}`}>
      <div className="slip-top">
        <div>
          <div className="slip-id">
            {s.id}
            {mostrarLoja && ` · ${s.loja}`}
            {s.criado_em && ` · ${dataCurta(s.criado_em)}`}
          </div>
          <div className="slip-title">{s.titulo}</div>
        </div>
        <span className={`status-pill status-${s.status}`}>{STATUS_LABEL[s.status]}</span>
      </div>

      <div className="slip-meta">
        <span className="tag">{s.setor}</span>
        <span className="tag">{s.prioridade}</span>
      </div>

      {s.descricao && <div className="slip-desc">{s.descricao}</div>}

      {s.imagemUrl && (
        <button className="slip-img-btn" onClick={() => setZoom(true)} aria-label="Ampliar foto">
          <img src={s.imagemUrl} className="slip-img" alt="Foto anexada" loading="lazy" />
        </button>
      )}
      {zoom && s.imagemUrl && <Lightbox src={s.imagemUrl} onClose={() => setZoom(false)} />}

      <Historico itens={respostas[s.id] ?? []} legado={s.resposta} />

      {(botoes.length > 0 || encaminha || ehDiretoria(usuario)) && (
        <div className="slip-actions">
          {botoes.map((b) => (
            <button key={b.status} disabled={ocupado} onClick={() => executar(() => mudarStatus(s.id, b.status))}>
              {b.rotulo}
            </button>
          ))}
          {encaminha && (
            <select
              className="encaminhar"
              aria-label="Trocar setor responsável"
              value=""
              disabled={ocupado}
              onChange={(e) => {
                const destino = e.target.value
                if (destino && window.confirm(`Encaminhar ${s.id} de ${s.setor} para ${destino}?`)) {
                  void executar(() => encaminhar(s.id, destino))
                }
              }}
            >
              <option value="">Trocar setor…</option>
              {SETORES_CENTRAL.filter((x) => x !== s.setor).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          )}
          {ehDiretoria(usuario) && (
            <button
              className="danger"
              disabled={ocupado}
              onClick={() => {
                if (window.confirm(`Remover a solicitação ${s.id}?`)) void executar(() => excluir(s))
              }}
            >
              Excluir
            </button>
          )}
        </div>
      )}

      {gerencia && s.status !== 'pendente' && (
        <form
          className="resp-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (!resposta.trim()) return
            void executar(async () => {
              await responder(s.id, resposta)
              setResposta('')
            })
          }}
        >
          <input
            placeholder="Responder ou adicionar nota..."
            value={resposta}
            maxLength={2000}
            onChange={(e) => setResposta(e.target.value)}
          />
          <button type="submit" disabled={ocupado || !resposta.trim()}>
            Responder
          </button>
        </form>
      )}
    </article>
  )
}

const VISIVEIS = 3

/** Histórico de respostas: mostra as 3 mais recentes e permite ver todas */
function Historico({ itens, legado }: { itens: Resposta[]; legado: string | null }) {
  const [todas, setTodas] = useState(false)

  // Solicitações antigas que ainda não passaram pela migração do histórico
  if (!itens.length) {
    return legado ? <div className="resposta">Retorno Central: {legado}</div> : null
  }

  const ocultas = Math.max(0, itens.length - VISIVEIS)
  const mostrar = todas ? itens : itens.slice(-VISIVEIS)

  return (
    <div className="historico">
      {ocultas > 0 && (
        <button className="link pequeno" onClick={() => setTodas(!todas)}>
          {todas ? 'Mostrar só as mais recentes' : `Ver todas as respostas (${itens.length})`}
        </button>
      )}
      {mostrar.map((r) => (
        <div key={r.id} className={'resposta' + (r.tipo === 'encaminhamento' ? ' encaminhamento' : '')}>
          <div className="resposta-autor">
            <strong>{r.autor_nome}</strong>
            {r.autor_tag && <span> ({r.autor_tag})</span>}
            <span className="resposta-data"> · {dataCurta(r.criado_em)}</span>
          </div>
          <div>{r.tipo === 'encaminhamento' ? '↪ ' + r.texto : r.texto}</div>
        </div>
      ))}
    </div>
  )
}
