import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Notificacao } from '../lib/types'

export function NotificationBell() {
  const { role, meuIdUsuario } = useAuth()
  const navigate = useNavigate()

  // Estados do Admin
  const [pendentes, setPendentes] = useState(0)

  // Estados do Aluno
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [piscar, setPiscar] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Busca solicitações pendentes para Admin
  const contarPendentesAdmin = useCallback(async () => {
    const [rs, re] = await Promise.all([
      supabase.from('reservas_salas').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
      supabase.from('reservas_equipamentos').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
    ])
    setPendentes((rs.count ?? 0) + (re.count ?? 0))
  }, [])

  // Busca avisos para Aluno
  const carregarNotificacoesAluno = useCallback(async () => {
    if (!meuIdUsuario) return
    const { data } = await supabase
      .from('notificacoes')
      .select('*')
      .eq('id_usuario', meuIdUsuario)
      .order('criado_em', { ascending: false })
    
    if (data) {
      setNotificacoes(data)
    }
  }, [meuIdUsuario])

  // Contagem de notificações não lidas
  const naoLidasCount = notificacoes.filter(n => !n.lida).length

  // Fecha o dropdown se clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Inscreve nos canais de tempo real do Supabase
  useEffect(() => {
    if (role === 'admin') {
      contarPendentesAdmin()

      const channel = supabase
        .channel('navbar-notificacoes-admin')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas_salas' }, () => {
          contarPendentesAdmin()
          setPiscar(true)
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas_equipamentos' }, () => {
          contarPendentesAdmin()
          setPiscar(true)
        })
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    } else if (role === 'aluno' && meuIdUsuario) {
      carregarNotificacoesAluno()

      const channel = supabase
        .channel('navbar-notificacoes-aluno')
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notificacoes',
          filter: `id_usuario=eq.${meuIdUsuario}`
        }, (payload) => {
          setNotificacoes(prev => [payload.new as Notificacao, ...prev])
          setPiscar(true)
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'notificacoes',
          filter: `id_usuario=eq.${meuIdUsuario}`
        }, () => {
          carregarNotificacoesAluno()
        })
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [role, meuIdUsuario, contarPendentesAdmin, carregarNotificacoesAluno])

  // Marcar como lida
  async function marcarComoLida(id: string) {
    const { error } = await supabase
      .from('notificacoes')
      .update({ lida: true })
      .eq('id', id)

    if (!error) {
      setNotificacoes(prev =>
        prev.map(n => (n.id === id ? { ...n, lida: true } : n))
      )
    }
  }

  // Marcar todas como lidas
  async function marcarTodasComoLidas() {
    if (!meuIdUsuario) return
    const { error } = await supabase
      .from('notificacoes')
      .update({ lida: true })
      .eq('id_usuario', meuIdUsuario)
      .eq('lida', false)

    if (!error) {
      setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })))
    }
  }

  const formatarData = (dataStr: string) => {
    try {
      const data = new Date(dataStr)
      return data.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }

  if (!role) return null

  // Layout para Admin (redireciona para aprovações)
  if (role === 'admin') {
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

  // Layout para Aluno (abre painel de avisos)
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen)
          setPiscar(false)
        }}
        className="relative rounded-md border border-(--color-border) p-2 text-(--color-ink-soft) transition-colors hover:bg-black/5"
        title="Seus avisos"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {naoLidasCount > 0 && (
          <span
            className={`absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-(--color-coral) px-1 font-mono text-[10px] font-bold text-white ${
              piscar ? 'animate-pulse' : ''
            }`}
          >
            {naoLidasCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-h-[420px] z-50 flex flex-col rounded-lg border border-(--color-border) bg-(--color-surface) shadow-lg font-sans">
          {/* Cabeçalho do Dropdown */}
          <div className="flex items-center justify-between border-b border-(--color-border) p-3">
            <h4 className="font-semibold text-sm text-(--color-ink) font-display">Avisos</h4>
            {naoLidasCount > 0 && (
              <button
                onClick={marcarTodasComoLidas}
                className="text-xs font-medium text-(--color-cyan) hover:text-(--color-cyan-bright) hover:underline"
              >
                Limpar tudo
              </button>
            )}
          </div>

          {/* Lista de Notificações */}
          <div className="flex-1 overflow-y-auto scrollbar-thin max-h-80">
            {notificacoes.length === 0 ? (
              <div className="p-4 text-center text-xs text-(--color-ink-soft) font-mono">
                Nenhum aviso no momento.
              </div>
            ) : (
              notificacoes.map((notif) => (
                <div
                  key={notif.id}
                  className={`flex flex-col gap-1 border-b border-black/5 p-3 text-xs last:border-b-0 transition-colors ${
                    notif.lida ? 'bg-transparent opacity-75' : 'bg-(--color-cyan-soft)/30 font-medium'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`font-semibold text-(--color-ink) ${!notif.lida ? 'text-(--color-cyan)' : ''}`}>
                      {notif.titulo}
                    </span>
                    <span className="text-[10px] text-(--color-ink-soft) font-mono whitespace-nowrap">
                      {formatarData(notif.criado_em)}
                    </span>
                  </div>
                  <p className="text-(--color-ink-soft) leading-relaxed break-words">{notif.mensagem}</p>
                  
                  {!notif.lida && (
                    <div className="mt-1.5 flex justify-end">
                      <button
                        onClick={() => marcarComoLida(notif.id)}
                        className="text-[10px] font-semibold text-(--color-cyan) hover:text-(--color-cyan-bright) uppercase tracking-wider"
                      >
                        Marcar como lida
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
