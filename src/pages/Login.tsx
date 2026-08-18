import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

type Aba = 'entrar' | 'ativar-usuario' | 'ativar-admin'

export function Login() {
  const { signIn, ativarCadastroUsuario, ativarCadastroAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [aba, setAba] = useState<Aba>('entrar')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [matricula, setMatricula] = useState('')
  const [codigo, setCodigo] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)

  function limparMensagens() {
    setError(null)
    setOk(false)
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    limparMensagens()
    setLoading(true)

    const { error, role } = await signIn(email, password)
    setLoading(false)

    if (error) return setError(error)

    const normalizedRole = role?.toString().toLowerCase().trim()

    if (normalizedRole === 'admin') {
      navigate('/admin', { replace: true })
    } else if (normalizedRole === 'usuario' || normalizedRole === 'usuarios' || normalizedRole === 'aluno') {
      const dest = (location.state as { from?: string })?.from ?? '/'
      navigate(dest, { replace: true })
    } else {
      setError('Conta autenticada, porém sem registro de perfil (administrador ou usuário) ativo no sistema.')
    }
  }

  async function handleAtivarUsuario(e: FormEvent) {
    e.preventDefault()
    limparMensagens()
    setLoading(true)
    const { error } = await ativarCadastroUsuario({ email, password, matricula })
    setLoading(false)
    if (error) return setError(error)
    setOk(true)
  }

  async function handleAtivarAdmin(e: FormEvent) {
    e.preventDefault()
    limparMensagens()
    setLoading(true)
    const { error } = await ativarCadastroAdmin({ email, password, codigo })
    setLoading(false)
    if (error) return setError(error)
    setOk(true)
  }

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center px-4 py-16">
      <div className="reg-mark rounded-xl border border-(--color-border) bg-(--color-surface) p-8 shadow-sm">
        <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">acesso ao sistema</p>
        <h1 className="mb-6 font-display text-2xl font-bold">
          {aba === 'entrar' ? 'Entrar no AgendaLab' : 'Ativar meu cadastro'}
        </h1>

        <div className="mb-6 flex gap-1 rounded-lg bg-(--color-paper) p-1">
          {(
            [
              ['entrar', 'entrar'],
              ['ativar-usuario', 'ativar (usuário)'],
              ['ativar-admin', 'ativar (admin)'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setAba(value)
                limparMensagens()
              }}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                aba === value ? 'bg-(--color-surface) text-(--color-cyan) shadow-sm' : 'text-(--color-ink-soft) hover:text-(--color-ink)'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {aba === 'entrar' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <Field label="E-mail">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="voce@universidade.edu" />
            </Field>
            <Field label="Senha">
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="••••••••" />
            </Field>
            {error && <ErroMsg texto={error} />}
            <button disabled={loading} type="submit" className="btn-primary w-full">
              {loading ? 'entrando…' : 'entrar'}
            </button>
          </form>
        )}

        {aba === 'ativar-usuario' && (
          <>
            {ok ? (
              <SucessoAtivacao />
            ) : (
              <form onSubmit={handleAtivarUsuario} className="space-y-4">
                <p className="text-xs text-(--color-ink-soft)">
                  Seu e-mail e matrícula precisam ter sido pré-cadastrados por um administrador antes de ativar o acesso.
                </p>
                <Field label="E-mail pré-cadastrado">
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="voce@universidade.edu" />
                </Field>
                <Field label="Matrícula">
                  <input required value={matricula} onChange={(e) => setMatricula(e.target.value)} className="input" placeholder="Ex: 2023001234" />
                </Field>
                <Field label="Crie uma senha">
                  <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="mínimo 6 caracteres" />
                </Field>
                {error && <ErroMsg texto={error} />}
                <button disabled={loading} type="submit" className="btn-primary w-full">
                  {loading ? 'ativando…' : 'ativar cadastro'}
                </button>
              </form>
            )}
          </>
        )}

        {aba === 'ativar-admin' && (
          <>
            {ok ? (
              <SucessoAtivacao />
            ) : (
              <form onSubmit={handleAtivarAdmin} className="space-y-4">
                <p className="text-xs text-(--color-ink-soft)">
                  Você precisa ter recebido um código de administrador de outro administrador do sistema.
                </p>
                <Field label="E-mail pré-cadastrado">
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="voce@universidade.edu" />
                </Field>
                <Field label="Código de administrador">
                  <input required value={codigo} onChange={(e) => setCodigo(e.target.value)} className="input font-mono uppercase" placeholder="Ex: A1B2C3D4" />
                </Field>
                <Field label="Crie uma senha">
                  <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="mínimo 6 caracteres" />
                </Field>
                {error && <ErroMsg texto={error} />}
                <button disabled={loading} type="submit" className="btn-primary w-full">
                  {loading ? 'ativando…' : 'ativar cadastro de administrador'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SucessoAtivacao() {
  return (
    <p className="rounded-md border border-(--color-green)/30 bg-(--color-green-soft) px-3 py-3 text-sm text-(--color-green)">
      Cadastro ativado com sucesso! Já dá pra entrar na aba <strong>"entrar"</strong> com o e-mail e a senha que você criou.
    </p>
  )
}

function ErroMsg({ texto }: { texto: string }) {
  return (
    <p className="rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) px-3 py-2 text-sm text-(--color-coral)">
      {texto}
    </p>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-(--color-ink)">{label}</span>
      {children}
    </label>
  )
}