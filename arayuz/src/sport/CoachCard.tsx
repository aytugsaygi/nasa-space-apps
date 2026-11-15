import { Megaphone, MessageCircleHeart, Timer } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { bodyPart, EXERCISES, type CheckinAnswer } from '../core/coach'
import type { RegionId } from '../core/model'
import { num } from '../core/tx'
import { useHealth, useQuery } from '../data/health'
import { resolve, useI18n } from '../i18n'
import type { StructureQuestion } from '../lib/assistant'
import { Tooltip } from '../components/Tooltip'
import type { IndicatorId } from '../core/catalog'

const BodyHeatmap = lazy(() => import('./BodyHeatmap'))

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * Spor koçu: dünden kalan bir şikayet varsa önce onu sorar ("Hâlâ sürüyor mu?") ve programı cevaba göre yeniden kurar.
 * Altında bugünün halkası (yapılan dakika, programdaki dakika ve günlük hedef; basınca gösterge gezgininde Spor grafiği
 * açılır) ve ana sayfadaki anatomi modelinin önden-arkadan küçük hali: bugün yapılan hareketlerin yüküne göre ısı haritası
 * (çalışmayan renksiz, orta sarı, çok kırmızı). En altta uyum ve kemik kaybı tahmini.
 */
export function CoachCard({ onAsk, onOpenChart }: { onAsk: (q: string, s?: StructureQuestion) => void; onOpenChart: (id: IndicatorId) => void }) {
  const { t, lang } = useI18n()
  const { astronaut, canEdit, snapshot, mutate } = useHealth()
  const checkin = useQuery('checkin', astronaut ? [astronaut] : null)
  const program = useQuery('program', astronaut ? [astronaut] : null)
  const [answered, setAnswered] = useState<CheckinAnswer | null>(null)

  /*
   * Isı: her bölgenin bugün yapılan hareketlerden aldığı yük (yük ağırlığı × dakika). Ölçek, programın tamamı
   * yapılsaydı en çok yüklenecek bölgedir: program bitince o bölge kırmızıya ulaşır.
   */
  const heat = useMemo(() => {
    const done: Partial<Record<RegionId, number>> = {}
    const planned: Partial<Record<RegionId, number>> = {}
    for (const it of program?.items ?? []) {
      for (const [r, w] of Object.entries(EXERCISES[it.exercise].load) as [RegionId, number][]) {
        planned[r] = (planned[r] ?? 0) + w * it.minutes
        if (it.done) done[r] = (done[r] ?? 0) + w * it.minutes
      }
    }
    const max = Math.max(1, ...Object.values(planned))
    return Object.fromEntries(Object.entries(done).map(([r, v]) => [r, Math.min(1, v / max)])) as Partial<Record<RegionId, number>>
  }, [program])
  const webgl = useMemo(() => hasWebGL(), [])

  const answer = (a: CheckinAnswer) => {
    if (!astronaut || !checkin) return
    void mutate('answerCheckin', astronaut, checkin.id, a)
    setAnswered(a)
  }

  const ex = snapshot?.exercise
  const names = (test: (h: number) => boolean) =>
    REGIONS.filter((r) => test(heat[r] ?? 0))
      .map((r) => resolve(bodyPart(r, 'both'), lang))
      .join(', ')
  const top = REGIONS.filter((r) => (heat[r] ?? 0) > 0)
    .sort((a, b) => (heat[b] ?? 0) - (heat[a] ?? 0))
    .slice(0, 2)
    .map((r) => resolve(bodyPart(r, 'both'), lang))
  const bodyLabel = t.sport.bodyLabel(names((h) => h >= 0.6), names((h) => h > 0 && h < 0.6), names((h) => h === 0))

  return (
    <section id="tour-coach" aria-labelledby="coach-title" className="@container panel flex size-full min-h-0 flex-col gap-3 overflow-hidden !rounded-3xl p-5">
      {/* Dar kartta düğmeler başlığın altına iner; başlık ve düğme yazıları tek satırda kalır */}
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <h2 id="coach-title" className="flex items-center gap-2 font-display text-[18px] font-semibold whitespace-nowrap">
          <Megaphone size={17} className="text-holo" aria-hidden />
          {t.sport.coachTitle}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => onAsk(t.sport.questionShort)} className="flex min-h-9 items-center gap-1.5 rounded-xl whitespace-nowrap border border-line px-2.5 text-[14px] text-ink-muted hover:border-holo/40 hover:text-holo">
            <Timer size={13} aria-hidden />
            {t.sport.askShort}
          </button>
          <button type="button" onClick={() => onAsk(t.sport.questionProgram)} className="flex min-h-9 items-center gap-1.5 rounded-xl whitespace-nowrap bg-holo/10 px-2.5 text-[14px] font-semibold text-holo ring-1 ring-holo/30 hover:bg-holo/15">
            <MessageCircleHeart size={13} aria-hidden />
            {t.sport.askProgram}
          </button>
        </div>
      </header>

      {/* Dünden kalan şikayet sorusu */}
      {checkin && !answered && (
        <div id="coach-checkin" role="group" aria-label={t.sport.coachTitle} className="rounded-2xl border border-holo/35 bg-holo/[0.06] p-3">
          <p className="text-[15px] leading-snug text-ink">
            {t.sport.checkinQ(t.hologram.symptomPhrase[checkin.symptom], resolve(bodyPart(checkin.region, checkin.side), lang), checkin.severity)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(['same', 'better', 'gone'] as CheckinAnswer[]).map((a) => (
              <button
                key={a}
                type="button"
                disabled={!canEdit}
                onClick={() => answer(a)}
                className="min-h-9 rounded-xl border border-line-strong px-3 text-[14.5px] text-ink transition-colors hover:border-holo/50 hover:bg-holo/10 disabled:opacity-50"
              >
                {t.sport.answers[a]}
              </button>
            ))}
          </div>
        </div>
      )}
      {answered && (
        <p role="status" className="rounded-2xl border border-ok/30 bg-ok/[0.06] px-3 py-2 text-[14.5px] text-ink">
          {t.sport.checkinDone[answered]}
        </p>
      )}

      {/* Bugünün halkası (basınca Spor grafiği) ve ısı haritası */}
      <div className="flex min-h-40 flex-1 items-stretch gap-4 @max-[26rem]:gap-3">
        {ex && (
          <Tooltip label={t.sport.ringTip} side="top" className="my-auto aspect-square h-28 shrink-0 @max-[30rem]:h-24">
            <button
              type="button"
              data-coach-ring
              onClick={() => onOpenChart('exercise')}
              aria-label={`${t.sport.ringLabel(ex.todayMin, ex.plannedMin, ex.targetMin)} ${t.sport.ringTip}`}
              className="group relative block size-full rounded-full transition-transform duration-200 hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-holo motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              <TodayRing done={ex.todayMin} planned={ex.plannedMin} target={ex.targetMin} targetText={`/ ${t.sport.minutes(ex.targetMin)}`} unit={t.sport.today} />
            </button>
          </Tooltip>
        )}
        <figure data-coach-body className="m-0 flex h-full min-w-0 flex-1 items-stretch gap-3">
          {/* İki figür alanın dörtte bir ve dörtte üç noktalarında; altlarında hale ve Ön / Arka yazısı */}
          <div className="relative flex h-full min-h-40 min-w-40 flex-1 flex-col">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-4 h-2/5"
              style={{
                background:
                  'radial-gradient(closest-side at 25% 85%, rgb(111 233 214 / 0.16), transparent), radial-gradient(closest-side at 75% 85%, rgb(111 233 214 / 0.16), transparent)',
              }}
            />
            <div className="relative min-h-0 flex-1">
              {webgl ? (
                <Suspense fallback={null}>
                  <BodyHeatmap heat={heat} label={bodyLabel} />
                </Suspense>
              ) : (
                <p className="text-[14px] text-ink-muted">{bodyLabel}</p>
              )}
            </div>
            <div className="grid shrink-0 grid-cols-2 pt-1 text-center font-mono text-[12.5px] font-semibold tracking-[0.1em] text-ink-muted uppercase" aria-hidden>
              <span>{t.sport.front}</span>
              <span>{t.sport.back}</span>
            </div>
          </div>
          <figcaption className="my-auto w-32 shrink-0 space-y-2 @max-[34rem]:hidden">
            <p className="font-mono text-[12.5px] font-semibold tracking-[0.07em] text-ink-dim uppercase">{t.sport.bodyTitle}</p>
            <div aria-hidden>
              <div className="h-2 rounded-full shadow-[0_0_10px_rgb(255_120_80/0.35)]" style={{ background: 'linear-gradient(90deg, #4fa9cf, #f7c35c 50%, #ff4d4d)' }} />
              <div className="mt-1 flex justify-between text-[12.5px] text-ink-dim">
                <span>{t.sport.heat.low}</span>
                <span>{t.sport.heat.high}</span>
              </div>
            </div>
            <p className="flex items-center gap-2 text-[13.5px] text-ink-muted" aria-hidden>
              <span className="size-2.5 shrink-0 rounded-full border border-[#4fa9cf] bg-[#4fa9cf]/30" />
              {t.sport.heat.none}
            </p>
            {/* En çok çalışan iki bölge (ya da henüz hareket yapılmadığı) */}
            <p data-heat-top className="text-[13.5px] leading-snug text-ink" aria-hidden>
              {top.length ? t.sport.heatTop(top.join(', ')) : t.sport.heatEmpty}
            </p>
          </figcaption>
        </figure>
      </div>

      {snapshot && (
        <p className="text-[14px] leading-snug text-ink-muted">
          {t.sport.adherence(Math.round(snapshot.bone.adherence * 100))} · {t.sport.bone(num(snapshot.bone.estimatedLossPct, lang, 1), num(snapshot.bone.withoutExercisePct, lang, 1))}
        </p>
      )}
    </section>
  )
}

