import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from '../lib/api'
import { STATUS_LABEL } from '../lib/constants'
import { notificar } from '../lib/notify'
import { lojasPermitidas, podeGerenciar } from '../lib/permissions'
import { supabase } from '../lib/supabase'
import type { Loja, Resposta, Solicitacao, Status } from '../lib/types'
import { useAuth } from './AuthContext'

interface DataValue {
  carregando: boolean
  erro: string
  lojas: Loja[]
  nomesLojasAtivas: string[]
  solicitacoes: Solicitacao[]
  /** Histórico de respostas por solicitação, da mais antiga para a mais nova */
  respostas: Record<string, Resposta[]>
  recarregar: () => Promise<void>
  criar: (nova: api.NovaSolicitacao) => Promise<Solicitacao>
  mudarStatus: (id: string, status: Status) => Promise<void>
  responder: (id: string, texto: string) => Promise<void>
  encaminhar: (id: string, setor: string) => Promise<void>
  excluir: (s: Solicitacao) => Promise<void>
}

const DataContext = createContext<DataValue | null>(null)

export function useData(): DataValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData fora do DataProvider')
  return ctx
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [lojas, setLojas] = useState<Loja[]>([])
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [respostas, setRespostas] = useState<Record<string, Resposta[]>>({})

  /** Junta respostas novas às existentes, sem repetir e em ordem de data */
  const juntarRespostas = useCallback((novas: Resposta[]) => {
    if (!novas.length) return
    setRespostas((atual) => {
      const copia = { ...atual }
      for (const r of novas) {
        const lista = copia[r.solicitacao_id] ?? []
        if (lista.some((x) => x.id === r.id)) continue
        copia[r.solicitacao_id] = [...lista, r].sort((a, b) => a.criado_em.localeCompare(b.criado_em))
      }
      return copia
    })
  }, [])

  // Ações feitas neste aparelho: não notificar a própria pessoa
  const acoesLocais = useRef(new Set<string>())
  const marcarLocal = (chave: string) => {
    acoesLocais.current.add(chave)
    window.setTimeout(() => acoesLocais.current.delete(chave), 10_000)
  }

  const nomesLojasAtivas = useMemo(() => lojas.filter((l) => l.ativo).map((l) => l.nome), [lojas])

  const recarregar = useCallback(async () => {
    setErro('')
    try {
      const [ls, ss, rs] = await Promise.all([api.listarLojas(), api.listarSolicitacoes(), api.listarRespostas()])
      setLojas(ls)
      setSolicitacoes(ss)
      setRespostas({})
      juntarRespostas(rs)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [juntarRespostas])

  const uid = usuario?.id

  useEffect(() => {
    if (uid) void recarregar()
  }, [uid, recarregar])

  // Tempo real: o banco só envia eventos das solicitações que o usuário pode ver
  const usuarioRef = useRef(usuario)
  usuarioRef.current = usuario
  const lojasRef = useRef(nomesLojasAtivas)
  lojasRef.current = nomesLojasAtivas
  const solicitacoesRef = useRef(solicitacoes)
  solicitacoesRef.current = solicitacoes

  useEffect(() => {
    if (!uid) return
    const canal = supabase
      .channel('solicitacoes-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes' }, async (payload) => {
        const eu = usuarioRef.current
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as Partial<Solicitacao>).id
          setSolicitacoes((lista) => lista.filter((s) => s.id !== id))
          return
        }

        const nova = await api.comImagem(payload.new as Solicitacao)

        if (payload.eventType === 'INSERT') {
          setSolicitacoes((lista) => (lista.some((s) => s.id === nova.id) ? lista : [nova, ...lista]))
          if (!acoesLocais.current.has('novo:' + nova.id) && podeGerenciar(eu, nova.setor)) {
            void notificar('Nova solicitação: ' + nova.titulo, `${nova.loja} · ${nova.setor}`)
          }
          return
        }

        // UPDATE
        const anterior = payload.old as Partial<Solicitacao>
        // Ainda não estava na lista? Ex.: foi encaminhada agora para um setor meu
        const eraNova = !solicitacoesRef.current.some((s) => s.id === nova.id)
        setSolicitacoes((lista) =>
          lista.some((s) => s.id === nova.id) ? lista.map((s) => (s.id === nova.id ? nova : s)) : [nova, ...lista],
        )
        const mudouSetor = anterior.setor !== undefined && anterior.setor !== nova.setor
        if (mudouSetor || eraNova) {
          void api.listarRespostas(nova.id).then(juntarRespostas).catch(console.error)
          if (podeGerenciar(eu, nova.setor) && !podeGerenciar(eu, anterior.setor ?? '') && !acoesLocais.current.has('enc:' + nova.id)) {
            void notificar('Solicitação encaminhada: ' + nova.titulo, `${nova.loja} · agora em ${nova.setor}`)
          }
        }
        const mudouStatus = anterior.status !== undefined && anterior.status !== nova.status
        const chave = `status:${nova.id}:${nova.status}`
        if (mudouStatus && !acoesLocais.current.has(chave)) {
          const souDaLoja = eu?.tag === 'Líder' && lojasPermitidas(eu, lojasRef.current).includes(nova.loja)
          if (souDaLoja) {
            void notificar(`Solicitação ${nova.id} atualizada`, 'Novo status: ' + STATUS_LABEL[nova.status])
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'respostas_solicitacao' }, (payload) => {
        juntarRespostas([payload.new as Resposta])
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(canal)
    }
  }, [uid, juntarRespostas])

  const substituir = (s: Solicitacao) =>
    setSolicitacoes((lista) => (lista.some((x) => x.id === s.id) ? lista.map((x) => (x.id === s.id ? s : x)) : [s, ...lista]))

  const criar = useCallback(
    async (nova: api.NovaSolicitacao) => {
      if (!usuario) throw new api.ErroApp('Sessão encerrada.')
      const criada = await api.criarSolicitacao(nova, usuario.id)
      marcarLocal('novo:' + criada.id)
      substituir(criada)
      return criada
    },
    [usuario],
  )

  const mudarStatus = useCallback(async (id: string, status: Status) => {
    marcarLocal(`status:${id}:${status}`)
    substituir(await api.mudarStatus(id, status))
  }, [])

  const responder = useCallback(
    async (id: string, texto: string) => {
      substituir(await api.responder(id, texto))
      juntarRespostas(await api.listarRespostas(id))
    },
    [juntarRespostas],
  )

  const encaminhar = useCallback(
    async (id: string, setor: string) => {
      marcarLocal('enc:' + id)
      substituir(await api.encaminhar(id, setor))
      juntarRespostas(await api.listarRespostas(id))
    },
    [juntarRespostas],
  )

  const excluir = useCallback(async (s: Solicitacao) => {
    await api.excluirSolicitacao(s)
    setSolicitacoes((lista) => lista.filter((x) => x.id !== s.id))
  }, [])

  return (
    <DataContext.Provider
      value={{
        carregando,
        erro,
        lojas,
        nomesLojasAtivas,
        solicitacoes,
        respostas,
        recarregar,
        criar,
        mudarStatus,
        responder,
        encaminhar,
        excluir,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}
