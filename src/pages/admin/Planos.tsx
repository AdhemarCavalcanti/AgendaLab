import { useState } from 'react'

// Chave usada pelo Dashboard para checar se há plano pago ativo
const STORAGE_KEY = 'agendalab_plano'

type PlanoId = 'gratis' | 'essencial' | 'profissional' | 'enterprise'

interface Plano {
  id: PlanoId
  nome: string
  preco: string
  precoCents?: number   // para ordenação; undefined = enterprise/custom
  periodo: string
  publico: string
  destaque?: boolean
  cor: 'default' | 'cyan' | 'amber' | 'ink'
  recursos: Array<{ texto: string; incluido: boolean }>
  badge?: string
  cta: string
  ctaCancel?: string
}

const PLANOS: Plano[] = [
  {
    id: 'gratis',
    nome: 'Grátis',
    preco: 'R$ 0',
    precoCents: 0,
    periodo: '/mês',
    publico: 'Validação · Pequenos espaços',
    cor: 'default',
    cta: 'Começar grátis',
    ctaCancel: 'Rebaixar para Grátis',
    recursos: [
      { texto: 'Até 2 salas cadastradas', incluido: true },
      { texto: 'Até 50 reservas mensais', incluido: true },
      { texto: '1 conta de administrador', incluido: true },
      { texto: 'Calendário de reservas', incluido: true },
      { texto: 'Calendário avançado', incluido: false },
      { texto: 'Relatórios avançados (CSV)', incluido: false },
      { texto: 'Automações de regras', incluido: false },
      { texto: 'API aberta / SSO', incluido: false },
    ],
  },
  {
    id: 'essencial',
    nome: 'Essencial',
    preco: 'R$ 79',
    precoCents: 7900,
    periodo: '/mês',
    publico: 'Instituições médias',
    cor: 'cyan',
    cta: 'Assinar Essencial',
    ctaCancel: 'Cancelar Essencial',
    recursos: [
      { texto: 'Até 10 salas cadastradas', incluido: true },
      { texto: 'Reservas ilimitadas', incluido: true },
      { texto: 'Até 3 administradores', incluido: true },
      { texto: 'Calendário avançado', incluido: true },
      { texto: 'Relatórios avançados (CSV)', incluido: false },
      { texto: 'Automações de regras', incluido: false },
      { texto: 'Integrações externas', incluido: false },
      { texto: 'API aberta / SSO', incluido: false },
    ],
  },
  {
    id: 'profissional',
    nome: 'Profissional',
    preco: 'R$ 199',
    precoCents: 19900,
    periodo: '/mês',
    publico: 'Empresas estruturadas',
    cor: 'amber',
    badge: 'Mais popular',
    destaque: true,
    cta: 'Assinar Profissional',
    ctaCancel: 'Cancelar Profissional',
    recursos: [
      { texto: 'Até 30 salas cadastradas', incluido: true },
      { texto: 'Reservas ilimitadas', incluido: true },
      { texto: 'Administradores ilimitados', incluido: true },
      { texto: 'Calendário avançado', incluido: true },
      { texto: 'Automações de regras', incluido: true },
      { texto: 'Relatórios avançados (CSV)', incluido: true },
      { texto: 'Integrações externas', incluido: true },
      { texto: 'API aberta / SSO', incluido: false },
    ],
  },
  {
    id: 'enterprise',
    nome: 'Enterprise',
    preco: 'A partir de R$ 499',
    periodo: '/mês',
    publico: 'Grandes operações',
    cor: 'ink',
    cta: 'Falar com vendas',
    ctaCancel: 'Cancelar Enterprise',
    recursos: [
      { texto: 'Salas ilimitadas', incluido: true },
      { texto: 'Reservas ilimitadas', incluido: true },
      { texto: 'Administradores ilimitados', incluido: true },
      { texto: 'Calendário avançado', incluido: true },
      { texto: 'Automações de regras', incluido: true },
      { texto: 'Relatórios avançados (CSV)', incluido: true },
      { texto: 'API aberta + integrações', incluido: true },
      { texto: 'Login via SSO', incluido: true },
      { texto: 'Suporte prioritário e customização', incluido: true },
    ],
  },
]

