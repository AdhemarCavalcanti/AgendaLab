import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Equipamento, Sala, TipoRecurso } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'

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

  // Função para redefinir todos os filtros
  const limparFiltros = () => {
    setBusca('')
    setTipo('todos')
    setStatusFiltro('todos')
  }

  // Verifica se há algum filtro ativo diferente do padrão
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

    const rEquip: Recurso[] = equipamentos.map((e) => ({
      id: e.id,
      tipo: 'equipamento',
      nome: e.nome,
      detalhe: `Quantidade disponível: ${e.quantidade}`,
      status: e.quantidade > 0 ? 'disponível' : 'ocupado',
    }))

    return [...rSalas, ...rEquip]
      .filter((r) => tipo === 'todos' || r.tipo === tipo)
      .filter((r) => statusFiltro === 'todos' || r.status.toLowerCase() === statusFiltro.toLowerCase())
      .filter((r) => r.nome.toLowerCase().includes(busca.toLowerCase()))
  }, [salas, equipamentos, tipo, statusFiltro, busca])

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <div className="mb-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">catálogo de recursos</p>
        <h1 className="font-display text-3xl font-bold">Salas e equipamentos disponíveis</h1>
        <p className="mt-1 text-(--color-ink-soft)">Filtre por tipo, status e busque por nome em tempo real.</p>
      </div>

      {/* Painel de Filtros Estruturado */}
      <div className="mb-8 rounded-xl border border-(--color-border) bg-black/5 p-4 md:p-5">
        <div className="flex flex-col gap-4">
          
          {/* Linha Superior: Campo de Busca + Botão Limpar */}
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

          {/* Linha Inferior: Seletores Didáticos */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            
            {/* Grupo Tipo */}
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-(--color-ink-soft)">
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
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      tipo === t.value
                        ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan) shadow-xs'
                        : 'border-(--color-border) bg-white text-(--color-ink-soft) hover:bg-black/5'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grupo Status */}
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-(--color-ink-soft)">
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
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      statusFiltro === s.value
                        ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan) shadow-xs'
                        : 'border-(--color-border) bg-white text-(--color-ink-soft) hover:bg-black/5'
                    }`}
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
        <p className="mb-6 rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) px-3 py-2 text-sm text-(--color-coral)">
          {erro}
        </p>
      )}

      {loading ? (
        <p className="font-mono text-sm text-(--color-ink-soft)">carregando recursos…</p>
      ) : recursos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-(--color-border) p-10 text-center">
          <p className="text-(--color-ink-soft)">Nenhum recurso encontrado com os filtros aplicados.</p>
          {temFiltroAtivo && (
            <button
              onClick={limparFiltros}
              className="mt-3 text-sm font-medium text-(--color-cyan) hover:underline"
            >
              Resetar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recursos.map((r) => (
            <Link
              key={`${r.tipo}-${r.id}`}
              to={`/recurso/${r.tipo}/${r.id}`}
              className="reg-mark group card overflow-hidden transition-shadow hover:shadow-md"
            >
              <div className="flex h-28 items-center justify-center bg-(--color-cyan-soft)">
                <span className="font-mono text-4xl text-(--color-cyan)/40">{r.tipo === 'sala' ? '▭' : '⚙'}</span>
              </div>
              <div className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-display font-semibold leading-tight group-hover:text-(--color-cyan)">{r.nome}</h3>
                  <StatusBadge status={r.status} tipo="recurso" />
                </div>
                <p className="font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">{r.tipo}</p>
                <p className="mt-1 text-sm text-(--color-ink-soft)">{r.detalhe}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}