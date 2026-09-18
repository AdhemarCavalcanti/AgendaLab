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
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">Gestão de Assinatura</p>
      <h1 className="mb-8 font-display text-3xl font-bold">Planos e Limites</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Plano Grátis */}
        <div className={`card p-6 flex flex-col ${!isPremium ? 'border-(--color-cyan) ring-1 ring-(--color-cyan)' : 'opacity-70'}`}>
          <div className="mb-4 border-b border-(--color-border) pb-4">
            <h2 className="font-display text-2xl font-bold">Grátis</h2>
            <p className="text-3xl font-bold mt-2">R$ 0</p>
            <p className="text-sm text-(--color-ink-soft) mt-1">Validação / Pequenos espaços</p>
          </div>
          <ul className="flex-1 space-y-3 text-sm text-(--color-ink) mb-6">
            <li>✓ Até 2 salas cadastradas</li>
            <li>✓ Limite de 50 reservas mensais</li>
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
        <div className={`card p-6 flex flex-col bg-(--color-cyan-soft)/30 ${isPremium ? 'border-(--color-cyan) ring-1 ring-(--color-cyan)' : ''}`}>
          <div className="mb-4 border-b border-(--color-border) pb-4">
            <h2 className="font-display text-2xl font-bold text-(--color-cyan)">Premium</h2>
            <p className="text-3xl font-bold mt-2">R$ 19,90<span className="text-base font-normal text-(--color-ink-soft)">/mês</span></p>
            <p className="text-sm text-(--color-ink-soft) mt-1">Instituições e Escolas</p>
          </div>
          <ul className="flex-1 space-y-3 text-sm text-(--color-ink) mb-6 font-medium">
            <li>✓ Salas e reservas ilimitadas</li>
            <li>✓ Equipamentos ilimitados</li>
            <li>✓ Relatórios avançados de ocupação (CSV)</li>
            <li>✓ Gestão de múltiplos administradores</li>
          </ul>
          {isPremium ? (
            <button disabled className="btn-primary w-full cursor-default opacity-100">Plano Atual (Ativo)</button>
          ) : (
            <button onClick={assinarPremium} className="btn-primary w-full shadow-md animate-pulse">Fazer Upgrade por R$ 19,90</button>
          )}
        </div>
      </div>
    </div>
  )
}