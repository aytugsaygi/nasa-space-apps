import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { GLASS_EASE as EASE } from '../components/GlassDialog'

/* Zihin egzersizlerinin ortak parçaları: sonuç özeti, sahne çerçevesi ve ilerleme çizgileri */

/** Egzersizin bittiğinde kabuğa verdiği özet: kaydedilen alanlar ve sonuç ekranındaki satırlar */
export interface MindSummary {
  score: number
  accuracy: number
  trials: number
  avgMs?: number
  endLevel?: number
  /** Sonuç ekranındaki küçük değerler (etiket, değer) */
  stats: { label: string; value: string }[]
}

/** Egzersizlerin ortak sahne çerçevesi: üstte ilerleme satırı, ortada egzersiz */
export function StageFrame({ top, children, label }: { top: ReactNode; children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="absolute inset-0 flex flex-col overflow-hidden rounded-[2rem] bg-white/[0.02] ring-1 ring-white/[0.06]">
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-4 px-6 pt-4">{top}</div>
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-5 sm:px-6">{children}</div>
    </div>
  )
}

/** İlerleme çizgileri: yapılanlar dolu, sıradaki hafif parlak */
export function ProgressDots({ total, done, label, reduced }: { total: number; done: number; label: string; reduced: boolean }) {
  return (
    <>
      <p className="tabular font-mono text-[12.5px] font-semibold tracking-[0.16em] whitespace-nowrap text-ink-dim uppercase">{label}</p>
      <div className="flex w-20 min-w-0 gap-1 sm:w-48" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <motion.span
              className="absolute inset-0 origin-left rounded-full bg-holo"
              initial={false}
              animate={{ scaleX: i < done ? 1 : 0 }}
              transition={{ duration: reduced ? 0 : 0.45, ease: EASE }}
            />
          </span>
        ))}
      </div>
    </>
  )
}
