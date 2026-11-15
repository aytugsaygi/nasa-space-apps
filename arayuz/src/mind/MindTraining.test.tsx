import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MEMORY, SPATIAL, SPEED } from '../core/mindTraining'
import { SOURCES } from '../core/sources'
import { localBackend, type Backend } from '../data/backend'
import { dictFor, renderWithProviders } from '../test/render'
import { MindTrainingDialog } from './MindTraining'

/*
 * Zihin egzersizleri penceresi: liste, üç egzersizin akışı (sahte saatle), sonucun kaydı ve hekim görünümü.
 * Hızlı bakışta cevaptan sonraki geçiş, adım akışının temizliğiyle iptal edilip egzersiz takılıyordu: regresyon testi var.
 */

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

/** Kare saati de sahte (Hızlı bakışta gösterim süresi requestAnimationFrame ile ölçülür); saat gerçek zamanla da ilerler ki animasyon ve sorgular beklemesin */
const fakeTime = () =>
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
/** Saati küçük adımlarla ilerletir: her adımda React yeniden çizer ve yeni adımın zamanlayıcısı kurulur */
const tick = (ms: number) => {
  for (let t = 0; t < ms; t += 50) act(() => vi.advanceTimersByTime(Math.min(50, ms - t)))
}
/** Sözlerin (promise) çözülmesi için: kayıt ve sorgular eşzamansızdır */
const flush = () => act(async () => {})

function open(lang: 'tr' | 'en', backend: Backend = localBackend()) {
  renderWithProviders(<MindTrainingDialog open onClose={() => {}} />, { lang, backend })
  return { t: dictFor(lang), m: dictFor(lang).mindTraining, backend }
}

