import { useCallback, useEffect, useState } from 'react'
import { useAcao } from '../../components/ui'
import { useData } from '../../context/DataContext'
import * as api from '../../lib/api'
import { MESES } from '../../lib/constants'
import type { DocAuditoria, NotaAuditoria, TipoAuditoria } from '../../lib/types'

const TITULO: Record<TipoAuditoria, string> = {
  presencial: 'Auditorias Presenciais Mensais (Supervisão Operacional)',
  adm: 'Auditorias Administrativas Mensais (Diretoria)',
}

/** Notas mensais (0 a 10) e relatório anual por loja. Agora tudo fica salvo no banco. */
export function PainelAuditorias({ tipo }: { tipo: TipoAuditoria }) {
  const { nomesLojasAtivas } = useData()
  const anoAtual = new Date().getFullYear()
  const [ano, setAno] = useState(anoAtual)
  const [notas, setNotas] = useState<NotaAuditoria[]>([])
  const [docs, setDocs] = useState<DocAuditoria[]>([])
  const [erro, setErro] = useState('')
  const { ocupado, executar } = useAcao()

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const [n, d] = await Promise.all([api.listarNotas(ano), api.listarDocumentos(ano)])
      setNotas(n.filter((x) => x.tipo === tipo))
      setDocs(d.filter((x) => x.tipo === tipo))
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [ano, tipo])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const nota = (loja: string, mes: number) => notas.find((n) => n.loja === loja && n.mes === mes)?.nota ?? null

  async function salvar(loja: string, mes: number, texto: string) {
    const limpo = texto.trim().replace(',', '.')
    const valor = limpo === '' ? null : Number(limpo)
    if (valor !== null && (Number.isNaN(valor) || valor < 0 || valor > 10)) {
      window.alert('A nota precisa ser um número de 0 a 10.')
      return
    }
    if (valor === nota(loja, mes)) return
    await executar(async () => {
      await api.salvarNota(loja, ano, mes, tipo, valor)
      setNotas((lista) => [...lista.filter((n) => !(n.loja === loja && n.mes === mes)), { loja, ano, mes, tipo, nota: valor }])
    })
  }

  return (
    <>
      <div className="linha-titulo">
        <h2 className="titulo-secao">{TITULO[tipo]}</h2>
        <label>
          Ano:{' '}
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {[anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>
      {erro && <p className="error-msg">{erro}</p>}
      <p className="suave">As notas são salvas ao sair do campo. Deixe em branco para apagar.</p>

      <div className="table-responsive">
        <table className="table-list auditoria">
          <thead>
            <tr>
              <th>LOJA</th>
              {MESES.map((m) => (
                <th key={m}>{m.toUpperCase()}</th>
              ))}
              <th>RELATÓRIO {ano}</th>
            </tr>
          </thead>
          <tbody>
            {nomesLojasAtivas.map((loja) => {
              const doc = docs.find((d) => d.loja === loja)
              return (
                <tr key={loja}>
                  <td>
                    <strong>{loja}</strong>
                  </td>
                  {MESES.map((m, i) => (
                    <td key={m}>
                      <input
                        // key muda quando o valor salvo muda, recriando o campo com o valor novo
                        key={`${ano}-${nota(loja, i + 1)}`}
                        className="nota"
                        inputMode="decimal"
                        aria-label={`Nota de ${m} - ${loja}`}
                        defaultValue={nota(loja, i + 1) ?? ''}
                        onBlur={(e) => void salvar(loja, i + 1, e.target.value)}
                      />
                    </td>
                  ))}
                  <td>
                    <input
                      type="file"
                      accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
                      disabled={ocupado}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f)
                          void executar(async () => {
                            await api.enviarDocumento(loja, ano, tipo, f, doc)
                            await carregar()
                          })
                      }}
                    />
                    <br />
                    {doc ? (
                      <button className="link" onClick={() => executar(() => api.abrirDocumento(doc))}>
                        {doc.nome_arquivo}
                      </button>
                    ) : (
                      <small>Nenhum enviado</small>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
