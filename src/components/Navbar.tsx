import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { NotificationBell } from './NotificationBell'

const linkBase =
  'px-3 py-2 text-sm font-medium rounded-xl transition-colors whitespace-nowrap'

function navClass(isActive: boolean) {
  return `${linkBase} ${isActive ? 'bg-(--color-cyan-soft) text-(--color-cyan)' : 'text-(--color-ink-soft) hover:bg-black/5 hover:text-(--color-ink)'}`
}

export function Navbar() {
  const { role, perfil, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuAberto, setMenuAberto] = useState(false)

  async function handleSignOut() {
    await signOut()
    setMenuAberto(false)
    navigate('/login')
  }

  const links = (
    <>
      <NavLink to="/" end className={({ isActive }) => navClass(isActive)} onClick={() => setMenuAberto(false)}>
        catálogo
      </NavLink>
      {role === 'aluno' && (
        <NavLink to="/minhas-reservas" className={({ isActive }) => navClass(isActive)} onClick={() => setMenuAberto(false)}>
          minhas reservas
        </NavLink>
      )}
      {role === 'admin' && (
        <>
          <NavLink to="/admin/recursos" className={({ isActive }) => navClass(isActive)} onClick={() => setMenuAberto(false)}>
            recursos
          </NavLink>
          <NavLink to="/admin/aprovacoes" className={({ isActive }) => navClass(isActive)} onClick={() => setMenuAberto(false)}>
            aprovações
          </NavLink>
          <NavLink to="/admin/reservas" className={({ isActive }) => navClass(isActive)} onClick={() => setMenuAberto(false)}>
            todas as reservas
          </NavLink>
          <NavLink to="/admin/usuarios" className={({ isActive }) => navClass(isActive)} onClick={() => setMenuAberto(false)}>
            usuários
          </NavLink>
          <NavLink to="/admin/dashboard" className={({ isActive }) => navClass(isActive)} onClick={() => setMenuAberto(false)}>
            dashboard
          </NavLink>
          <NavLink to="/admin/acompanhamento" className={({ isActive }) => navClass(isActive)} onClick={() => setMenuAberto(false)}>
            acompanhamento
          </NavLink>
        </>
      )}
      <NavLink to="/planos" className={({ isActive }) => navClass(isActive)} onClick={() => setMenuAberto(false)}>
        planos
      </NavLink>
    </>
  )

  return (
    <header className="sticky top-0 z-30 border-b border-(--color-border)/80 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <div className="flex min-w-0 items-center gap-6">
          <NavLink to="/" className="flex items-center gap-2.5 shrink-0" onClick={() => setMenuAberto(false)}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-(--color-cyan) text-sm font-extrabold tracking-tight text-white shadow-[0_8px_18px_color-mix(in_srgb,#4A1F2D_20%,transparent)]">
              R
            </span>
            <span className="font-display text-[1.05rem] font-extrabold tracking-tight text-(--color-ink)">
              Reserva<span className="text-(--color-accent)">AI</span>
            </span>
          </NavLink>
          <nav className="hidden items-center gap-0.5 overflow-x-auto md:flex">{links}</nav>
        </div>

        <div className="flex items-center gap-2">
          {perfil ? (
            <>
              {(role === 'admin' || role === 'aluno') && <NotificationBell />}
              <NavLink
                to="/perfil"
                className="hidden text-right sm:block group hover:opacity-80 transition-opacity"
                title="Acessar Perfil e Configurações"
              >
                <p className="text-sm font-semibold leading-tight text-(--color-ink) group-hover:text-(--color-cyan)">{perfil.nome}</p>
                <p className="text-[11px] leading-tight text-(--color-ink-soft)">{role === 'admin' ? 'admin' : 'aluno/pesquisador'}</p>
              </NavLink>
              <NavLink
                to="/perfil"
                className={({ isActive }) =>
                  `rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-transparent bg-(--color-cyan-soft) text-(--color-cyan)'
                      : 'border-(--color-border) text-(--color-ink-soft) hover:border-(--color-cyan) hover:text-(--color-cyan)'
                  }`
                }
              >
                perfil
              </NavLink>
              <button
                onClick={handleSignOut}
                className="rounded-xl border border-(--color-border) px-3 py-1.5 text-sm font-medium text-(--color-ink-soft) transition-colors hover:border-(--color-coral) hover:text-(--color-coral)"
              >
                sair
              </button>
            </>
          ) : (
            <NavLink to="/login" className="shrink-0 rounded-xl bg-(--color-cyan) px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_color-mix(in_srgb,#4A1F2D_16%,transparent)] hover:bg-(--color-cyan-bright)">
              entrar / ativar cadastro
            </NavLink>
          )}

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-xl border border-(--color-border) text-(--color-ink) md:hidden"
            onClick={() => setMenuAberto((aberto) => !aberto)}
            aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          >
            <span className="text-lg leading-none">{menuAberto ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>

      {menuAberto && (
        <nav className="border-t border-(--color-border) bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">{links}</div>
        </nav>
      )}
    </header>
  )
}
