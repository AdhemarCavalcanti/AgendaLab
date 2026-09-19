import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

type Aba = 'entrar' | 'ativar-usuario' | 'ativar-admin' | 'esqueci-senha'

function destinoAposLogin(from?: string) {
  if (!from || from === '/login') return '/'
  return from
}

export function Login() {
  const { signIn, ativarCadastroUsuario, ativarCadastroAdmin, session, role, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [aba, setAba] = useState<Aba>('entrar')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [matricula, setMatricula] = useState('')
  const [codigo, setCodigo] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (location.state?.mensagemSucesso) {
      setMensagemSucesso(location.state.mensagemSucesso)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  useEffect(() => {
    if (!authLoading && session && role) {
      navigate(destinoAposLogin((location.state as { from?: string })?.from), { replace: true })
    }
  }, [authLoading, session, role, location.state, navigate])

  function limparMensagens() {
    setError(null)
    setOk(false)
    setMensagemSucesso(null)
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    limparMensagens()
    setLoading(true)

    try {
      const emailNormalizado = email.trim().toLowerCase()
      const { error: signInError } = await signIn(emailNormalizado, password)

      if (signInError) {
        setError(signInError)
        return
      }

      navigate(destinoAposLogin((location.state as { from?: string })?.from), { replace: true })
    } catch {
      setError('Ocorreu um erro inesperado ao realizar o login.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAtivarUsuario(e: FormEvent) {
    e.preventDefault()
    limparMensagens()
    setLoading(true)

    const { error } = await ativarCadastroUsuario({
      email,
      password,
      matricula,
    })

    setLoading(false)

    if (error) return setError(error)

    setOk(true)
  }

  async function handleAtivarAdmin(e: FormEvent) {
    e.preventDefault()
    limparMensagens()
    setLoading(true)

    const { error } = await ativarCadastroAdmin({
      email,
      password,
      codigo,
    })

    setLoading(false)

    if (error) return setError(error)

    setOk(true)
  }

  async function handleEsqueciSenha(e: FormEvent) {
    e.preventDefault()
    limparMensagens()
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      }
    )

    setLoading(false)

    if (error) {
      setError(
        'Erro ao enviar e-mail de redefinição: ' + error.message
      )
    } else {
      setMensagemSucesso(
        `Enviamos um e-mail para ${email} com o link de redefinição de senha.`
      )
    }
  }

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center px-4 py-16">
      <div className="rounded-3xl border border-(--color-border) bg-white/90 p-8 shadow-[0_24px_60px_color-mix(in_srgb,#0B1220_8%,transparent)] backdrop-blur">
        <p className="kicker">
          acesso ao sistema
        </p>

        <h1 className="mb-6 font-display text-3xl font-extrabold tracking-tight">
          {aba === 'entrar' && 'Entrar no ReservaAI'}
          {aba === 'esqueci-senha' && 'Redefinir Senha'}
          {(aba === 'ativar-usuario' || aba === 'ativar-admin') &&
            'Ativar meu cadastro'}
        </h1>

        <div className="mb-6 flex gap-1 rounded-2xl bg-(--color-paper) p-1">
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
              className={`flex-1 rounded-xl px-2 py-1.5 text-xs font-semibold capitalize transition-colors ${
                aba === value ||
                (aba === 'esqueci-senha' && value === 'entrar')
                  ? 'bg-white text-(--color-cyan) shadow-sm'
                  : 'text-(--color-ink-soft) hover:text-(--color-ink)'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {aba === 'entrar' && (
          <form onSubmit={handleLogin} className="space-y-4">
            {mensagemSucesso && (
              <p className="alert-ok">
                {mensagemSucesso}
              </p>
            )}
            <Field label="E-mail">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="voce@universidade.edu"
              />
            </Field>

            <Field label="Senha">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
              />
            </Field>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setAba('esqueci-senha')
                  limparMensagens()
                }}
                className="text-xs font-medium text-(--color-cyan) hover:underline"
              >
                Esqueceu a senha?
              </button>
            </div>

            {error && <ErroMsg texto={error} />}

            <button
              disabled={loading}
              type="submit"
              className="btn-primary w-full"
            >
              {loading ? 'entrando…' : 'entrar'}
            </button>
          </form>
        )}

        {aba === 'esqueci-senha' && (
          <div>
            {mensagemSucesso ? (
              <div className="space-y-4">
                <p className="alert-ok">
                  {mensagemSucesso}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setAba('entrar')
                    limparMensagens()
                  }}
                  className="btn-primary w-full"
                >
                  Voltar para o Login
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleEsqueciSenha}
                className="space-y-4"
              >
                <p className="text-xs text-(--color-ink-soft)">
                  Informe o seu e-mail cadastrado. Enviaremos um
                  link de confirmação para você cadastrar uma nova
                  senha.
                </p>

                <Field label="E-mail cadastrado">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="voce@universidade.edu"
                  />
                </Field>

                {error && <ErroMsg texto={error} />}

                <button
                  disabled={loading}
                  type="submit"
                  className="btn-primary w-full"
                >
                  {loading
                    ? 'enviando…'
                    : 'enviar e-mail de redefinição'}
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setAba('entrar')
                      limparMensagens()
                    }}
                    className="text-xs font-medium text-(--color-ink-soft) hover:text-(--color-ink)"
                  >
                    ← Voltar para o Login
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {aba === 'ativar-usuario' && (
          <>
            {ok ? (
              <SucessoAtivacao />
            ) : (
              <form
                onSubmit={handleAtivarUsuario}
                className="space-y-4"
              >
                <p className="text-xs text-(--color-ink-soft)">
                  Seu e-mail e matrícula precisam ter sido
                  pré-cadastrados por um administrador antes de
                  ativar o acesso.
                </p>

                <Field label="E-mail pré-cadastrado">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="voce@universidade.edu"
                  />
                </Field>

                <Field label="Matrícula">
                  <input
                    required
                    value={matricula}
                    onChange={(e) => setMatricula(e.target.value)}
                    className="input"
                    placeholder="Ex: 2023001234"
                  />
                </Field>

                <Field label="Crie uma senha">
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                    placeholder="mínimo 6 caracteres"
                  />
                </Field>

                {error && <ErroMsg texto={error} />}

                <button
                  disabled={loading}
                  type="submit"
                  className="btn-primary w-full"
                >
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
              <form
                onSubmit={handleAtivarAdmin}
                className="space-y-4"
              >
                <p className="text-xs text-(--color-ink-soft)">
                  Você precisa ter recebido um código de
                  administrador de outro administrador do sistema.
                </p>

                <Field label="E-mail pré-cadastrado">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="voce@universidade.edu"
                  />
                </Field>

                <Field label="Código de administrador">
                  <input
                    required
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    className="input font-mono uppercase"
                    placeholder="Ex: A1B2C3D4"
                  />
                </Field>

                <Field label="Crie uma senha">
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                    placeholder="mínimo 6 caracteres"
                  />
                </Field>

                {error && <ErroMsg texto={error} />}

                <button
                  disabled={loading}
                  type="submit"
                  className="btn-primary w-full"
                >
                  {loading
                    ? 'ativando…'
                    : 'ativar cadastro de administrador'}
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
    <p className="alert-ok">
      Cadastro ativado com sucesso! Já dá pra entrar na aba{' '}
      <strong>"entrar"</strong> com o e-mail e a senha que você
      criou.
    </p>
  )
}

function ErroMsg({ texto }: { texto: string }) {
  return (
    <p className="alert-error">
      {texto}
    </p>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-(--color-ink)">
        {label}
      </span>
      {children}
    </label>
  )
}