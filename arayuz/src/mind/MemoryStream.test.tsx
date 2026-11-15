import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MEMORY } from '../core/mindTraining'
import { dictFor, renderWithProviders } from '../test/render'
import { MemoryStream } from './MemoryStream'

/*
 * Regresyon: bloğun son öğesinde yapılan basış puana sayılmıyordu (blok sonunu zamanlayan efekt, basışların o adımın
 * başındaki listesini görüyordu). Dizi sabitlenir: tek eşleşme son öğededir.
 */
const SEQ = [0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1, 1]
vi.mock('../core/mindTraining', async (importOriginal) => ({ ...(await importOriginal<typeof import('../core/mindTraining')>()), makeNBack: () => [...SEQ] }))

afterEach(() => vi.useRealTimers())

describe('Bellek akışı', () => {
  it('son öğedeki eşleşmeye basış yakalanmış sayılır (hata yok, seviye artar)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const g = dictFor('tr').mindTraining.memory
    expect(SEQ).toHaveLength(MEMORY.baseItems + 1)
    renderWithProviders(<MemoryStream startLevel={1} onDone={() => {}} reduced />, { lang: 'tr' })
    // Son öğeye kadar ilerle, yalnızca orada bas
    for (let s = 0; s < SEQ.length - 1; s++) for (let t = 0; t < MEMORY.stepMs; t += 50) act(() => vi.advanceTimersByTime(50))
    expect(document.querySelector('[data-memory-grid]')).toHaveAttribute('data-memory-index', String(SEQ.length - 1))
    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByText(g.hit)).toBeInTheDocument()
    for (let t = 0; t < MEMORY.stepMs; t += 50) act(() => vi.advanceTimersByTime(50))
    // Blok sonu ekranı, çalışma ekranının çıkış geçişinden sonra gelir
    await act(async () => {})
    for (let t = 0; t < 600; t += 50) act(() => vi.advanceTimersByTime(50))
    expect(screen.getByText(g.errors(0))).toBeInTheDocument()
    expect(screen.getByText(g.up(2))).toBeInTheDocument()
  })
})
