import type { VistoriaEquipamento } from '../lib/types'

export function VistoriaHistorico({ vistorias }: { vistorias: VistoriaEquipamento[] }) {
  if (vistorias.length === 0) return null

  return (
    <div className="mt-3 border-t border-(--color-border) pt-3 text-xs text-(--color-ink-soft)">
      <p className="mb-2 font-semibold text-(--color-ink)">Histórico de vistoria</p>
      <div className="space-y-2">
        {vistorias.map((vistoria) => {
          const responsavel = Array.isArray(vistoria.administradores)
            ? vistoria.administradores[0]?.nome
            : vistoria.administradores?.nome
          return <div key={vistoria.id}>
            <p className="font-medium text-(--color-ink)">
              {vistoria.etapa === 'entrega' ? 'Entrega' : 'Devolução'} · {new Date(vistoria.criado_em).toLocaleString('pt-BR')}
              {responsavel && ` · ${responsavel}`}
            </p>
            <p>
              Cabo: {vistoria.cabo_presente ? 'presente' : 'ausente'} · Peças: {vistoria.pecas_completas ? 'completas' : 'incompletas'} · Condição: {vistoria.sem_danos_visiveis ? 'sem danos visíveis' : 'com danos visíveis'}
            </p>
            {vistoria.observacoes && <p>Observações: {vistoria.observacoes}</p>}
          </div>
        })}
      </div>
    </div>
  )
}
