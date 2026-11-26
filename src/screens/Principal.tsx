import { useEffect, useState } from 'react'
import { Abas, Vazio } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { ativarPush, estadoPush, sincronizarPush, type EstadoPush } from '../lib/push'
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
  const [notif, setNotif] = useState<EstadoPush>('indisponivel')
  const [ativando, setAtivando] = useState(false)

  // Ao entrar: descobre o estado e, se já estava permitido, renova a inscrição
  useEffect(() => {
    void estadoPush().then((e) => {
      setNotif(e)
      if (e === 'ativo') void sincronizarPush()
    })
  }, [usuario?.id])

  async function ativar() {
    setAtivando(true)
    try {
      const e = await ativarPush()
      setNotif(e)
      if (e === 'negado') {
        window.alert(
          'As notificações estão bloqueadas neste aparelho. Para liberar, abra os ajustes do aparelho (ou do navegador), procure o Central+ e permita as notificações.',
        )
      }
    } catch (e) {
      window.alert((e as Error).message)
    } finally {
      setAtivando(false)
    }
  }

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
            <button className="btn-sm" disabled={ativando} onClick={() => void ativar()}>
              {ativando ? 'Ativando…' : '🔔 Ativar notificações'}
            </button>
          )}
          {notif === 'instalar_iphone' && (
            <button
              className="btn-sm"
              onClick={() =>
                window.alert(
                  'No iPhone, as notificações funcionam pelo ícone do Central+ na Tela de Início:\n\n1. Toque em Compartilhar (quadrado com a seta)\n2. Escolha "Adicionar à Tela de Início"\n3. Abra o Central+ pelo ícone novo, entre e toque em "Ativar notificações"',
                )
              }
            >
              🔔 Notificações no iPhone
            </button>
          )}
          {notif === 'negado' && (
            <small className="suave" title="Libere nas configurações do aparelho ou do navegador">
              🔕 Notificações bloqueadas
            </small>
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
