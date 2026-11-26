import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from '../lib/api'
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
  const solicitacoesRef = useRef(solicitacoes)
  solicitacoesRef.current = solicitacoes

  useEffect(() => {
    if (!uid) return
    const canal = supabase
      .channel('solicitacoes-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes' }, async (payload) => {
        // Só mantém a lista em dia; os avisos chegam pelo push (servidor)
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as Partial<Solicitacao>).id
          setSolicitacoes((lista) => lista.filter((s) => s.id !== id))
          return
        }

        const nova = await api.comImagem(payload.new as Solicitacao)

        if (payload.eventType === 'INSERT') {
          setSolicitacoes((lista) => (lista.some((s) => s.id === nova.id) ? lista : [nova, ...lista]))
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
      substituir(criada)
      return criada
    },
    [usuario],
  )

  const mudarStatus = useCallback(async (id: string, status: Status) => {
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
