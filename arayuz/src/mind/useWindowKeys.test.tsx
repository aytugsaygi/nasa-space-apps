import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useWindowKeys } from './useWindowKeys'

function Probe({ onKey }: { onKey: (e: KeyboardEvent) => void }) {
  useWindowKeys(onKey)
  return null
}

describe('useWindowKeys', () => {
  it('dinleyici bir kez bağlanır ve her zaman son çizimdeki işleyiciyi çağırır', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const first = vi.fn()
    const second = vi.fn()
    const { rerender, unmount } = render(<Probe onKey={first} />)
    rerender(<Probe onKey={second} />)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1)
    unmount()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(second).toHaveBeenCalledTimes(1)
    add.mockRestore()
  })
})
