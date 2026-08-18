import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Administrador, PreCadastro, Usuario } from '../../lib/types'
import { Modal } from '../../components/Modal'

type Aba = 'usuarios' | 'administradores'

export function AdminGestaoUsuarios() {
  const [aba, setAba] = useState<Aba>('usuarios')
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [administradores, setAdministradores] = useState<Administrador[]>([])
  const [pendentes, setPendentes] = useState<PreCadastro[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [modalAberto, setModalAberto] = useState(false)
  const [codigoGerado, setCodigoGerado] = useState<{ nome: string; codigo: string } | null>(null)

  async function carregar() {
    setLoading(true)
    setErro(null)
    const [{ data: u, error: eU }, { data: a, error: eA }, { data: p, error: eP }] = await Promise.all([
      supabase.from('usuarios').select('*').order('nome', { ascending: true }),
      supabase.from('administradores').select('*').order('nome', { ascending: true }),
      supabase.rpc('admin_listar_pre_cadastros'),
    ])
    if (eU || eA || eP) setErro((eU ?? eA ?? eP)?.message ?? null)
    setUsuarios((u as Usuario[]) ?? [])
    setAdministradores((a as Administrador[]) ?? [])
    setPendentes((p as PreCadastro[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  const pendentesUsuarios = pendentes.filter((p) => p.tipo === 'usuario')
  const pendentesAdmins = pendentes.filter((p) => p.tipo === 'administrador')

  async function cancelarPendente(item: PreCadastro) {
    if (!confirm(`Cancelar o pré-cadastro de ${item.nome}?`)) return
    const { error } = await supabase.rpc('admin_cancelar_pre_cadastro', { p_tipo: item.tipo, p_email: item.email })
    if (error) alert('Erro: ' + error.message)
    else carregar()
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

      <div className="mb-6 flex gap-2">
        {(['usuarios', 'administradores'] as Aba[]).map((t) => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              aba === t ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan)' : 'border-(--color-border) text-(--color-ink-soft) hover:bg-black/5'
            }`}
          >
            {t === 'usuarios' ? 'alunos/pesquisadores' : 'administradores'}
          </button>
        ))}
      </div>

      {erro && <p className="mb-4 rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) px-3 py-2 text-sm text-(--color-coral)">{erro}</p>}

      {loading ? (
        <p className="font-mono text-sm text-(--color-ink-soft)">carregando…</p>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
              Pendentes de ativação {aba === 'usuarios' ? `(${pendentesUsuarios.length})` : `(${pendentesAdmins.length})`}
            </h2>
            {(aba === 'usuarios' ? pendentesUsuarios : pendentesAdmins).length === 0 ? (
              <p className="rounded-lg border border-dashed border-(--color-border) p-6 text-center text-sm text-(--color-ink-soft)">
                Nenhum pré-cadastro pendente.
              </p>
            ) : (
              <div className="space-y-2">
                {(aba === 'usuarios' ? pendentesUsuarios : pendentesAdmins).map((p) => (
                  <div key={p.email} className="card flex flex-wrap items-center justify-between gap-3 p-3">
                    <div>
                      <p className="font-medium">{p.nome}</p>
                      <p className="text-sm text-(--color-ink-soft)">{p.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-(--color-amber)/30 bg-(--color-amber-soft) px-2.5 py-1 font-mono text-xs text-(--color-amber)">
                        {aba === 'usuarios' ? `matrícula: ${p.identificador}` : `código: ${p.identificador}`}
                      </span>
                      <button
                        onClick={() => cancelarPendente(p)}
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

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
              Contas ativas {aba === 'usuarios' ? `(${usuarios.length})` : `(${administradores.length})`}
            </h2>
            {(aba === 'usuarios' ? usuarios : administradores).length === 0 ? (
              <p className="rounded-lg border border-dashed border-(--color-border) p-6 text-center text-sm text-(--color-ink-soft)">
                Nenhuma conta ativa ainda.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-(--color-border)">
                <table className="w-full text-left text-sm">
                  <thead className="bg-(--color-paper) font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">
                    <tr>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">E-mail</th>
                      <th className="px-4 py-3">{aba === 'usuarios' ? 'Matrícula' : 'Código'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aba === 'usuarios'
                      ? usuarios.map((u) => (
                          <tr key={u.id_usuario} className="border-t border-(--color-border)">
                            <td className="px-4 py-3 font-medium">{u.nome}</td>
                            <td className="px-4 py-3">{u.email}</td>
                            <td className="px-4 py-3 font-mono">{u.matricula ?? '—'}</td>
                          </tr>
                        ))
                      : administradores.map((a) => (
                          <tr key={a.id_adm} className="border-t border-(--color-border)">
                            <td className="px-4 py-3 font-medium">{a.nome}</td>
                            <td className="px-4 py-3">{a.email}</td>
                            <td className="px-4 py-3 font-mono">{a.codigo ?? '—'}</td>
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
          onCriado={(codigoInfo) => {
            setModalAberto(false)
            if (codigoInfo) setCodigoGerado(codigoInfo)
            carregar()
          }}
        />
      )}

      {codigoGerado && (
        <Modal title="Código de administrador gerado" onClose={() => setCodigoGerado(null)}>
          <div className="space-y-3">
            <p className="text-sm text-(--color-ink-soft)">
              Compartilhe este código com <strong>{codigoGerado.nome}</strong> para que ele(a) ative o próprio cadastro na tela de login, aba "ativar (admin)".
            </p>
            <div className="rounded-md border border-(--color-cyan)/40 bg-(--color-cyan-soft) p-4 text-center font-mono text-2xl font-bold tracking-widest text-(--color-cyan)">
              {codigoGerado.codigo}
            </div>
            <button className="btn-primary w-full" onClick={() => setCodigoGerado(null)}>
              entendi
            </button>
          </div>
        </Modal>
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
  onCriado: (codigoInfo: { nome: string; codigo: string } | null) => void
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [matricula, setMatricula] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro(null)

    if (tipo === 'usuarios') {
      const { error } = await supabase.rpc('admin_criar_pre_cadastro_usuario', {
        p_nome: nome,
        p_email: email,
        p_matricula: matricula,
      })
      setSalvando(false)
      if (error) return setErro(error.message)
      onCriado(null)
    } else {
      const { data, error } = await supabase.rpc('admin_criar_pre_cadastro_admin', { p_nome: nome, p_email: email })
      setSalvando(false)
      if (error) return setErro(error.message)
      onCriado({ nome, codigo: data as string })
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
          <p className="text-xs text-(--color-ink-soft)">Um código de ativação único será gerado automaticamente após salvar.</p>
        )}

        {erro && <p className="rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) px-3 py-2 text-sm text-(--color-coral)">{erro}</p>}

        <div className="flex justify-end gap-2">
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
