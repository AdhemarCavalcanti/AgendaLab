import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Equipamento, Sala, StatusRecurso, TipoRecurso } from '../../lib/types'
import { StatusBadge } from '../../components/StatusBadge'
import { Modal } from '../../components/Modal'

type SalaComRegras = Sala & { regras_uso?: string }
type EquipamentoComRegras = Equipamento & { regras_uso?: string; quantidade_manutencao?: number }

const STATUS_OPTS: StatusRecurso[] = ['livre', 'ocupado', 'manutencao']

export function AdminRecursos() {
  const [aba, setAba] = useState<TipoRecurso>('sala')
  const [salas, setSalas] = useState<SalaComRegras[]>([])
  const [equipamentos, setEquipamentos] = useState<EquipamentoComRegras[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<SalaComRegras | EquipamentoComRegras | null>(null)

  // Estado para controlar a modal de manutenção parcial em equipamentos
  const [equipamentoManutencao, setEquipamentoManutencao] = useState<{
    item: EquipamentoComRegras
    acao: 'entrar' | 'sair'
  } | null>(null)
  const [qtdManutencaoInput, setQtdManutencaoInput] = useState<number>(1)
  const [enviandoManutencao, setEnviandoManutencao] = useState(false)

  async function carregar() {
    setLoading(true)
    const [{ data: s, error: eS }, { data: e, error: eE }] = await Promise.all([
      supabase.from('salas').select('*').order('nome', { ascending: true }),
      supabase.from('equipamentos').select('*').order('nome', { ascending: true }),
    ])
    if (eS || eE) setErro((eS ?? eE)?.message ?? null)
    setSalas((s as SalaComRegras[]) ?? [])
    setEquipamentos((e as EquipamentoComRegras[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  async function excluir(id: number) {
    if (!confirm('Excluir este recurso permanentemente? Esta ação não pode ser desfeita.')) return
    const tabela = aba === 'sala' ? 'salas' : 'equipamentos'
    const coluna = aba === 'sala' ? 'id_sala' : 'id'
    const { error } = await supabase.from(tabela).delete().eq(coluna, id)
    if (error) alert('Erro ao excluir: ' + error.message)
    else carregar()
  }

  async function alternarManutencaoSala(item: SalaComRegras) {
    const novoStatus: StatusRecurso = item.status === 'manutencao' ? 'livre' : 'manutencao'
    const { error } = await supabase.from('salas').update({ status: novoStatus }).eq('id_sala', item.id_sala)
    if (error) alert('Erro: ' + error.message)
    else carregar()
  }

  function abrirModalManutencaoEquipamento(item: EquipamentoComRegras, acao: 'entrar' | 'sair') {
    setEquipamentoManutencao({ item, acao })
    setQtdManutencaoInput(1)
  }

  async function confirmarManutencaoEquipamento() {
    if (!equipamentoManutencao || qtdManutencaoInput <= 0) return

    const { item, acao } = equipamentoManutencao
    const qtdAtual = item.quantidade ?? 0
    const qtdManutencaoAtual = item.quantidade_manutencao ?? 0

    let novaQtd = qtdAtual
    let novaQtdManutencao = qtdManutencaoAtual

    if (acao === 'entrar') {
      if (qtdManutencaoInput > qtdAtual) {
        alert('A quantidade em manutenção não pode ser maior do que o estoque disponível.')
        return
      }
      novaQtd = qtdAtual - qtdManutencaoInput
      novaQtdManutencao = qtdManutencaoAtual + qtdManutencaoInput
    } else {
      novaQtd = qtdAtual + qtdManutencaoInput
      novaQtdManutencao = Math.max(0, qtdManutencaoAtual - qtdManutencaoInput)
    }

    // Define status global
    let novoStatus: StatusRecurso = 'livre'
    if (novaQtd === 0 && novaQtdManutencao > 0) {
      novoStatus = 'manutencao'
    } else if (item.status === 'manutencao' && novaQtd > 0) {
      novoStatus = 'livre'
    } else {
      novoStatus = item.status
    }

    setEnviandoManutencao(true)
    const { error } = await supabase
      .from('equipamentos')
      .update({
        quantidade: novaQtd,
        quantidade_manutencao: novaQtdManutencao,
        status: novoStatus,
      })
      .eq('id', item.id)

    setEnviandoManutencao(false)

    if (error) {
      alert('Erro ao atualizar manutenção: ' + error.message)
    } else {
      setEquipamentoManutencao(null)
      carregar()
    }
  }

  const lista = aba === 'sala' ? salas : equipamentos

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">painel administrativo</p>
          <h1 className="font-display text-3xl font-bold">Gestão de recursos</h1>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setEditando(null)
            setModalAberto(true)
          }}
        >
          + novo {aba}
        </button>
      </div>

      <div className="mb-6 flex gap-2">
        {(['sala', 'equipamento'] as TipoRecurso[]).map((t) => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              aba === t ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan)' : 'border-(--color-border) text-(--color-ink-soft) hover:bg-black/5'
            }`}
          >
            {t === 'sala' ? 'salas' : 'equipamentos'}
          </button>
        ))}
      </div>

      {erro && <p className="mb-4 rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) px-3 py-2 text-sm text-(--color-coral)">{erro}</p>}

      {loading ? (
        <p className="font-mono text-sm text-(--color-ink-soft)">carregando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-lg border border-dashed border-(--color-border) p-10 text-center text-(--color-ink-soft)">Nenhum recurso cadastrado ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-(--color-border)">
          <table className="w-full text-left text-sm">
            <thead className="bg-(--color-paper) font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">{aba === 'sala' ? 'Capacidade' : 'Disponível / Manutenção'}</th>
                <th className="px-4 py-3">Regras de Uso</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((item) => {
                const id = aba === 'sala' ? (item as SalaComRegras).id_sala : (item as EquipamentoComRegras).id
                return (
                  <tr key={id} className="border-t border-(--color-border)">
                    <td className="px-4 py-3 font-medium">{item.nome}</td>
                    <td className="px-4 py-3 font-mono">
                      {aba === 'sala' ? (
                        (item as SalaComRegras).lotacao
                      ) : (
                        <span>
                          {(item as EquipamentoComRegras).quantidade}{' '}
                          <span className="text-xs text-(--color-ink-soft)">
                            ({(item as EquipamentoComRegras).quantidade_manutencao ?? 0} em manut.)
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <p className="line-clamp-2 text-xs text-(--color-ink-soft)">
                        {item.regras_uso ? item.regras_uso : <span className="italic opacity-50">Nenhuma regra cadastrada</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} tipo="recurso" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditando(item)
                            setModalAberto(true)
                          }}
                          className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium hover:bg-black/5"
                        >
                          editar
                        </button>

                        {aba === 'sala' ? (
                          <button
                            onClick={() => alternarManutencaoSala(item as SalaComRegras)}
                            className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium hover:bg-black/5"
                          >
                            {item.status === 'manutencao' ? 'reativar' : 'manutenção'}
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => abrirModalManutencaoEquipamento(item as EquipamentoComRegras, 'entrar')}
                              className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium hover:bg-black/5"
                              disabled={(item as EquipamentoComRegras).quantidade <= 0}
                            >
                              + manutenção
                            </button>
                            {((item as EquipamentoComRegras).quantidade_manutencao ?? 0) > 0 && (
                              <button
                                onClick={() => abrirModalManutencaoEquipamento(item as EquipamentoComRegras, 'sair')}
                                className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium hover:bg-black/5 text-(--color-cyan)"
                              >
                                retornar
                              </button>
                            )}
                          </>
                        )}

                        <button
                          onClick={() => excluir(id)}
                          className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium text-(--color-coral) hover:bg-(--color-coral-soft)"
                        >
                          excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalAberto && (
        <RecursoForm
          tipo={aba}
          item={editando}
          onClose={() => setModalAberto(false)}
          onSaved={() => {
            setModalAberto(false)
            carregar()
          }}
        />
      )}

      {equipamentoManutencao && (
        <Modal
          title={
            equipamentoManutencao.acao === 'entrar'
              ? `Enviar para manutenção: ${equipamentoManutencao.item.nome}`
              : `Retornar da manutenção: ${equipamentoManutencao.item.nome}`
          }
          onClose={() => setEquipamentoManutencao(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-(--color-ink-soft)">
              {equipamentoManutencao.acao === 'entrar'
                ? `Estoque livre atual: ${equipamentoManutencao.item.quantidade}. Quantas unidades deseja colocar em manutenção?`
                : `Unidades em manutenção atual: ${equipamentoManutencao.item.quantidade_manutencao ?? 0}. Quantas unidades estão retornando para o estoque livre?`}
            </p>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Quantidade</span>
              <input
                type="number"
                min={1}
                max={
                  equipamentoManutencao.acao === 'entrar'
                    ? equipamentoManutencao.item.quantidade
                    : undefined
                }
                value={qtdManutencaoInput}
                onChange={(e) => setQtdManutencaoInput(Number(e.target.value))}
                className="input"
              />
            </label>

            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEquipamentoManutencao(null)} disabled={enviandoManutencao}>
                cancelar
              </button>
              <button className="btn-primary" onClick={confirmarManutencaoEquipamento} disabled={enviandoManutencao || qtdManutencaoInput < 1}>
                {enviandoManutencao ? 'salvando…' : 'confirmar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function RecursoForm({
  tipo,
  item,
  onClose,
  onSaved,
}: {
  tipo: TipoRecurso
  item: SalaComRegras | EquipamentoComRegras | null
  onClose: () => void
  onSaved: () => void
}) {
  const isSala = tipo === 'sala'
  const [nome, setNome] = useState(item?.nome ?? '')
  const [quantidadeOuLotacao, setQuantidadeOuLotacao] = useState(
    isSala ? (item as SalaComRegras)?.lotacao ?? 10 : (item as EquipamentoComRegras)?.quantidade ?? 1
  )
  const [qtdManutencao, setQtdManutencao] = useState(
    !isSala ? (item as EquipamentoComRegras)?.quantidade_manutencao ?? 0 : 0
  )
  const [regrasUso, setRegrasUso] = useState(item?.regras_uso ?? '')
  const [status, setStatus] = useState<StatusRecurso>(item?.status ?? 'livre')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      setErro('Informe o nome.')
      return
    }
    setSalvando(true)
    setErro(null)

    if (isSala) {
      const payload = {
        nome,
        lotacao: quantidadeOuLotacao,
        status,
        regras_uso: regrasUso.trim() || null,
      }
      const query = item
        ? supabase.from('salas').update(payload).eq('id_sala', (item as SalaComRegras).id_sala)
        : supabase.from('salas').insert(payload)
      const { error } = await query
      setSalvando(false)
      if (error) return setErro(error.message)
    } else {
      const payload = {
        nome,
        quantidade: quantidadeOuLotacao,
        quantidade_manutencao: qtdManutencao,
        status,
        regras_uso: regrasUso.trim() || null,
      }
      const query = item
        ? supabase.from('equipamentos').update(payload).eq('id', (item as EquipamentoComRegras).id)
        : supabase.from('equipamentos').insert(payload)
      const { error } = await query
      setSalvando(false)
      if (error) return setErro(error.message)
    }
    onSaved()
  }

  return (
    <Modal title={`${item ? 'Editar' : 'Novo'} ${tipo}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="input"
            placeholder={isSala ? 'Ex: Laboratório 3' : 'Ex: Microscópio óptico'}
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{isSala ? 'Capacidade (lotação)' : 'Quantidade disponível'}</span>
          <input
            type="number"
            min={0}
            value={quantidadeOuLotacao}
            onChange={(e) => setQuantidadeOuLotacao(Number(e.target.value))}
            className="input"
            required
          />
        </label>

        {!isSala && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Quantidade em manutenção</span>
            <input
              type="number"
              min={0}
              value={qtdManutencao}
              onChange={(e) => setQtdManutencao(Number(e.target.value))}
              className="input"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Regras de Uso</span>
          <textarea
            value={regrasUso}
            onChange={(e) => setRegrasUso(e.target.value)}
            className="input"
            rows={3}
            placeholder="Digite as instruções e regras para utilização deste recurso..."
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusRecurso)} className="input">
            {STATUS_OPTS.map((s) => (
              <option key={s} value={s}>
                {s === 'livre' ? 'Disponível' : s === 'ocupado' ? 'Ocupado' : 'Em manutenção'}
              </option>
            ))}
          </select>
        </label>

        {erro && <p className="rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) px-3 py-2 text-sm text-(--color-coral)">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={salvando}>
            cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? 'salvando…' : 'salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}