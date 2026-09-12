import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../Modal'

describe('Modal Component', () => {
  it('renderiza o título e o conteúdo interno', () => {
    const handleClose = vi.fn()
    render(
      <Modal title="Título do Teste" onClose={handleClose}>
        <p>Conteúdo interno do modal</p>
      </Modal>
    )

    expect(screen.getByText('Título do Teste')).toBeInTheDocument()
    expect(screen.getByText('Conteúdo interno do modal')).toBeInTheDocument()
  })

  it('chama onClose ao clicar no botão de fechar', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()
    render(
      <Modal title="Fechar Modal" onClose={handleClose}>
        <p>Conteúdo</p>
      </Modal>
    )

    const closeBtn = screen.getByRole('button', { name: 'Fechar' })
    await user.click(closeBtn)

    expect(handleClose).toHaveBeenCalledTimes(1)
  })
})
