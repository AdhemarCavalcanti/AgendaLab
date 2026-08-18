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

  const recursos: Recurso[] = useMemo(() => {
    const rSalas: Recurso[] = salas.map((s) => ({
      id: s.id_sala,
      tipo: 'sala',
      nome: s.nome,
      detalhe: `Capacidade: ${s.lotacao} pessoas`,
      status: s.status,
    }))
    const rEquip: Recurso[] = equipamentos.map((e) => ({
      id: e.id,
      tipo: 'equipamento',
      nome: e.nome,
      detalhe: `Quantidade disponível: ${e.quantidade}`,
      status: e.status,
    }))
    return [...rSalas, ...rEquip]
      .filter((r) => tipo === 'todos' || r.tipo === tipo)
      .filter((r) => r.nome.toLowerCase().includes(busca.toLowerCase()))
  }, [salas, equipamentos, tipo, busca])

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <div className="mb-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">catálogo de recursos</p>
        <h1 className="font-display text-3xl font-bold">Salas e equipamentos disponíveis</h1>
        <p className="mt-1 text-(--color-ink-soft)">Filtre por tipo, busque por nome e veja o status em tempo real.</p>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome…"
          className="input sm:max-w-xs"
        />
        <div className="flex gap-2">
          {(['todos', 'sala', 'equipamento'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${
                tipo === t
                  ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan)'
                  : 'border-(--color-border) text-(--color-ink-soft) hover:bg-black/5'
              }`}
            >
              {t === 'todos' ? 'todos' : t === 'sala' ? 'salas' : 'equipamentos'}
            </button>
          ))}
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
        <p className="rounded-lg border border-dashed border-(--color-border) p-10 text-center text-(--color-ink-soft)">
          Nenhum recurso encontrado para esse filtro.
        </p>
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