// ícones SVG inline
function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-(--color-green)" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}
function CrossIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-(--color-border)" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function SparkIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l2.4 7.2H22l-6.4 4.6 2.4 7.2L12 16.6 6 21l2.4-7.2L2 9.2h7.6L12 2z" />
    </svg>
  )
}

function ModalCheckout({
  plano,
  onConfirm,
  onClose,
}: {
  plano: Plano
  onConfirm: () => void
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'success'>('form')

  // campos fictícios de pagamento
  const [cartao, setCartao] = useState('')
  const [validade, setValidade] = useState('')
  const [cvv, setCvv] = useState('')
  const [nome, setNome] = useState('')

  function formatarCartao(v: string) {
    return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
  }
  function formatarValidade(v: string) {
    return v.replace(/\D/g, '').slice(0, 4).replace(/(\d{2})(\d)/, '$1/$2')
  }

  async function handlePagar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1800)) // simula gateway
    setLoading(false)
    setStep('success')
    onConfirm()
  }

  const corBtn: Record<Plano['cor'], string> = {
    default: 'btn-secondary',
    cyan: 'btn-primary',
    amber: 'bg-(--color-amber) hover:opacity-90 text-white font-semibold rounded-lg px-4 py-2.5 text-sm flex items-center justify-center gap-2 transition-opacity',
    ink: 'bg-(--color-ink) hover:opacity-80 text-white font-semibold rounded-lg px-4 py-2.5 text-sm flex items-center justify-center gap-2 transition-opacity',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(14,26,43,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="card w-full max-w-md p-6 shadow-2xl">
        {step === 'success' ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-(--color-green-soft) text-(--color-green)">
              <CheckIcon />
            </div>
            <h2 className="font-display text-2xl font-bold">Assinatura ativada!</h2>
            <p className="text-sm text-(--color-ink-soft)">
              O plano <strong>{plano.nome}</strong> está ativo agora. Aproveite todos os recursos.
            </p>
            <button onClick={onClose} className="btn-primary w-full mt-2">
              Continuar
            </button>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="font-mono text-xs uppercase text-(--color-ink-soft) tracking-wider mb-0.5">checkout simulado</p>
                <h2 className="font-display text-xl font-bold">Plano {plano.nome}</h2>
              </div>
              <button onClick={onClose} className="rounded-md p-1.5 hover:bg-(--color-paper) text-(--color-ink-soft) transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mb-5 rounded-lg border border-(--color-border) bg-(--color-paper) px-4 py-3 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-(--color-ink-soft)">Subtotal</span>
                <span className="font-medium">{plano.preco}{plano.periodo}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-(--color-ink-soft)">Renovação</span>
                <span>Mensal automática</span>
              </div>
            </div>

            <form onSubmit={handlePagar} className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block font-mono text-xs uppercase text-(--color-ink-soft)">Nome no cartão</label>
                <input className="input" placeholder="Maria Silva" value={nome} onChange={(e) => setNome(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block font-mono text-xs uppercase text-(--color-ink-soft)">Número do cartão</label>
                <input className="input font-mono" placeholder="0000 0000 0000 0000" value={cartao}
                  onChange={(e) => setCartao(formatarCartao(e.target.value))} maxLength={19} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-mono text-xs uppercase text-(--color-ink-soft)">Validade</label>
                  <input className="input font-mono" placeholder="MM/AA" value={validade}
                    onChange={(e) => setValidade(formatarValidade(e.target.value))} maxLength={5} required />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-xs uppercase text-(--color-ink-soft)">CVV</label>
                  <input className="input font-mono" placeholder="123" value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} required />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className={`mt-2 w-full ${corBtn[plano.cor]} disabled:opacity-60`}
              >
                {loading ? 'Processando…' : `Assinar por ${plano.preco}${plano.periodo}`}
              </button>
              <p className="text-center font-mono text-[10px] text-(--color-ink-soft)">
                🔒 Pagamento simulado — nenhum dado é enviado
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export function AdminPlanos() {
  const [planoAtual, setPlanoAtual] = useState<PlanoId>(
    (localStorage.getItem(STORAGE_KEY) as PlanoId) ?? 'gratis'
  )
  const [checkout, setCheckout] = useState<Plano | null>(null)

  function ativarPlano(plano: Plano) {
    if (plano.id === 'enterprise') {
      // Redireciona para contato simulado
      window.open('mailto:vendas@agendalab.com.br?subject=Interesse%20Enterprise', '_blank')
      return
    }
    setCheckout(plano)
  }

  function confirmarPlano(plano: Plano) {
    localStorage.setItem(STORAGE_KEY, plano.id)
    setPlanoAtual(plano.id)
  }

  function cancelarParaGratis() {
    localStorage.setItem(STORAGE_KEY, 'gratis')
    setPlanoAtual('gratis')
  }

  const corCard: Record<Plano['cor'], string> = {
    default: 'border-(--color-border)',
    cyan: 'border-(--color-cyan)/60',
    amber: 'border-(--color-amber)/60',
    ink: 'border-(--color-ink)/30',
  }
  const corPreco: Record<Plano['cor'], string> = {
    default: 'text-(--color-ink)',
    cyan: 'text-(--color-cyan)',
    amber: 'text-(--color-amber)',
    ink: 'text-(--color-ink)',
  }
  const corNome: Record<Plano['cor'], string> = {
    default: 'text-(--color-ink)',
    cyan: 'text-(--color-cyan)',
    amber: 'text-(--color-amber)',
    ink: 'text-(--color-ink)',
  }
  const corCta: Record<Plano['cor'], string> = {
    default: 'btn-secondary w-full',
    cyan: 'btn-primary w-full',
    amber: 'w-full rounded-lg bg-(--color-amber) px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90',
    ink: 'w-full rounded-lg bg-(--color-ink) px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80',
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      {/* cabeçalho */}
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">
        gestão de assinatura
      </p>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-bold">Planos e preços</h1>
        {planoAtual !== 'gratis' && (
          <button
            onClick={cancelarParaGratis}
            className="btn-secondary text-xs text-(--color-coral) hover:border-(--color-coral)"
          >
            Cancelar assinatura
          </button>
        )}
      </div>
      <p className="mb-10 max-w-xl text-sm text-(--color-ink-soft)">
        Escolha o plano ideal para o tamanho da sua operação. Mude ou cancele a qualquer momento.
      </p>

      {/* plano atual destacado */}
      {planoAtual !== 'gratis' && (
        <div className="mb-8 flex items-center gap-3 rounded-lg border border-(--color-green)/40 bg-(--color-green-soft) px-4 py-3">
          <span className="text-(--color-green)"><SparkIcon /></span>
          <p className="font-mono text-sm font-medium text-(--color-green)">
            Plano atual: <strong>{PLANOS.find((p) => p.id === planoAtual)?.nome}</strong>
          </p>
        </div>
      )}

      {/* grade de cards */}
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {PLANOS.map((plano) => {
          const ativo = planoAtual === plano.id
          return (
            <div
              key={plano.id}
              id={`plano-card-${plano.id}`}
              className={`card relative flex flex-col p-6 transition-shadow ${corCard[plano.cor]} ${ativo ? 'ring-2 ring-(--color-cyan) shadow-lg' : plano.destaque ? 'shadow-md' : ''}`}
            >
              {/* badge */}
              {plano.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-(--color-amber) px-3 py-0.5 font-mono text-xs font-bold text-white shadow-sm">
                  {plano.badge}
                </span>
              )}
              {ativo && (
                <span className="absolute -top-3 right-4 rounded-full bg-(--color-cyan) px-3 py-0.5 font-mono text-xs font-bold text-white shadow-sm">
                  Ativo
                </span>
              )}

              {/* header */}
              <div className="mb-5 border-b border-(--color-border) pb-4">
                <h2 className={`font-display text-xl font-bold ${corNome[plano.cor]}`}>{plano.nome}</h2>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-(--color-ink-soft)">{plano.publico}</p>
                <p className={`mt-3 font-display text-2xl font-bold ${corPreco[plano.cor]}`}>
                  {plano.preco}
                  {plano.precoCents !== undefined
                    ? <span className="text-base font-normal text-(--color-ink-soft)">{plano.periodo}</span>
                    : <span className="text-base font-normal text-(--color-ink-soft)">{plano.periodo}</span>
                  }
                </p>
              </div>

              {/* recursos */}
              <ul className="mb-6 flex-1 space-y-2.5">
                {plano.recursos.map((r) => (
                  <li key={r.texto} className={`flex items-start gap-2 text-sm ${r.incluido ? 'text-(--color-ink)' : 'text-(--color-ink-soft)/60 line-through'}`}>
                    {r.incluido ? <CheckIcon /> : <CrossIcon />}
                    <span>{r.texto}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {ativo ? (
                <button disabled className="btn-secondary w-full cursor-default opacity-80">
                  Plano atual
                </button>
              ) : (
                <button
                  id={`btn-assinar-${plano.id}`}
                  onClick={() => ativarPlano(plano)}
                  className={corCta[plano.cor]}
                >
                  {plano.id === 'enterprise' ? '📞 Falar com vendas' : plano.cta}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* comparativo de recursos */}
      <div className="mt-14">
        <h2 className="mb-6 font-display text-xl font-bold">Comparativo completo</h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-(--color-border) bg-(--color-paper)">
                  <th className="py-3 pl-5 pr-3 text-left font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">Recurso</th>
                  {PLANOS.map((p) => (
                    <th key={p.id} className={`px-4 py-3 text-center font-display text-sm font-semibold ${corNome[p.cor]} ${planoAtual === p.id ? 'bg-(--color-cyan-soft)' : ''}`}>
                      {p.nome}
                      {planoAtual === p.id && <span className="ml-1.5 font-mono text-[10px] font-normal text-(--color-cyan)">(atual)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Salas cadastradas',       vals: ['Até 2', 'Até 10', 'Até 30', 'Ilimitadas'] },
                  { label: 'Reservas mensais',         vals: ['Até 50', 'Ilimitadas', 'Ilimitadas', 'Ilimitadas'] },
                  { label: 'Administradores',          vals: ['1', 'Até 3', 'Ilimitados', 'Ilimitados'] },
                  { label: 'Calendário avançado',      vals: [false, true, true, true] },
                  { label: 'Relatórios (CSV)',          vals: [false, false, true, true] },
                  { label: 'Automações de regras',      vals: [false, false, true, true] },
                  { label: 'Integrações externas',     vals: [false, false, true, true] },
                  { label: 'API aberta',               vals: [false, false, false, true] },
                  { label: 'Login via SSO',            vals: [false, false, false, true] },
                  { label: 'Suporte prioritário',      vals: [false, false, false, true] },
                ].map((row) => (
                  <tr key={row.label} className="border-b border-(--color-border) last:border-0 hover:bg-(--color-paper)/60 transition-colors">
                    <td className="py-3 pl-5 pr-3 font-medium text-(--color-ink)">{row.label}</td>
                    {row.vals.map((v, i) => (
                      <td key={i} className={`px-4 py-3 text-center font-mono text-xs ${planoAtual === PLANOS[i].id ? 'bg-(--color-cyan-soft)/40' : ''}`}>
                        {typeof v === 'boolean' ? (
                          v
                            ? <span className="text-(--color-green)">✓</span>
                            : <span className="text-(--color-border)">—</span>
                        ) : (
                          <span className="text-(--color-ink-soft)">{v}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="mt-14 grid gap-4 md:grid-cols-2">
        {[
          { p: 'Posso cancelar a qualquer momento?', r: 'Sim. Você pode cancelar ou rebaixar o plano a qualquer momento, sem multa. O acesso continua até o fim do ciclo pago.' },
          { p: 'O que acontece com meus dados ao cancelar?', r: 'Seus dados ficam preservados por 30 dias após o cancelamento. Após esse prazo, recursos acima dos limites do plano Grátis ficam inativos.' },
          { p: 'Posso migrar de plano no meio do mês?', r: 'Sim. A migração é imediata e o valor é calculado proporcionalmente ao período restante.' },
          { p: 'O plano Enterprise tem contrato mínimo?', r: 'O Enterprise inclui um contrato personalizado. Fale com nosso time de vendas para detalhes de período mínimo, SLA e customizações.' },
        ].map((item) => (
          <div key={item.p} className="card p-5">
            <h3 className="mb-2 font-semibold text-sm">{item.p}</h3>
            <p className="text-sm text-(--color-ink-soft)">{item.r}</p>
          </div>
        ))}
      </div>

      {/* modal de checkout */}
      {checkout && (
        <ModalCheckout
          plano={checkout}
          onConfirm={() => confirmarPlano(checkout)}
          onClose={() => setCheckout(null)}
        />
      )}
    </div>
  )
}
