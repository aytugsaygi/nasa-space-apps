import { ArrowRight, Send, Vibrate } from 'lucide-react'
import type { Finding } from '../core/model'
import { SOURCES } from '../core/sources'
import { NasaBadge } from './NasaBadge'
import { resolve, useI18n } from '../i18n'
import { ALERT_META } from '../lib/status'
import { ToastClose } from './ToastClose'

const BORDER = {
  bilgi: 'border-holo/30',
  dikkat: 'border-warn/45',
  kritik: 'border-crit/55',
} as const

/**
 * Köşede beliren uyarı. Analizin bulduğu durumu gösterir: başlık, neden (sayılarla), ne yapmalı ve kaynak (U-11).
 * Önem seviyesi renk, ikon, etiket ve kenarlıkla ayrılır. Metin her çizimde seçili dile göre çözülür.
 */
export function AlertToast({
  finding,
  vibrate,
  onOpen,
  onGo,
  onDismiss,
}: {
  finding: Finding
  vibrate: boolean
  /** Bölgenin bilgi kartını açar (uyarı bir bölgeye bağlıysa) */
  onOpen?: () => void
  /** İlgili sayfaya gider */
  onGo?: () => void
  onDismiss: () => void
}) {
  const { lang, t } = useI18n()
  const level = finding.level
  const m = ALERT_META[level]
  const Icon = m.icon
  const critical = level === 'kritik'
  const src = finding.sources.find((s) => s !== 'vitalis')
  return (
    <div
      data-alert-level={level}
      className={`relative w-[min(400px,calc(100vw-2rem))] rounded-2xl border ${BORDER[level]} bg-raised/95 py-4 pr-11 pl-4 shadow-[0_24px_50px_-18px_rgb(0_0_0/0.9)] backdrop-blur-xl ${vibrate ? 'buzz' : ''}`}
      style={critical ? { boxShadow: `0 0 0 1px ${m.hex}33, 0 24px 50px -18px rgb(0 0 0 / 0.9), 0 0 40px -10px ${m.hex}66` } : undefined}
    >
      <div className="flex gap-3">
        <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${m.text}`} style={{ background: `${m.hex}1a` }}>
          <Icon size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-mono text-[12.5px] font-semibold tracking-[0.07em] uppercase ${m.text}`}>{t.alertLevel[level]}</span>
            {vibrate && (
              <span className="flex items-center gap-1 text-[12.5px] text-ink-dim">
                <Vibrate size={12} aria-hidden /> {t.toast.vibration}
              </span>
            )}
            {finding.notifyDoctor && critical && (
              <span className="flex items-center gap-1 text-[12.5px] text-ink-dim">
                <Send size={11} aria-hidden /> {t.alerts.notified}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[16.5px] font-semibold text-ink">{resolve(finding.title, lang)}</p>
          <p className="mt-1 text-[14.5px] leading-snug text-ink-muted">{resolve(finding.reason, lang)}</p>
          <p className="mt-1.5 text-[14.5px] leading-snug text-ink">
            <span className="font-semibold">{t.alerts.action} </span>
            {resolve(finding.action, lang)}
          </p>
          {src && (
            <a href={SOURCES[src].url} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[13px] text-ink-dim underline decoration-line-strong underline-offset-2 hover:text-holo">
              {t.alerts.source}: {SOURCES[src].org}
              <NasaBadge source={src} />
            </a>
          )}
          {(onOpen || onGo || critical) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onOpen && (
                <button type="button" onClick={onOpen} className="min-h-9 rounded-lg px-3 text-[14.5px] font-semibold text-void" style={{ background: m.hex }}>
                  {t.toast.openRegion}
                </button>
              )}
              {onGo && (
                <button type="button" onClick={onGo} className="flex min-h-9 items-center gap-1 rounded-lg border border-line-strong px-3 text-[14.5px] text-ink">
                  {t.alerts.goPage}
                  <ArrowRight size={13} aria-hidden />
                </button>
              )}
              <button type="button" onClick={onDismiss} className="min-h-9 rounded-lg border border-line-strong px-3 text-[14.5px] text-ink">
                {t.toast.dismiss}
              </button>
            </div>
          )}
        </div>
      </div>
      <ToastClose label={t.toast.closeAlert} onClose={onDismiss} />
    </div>
  )
}
