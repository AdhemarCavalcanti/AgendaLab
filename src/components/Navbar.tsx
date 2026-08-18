import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { NotificationBell } from './NotificationBell'

const linkBase =
  'px-3 py-2 text-sm font-medium rounded-md transition-colors font-mono tracking-tight whitespace-nowrap'

export function Navbar() {
  const { role, perfil, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-(--color-border) bg-(--color-surface)/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-8">
          <NavLink to="/" className="flex items-center gap-2 shrink-0">
            <span className="grid h-8 w-8 place-items-center rounded-md border-2 border-(--color-cyan) text-(--color-cyan) font-display font-bold">A</span>
            <span className="font-display text-lg font-bold tracking-tight text-(--color-ink)">AgendaLab</span>
          </NavLink>
          <nav className="hidden items-center gap-1 overflow-x-auto md:flex">
            <NavLink to="/" end className={({ isActive }) => `${linkBase} ${isActive ? 'bg-(--color-cyan-soft) text-(--color-cyan)' : 'text-(--color-ink-soft) hover:bg-black/5'}`}>
              catálogo
            </NavLink>
            {role === 'aluno' && (
              <NavLink to="/minhas-reservas" className={({ isActive }) => `${linkBase} ${isActive ? 'bg-(--color-cyan-soft) text-(--color-cyan)' : 'text-(--color-ink-soft) hover:bg-black/5'}`}>
                minhas reservas
              </NavLink>
            )}
            {role === 'admin' && (
              <>
                <NavLink to="/admin/recursos" className={({ isActive }) => `${linkBase} ${isActive ? 'bg-(--color-cyan-soft) text-(--color-cyan)' : 'text-(--color-ink-soft) hover:bg-black/5'}`}>
                  recursos
                </NavLink>
                <NavLink to="/admin/aprovacoes" className={({ isActive }) => `${linkBase} ${isActive ? 'bg-(--color-cyan-soft) text-(--color-cyan)' : 'text-(--color-ink-soft) hover:bg-black/5'}`}>
                  aprovações
                </NavLink>
                <NavLink to="/admin/reservas" className={({ isActive }) => `${linkBase} ${isActive ? 'bg-(--color-cyan-soft) text-(--color-cyan)' : 'text-(--color-ink-soft) hover:bg-black/5'}`}>
                  todas as reservas
                </NavLink>
                <NavLink to="/admin/usuarios" className={({ isActive }) => `${linkBase} ${isActive ? 'bg-(--color-cyan-soft) text-(--color-cyan)' : 'text-(--color-ink-soft) hover:bg-black/5'}`}>
                  usuários
                </NavLink>
                <NavLink to="/admin/dashboard" className={({ isActive }) => `${linkBase} ${isActive ? 'bg-(--color-cyan-soft) text-(--color-cyan)' : 'text-(--color-ink-soft) hover:bg-black/5'}`}>
                  dashboard
                </NavLink>
              </>
            )}
          </nav>
        </div>

        {perfil ? (
          <div className="flex items-center gap-3">
            {role === 'admin' && <NotificationBell />}
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-(--color-ink)">{perfil.nome}</p>
              <p className="text-xs font-mono leading-tight text-(--color-ink-soft)">{role === 'admin' ? 'admin' : 'aluno/pesquisador'}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-md border border-(--color-border) px-3 py-1.5 text-sm font-medium text-(--color-ink-soft) transition-colors hover:border-(--color-coral) hover:text-(--color-coral)"
            >
              sair
            </button>
          </div>
        ) : (
          <NavLink to="/login" className="shrink-0 rounded-md bg-(--color-cyan) px-4 py-1.5 text-sm font-medium text-white hover:bg-(--color-cyan-bright)">
            entrar / ativar cadastro
          </NavLink>
        )}
      </div>
    </header>
  )
}
