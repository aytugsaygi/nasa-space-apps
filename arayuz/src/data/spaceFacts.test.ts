import { describe, expect, it } from 'vitest'
import { SOURCES } from '../core/sources'
import { SPACE_FACTS } from './spaceFacts'

describe('günün bilgisi', () => {
  it('her bilginin iki dilde metni ve kaynaklar listesinde kayıtlı bir NASA kaynağı var', () => {
    expect(SPACE_FACTS.length).toBeGreaterThanOrEqual(36)
    for (const f of SPACE_FACTS) {
      expect(f.text.tr.trim()).not.toBe('')
      expect(f.text.en.trim()).not.toBe('')
      const src = SOURCES[f.source]
      expect(src, f.text.en).toBeDefined()
      expect(src.url).toMatch(/^https:\/\/(www\.nasa\.gov|science\.nasa\.gov|humanresearchroadmap\.nasa\.gov|ntrs\.nasa\.gov|www\.asc-csa\.gc\.ca)\//)
    }
  })
})
