import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AvailabilityGrid, type Ocupacao } from '../AvailabilityGrid'

describe('AvailabilityGrid Component', () => {
  // Data de teste no futuro para evitar que os slots caiam como 'passado'
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + 5)
  futureDate.setHours(0, 0, 0, 0)

  it('renderiza os slots de horários do dia', () => {
    render(
      <AvailabilityGrid
        date={futureDate}
        ocupacoes={[]}
        startHour={8}
        endHour={12}
        totalEstoque={1}
      />
    )

    expect(screen.getByText(/08:00 – 09:00/i)).toBeInTheDocument()
    expect(screen.getByText(/09:00 – 10:00/i)).toBeInTheDocument()
    expect(screen.getByText(/12:00 – 13:00/i)).toBeInTheDocument()
  })

  it('bloqueia slot de sala quando houver reserva aprovada ou pendente', () => {
    const slotStart = new Date(futureDate)
    slotStart.setHours(10, 0, 0, 0)
    const slotEnd = new Date(futureDate)
    slotEnd.setHours(11, 0, 0, 0)

    const ocupacoes: Ocupacao[] = [
      {
        inicio: slotStart.toISOString(),
        fim: slotEnd.toISOString(),
        status: 'aprovada',
        mine: false,
      },
    ]

    render(
      <AvailabilityGrid
        date={futureDate}
        ocupacoes={ocupacoes}
        startHour={9}
        endHour={12}
        isEquipamento={false}
      />
    )

    expect(screen.getByText('ocupado')).toBeInTheDocument()
    const button = screen.getByText(/10:00 – 11:00/i).closest('button')
    expect(button).toBeDisabled()
  })

  it('identifica reserva própria da pessoa logada', () => {
    const slotStart = new Date(futureDate)
    slotStart.setHours(14, 0, 0, 0)
    const slotEnd = new Date(futureDate)
    slotEnd.setHours(15, 0, 0, 0)

    const ocupacoes: Ocupacao[] = [
      {
        inicio: slotStart.toISOString(),
        fim: slotEnd.toISOString(),
        status: 'pendente',
        mine: true,
      },
    ]

    render(
      <AvailabilityGrid
        date={futureDate}
        ocupacoes={ocupacoes}
        startHour={13}
        endHour={16}
        isEquipamento={false}
      />
    )

    expect(screen.getByText('sua solicitação')).toBeInTheDocument()
  })

  it('permite reserva de equipamento com estoque parcial restante e marca esgotado quando atinge a capacidade máxima', () => {
    const slotStart = new Date(futureDate)
    slotStart.setHours(9, 0, 0, 0)
    const slotEnd = new Date(futureDate)
    slotEnd.setHours(10, 0, 0, 0)

    const slotStart2 = new Date(futureDate)
    slotStart2.setHours(11, 0, 0, 0)
    const slotEnd2 = new Date(futureDate)
    slotEnd2.setHours(12, 0, 0, 0)

    const ocupacoes: Ocupacao[] = [
      // 9h: 2 de 5 em uso (parcial)
      {
        inicio: slotStart.toISOString(),
        fim: slotEnd.toISOString(),
        status: 'aprovada',
        quantidade: 2,
      },
      // 11h: 5 de 5 em uso (esgotado)
      {
        inicio: slotStart2.toISOString(),
        fim: slotEnd2.toISOString(),
        status: 'aprovada',
        quantidade: 5,
      },
    ]

    render(
      <AvailabilityGrid
        date={futureDate}
        ocupacoes={ocupacoes}
        startHour={9}
        endHour={12}
        totalEstoque={5}
        isEquipamento={true}
        onConfirmSelection={vi.fn()}
      />
    )

    // Slot das 9h mostra uso parcial e continua habilitado
    expect(screen.getByText('⚠️ 2/5 em uso')).toBeInTheDocument()
    const btn9 = screen.getByText(/09:00 – 10:00/i).closest('button')
    expect(btn9).not.toBeDisabled()

    // Slot das 11h mostra esgotado e fica desabilitado
    expect(screen.getByText('esgotado')).toBeInTheDocument()
    const btn11 = screen.getByText(/11:00 – 12:00/i).closest('button')
    expect(btn11).toBeDisabled()
  })

  it('permite selecionar intervalo de horários e confirmar seleção', async () => {
    const user = userEvent.setup()
    const handleConfirm = vi.fn()

    render(
      <AvailabilityGrid
        date={futureDate}
        ocupacoes={[]}
        startHour={14}
        endHour={17}
        onConfirmSelection={handleConfirm}
      />
    )

    const btn14 = screen.getByText(/14:00 – 15:00/i).closest('button')!
    await user.click(btn14)

    expect(screen.getByText(/selecionado: 14:00 → 15:00/i)).toBeInTheDocument()

    // Seleciona hora seguinte contígua
    const btn15 = screen.getByText(/15:00 – 16:00/i).closest('button')!
    await user.click(btn15)

    expect(screen.getByText(/selecionado: 14:00 → 16:00/i)).toBeInTheDocument()

    // Clica no botão de confirmar solicitação
    const btnConfirm = screen.getByRole('button', { name: /solicitar reserva/i })
    await user.click(btnConfirm)

    expect(handleConfirm).toHaveBeenCalledTimes(1)
    const [startArg, endArg] = handleConfirm.mock.calls[0]
    expect(startArg.getHours()).toBe(14)
    expect(endArg.getHours()).toBe(16)
  })
})
