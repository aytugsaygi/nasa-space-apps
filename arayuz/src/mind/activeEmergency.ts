import type { AssistRequestDoc } from '../core/crewAssist'
import { useHealth, useQuery } from '../data/health'

/** Kişinin sonlandırılmamış acil durumu (en yenisi); yoksa null, henüz okunmadıysa undefined */
export function useActiveEmergency(): AssistRequestDoc | null | undefined {
  const { astronaut, canEdit } = useHealth()
  const mine = useQuery('assistRequests', astronaut && canEdit ? [astronaut] : null)
  if (!mine) return undefined
  return mine.find((r) => r.endedAt === undefined) ?? null
}
