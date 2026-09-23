import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { StatusBadge } from '../components/StatusBadge'
import { obterImagemRecurso } from '../lib/recursoImagens'
import type { Equipamento, Sala, TipoRecurso } from '../lib/types'

interface Recurso {
  id: number
  tipo: TipoRecurso
  nome: string
  detalhe: string
  status: string
}

export function Catalogo() {
  const [salas, setSalas] = useState<Sala[]>([])
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [tipo, setTipo] = useState<'todos' | TipoRecurso>('todos')
  const [statusFiltro, setStatusFiltro] = useState<string>('todos')
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: s, error: eS }, { data: e, error: eE }] = await Promise.all([
        supabase.from('salas').select('*').order('nome', { ascending: true }),
        supabase.from('equipamentos').select('*').order('nome', { ascending: true }),
      ])
      if (eS || eE) setErro((eS ?? eE)?.message ?? 'Erro ao carregar recursos.')
      setSalas((s as Sala[]) ?? [])
      setEquipamentos((e as Equipamento[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const limparFiltros = () => {
    setBusca('')
    setTipo('todos')
    setStatusFiltro('todos')
  }

  const temFiltroAtivo = busca !== '' || tipo !== 'todos' || statusFiltro !== 'todos'

  const recursos: Recurso[] = useMemo(() => {
    const rSalas: Recurso[] = salas.map((s) => {
      let statusFormatado: string = s.status
      if (s.status === 'livre') statusFormatado = 'disponível'
      else if (s.status === 'manutencao') statusFormatado = 'manutenção'

      return {
        id: s.id_sala,
        tipo: 'sala',
        nome: s.nome,
        detalhe: `Capacidade: ${s.lotacao} pessoas`,
        status: statusFormatado,
      }
    })

    const rEquip: Recurso[] = equipamentos.map((e) => {
      // Cast seguro para e as any evitando que a falta do tipo na interface trave o build
      const equipAny = e as any
      const qtdTotal = Number(equipAny.quantidade || 0)
      const qtdManutencao = Number(equipAny.quantidade_manutencao || 0)
      const saldoDisponivel = Math.max(0, qtdTotal - qtdManutencao)

      return {
        id: e.id,
        tipo: 'equipamento',
        nome: e.nome,
        detalhe: `Quantidade disponível: ${saldoDisponivel}`,
        status: saldoDisponivel > 0 ? 'disponível' : 'manutenção',
      }
    })

    return [...rSalas, ...rEquip]
      .filter((r) => tipo === 'todos' || r.tipo === tipo)
      .filter((r) => statusFiltro === 'todos' || r.status.toLowerCase() === statusFiltro.toLowerCase())
      .filter((r) => r.nome.toLowerCase().includes(busca.toLowerCase()))
  }, [salas, equipamentos, tipo, statusFiltro, busca])

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <div className="mb-8">
        <p className="kicker">catálogo de recursos</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Salas e equipamentos disponíveis</h1>
        <p className="mt-2 max-w-2xl text-(--color-ink-soft)">Filtre por tipo, status e busque por nome em tempo real.</p>
      </div>

      {/* Painel de Filtros */}
      <div className="card mb-8 p-4 md:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome do recurso..."
                className="input w-full pr-8"
              />
              {busca && (
                <button
                  onClick={() => setBusca('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-(--color-ink-soft) hover:text-(--color-ink)"
                  title="Limpar busca"
                >
                  ✕
                </button>
              )}
            </div>

            {temFiltroAtivo && (
              <button
                onClick={limparFiltros}
                className="self-start text-xs font-semibold text-(--color-coral) underline underline-offset-4 transition-opacity hover:opacity-80 sm:self-auto"
              >
                Limpar todos os filtros
              </button>
            )}
          </div>

          <hr className="border-(--color-border)/50" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-(--color-ink-soft)">
                Tipo de Recurso
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: 'todos', label: 'Todos' },
                  { value: 'sala', label: 'Salas' },
                  { value: 'equipamento', label: 'Equipamentos' },
                ].map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTipo(t.value as 'todos' | TipoRecurso)}
                    className={`chip ${tipo === t.value ? 'chip-on' : ''}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-(--color-ink-soft)">
                Status de Disponibilidade
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: 'todos', label: 'Todos' },
                  { value: 'disponível', label: 'Disponível' },
                  { value: 'ocupado', label: 'Ocupado' },
                  { value: 'manutenção', label: 'Manutenção' },
                ].map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setStatusFiltro(s.value)}
                    className={`chip ${statusFiltro === s.value ? 'chip-on' : ''}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {erro && (
        <p className="alert-error mb-6">
          {erro}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="card overflow-hidden animate-pulse">
              <div className="h-44 bg-black/5 dark:bg-white/5" />
              <div className="p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="h-5 w-36 bg-black/10 dark:bg-white/10 rounded" />
                  <div className="h-5 w-16 bg-black/10 dark:bg-white/10 rounded-full" />
                </div>
                <div className="h-3 w-20 bg-black/5 dark:bg-white/5 rounded" />
                <div className="h-4 w-48 bg-black/5 dark:bg-white/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : recursos.length === 0 ? (
        <div className="empty flex flex-col items-center justify-center py-12 text-center">
          <span className="mb-2 text-3xl">🔍</span>
          <p className="font-semibold text-base">Nenhum recurso encontrado</p>
          <p className="text-sm text-(--color-ink-soft) mt-1 max-w-sm">
            Não encontramos salas ou equipamentos com os filtros aplicados. Tente ajustar o termo de busca ou filtros.
          </p>
          {temFiltroAtivo && (
            <button
              onClick={limparFiltros}
              className="mt-4 text-sm font-medium text-(--color-cyan) hover:underline"
            >
              Resetar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recursos.map((r) => {
            const imgInfo = obterImagemRecurso(r.tipo, r.nome)
            return (
              <Link
                key={`${r.tipo}-${r.id}`}
                to={`/recurso/${r.tipo}/${r.id}`}
                className="group card overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_color-mix(in_srgb,#0B1220_12%,transparent)]"
              >
                {/* Imagem / Banner do Recurso */}
                <div className={`relative h-44 w-full overflow-hidden bg-gradient-to-br ${imgInfo.gradienteFallback}`}>
                  <img
                    src={imgInfo.url}
                    alt={imgInfo.alt}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    onError={(e) => {
                      ;(e.target as HTMLElement).style.display = 'none'
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

                  {/* Badge de tipo de recurso no canto superior esquerdo */}
                  <span className="absolute top-3 left-3 rounded-full bg-black/40 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm border border-white/20">
                    {r.tipo === 'sala' ? '🏛️ Sala' : '⚙️ Equipamento'}
                  </span>

                  {/* Categoria temática no canto inferior */}
                  <span className="absolute bottom-2.5 left-3 text-[11px] font-medium text-white/90 drop-shadow-sm">
                    {imgInfo.categoria}
                  </span>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="font-display text-lg font-bold leading-snug group-hover:text-(--color-cyan) transition-colors">
                        {r.nome}
                      </h3>
                      <StatusBadge status={r.status} tipo="recurso" />
                    </div>
                    <p className="text-sm text-(--color-ink-soft) flex items-center gap-1.5 mt-1">
                      {r.detalhe}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-(--color-border)/60 flex items-center justify-between text-xs font-semibold text-(--color-cyan)">
                    <span>Ver horários e reservar</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}