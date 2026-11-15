import { Play } from 'lucide-react'
import type { CSSProperties, LiHTMLAttributes } from 'react'
import { HERO_BUTTON, HERO_TITLE, VideoBackdrop, type MindVideo } from './VideoBackdrop'

/*
 * Zihinsel sağlık sayfasının videolu kutusu (destek kütüphanesi ve "Kendini tanı"): afiş düzeni. Orta-altta çerçevesiz büyük
 * başlık; imleç gelince (ya da klavye odağı girince) açıklama ve süre belirir; altında Başlat. Henüz olmayan özellikte
 * düğme yerine "Yakında" yazar. Kutu bir liste öğesidir (li).
 */
export function VideoTile({
  video,
  active,
  title,
  desc,
  meta,
  action,
  soon,
  ...li
}: {
  video: MindVideo
  /** Sayfa açık mı (video yalnızca açık sayfada oynar) */
  active: boolean
  title: string
  desc: string
  meta?: string
  action?: { label: string; ariaLabel: string; onClick: () => void; disabled?: boolean }
  /** Henüz olmayan özellik: düğme yerine bu yazı */
  soon?: string
} & LiHTMLAttributes<HTMLLIElement>) {
  return (
    <li {...li} className="reveal-tile @container relative isolate flex min-h-0 flex-col overflow-hidden rounded-xl border border-line p-4">
      <VideoBackdrop name={video} active={active} />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-end pb-1 text-center">
        {/* Dar kutuda (ör. "Kendini tanı" dörtlüsü) başlık tek satırda kalır ve genişliğe göre küçülür; açıklama en çok iki satırdır (en dar kutuda bir satır).
            Böylece imleç gelince açılan açıklama başlığı kutunun dışına itmez. */}
        <h3 className={`${HERO_TITLE} @max-[15rem]:text-[length:7.6cqi] @max-[15rem]:whitespace-nowrap`}>{title}</h3>
        <div className="reveal-rows w-full">
          <div className="[text-shadow:0_1px_4px_rgb(0_0_0/0.85)]">
            <p className="reveal-line mx-auto line-clamp-2 max-w-[26rem] pt-2.5 text-[14.5px] leading-snug text-white/90 @max-[24rem]:pt-1.5 @max-[24rem]:text-[13.5px] @max-[13rem]:line-clamp-1">{desc}</p>
            {meta && (
              <p className="reveal-line tabular pt-1 text-[14px] text-white/70 @max-[24rem]:hidden" style={{ '--i': 1 } as CSSProperties}>
                {meta}
              </p>
            )}
          </div>
        </div>
        {action && (
          <button type="button" onClick={action.onClick} disabled={action.disabled} aria-haspopup="dialog" aria-label={action.ariaLabel} className={`mt-4 ${HERO_BUTTON} disabled:cursor-not-allowed disabled:opacity-50 @max-[24rem]:mt-2.5`}>
            <Play size={14} className="fill-current" aria-hidden />
            {action.label}
          </button>
        )}
        {soon && <span className="mt-4 @max-[24rem]:mt-2.5 inline-flex min-h-9 items-center rounded-full bg-white/[0.1] px-4 text-[14px] font-medium text-white/80 backdrop-blur-md">{soon}</span>}
      </div>
    </li>
  )
}
