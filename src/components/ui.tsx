import { useEffect, useMemo, useState, type ReactNode } from 'react'

// ---------------------------------------------------------------- Abas

export interface Aba<T extends string> {
  id: T
  rotulo: string
}

export function Abas<T extends string>({ abas, ativa, onChange }: { abas: Aba<T>[]; ativa: T; onChange: (id: T) => void }) {
  return (
    <nav className="nav-tabs" role="tablist">
      {abas.map((a) => (
        <button
          key={a.id}
          role="tab"
          aria-selected={a.id === ativa}
          className={a.id === ativa ? 'active' : ''}
          onClick={() => onChange(a.id)}
        >
          {a.rotulo}
        </button>
      ))}
    </nav>
  )
}

// ---------------------------------------------------------------- Busca + paginação

/** Filtra por texto e pagina uma lista. Volta à página 1 quando a busca muda. */
export function usePaginacao<T>(itens: T[], textoDe: (item: T) => string, porPagina: number) {
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? itens.filter((i) => textoDe(i).toLowerCase().includes(q)) : itens
  }, [itens, busca])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = filtrados.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina)

  const barra = (
    <div className="search-pagination-bar">
      <input
        type="search"
        placeholder="Pesquisar..."
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value)
          setPagina(1)
        }}
      />
      <div className="pagination-controls">
        <span>
          Página <strong>{paginaAtual}</strong> de <strong>{totalPaginas}</strong> ({filtrados.length})
        </span>
        <button disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)}>
          Anterior
        </button>
        <button disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)}>
          Próxima
        </button>
      </div>
    </div>
  )

  return { visiveis, barra, total: filtrados.length }
}

// ---------------------------------------------------------------- Diversos

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{rotulo}</span>
      {children}
    </label>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Mensagem({ tipo, children }: { tipo: 'erro' | 'info'; children: ReactNode }) {
  if (!children) return null
  return <div className={tipo === 'erro' ? 'error-msg' : 'info-msg'}>{children}</div>
}

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="lightbox-overlay" onClick={onClose} role="dialog" aria-label="Imagem anexada">
      <img src={src} className="lightbox-img" alt="Anexo" />
    </div>
  )
}

/** Executa uma ação assíncrona mostrando erro em alerta e bloqueando cliques duplos */
export function useAcao() {
  const [ocupado, setOcupado] = useState(false)
  async function executar(fn: () => Promise<unknown>) {
    if (ocupado) return
    setOcupado(true)
    try {
      await fn()
    } catch (e) {
      window.alert((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }
  return { ocupado, executar }
}
