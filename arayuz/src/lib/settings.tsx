import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export interface Settings {
  sound: boolean
  vibration: boolean
  voiceReply: boolean
  /** Seçilen sesli cevap sesi (SpeechSynthesisVoice.voiceURI); boşsa ilk Türkçe ses */
  voiceURI: string | null
  voiceRate: number
  voicePitch: number
  /** Asistanın sesi: kadın ya da erkek (cihazdaki seslerden seçilir) */
  voiceGender: 'female' | 'male'
}

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]

const KEY = 'vitalis.settings'
const DEFAULTS: Settings = { sound: true, vibration: true, voiceReply: false, voiceURI: null, voiceRate: 0.95, voicePitch: 1, voiceGender: 'female' }

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    // Eski sürümden kalan görünüm seçimi artık kullanılmıyor
    const { uiStyle: _unused, ...saved } = JSON.parse(raw) as Partial<Settings> & { uiStyle?: unknown }
    return { ...DEFAULTS, ...saved }
  } catch {
    return DEFAULTS
  }
}

const Ctx = createContext<{
  settings: Settings
  toggle: (key: BoolKey) => void
  update: (patch: Partial<Settings>) => void
} | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings))
  }, [settings])

  const toggle = useCallback((key: BoolKey) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }))
  }, [])
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  return <Ctx.Provider value={{ settings, toggle, update }}>{children}</Ctx.Provider>
}

export function useSettings() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSettings, SettingsProvider içinde kullanılmalı')
  return v
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fn = () => setReduced(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return reduced
}
