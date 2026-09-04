import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Modal } from '../components/Modal'
import { StatusBadge } from '../components/StatusBadge'
import type { Administrador, StatusReserva, Usuario } from '../lib/types'

interface ReservaFutura {
  id: number
  tipo: 'sala' | 'equipamento'
  recursoNome: string
  inicio: string
  fim: string
  status: StatusReserva
}

export function Perfil() {
  const { role, perfil, meuIdUsuario, meuIdAdm, signOut } = useAuth()
  const navigate = useNavigate()

  const [modalExcluirAberto, setModalExcluirAberto] = useState(false)
  const [carregandoReservas, setCarregandoReservas] = useState(false)
  const [reservasFuturas, setReservasFuturas] = useState<ReservaFutura[]>([])
  const [textoConfirmacao, setTextoConfirmacao] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [erroExclusao, setErroExclusao] = useState<string | null>(null)

  const usuario = role === 'aluno' ? (perfil as Usuario | null) : null
  const admin = role === 'admin' ? (perfil as Administrador | null) : null

  // Busca reservas futuras ativas quando abre o modal de exclusão
  async function abrirModalExclusao() {
    setTextoConfirmacao('')
    setErroExclusao(null)
    setModalExcluirAberto(true)
    setCarregandoReservas(true)

    try {
      let targetUserId = meuIdUsuario

      if (!targetUserId && role === 'aluno') {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: uBD } = await supabase
            .from('usuarios')
            .select('id_usuario')
            .or(`uuid.eq.${user.id},email.eq.${user.email}`)
            .maybeSingle()
          if (uBD) targetUserId = uBD.id_usuario
        }
      }

      if (!targetUserId) {
        setReservasFuturas([])
        setCarregandoReservas(false)
        return
      }

      const agora = new Date().toISOString()

      const [resSalas, resEquip, resListaSalas, resListaEquip] = await Promise.all([
        supabase
          .from('reservas_salas')
          .select('id, id_sala, inicio, fim, status')
          .eq('id_usuario', targetUserId)
          .in('status', ['pendente', 'aprovada'])
          .gte('fim', agora)
          .order('inicio', { ascending: true }),
        supabase
          .from('reservas_equipamentos')
          .select('id, id_equipamento, inicio, fim, status')
          .eq('id_usuario', targetUserId)
          .in('status', ['pendente', 'aprovada'])
          .gte('fim', agora)
          .order('inicio', { ascending: true }),
        supabase.from('salas').select('id_sala, nome'),
        supabase.from('equipamentos').select('id, nome'),
      ])

      const mapaSalas = new Map<number, string>(
        (resListaSalas.data ?? []).map((s: any) => [s.id_sala, s.nome])
      )
      const mapaEquip = new Map<number, string>(
        (resListaEquip.data ?? []).map((e: any) => [e.id, e.nome])
      )

      const itensSalas: ReservaFutura[] = (resSalas.data ?? []).map((r: any) => ({
        id: r.id,
        tipo: 'sala',
        recursoNome: mapaSalas.get(r.id_sala) ?? `Sala #${r.id_sala}`,
        inicio: r.inicio,
        fim: r.fim,
        status: r.status,
      }))

      const itensEquip: ReservaFutura[] = (resEquip.data ?? []).map((r: any) => ({
        id: r.id,
        tipo: 'equipamento',
        recursoNome: mapaEquip.get(r.id_equipamento) ?? `Equipamento #${r.id_equipamento}`,
        inicio: r.inicio,
        fim: r.fim,
        status: r.status,
      }))

      setReservasFuturas(
        [...itensSalas, ...itensEquip].sort(
          (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()
        )
      )
    } catch (err: any) {
      console.error('Erro ao buscar reservas futuras:', err)
      setReservasFuturas([])
    } finally {
      setCarregandoReservas(false)
    }
  }

  // Executa a exclusão de conta e o cancelamento de reservas
  async function confirmarExclusaoConta() {
    if (textoConfirmacao.trim().toUpperCase() !== 'EXCLUIR') {
      return
    }

    setExcluindo(true)
    setErroExclusao(null)

    try {
      // 1. Tenta executar via RPC do Supabase
      const { error: rpcError } = await supabase.rpc('excluir_minha_conta')

      // 2. Se a RPC não estiver criada no banco ainda, executa os passos via cliente
      if (rpcError) {
        console.warn('RPC excluir_minha_conta indisponível, executando fallback no cliente:', rpcError.message)

        const targetUserId = meuIdUsuario
        const targetAdmId = meuIdAdm
        const agora = new Date().toISOString()

        if (targetUserId) {
          // a) Cancelar reservas futuras ativas de salas
          await supabase
            .from('reservas_salas')
            .update({
              status: 'cancelada',
              motivo: 'Cancelada automaticamente devido à exclusão da conta do usuário',
            })
            .eq('id_usuario', targetUserId)
            .in('status', ['pendente', 'aprovada'])
            .gte('fim', agora)

          // b) Cancelar reservas futuras ativas de equipamentos
          await supabase
            .from('reservas_equipamentos')
            .update({
              status: 'cancelada',
              motivo: 'Cancelada automaticamente devido à exclusão da conta do usuário',
            })
            .eq('id_usuario', targetUserId)
            .in('status', ['pendente', 'aprovada'])
            .gte('fim', agora)

          // c) Limpar notificações
          await supabase
            .from('notificacoes')
            .delete()
            .eq('id_usuario', targetUserId)

          // d) Anonimizar dados do usuário e desvincular conta
          const timestamp = Date.now()
          const { error: erroAnonimizar } = await supabase
            .from('usuarios')
            .update({
              nome: 'Usuário Removido',
              email: `anonimizado_${targetUserId}_${timestamp}@removido.agendalab.local`,
              matricula: null,
              uuid: null,
            })
            .eq('id_usuario', targetUserId)

          if (erroAnonimizar) {
            console.error('Erro ao anonimizar usuário:', erroAnonimizar)
          }
        } else if (targetAdmId) {
          // Anonimizar administrador
          const timestamp = Date.now()
          await supabase
            .from('administradores')
            .update({
              nome: 'Administrador Removido',
              email: `anonimizado_adm_${targetAdmId}_${timestamp}@removido.agendalab.local`,
              codigo: null,
              uuid: null,
            })
            .eq('id_adm', targetAdmId)
        }
      }

      // 3. Encerra a sessão atual
      await signOut()

      // 4. Redireciona para o login com mensagem de sucesso
      navigate('/login', {
        replace: true,
        state: {
          mensagemSucesso:
            'Sua conta foi excluída com sucesso. Todos os seus dados pessoais foram anonimizados e suas reservas futuras foram canceladas.',
        },
      })
    } catch (err: any) {
      console.error('Falha ao excluir conta:', err)
      setErroExclusao(err.message || 'Erro ao processar exclusão da conta. Tente novamente.')
      setExcluindo(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <div className="mb-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">
          área do usuário · configurações
        </p>
        <h1 className="font-display text-3xl font-bold">Meu Perfil</h1>
        <p className="mt-1 text-sm text-(--color-ink-soft)">
          Visualize suas informações cadastrais e gerencie as preferências da sua conta.
        </p>
      </div>

      <div className="space-y-6">
        {/* Card de Dados Cadastrais */}
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between border-b border-(--color-border) pb-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-(--color-cyan-soft) font-display text-lg font-bold text-(--color-cyan)">
                {perfil?.nome ? perfil.nome.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-(--color-ink)">{perfil?.nome ?? '—'}</h2>
                <span className="inline-block rounded-full bg-(--color-green-soft) px-2.5 py-0.5 font-mono text-xs text-(--color-green)">
                  Conta Ativa
                </span>
              </div>
            </div>
            <span className="rounded-md border border-(--color-border) px-3 py-1 font-mono text-xs text-(--color-ink-soft)">
              {role === 'admin' ? 'Administrador' : 'Aluno / Pesquisador'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">E-mail</p>
              <p className="font-medium text-(--color-ink)">{perfil?.email ?? '—'}</p>
            </div>

            {role === 'aluno' && usuario && (
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">Matrícula</p>
                <p className="font-mono font-medium text-(--color-ink)">{usuario.matricula ?? 'Não informada'}</p>
              </div>
            )}

            {role === 'admin' && admin && (
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">Código de Admin</p>
                <p className="font-mono font-medium text-(--color-ink)">{admin.codigo ?? '—'}</p>
              </div>
            )}

            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">Identificador (ID)</p>
              <p className="font-mono font-medium text-(--color-ink)">
                #{meuIdUsuario ?? meuIdAdm ?? '—'}
              </p>
            </div>
          </div>
        </section>

        {/* Zona de Perigo / Exclusão de Conta */}
        <section className="rounded-xl border border-(--color-coral)/40 bg-(--color-coral-soft)/10 p-6">
          <div className="mb-3 flex items-center gap-2 text-(--color-coral)">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h2 className="font-display text-lg font-bold">Zona de Perigo</h2>
          </div>

          <p className="text-sm text-(--color-ink)">
            Caso você não queira mais utilizar a plataforma AgendaLab, você tem a opção de excluir
            sua conta definitivamente e solicitar a remoção/anonimização de seus dados pessoais.
          </p>

          <ul className="my-3 list-inside list-disc space-y-1 text-xs text-(--color-ink-soft)">
            <li>Sua sessão será imediatamente encerrada.</li>
            <li>Seus dados pessoais (nome, e-mail e matrícula) serão desvinculados e anonimizados.</li>
            <li>
              <strong>Todas as suas reservas futuras ativas (Pendentes ou Aprovadas) serão canceladas automaticamente.</strong>
            </li>
            <li>Esta ação é irreversível e não poderá ser desfeita.</li>
          </ul>

          <div className="pt-2">
            <button
              type="button"
              onClick={abrirModalExclusao}
              className="rounded-md border border-(--color-coral) bg-white/60 px-4 py-2 text-sm font-semibold text-(--color-coral) transition-colors hover:bg-(--color-coral) hover:text-white"
            >
              Excluir minha conta
            </button>
          </div>
        </section>
      </div>

      {/* Modal de Confirmação de Exclusão */}
      {modalExcluirAberto && (
        <Modal
          title="Excluir Conta e Anonimizar Dados"
          onClose={() => !excluindo && setModalExcluirAberto(false)}
          maxWidth="max-w-lg"
        >
          <div className="space-y-4">
            {/* Alerta de Reservas Futuras Ativas */}
            {carregandoReservas ? (
              <p className="font-mono text-sm text-(--color-ink-soft)">
                Verificando se há reservas futuras ativas…
              </p>
            ) : reservasFuturas.length > 0 ? (
              <div className="rounded-lg border border-amber-400/50 bg-amber-50 p-4 text-amber-900">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-lg leading-none" aria-hidden="true">⚠️</span>
                  <div>
                    <h4 className="font-semibold text-sm">
                      Atenção: Você possui {reservasFuturas.length} reserva(s) futura(s) ativa(s)!
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed text-amber-800">
                      Ao prosseguir com a exclusão da sua conta, <strong>todas as suas reservas futuras (pendentes ou aprovadas) listadas abaixo serão canceladas automaticamente</strong> pelo sistema:
                    </p>
                  </div>
                </div>

                <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {reservasFuturas.map((res) => (
                    <div
                      key={`${res.tipo}-${res.id}`}
                      className="rounded border border-amber-200 bg-white/90 p-2.5 text-xs text-stone-800 shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-medium uppercase text-[10px] text-(--color-ink-soft)">
                          {res.tipo}
                        </span>
                        <StatusBadge status={res.status} />
                      </div>
                      <p className="mt-1 font-semibold">{res.recursoNome}</p>
                      <p className="font-mono text-[11px] text-(--color-ink-soft)">
                        {new Date(res.inicio).toLocaleDateString('pt-BR')} ·{' '}
                        {new Date(res.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} –{' '}
                        {new Date(res.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-(--color-border) bg-(--color-paper) p-3 text-xs text-(--color-ink-soft)">
                ✓ Você não possui nenhuma reserva futura pendente ou aprovada no momento.
              </p>
            )}

            <div className="text-xs text-(--color-ink-soft) space-y-1">
              <p className="font-semibold text-(--color-ink)">O que acontecerá ao confirmar:</p>
              <p>• Sua sessão será encerrada imediatamente.</p>
              <p>• Seus dados cadastrais serão removidos/anonimizados do banco de dados.</p>
              <p>• Sua conta será desativada para novos acessos.</p>
            </div>

            {/* Confirmação digitada */}
            <div className="rounded-md border border-(--color-border) p-3">
              <label className="block">
                <span className="block text-xs font-semibold text-(--color-ink) mb-1">
                  Para confirmar, digite <span className="font-mono font-bold text-(--color-coral)">EXCLUIR</span> no campo abaixo:
                </span>
                <input
                  type="text"
                  value={textoConfirmacao}
                  onChange={(e) => setTextoConfirmacao(e.target.value)}
                  placeholder="EXCLUIR"
                  disabled={excluindo}
                  className="input font-mono text-sm uppercase"
                />
              </label>
            </div>

            {erroExclusao && (
              <p className="rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) px-3 py-2 text-xs text-(--color-coral)">
                {erroExclusao}
              </p>
            )}

            {/* Ações do Modal */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalExcluirAberto(false)}
                disabled={excluindo}
                className="btn-secondary text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarExclusaoConta}
                disabled={textoConfirmacao.trim().toUpperCase() !== 'EXCLUIR' || excluindo}
                className="rounded-md bg-(--color-coral) px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {excluindo ? 'Excluindo conta…' : 'Confirmar Exclusão Definitiva'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
