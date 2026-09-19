import { useState } from 'react'

export function AdminPlanos() {
  const [isPremium, setIsPremium] = useState(localStorage.getItem('agendalab_plano') === 'premium')

  function assinarPremium() {
    localStorage.setItem('agendalab_plano', 'premium')
    setIsPremium(true)
    alert('Upgrade para o Plano Premium realizado com sucesso! (Simulação)')
    window.location.reload() // Recarrega para aplicar as permissões
  }

  function cancelarAssinatura() {
    localStorage.removeItem('agendalab_plano')
    setIsPremium(false)
    alert('Assinatura cancelada. Voltou ao Plano Grátis.')
    window.location.reload()
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
      <p className="kicker">Gestão de Assinatura</p>
      <h1 className="mb-8 font-display text-4xl font-extrabold tracking-tight">Planos e Limites</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Plano Grátis */}
        <div className={`card flex flex-col p-7 ${!isPremium ? 'ring-2 ring-(--color-cyan)' : 'opacity-70'}`}>
          <div className="mb-5 border-b border-(--color-border) pb-5">
            <h2 className="font-display text-2xl font-bold tracking-tight">Grátis</h2>
            <p className="mt-2 text-4xl font-extrabold tracking-tight">R$ 0</p>
            <p className="mt-1 text-sm text-(--color-ink-soft)">Validação / Pequenos espaços</p>
          </div>
          <ul className="mb-6 flex-1 space-y-3 text-sm text-(--color-ink)">
            <li>✓ Até 2 salas reservadas por usuário</li>
            <li>✓ Limite de 50 reservas mensais por usuário</li>
            <li>✓ 1 conta de administrador</li>
            <li className="text-(--color-ink-soft) line-through">Relatórios avançados de ocupação</li>
          </ul>
          {!isPremium ? (
            <button disabled className="btn-secondary w-full cursor-default bg-(--color-paper)">Plano Atual</button>
          ) : (
            <button onClick={cancelarAssinatura} className="btn-secondary w-full text-(--color-coral) hover:border-(--color-coral)">Rebaixar para Grátis</button>
          )}
        </div>

        {/* Plano Premium */}
        <div className={`card flex flex-col p-7 ${isPremium ? 'ring-2 ring-(--color-accent)' : ''}`}>
          <div className="mb-5 border-b border-(--color-border) pb-5">
            <p className="mb-2 inline-flex rounded-full bg-(--color-accent-soft) px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-(--color-green)">Recomendado</p>
            <h2 className="font-display text-2xl font-bold tracking-tight text-(--color-cyan)">Premium</h2>
            <p className="mt-2 text-4xl font-extrabold tracking-tight">R$ 19,90<span className="text-base font-medium text-(--color-ink-soft)">/mês</span></p>
            <p className="mt-1 text-sm text-(--color-ink-soft)">Equipes e empresas</p>
          </div>
          <ul className="mb-6 flex-1 space-y-3 text-sm font-medium text-(--color-ink)">
            <li>✓ Salas e reservas ilimitadas para usuários</li>
            <li>✓ Equipamentos ilimitados</li>
            <li>✓ Relatórios avançados de ocupação (CSV)</li>
            <li>✓ Gestão de múltiplos administradores</li>
          </ul>
          {isPremium ? (
            <button disabled className="btn-primary w-full cursor-default opacity-100">Plano Atual (Ativo)</button>
          ) : (
            <button onClick={assinarPremium} className="btn-primary w-full">Fazer Upgrade por R$ 19,90</button>
          )}
        </div>
      </div>
    </div>
  )
}
