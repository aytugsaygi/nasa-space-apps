import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SettingsProvider } from '../lib/settings'
import { Sheet } from './Sheet'

/*
 * Hata (2026-11-13): odak etkisi onClose'a bağlıydı. Üst bileşen yeniden çizilip yeni bir onClose verince odak kapat
 * düğmesine kaçıyor, pencerede yazı yazılamıyordu (Kayıtlarım'daki günlük, hekim mesajı).
 */
let rerender: () => void = () => {}
function Host() {
  const [n, setN] = useState(0)
  rerender = () => setN((x) => x + 1)
  return (
    <Sheet open onClose={() => void n} title="Başlık" closeLabel="Kapat">
      <textarea aria-label="Not" />
    </Sheet>
  )
}

describe('Sheet', () => {
  it('üst bileşen yeniden çizilince yazı alanındaki odak kaybolmaz', async () => {
    render(
      <SettingsProvider>
        <Host />
      </SettingsProvider>,
    )
    // Açılışta odak kapat düğmesine gider (30 ms)
    await screen.findByRole('dialog')
    await new Promise((r) => setTimeout(r, 60))
    const note = screen.getByLabelText('Not')
    note.focus()
    act(() => rerender())
    await new Promise((r) => setTimeout(r, 60))
    expect(document.activeElement).toBe(note)
  })
})
