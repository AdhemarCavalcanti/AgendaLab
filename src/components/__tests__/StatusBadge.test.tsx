import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '../StatusBadge'

describe('StatusBadge Component', () => {
  it('renderiza corretamente os status de recursos', () => {
    const { rerender } = render(<StatusBadge status="livre" tipo="recurso" />)
    expect(screen.getByText('Disponível')).toBeInTheDocument()

    rerender(<StatusBadge status="ocupado" tipo="recurso" />)
    expect(screen.getByText('Ocupado')).toBeInTheDocument()

    rerender(<StatusBadge status="manutencao" tipo="recurso" />)
    expect(screen.getByText('Em manutenção')).toBeInTheDocument()

    rerender(<StatusBadge status="manutenção" tipo="recurso" />)
    expect(screen.getByText('Em manutenção')).toBeInTheDocument()
  })

  it('renderiza corretamente os status de reservas', () => {
    const { rerender } = render(<StatusBadge status="pendente" tipo="reserva" />)
    expect(screen.getByText('Pendente')).toBeInTheDocument()

    rerender(<StatusBadge status="aprovada" tipo="reserva" />)
    expect(screen.getByText('Aprovada')).toBeInTheDocument()

    rerender(<StatusBadge status="cancelada" tipo="reserva" />)
    expect(screen.getByText('Cancelada')).toBeInTheDocument()

    rerender(<StatusBadge status="cancelada_administracao" tipo="reserva" />)
    expect(screen.getByText('Cancelada pela Administração')).toBeInTheDocument()
  })

  it('renderiza fallback para status desconhecido', () => {
    render(<StatusBadge status="desconhecido" tipo="reserva" />)
    expect(screen.getByText('desconhecido')).toBeInTheDocument()
  })
})
