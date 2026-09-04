import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

type Aba = 'entrar' | 'ativar-usuario' | 'ativar-admin' | 'esqueci-senha'

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
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (location.state?.mensagemSucesso) {
      setMensagemSucesso(location.state.mensagemSucesso)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

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

      // 1. Autentica no Supabase Auth
      const { error: signInError } = await signIn(
        emailNormalizado,
        password
      )

      if (signInError) {
        setError(signInError)
        setLoading(false)
        return
      }

      // 2. Obtém a sessão atual
      const {
        data: { session },
        error: userError,
      } = await supabase.auth.getSession()

      const user = session?.user

      if (userError || !user) {
        setError('Não foi possível identificar o usuário autenticado.')
        setLoading(false)
        return
      }

      // 3. Verifica primeiro se o usuário é administrador
      const {
        data: administrador,
        error: administradorError,
      } = await supabase
        .from('administradores')
        .select('id_adm, uuid, nome, email, codigo')
        .eq('uuid', user.id)
        .maybeSingle()

      if (administradorError) {
        setError(
          'Erro ao verificar o perfil de administrador: ' +
            administradorError.message
        )
        setLoading(false)
        return
      }

      // 4. Login como administrador
      if (administrador) {
        const dest = (location.state as { from?: string })?.from ?? '/'
        navigate(dest, {
          replace: true,
          state: {
            perfil: 'admin',
            ehAdministrador: true,
            idAdm: administrador.id_adm,
            nome: administrador.nome,
            email: administrador.email,
          },
        })
        return
      }

      // 5. Se não é administrador, verifica se é usuário comum
      const {
        data: usuario,
        error: usuarioError,
      } = await supabase
        .from('usuarios')
        .select('id_usuario, uuid, nome, email, matricula')
        .eq('uuid', user.id)
        .maybeSingle()

      if (usuarioError) {
        setError(
          'Erro ao verificar o perfil de usuário: ' + usuarioError.message
        )
        setLoading(false)
        return
      }

      // 6. Login como usuário comum
      if (usuario) {
        const dest = (location.state as { from?: string })?.from ?? '/'
        navigate(dest, {
          replace: true,
          state: {
            perfil: 'usuario',
            ehAdministrador: false,
            idUsuario: usuario.id_usuario,
            nome: usuario.nome,
            email: usuario.email,
          },
        })
        return
      }

      // 7. Se autenticou no Auth mas a coluna 'uuid' ainda está NULL nas duas tabelas:
      setError(
        'Conta autenticada, porém sem registro de perfil (administrador ou usuário) ativo no sistema.'
      )
    } catch (err) {
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
      <div className="reg-mark rounded-xl border border-(--color-border) bg-(--color-surface) p-8 shadow-sm">
        <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">
          acesso ao sistema
        </p>

        <h1 className="mb-6 font-display text-2xl font-bold">
          {aba === 'entrar' && 'Entrar no AgendaLab'}
          {aba === 'esqueci-senha' && 'Redefinir Senha'}
          {(aba === 'ativar-usuario' || aba === 'ativar-admin') &&
            'Ativar meu cadastro'}
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
                aba === value ||
                (aba === 'esqueci-senha' && value === 'entrar')
                  ? 'bg-(--color-surface) text-(--color-cyan) shadow-sm'
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
              <p className="rounded-md border border-(--color-green)/30 bg-(--color-green-soft) px-3 py-3 text-sm text-(--color-green)">
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
                <p className="rounded-md border border-(--color-green)/30 bg-(--color-green-soft) px-3 py-3 text-sm text-(--color-green)">
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
    <p className="rounded-md border border-(--color-green)/30 bg-(--color-green-soft) px-3 py-3 text-sm text-(--color-green)">
      Cadastro ativado com sucesso! Já dá pra entrar na aba{' '}
      <strong>"entrar"</strong> com o e-mail e a senha que você
      criou.
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