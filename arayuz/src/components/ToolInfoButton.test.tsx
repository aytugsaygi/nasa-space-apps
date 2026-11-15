import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ToolInfoButton } from './ToolInfoButton'

/*
 * Bölüm açıklaması yalnızca istenince açılır: ⓘ düğmesine gelince ya da klavyeyle odaklanınca görünür, tıklayınca açık
 * kalır; Esc ya da dışarı tıklama kapatır. Kendiliğinden açılmaz.
 */
describe('ToolInfoButton', () => {
  const setup = () => {
    render(
      <>
        <ToolInfoButton title="Vücut haritası" what="Vücudun 3D haritası." how={['Bir bölgeye tıkla.']} howLabel="Nasıl kullanılır" label="Vücut haritası: bu bölüm ne işe yarar?" />
        <button type="button">dışarı</button>
      </>,
    )
    return screen.getByRole('button', { name: 'Vücut haritası: bu bölüm ne işe yarar?' })
  }

  it('başta kapalıdır; klavyeyle odaklanınca açılır ve düğmeyi tarif eder, Esc kapatır', async () => {
    const user = userEvent.setup()
    const button = setup()
    expect(screen.queryByRole('tooltip')).toBeNull()
    await user.tab()
    expect(button).toHaveFocus()
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Vücudun 3D haritası.')
    expect(tip).toHaveTextContent('Nasıl kullanılır')
    expect(tip).toHaveTextContent('Bir bölgeye tıkla.')
    expect(button).toHaveAccessibleDescription(/Vücudun 3D haritası/)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('tıklayınca açık kalır; yeniden tıklama ya da dışarı tıklama kapatır', async () => {
    const user = userEvent.setup()
    const button = setup()
    await user.click(button)
    await user.unhover(button)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'dışarı' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
    await user.click(button)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await user.click(button)
    await user.unhover(button)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
