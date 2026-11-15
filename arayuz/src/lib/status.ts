import { AlertOctagon, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react'
import type { AlertLevel, Status } from '../data/types'

/**
 * Durum her zaman renk + ikon + yazı üçlüsüyle gösterilir.
 * Yazılar dile bağlıdır: t.status[durum] ve t.alertLevel[seviye].
 */
export const STATUS_META: Record<Status, { icon: LucideIcon; text: string; bg: string; ring: string; hex: string }> = {
  normal: { icon: CheckCircle2, text: 'text-ok', bg: 'bg-ok/10', ring: 'ring-ok/30', hex: '#5ee39a' },
  dikkat: { icon: AlertTriangle, text: 'text-warn', bg: 'bg-warn/10', ring: 'ring-warn/35', hex: '#f7c35c' },
  kritik: { icon: AlertOctagon, text: 'text-crit', bg: 'bg-crit/12', ring: 'ring-crit/40', hex: '#ff7a7a' },
}

export const ALERT_META: Record<AlertLevel, { icon: LucideIcon; text: string; hex: string }> = {
  bilgi: { icon: Info, text: 'text-holo', hex: '#6fe9d6' },
  dikkat: { icon: AlertTriangle, text: 'text-warn', hex: '#f7c35c' },
  kritik: { icon: AlertOctagon, text: 'text-crit', hex: '#ff7a7a' },
}
