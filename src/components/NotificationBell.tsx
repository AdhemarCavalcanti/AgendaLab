import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function NotificationBell() {
  const [pendentes, setPendentes] = useState(0)
  const [piscar, setPiscar] = useState(false)
  const navigate = useNavigate()

  async function contarPendentes() {
    const [rs, re] = await Promise.all([
      supabase.from('reservas_salas').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
      supabase.from('reservas_equipamentos').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
    ])
    setPendentes((rs.count ?? 0) + (re.count ?? 0))
  }

  useEffect(() => {
    contarPendentes()

    const channel = supabase
      .channel('navbar-notificacoes-reservas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas_salas' }, () => {
        contarPendentes()
        setPiscar(true)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas_equipamentos' }, () => {
        contarPendentes()
        setPiscar(true)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <button
      onClick={() => {
        setPiscar(false)
        navigate('/admin/aprovacoes')
      }}
      className="relative rounded-md border border-(--color-border) p-2 text-(--color-ink-soft) transition-colors hover:bg-black/5"
      title="Solicitações pendentes"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {pendentes > 0 && (
        <span
          className={`absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-(--color-coral) px-1 font-mono text-[10px] font-bold text-white ${
            piscar ? 'animate-pulse' : ''
          }`}
        >
          {pendentes}
        </span>
      )}
    </button>
  )
}
