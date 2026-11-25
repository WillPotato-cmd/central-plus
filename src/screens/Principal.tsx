import { useEffect, useState } from 'react'
import { Abas, Vazio } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { estadoPermissao, pedirPermissao, type EstadoPermissao } from '../lib/notify'
import { visaoPrincipal } from '../lib/permissions'
import { CentralView } from './CentralView'
import { Balanco } from './diretoria/Balanco'
import { Logs } from './diretoria/Logs'
import { Lojas } from './diretoria/Lojas'
import { PainelAuditorias } from './diretoria/PainelAuditorias'
import { Usuarios } from './diretoria/Usuarios'
import { LiderView } from './LiderView'
import { Perfil } from './Perfil'

type AbaDiretoria = 'balanco' | 'audit_adm' | 'audit_presencial' | 'central' | 'lojas_visao' | 'lojas' | 'usuarios' | 'logs'

export function Principal() {
  const { usuario, sair } = useAuth()
  const { carregando, erro, recarregar } = useData()
  const [perfilAberto, setPerfilAberto] = useState(false)
  const [notif, setNotif] = useState<EstadoPermissao>('indisponivel')

  useEffect(() => {
    void estadoPermissao().then(setNotif)
  }, [])

  if (!usuario) return null
  const visao = visaoPrincipal(usuario)

  let conteudo
  if (perfilAberto) conteudo = <Perfil aoFechar={() => setPerfilAberto(false)} />
  else if (carregando) conteudo = <div className="loading">Carregando…</div>
  else if (erro)
    conteudo = (
      <Vazio>
        {erro}
        <br />
        <button className="btn-sm" onClick={() => void recarregar()}>
          Tentar de novo
        </button>
      </Vazio>
    )
  else if (visao === 'diretoria') conteudo = <VisaoDiretoria />
  else if (visao === 'lider') conteudo = <LiderView />
  else conteudo = <CentralView />

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Central+</h1>
          <span>CENTRAL DE SOLICITAÇÕES E OPERAÇÕES</span>
        </div>
        <div className="user-info">
          {notif === 'pendente' && (
            <button className="btn-sm" onClick={() => void pedirPermissao().then(setNotif)}>
              🔔 Ativar notificações
            </button>
          )}
          <button className="btn-link" onClick={() => setPerfilAberto(true)} title="Meu perfil">
            {usuario.nome} <small className="tag">{usuario.tag}</small>
          </button>
          <button className="logout-btn" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      </header>
      <main>{conteudo}</main>
    </div>
  )
}

function VisaoDiretoria() {
  const [aba, setAba] = useState<AbaDiretoria>('balanco')
  return (
    <>
      <Abas
        ativa={aba}
        onChange={setAba}
        abas={[
          { id: 'balanco', rotulo: 'Balanço Geral' },
          { id: 'audit_adm', rotulo: 'Auditoria Adm' },
          { id: 'audit_presencial', rotulo: 'Auditoria Presencial' },
          { id: 'central', rotulo: 'Painel Central' },
          { id: 'lojas_visao', rotulo: 'Visão Líderes' },
          { id: 'lojas', rotulo: 'Lojas' },
          { id: 'usuarios', rotulo: 'Usuários' },
          { id: 'logs', rotulo: 'Logs' },
        ]}
      />
      {aba === 'balanco' && <Balanco />}
      {aba === 'audit_adm' && <PainelAuditorias key="adm" tipo="adm" />}
      {aba === 'audit_presencial' && <PainelAuditorias key="presencial" tipo="presencial" />}
      {aba === 'central' && <CentralView />}
      {aba === 'lojas_visao' && <LiderView />}
      {aba === 'lojas' && <Lojas />}
      {aba === 'usuarios' && <Usuarios />}
      {aba === 'logs' && <Logs />}
    </>
  )
}
