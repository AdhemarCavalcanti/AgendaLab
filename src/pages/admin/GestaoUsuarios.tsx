import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Administrador, Usuario } from '../../lib/types'
import { Modal } from '../../components/Modal'

type Aba = 'usuarios' | 'administradores'

export function AdminGestaoUsuarios() {
  const [aba, setAba] = useState<Aba>('usuarios')
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [administradores, setAdministradores] = useState<Administrador[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  
  // Estado para o filtro de pesquisa
  const [busca, setBusca] = useState('')

  const [modalAberto, setModalAberto] = useState(false)

  async function carregar() {
    setLoading(true)
    setErro(null)
    const [{ data: u, error: eU }, { data: a, error: eA }] = await Promise.all([
      supabase.from('usuarios').select('*').order('nome', { ascending: true }),
      supabase.from('administradores').select('*').order('nome', { ascending: true }),
    ])

    if (eU || eA) setErro((eU ?? eA)?.message ?? null)
    setUsuarios((u as Usuario[]) ?? [])
    setAdministradores((a as Administrador[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  // Função genérica de filtro por nome, e-mail, matrícula ou código
  const filtrarPorTermo = <T extends { nome: string; email: string; matricula?: string | null; codigo?: string | null }>(
    lista: T[]
  ) => {
    if (!busca.trim()) return lista
    const termo = busca.toLowerCase().trim()
    return lista.filter(
      (item) =>
        item.nome.toLowerCase().includes(termo) ||
        item.email.toLowerCase().includes(termo) ||
        (item.matricula && item.matricula.toLowerCase().includes(termo)) ||
        (item.codigo && item.codigo.toLowerCase().includes(termo))
    )
  }

  // Listas filtradas e divididas por status
  const pendentesUsuarios = filtrarPorTermo(usuarios.filter((u) => !u.uuid))
  const ativadosUsuarios = filtrarPorTermo(usuarios.filter((u) => !!u.uuid))

  const pendentesAdmins = filtrarPorTermo(administradores.filter((a) => !a.uuid))
  const ativadosAdmins = filtrarPorTermo(administradores.filter((a) => !!a.uuid))

  async function cancelarPendente(id: number, tabela: 'usuarios' | 'administradores', nome: string) {
    if (!confirm(`Cancelar o pré-cadastro de ${nome}?`)) return

    const campoId = tabela === 'usuarios' ? 'id_usuario' : 'id_adm'
    const { error } = await supabase.from(tabela).delete().eq(campoId, id)

    if (error) alert('Erro ao cancelar: ' + error.message)
    else carregar()
  }

  async function redefinirSenha(email: string) {
    if (!confirm(`Enviar e-mail de redefinição de senha para ${email}?`)) return

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })

    if (error) {
      alert('Erro ao solicitar redefinição: ' + error.message)
    } else {
      alert(`E-mail de redefinição enviado com sucesso para ${email}!`)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">painel administrativo</p>
          <h1 className="font-display text-3xl font-bold">Gestão de usuários</h1>
        </div>
        <button className="btn-primary" onClick={() => setModalAberto(true)}>
          + pré-cadastrar {aba === 'usuarios' ? 'aluno' : 'administrador'}
        </button>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {(['usuarios', 'administradores'] as Aba[]).map((t) => (
            <button
              key={t}
              onClick={() => setAba(t)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                aba === t
                  ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan)'
                  : 'border-(--color-border) text-(--color-ink-soft) hover:bg-black/5'
              }`}
            >
              {t === 'usuarios' ? 'alunos/pesquisadores' : 'administradores'}
            </button>
          ))}
        </div>

        {/* Input de busca */}
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={aba === 'usuarios' ? "Buscar por nome, e-mail ou matrícula…" : "Buscar por nome, e-mail ou código…"}
            className="input w-full pr-8 text-sm"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-(--color-ink-soft) hover:text-(--color-ink)"
              title="Limpar busca"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {erro && <p className="mb-4 rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) px-3 py-2 text-sm text-(--color-coral)">{erro}</p>}

      {loading ? (
        <p className="font-mono text-sm text-(--color-ink-soft)">carregando…</p>
      ) : (
        <div className="space-y-8">
          {/* Seção de Pendentes */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
              Pendentes de ativação {aba === 'usuarios' ? `(${pendentesUsuarios.length})` : `(${pendentesAdmins.length})`}
            </h2>
            {aba === 'usuarios' ? (
              pendentesUsuarios.length === 0 ? (
                <p className="rounded-lg border border-dashed border-(--color-border) p-6 text-center text-sm text-(--color-ink-soft)">
                  {busca ? 'Nenhum resultado encontrado para a busca.' : 'Nenhum pré-cadastro de aluno pendente.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {pendentesUsuarios.map((u) => (
                    <div key={u.id_usuario} className="card flex flex-wrap items-center justify-between gap-3 p-3">
                      <div>
                        <p className="font-medium">{u.nome}</p>
                        <p className="text-sm text-(--color-ink-soft)">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full border border-(--color-amber)/30 bg-(--color-amber-soft) px-2.5 py-1 font-mono text-xs text-(--color-amber)">
                          matrícula: {u.matricula ?? '—'}
                        </span>
                        <button
                          onClick={() => cancelarPendente(u.id_usuario, 'usuarios', u.nome)}
                          className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium text-(--color-coral) hover:bg-(--color-coral-soft)"
                        >
                          cancelar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : pendentesAdmins.length === 0 ? (
              <p className="rounded-lg border border-dashed border-(--color-border) p-6 text-center text-sm text-(--color-ink-soft)">
                {busca ? 'Nenhum resultado encontrado para a busca.' : 'Nenhum pré-cadastro de administrador pendente.'}
              </p>
            ) : (
              <div className="space-y-2">
                {pendentesAdmins.map((a) => (
                  <div key={a.id_adm} className="card flex flex-wrap items-center justify-between gap-3 p-3">
                    <div>
                      <p className="font-medium">{a.nome}</p>
                      <p className="text-sm text-(--color-ink-soft)">{a.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-(--color-amber)/30 bg-(--color-amber-soft) px-2.5 py-1 font-mono text-xs text-(--color-amber)">
                        código: {a.codigo ?? '—'}
                      </span>
                      <button
                        onClick={() => cancelarPendente(a.id_adm, 'administradores', a.nome)}
                        className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium text-(--color-coral) hover:bg-(--color-coral-soft)"
                      >
                        cancelar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Seção de Contas Ativas */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
              Contas ativas {aba === 'usuarios' ? `(${ativadosUsuarios.length})` : `(${ativadosAdmins.length})`}
            </h2>
            {(aba === 'usuarios' ? ativadosUsuarios : ativadosAdmins).length === 0 ? (
              <p className="rounded-lg border border-dashed border-(--color-border) p-6 text-center text-sm text-(--color-ink-soft)">
                {busca ? 'Nenhum resultado encontrado para a busca.' : 'Nenhuma conta ativa ainda.'}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-(--color-border)">
                <table className="w-full text-left text-sm">
                  <thead className="bg-(--color-paper) font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">
                    <tr>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">E-mail</th>
                      <th className="px-4 py-3">{aba === 'usuarios' ? 'Matrícula' : 'Código'}</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aba === 'usuarios'
                      ? ativadosUsuarios.map((u) => (
                          <tr key={u.id_usuario} className="border-t border-(--color-border)">
                            <td className="px-4 py-3 font-medium">{u.nome}</td>
                            <td className="px-4 py-3">{u.email}</td>
                            <td className="px-4 py-3 font-mono">{u.matricula ?? '—'}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => redefinirSenha(u.email)}
                                className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium text-(--color-cyan) hover:bg-(--color-cyan-soft)"
                              >
                                redefinir senha
                              </button>
                            </td>
                          </tr>
                        ))
                      : ativadosAdmins.map((a) => (
                          <tr key={a.id_adm} className="border-t border-(--color-border)">
                            <td className="px-4 py-3 font-medium">{a.nome}</td>
                            <td className="px-4 py-3">{a.email}</td>
                            <td className="px-4 py-3 font-mono">{a.codigo ?? '—'}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => redefinirSenha(a.email)}
                                className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium text-(--color-cyan) hover:bg-(--color-cyan-soft)"
                              >
                                redefinir senha
                              </button>
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {modalAberto && (
        <PreCadastroForm
          tipo={aba}
          onClose={() => setModalAberto(false)}
          onCriado={() => {
            setModalAberto(false)
            carregar()
          }}
        />
      )}
    </div>
  )
}

function PreCadastroForm({
  tipo,
  onClose,
  onCriado,
}: {
  tipo: Aba
  onClose: () => void
  onCriado: () => void
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [matricula, setMatricula] = useState('')
  const [codigoAdmin, setCodigoAdmin] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function gerarCodigoAleatorio() {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let resultado = 'ADM-'
    for (let i = 0; i < 6; i++) {
      resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length))
    }
    setCodigoAdmin(resultado)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro(null)

    if (tipo === 'usuarios') {
      const { error } = await supabase.from('usuarios').insert([
        {
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          matricula: matricula.trim(),
        },
      ])

      setSalvando(false)

      if (error) {
        if (error.code === '23505') {
          if (error.message.includes('matricula')) {
            return setErro('Esta matrícula já está cadastrada para outro aluno.')
          }
          if (error.message.includes('email')) {
            return setErro('Este e-mail já está cadastrado.')
          }
          return setErro('Já existe um aluno cadastrado com estes dados.')
        }
        return setErro(error.message)
      }

      onCriado()
    } else {
      if (!codigoAdmin) {
        setSalvando(false)
        return setErro('Por favor, gere um código de verificação para o administrador.')
      }

      const { error } = await supabase.from('administradores').insert([
        {
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          codigo: codigoAdmin.trim().toUpperCase(),
        },
      ])

      setSalvando(false)

      if (error) {
        if (error.code === '23505') {
          if (error.message.includes('codigo')) {
            return setErro('Este código de administrador já está em uso. Por favor, gere um novo código.')
          }
          if (error.message.includes('email')) {
            return setErro('Este e-mail já está cadastrado.')
          }
          return setErro('Já existe um administrador cadastrado com estes dados.')
        }
        return setErro(error.message)
      }

      onCriado()
    }
  }

  return (
    <Modal title={`Pré-cadastrar ${tipo === 'usuarios' ? 'aluno/pesquisador' : 'administrador'}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nome completo</span>
          <input required value={nome} onChange={(e) => setNome(e.target.value)} className="input" placeholder="Nome da pessoa" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="pessoa@universidade.edu" />
        </label>
        {tipo === 'usuarios' && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Matrícula</span>
            <input required value={matricula} onChange={(e) => setMatricula(e.target.value)} className="input" placeholder="Ex: 2023001234" />
          </label>
        )}
        {tipo === 'administradores' && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Código de ativação do Admin</span>
            <div className="flex gap-2">
              <input
                required
                readOnly
                value={codigoAdmin}
                className="input font-mono font-bold uppercase tracking-wider bg-black/5"
                placeholder="Clique ao lado para gerar"
              />
              <button
                type="button"
                onClick={gerarCodigoAleatorio}
                className="btn-secondary whitespace-nowrap text-xs font-semibold"
              >
                {codigoAdmin ? 'Gerar Outro' : 'Gerar Código'}
              </button>
            </div>
          </label>
        )}

        {erro && <p className="rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) px-3 py-2 text-sm text-(--color-coral)">{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={salvando}>
            cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? 'salvando…' : 'pré-cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}