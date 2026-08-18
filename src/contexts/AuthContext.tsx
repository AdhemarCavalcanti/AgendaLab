import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Administrador, Role, Usuario } from '../lib/types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  role: Role
  perfil: Usuario | Administrador | null
  /** id_usuario (bigint) do usuário logado, quando aluno — usado nas FKs de reserva */
  meuIdUsuario: number | null
  /** id_adm (bigint) do admin logado, quando admin */
  meuIdAdm: number | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  ativarCadastroUsuario: (params: { nome: string; email: string; password: string; matricula: string }) => Promise<{ error: string | null }>
  ativarCadastroAdmin: (params: { nome: string; email: string; password: string; codigo: string }) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [perfil, setPerfil] = useState<Usuario | Administrador | null>(null)
  const [meuIdUsuario, setMeuIdUsuario] = useState<number | null>(null)
  const [meuIdAdm, setMeuIdAdm] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  async function resolvePerfil(uid: string) {
    // is_admin()/get_my_user_id() são SECURITY DEFINER: funcionam independente de RLS
    const { data: souAdmin } = await supabase.rpc('is_admin')

    if (souAdmin) {
      const { data: adm } = await supabase.from('administradores').select('*').eq('uuid', uid).maybeSingle()
      if (adm) {
        setRole('admin')
        setPerfil(adm as Administrador)
        setMeuIdAdm((adm as Administrador).id_adm)
        setMeuIdUsuario(null)
        return
      }
    }

    const { data: myId } = await supabase.rpc('get_my_user_id')
    if (myId) {
      const { data: usr } = await supabase.from('usuarios').select('*').eq('uuid', uid).maybeSingle()
      if (usr) {
        setRole('aluno')
        setPerfil(usr as Usuario)
        setMeuIdUsuario(myId as number)
        setMeuIdAdm(null)
        return
      }
    }

    setRole(null)
    setPerfil(null)
    setMeuIdUsuario(null)
    setMeuIdAdm(null)
  }

  async function refreshPerfil() {
    if (session?.user) await resolvePerfil(session.user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) {
        resolvePerfil(data.session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession?.user) {
        resolvePerfil(newSession.user.id)
      } else {
        setRole(null)
        setPerfil(null)
        setMeuIdUsuario(null)
        setMeuIdAdm(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: traduzErro(error.message) }
    return { error: null }
  }

  async function ativarCadastroUsuario(params: { nome: string; email: string; password: string; matricula: string }) {
    const { data: autorizado, error: erroValidacao } = await supabase.rpc('validar_pre_cadastro_usuario', {
      p_email: params.email,
      p_matricula: params.matricula,
    })
    if (erroValidacao) return { error: erroValidacao.message }
    if (!autorizado) {
      return { error: 'E-mail ou matrícula não autorizados. Peça a um administrador para realizar o seu pré-cadastro.' }
    }

    const { error } = await supabase.auth.signUp({
      email: params.email,
      password: params.password,
      options: { data: { nome: params.nome, matricula: params.matricula } },
    })
    if (error) return { error: traduzErro(error.message) }
    return { error: null }
  }

  async function ativarCadastroAdmin(params: { nome: string; email: string; password: string; codigo: string }) {
    const { data: autorizado, error: erroValidacao } = await supabase.rpc('validar_pre_cadastro_admin', {
      p_email: params.email,
      p_codigo: params.codigo,
    })
    if (erroValidacao) return { error: erroValidacao.message }
    if (!autorizado) {
      return { error: 'E-mail ou código de administrador não autorizados. Peça a outro administrador para realizar o seu pré-cadastro.' }
    }

    const { error } = await supabase.auth.signUp({
      email: params.email,
      password: params.password,
      options: { data: { nome: params.nome, codigo: params.codigo } },
    })
    if (error) return { error: traduzErro(error.message) }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setRole(null)
    setPerfil(null)
    setMeuIdUsuario(null)
    setMeuIdAdm(null)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        role,
        perfil,
        meuIdUsuario,
        meuIdAdm,
        loading,
        signIn,
        ativarCadastroUsuario,
        ativarCadastroAdmin,
        signOut,
        refreshPerfil,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}

function traduzErro(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha inválidos.'
  if (msg.includes('User already registered')) return 'Este e-mail já possui cadastro. Tente entrar ou recuperar a senha.'
  if (msg.includes('Password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.'
  if (msg.toLowerCase().includes('acesso negado')) return msg.replace(/^.*Acesso negado:\s*/i, 'Acesso negado: ')
  return msg
}