describe.each(['tr', 'en'] as const)('zihin egzersizleri (%s)', (lang) => {
  it('liste: üç egzersiz, her birinin alanı ve gerekçe kaynakları; egzersize girip geri dönülür', async () => {
    const { m } = open(lang)
    const dialog = await screen.findByRole('dialog', { name: m.title })
    for (const ex of ['speed', 'memory', 'spatial'] as const) {
      const card = within(dialog).getByRole('button', { name: m.open(m.names[ex]) })
      expect(card).toHaveTextContent(m.domains[ex])
      expect(card).toHaveTextContent(m.notTried)
    }
    expect(within(dialog).getByRole('heading', { name: m.whyTitle })).toBeInTheDocument()
    for (const id of ['mindIss', 'visuospatial', 'actSpeed', 'nbackMeta', 'spatialTraining'] as const) {
      expect(dialog.querySelector(`a[href="${SOURCES[id].url}"]`)).not.toBeNull()
    }
    fireEvent.click(within(dialog).getByRole('button', { name: m.open(m.names.spatial) }))
    expect(await within(dialog).findByRole('heading', { name: m.spaceTitle })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: m.start })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: m.backLabel }))
    expect(await within(dialog).findByRole('button', { name: m.open(m.names.speed) })).toBeInTheDocument()
  })

  it('Hızlı bakış: cevaptan sonra sıradaki deneme başlar; 20 deneme sonunda eşik süresi gösterilir ve kaydedilir', async () => {
    fakeTime()
    const { m, backend } = open(lang)
    fireEvent.click(await screen.findByRole('button', { name: m.open(m.names.speed) }))
    fireEvent.click(await screen.findByRole('button', { name: m.start }))
    await flush()
    for (let k = 0; k < SPEED.trials; k++) {
      // Bakış noktası → gösterim → maske → soru
      tick(2000)
      const stimulusSeen = document.querySelector('[data-speed-step]')?.getAttribute('data-speed-step')
      expect(stimulusSeen).toBe('center')
      fireEvent.keyDown(window, { key: '1' })
      expect(document.querySelector('[data-speed-step]')?.getAttribute('data-speed-step')).toBe('where')
      fireEvent.keyDown(window, { key: String((k % SPEED.slots) + 1) })
      // Geri bildirim bitince yeni deneme bakış noktasıyla başlar (önceden burada takılıyordu)
      tick(900)
      if (k < SPEED.trials - 1) expect(document.querySelector('[data-speed-step]')?.getAttribute('data-speed-step')).toBe('fixate')
    }
    await flush()
    const result = document.querySelector('[data-mind-result="speed"]')
    expect(result).not.toBeNull()
    expect(result).toHaveTextContent(m.speed.resultLabel)
    await flush()
    expect(result).toHaveTextContent(m.saved)
    const saved = await backend.call('mindSessions', 'yildiz')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ exercise: 'speed', trials: SPEED.trials })
    expect(saved[0].score).toBeGreaterThanOrEqual(SPEED.minMs)
  })

  it('Zihinde döndür: klavyeyle (← aynı, → ayna) cevaplanır; doğru cevaplar sayılır ve açı büyür', async () => {
    fakeTime()
    const { m, backend } = open(lang)
    fireEvent.click(await screen.findByRole('button', { name: m.open(m.names.spatial) }))
    fireEvent.click(await screen.findByRole('button', { name: m.start }))
    await flush()
    for (let k = 0; k < SPATIAL.trials; k++) {
      const kind = document.querySelector(`[data-spatial-index="${k}"]`)!.getAttribute('data-spatial-trial')
      fireEvent.keyDown(window, { key: kind === 'mirror' ? 'ArrowRight' : 'ArrowLeft' })
      expect(document.querySelector('[data-spatial-feedback]')?.getAttribute('data-spatial-feedback')).toBe('ok')
      tick(1000)
      await flush()
    }
    const result = document.querySelector('[data-mind-result="spatial"]')
    expect(result).not.toBeNull()
    expect(result?.querySelector('[data-mind-score]')).toHaveTextContent(`${SPATIAL.trials}/${SPATIAL.trials}`)
    await flush()
    const saved = await backend.call('mindSessions', 'yildiz')
    expect(saved[0]).toMatchObject({ exercise: 'spatial', score: SPATIAL.trials, accuracy: 1 })
  })

  it('Bellek akışı: eşleşmede basış yakalanır, eşleşme olmayanda yanlış sayılır; blok sonunda seviye kuralı uygulanır', async () => {
    const { m } = open(lang)
    fireEvent.click(await screen.findByRole('button', { name: m.open(m.names.memory) }))
    expect(await screen.findByText(m.memory.startsAt(1))).toBeInTheDocument()
    // Egzersiz boyunca saat yalnızca testin ilerlettiği kadar ilerler (gerçek zamanla kayarsa yanan pencere kaçırılabilir)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    fireEvent.click(screen.getByRole('button', { name: m.start }))
    tick(500)
    await flush()
    const seen: number[] = []
    let hit = false
    let falseAlarm = false
    for (let s = 0; s < MEMORY.baseItems + 1; s++) {
      const grid = document.querySelector('[data-memory-grid]')!
      const i = Number(grid.getAttribute('data-memory-index'))
      seen[i] = Number(grid.querySelector('[data-on]')?.getAttribute('data-memory-cell'))
      const match = i >= 1 && seen[i] === seen[i - 1]
      // Her eşleşmede ve bir kez de eşleşme olmayan öğede Boşluk
      if (match || (!falseAlarm && i >= 1)) {
        const first = !hit && !falseAlarm
        fireEvent.keyDown(window, { key: ' ' })
        // Basış anında kaydedilir (beklemeden denetlenir: bekleme sahte saati ilerletip akışı kaydırırdı)
        expect(document.querySelector('#memory-match')).toHaveAttribute('aria-pressed', 'true')
        // İlk basışta önceki geri bildirim yoktur: yenisi hemen görünür
        if (first) expect(screen.getByText(match ? m.memory.hit : m.memory.falseAlarm)).toBeInTheDocument()
        if (match) hit = true
        else falseAlarm = true
      }
      tick(MEMORY.stepMs)
    }
    expect(hit).toBe(true)
    // Bir yanlış basış, kaçırma yok: 3'ten az hata → seviye 2'ye çıkar
    tick(500)
    await flush()
    tick(500)
    expect(screen.getByText(m.memory.errors(1))).toBeInTheDocument()
    expect(screen.getByText(m.memory.up(2))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: m.memory.next }))
    await flush()
    expect(document.querySelector('[data-memory-level]')).toHaveTextContent(m.memory.level(2))
  })

  it('hekim görünümünde egzersiz denenir ama sonuç kaydedilmez; listede bunu söyleyen not var', async () => {
    localStorage.setItem('vitalis.profile', JSON.stringify({ role: 'surgeon', self: 'yildiz', viewing: 'yildiz' }))
    fakeTime()
    const { m, backend } = open(lang)
    expect(await screen.findByText(new RegExp(m.surgeonView.slice(0, 20)))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: m.open(m.names.spatial) }))
    fireEvent.click(await screen.findByRole('button', { name: m.start }))
    await flush()
    for (let k = 0; k < SPATIAL.trials; k++) {
      fireEvent.keyDown(window, { key: 'ArrowLeft' })
      tick(1000)
      await flush()
    }
    const result = document.querySelector('[data-mind-result="spatial"]')
    expect(result).not.toBeNull()
    await flush()
    expect(result).not.toHaveTextContent(m.saved)
    expect(await backend.call('mindSessions', 'yildiz')).toEqual([])
  })
})
