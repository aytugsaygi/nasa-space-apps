import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { Tooltip } from './Tooltip'

const setup = () =>
  renderWithProviders(
    <Tooltip label="Açıklama">
      <button type="button">Düğme</button>
    </Tooltip>,
  )

describe('Tooltip', () => {
  it('fareyle üzerine gelince görünür, çıkınca kaybolur', async () => {
    setup()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await userEvent.hover(screen.getByRole('button', { name: 'Düğme' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Açıklama')
    await userEvent.unhover(screen.getByRole('button', { name: 'Düğme' }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('sayfanın en üst katmanına (body) çizilir; bölüm kenarında kırpılmaz', async () => {
    const { container } = setup()
    await userEvent.hover(screen.getByRole('button', { name: 'Düğme' }))
    const tip = screen.getByRole('tooltip')
    expect(container.contains(tip)).toBe(false)
    expect(tip.parentElement).toBe(document.body)
  })

  it('tıklayınca ve Esc ile kapanır', async () => {
    setup()
    const button = screen.getByRole('button', { name: 'Düğme' })
    await userEvent.hover(button)
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await userEvent.unhover(button)
    await userEvent.hover(button)
    await userEvent.click(button)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
