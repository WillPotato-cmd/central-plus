import { useCallback, useEffect, useState } from 'react'
import { Campo, useAcao, usePaginacao } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import * as api from '../../lib/api'
import { SENHA_MINIMA, SETORES_CENTRAL } from '../../lib/constants'
import type { Tag, TipoSupervisao, Usuario } from '../../lib/types'

const TAGS: Tag[] = ['Líder', 'Central', 'Supervisão', 'Diretoria']

interface Formulario extends api.DadosUsuario {
  email: string
  senha: string
}

const VAZIO: Formulario = {
  email: '',
  senha: '',
  nome: '',
  tag: 'Líder',
  lojas_acesso: [],
  setores_acesso: [],
  tipo_supervisao: 'operacao',
}

function alternar(lista: string[], item: string, marcado: boolean): string[] {
  return marcado ? [...new Set([...lista, item])] : lista.filter((x) => x !== item)
}

export function Usuarios() {
  const { usuario: eu } = useAuth()
  const { nomesLojasAtivas } = useData()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [form, setForm] = useState<Formulario>(VAZIO)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const { ocupado, executar } = useAcao()

  const carregar = useCallback(async () => {
    try {
      setUsuarios(await api.listarUsuarios())
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const { visiveis, barra } = usePaginacao(usuarios, (u) => `${u.nome} ${u.email} ${u.tag}`, 8)

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setForm((f) => ({ ...f, [k]: v }))

  function editar(u: Usuario) {
    setEditandoId(u.id)
    setForm({
      email: u.email,
      senha: '',
      nome: u.nome,
      tag: u.tag,
      lojas_acesso: u.lojas_acesso ?? [],
      setores_acesso: u.setores_acesso ?? [],
      tipo_supervisao: (u.tipo_supervisao || 'operacao') as TipoSupervisao,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelar() {
    setEditandoId(null)
    setForm(VAZIO)
  }

  function salvar() {
    if (!form.nome.trim()) return window.alert('Preencha o nome.')
    if (!editandoId && !form.email.trim()) return window.alert('Preencha o e-mail.')
    if (!editandoId && form.senha.length < SENHA_MINIMA)
      return window.alert(`A senha inicial precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
    if (editandoId && form.senha && form.senha.length < SENHA_MINIMA)
      return window.alert(`A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
    if (editandoId === eu?.id && form.tag !== 'Diretoria')
      return window.alert('Você não pode tirar o seu próprio acesso de Diretoria.')

    void executar(async () => {
      if (editandoId) {
        await api.atualizarUsuario(editandoId, form.email, form)
        if (form.senha) await api.redefinirSenhaDeUsuario(editandoId, form.email, form.senha)
        window.alert('Alterações salvas.')
      } else {
        await api.criarUsuario(form.email, form.senha, form)
        window.alert(`Usuário ${form.nome} cadastrado!`)
      }
      cancelar()
      await carregar()
    })
  }

  return (
    <div className="grid">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault()
          salvar()
        }}
      >
        <h2>{editandoId ? 'Editar Usuário' : 'Cadastrar Novo Usuário'}</h2>
        {erro && <p className="error-msg">{erro}</p>}
        <Campo rotulo="Nome completo">
          <input value={form.nome} onChange={(e) => set('nome', e.target.value)} />
        </Campo>
        <Campo rotulo="E-mail corporativo (login)">
          <input type="email" autoComplete="off" disabled={!!editandoId} value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Campo>
        <Campo rotulo={editandoId ? 'Nova senha (em branco = manter a atual)' : 'Senha inicial'}>
          <input
            type="password"
            autoComplete="new-password"
            placeholder={`Mínimo ${SENHA_MINIMA} caracteres`}
            value={form.senha}
            onChange={(e) => set('senha', e.target.value)}
          />
        </Campo>
        <Campo rotulo="Cargo">
          <select value={form.tag} onChange={(e) => set('tag', e.target.value as Tag)}>
            {TAGS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Campo>

        {form.tag === 'Líder' && (
          <div className="field">
            <span>Lojas liberadas</span>
            <div className="checkbox-group">
              {nomesLojasAtivas.map((l) => (
                <label className="checkbox-item" key={l}>
                  <input
                    type="checkbox"
                    checked={form.lojas_acesso.includes(l)}
                    onChange={(e) => set('lojas_acesso', alternar(form.lojas_acesso, l, e.target.checked))}
                  />{' '}
                  {l}
                </label>
              ))}
            </div>
          </div>
        )}

        {form.tag === 'Central' && (
          <div className="field">
            <span>Setores liberados</span>
            <div className="checkbox-group">
              {SETORES_CENTRAL.map((s) => (
                <label className="checkbox-item" key={s}>
                  <input
                    type="checkbox"
                    checked={form.setores_acesso.includes(s)}
                    onChange={(e) => set('setores_acesso', alternar(form.setores_acesso, s, e.target.checked))}
                  />{' '}
                  {s}
                </label>
              ))}
            </div>
          </div>
        )}

        {form.tag === 'Supervisão' && (
          <Campo rotulo="Escopo da supervisão">
            <select value={form.tipo_supervisao} onChange={(e) => set('tipo_supervisao', e.target.value as TipoSupervisao)}>
              <option value="operacao">Operação (todas as lojas)</option>
              <option value="administrativa">Administrativa (todos os setores)</option>
            </select>
          </Campo>
        )}

        <button className="submit-btn" disabled={ocupado}>
          {editandoId ? 'Salvar Alterações' : 'Cadastrar Usuário'}
        </button>
        {editandoId && (
          <button type="button" className="submit-btn secundario" onClick={cancelar}>
            Cancelar
          </button>
        )}
      </form>

      <div>
        <h2 className="titulo-secao">Usuários Cadastrados</h2>
        {barra}
        <div className="table-responsive">
          <table className="table-list">
            <thead>
              <tr>
                <th>USUÁRIO</th>
                <th>CARGO</th>
                <th>STATUS</th>
                <th>AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((u) => {
                const inativo = u.ativo === false
                return (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.nome}</strong>
                      <br />
                      <small>{u.email}</small>
                    </td>
                    <td>
                      <span className="tag">{u.tag}</span>
                    </td>
                    <td>
                      <span className="tag">{inativo ? 'Inativo' : 'Ativo'}</span>
                    </td>
                    <td>
<div className="table-actions">
                      <button className="btn-sm" onClick={() => editar(u)}>
                        Editar
                      </button>
                      {u.id !== eu?.id && (
                        <button
                          className={'btn-sm' + (inativo ? '' : ' danger')}
                          disabled={ocupado}
                          onClick={() =>
                            executar(async () => {
                              await api.definirAtivo(u, inativo)
                              await carregar()
                            })
                          }
                        >
                          {inativo ? 'Reativar' : 'Desativar'}
                        </button>
                      )}
                    </div>
</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