const REGIONS: RegionId[] = ['bas', 'gogus', 'sirt', 'ustKol', 'onKol', 'eller', 'bacaklar', 'ayaklar']

/**
 * Bugünün halkası: dış halka yapılan dakikayı, arkadaki soluk halka programdaki dakikayı günlük hedefe göre gösterir.
 * Hedefe ulaşınca halka yeşile döner.
 */
function TodayRing({ done, planned, target, targetText, unit }: { done: number; planned: number; target: number; targetText: string; unit: string }) {
  const r = 42
  const c = 2 * Math.PI * r
  const frac = (v: number) => Math.max(0, Math.min(1, target ? v / target : 0))
  const reached = done >= target
  return (
    <div className="relative size-full" aria-hidden>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="7" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-holo)" strokeOpacity="0.22" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${frac(planned) * c} ${c}`} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={reached ? 'var(--color-ok)' : 'var(--color-holo)'}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac(done))}
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
          style={{ filter: `drop-shadow(0 0 4px ${reached ? 'var(--color-ok)' : 'var(--color-holo)'})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none" aria-hidden>
        <span className={`tabular font-display text-[26px] font-semibold ${reached ? 'text-ok' : 'text-ink'}`}>{done}</span>
        <span className="tabular mt-1 font-mono text-[12.5px] text-ink-dim">{targetText}</span>
        <span className="mt-0.5 text-[12.5px] text-ink-dim">{unit}</span>
      </div>
    </div>
  )
}
