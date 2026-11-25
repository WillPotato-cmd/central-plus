import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { STATUS_LABEL } from '../lib/constants'
import { ehDiretoria, podeGerenciar } from '../lib/permissions'
import type { Solicitacao, Status } from '../lib/types'
import { Lightbox, useAcao } from './ui'

function dataCurta(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function SolicitacaoCard({ s, mostrarLoja }: { s: Solicitacao; mostrarLoja: boolean }) {
  const { usuario } = useAuth()
  const { mudarStatus, responder, excluir } = useData()
  const { ocupado, executar } = useAcao()
  const [resposta, setResposta] = useState('')
  const [zoom, setZoom] = useState(false)

  const gerencia = podeGerenciar(usuario, s.setor)

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

      {s.resposta && <div className="resposta">Retorno Central: {s.resposta}</div>}

      {(botoes.length > 0 || ehDiretoria(usuario)) && (
        <div className="slip-actions">
          {botoes.map((b) => (
            <button key={b.status} disabled={ocupado} onClick={() => executar(() => mudarStatus(s.id, b.status))}>
              {b.rotulo}
            </button>
          ))}
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
