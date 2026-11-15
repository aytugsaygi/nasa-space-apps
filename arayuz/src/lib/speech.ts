import { useCallback, useEffect, useRef, useState } from 'react'
import { LOCALE, type Lang } from '../i18n'

/* Web Speech API'nin TypeScript'te hazır tipi yok; kullandığımız kadarını tanımlıyoruz. */
interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  onresult: ((e: RecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}
type RecognitionCtor = new () => Recognition

function getCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Konuşmayı seçilen dilde (tr-TR / en-US) yazıya çevirir. Metin otomatik gönderilmez;
 * kullanıcı düzeltip kendisi gönderir. Hata kodu arayüzde dile göre metne çevrilir.
 */
export type SpeechError = 'denied' | 'noSpeech' | 'failed'

export function useSpeechToText(onText: (text: string) => void, lang: Lang) {
  const supported = typeof window !== 'undefined' && !!getCtor()
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<SpeechError | null>(null)
  const rec = useRef<Recognition | null>(null)
  const cb = useRef(onText)
  cb.current = onText

  const stop = useCallback(() => rec.current?.stop(), [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) return
    setError(null)
    const r = new Ctor()
    r.lang = LOCALE[lang]
    r.interimResults = true
    r.continuous = false
    let finalText = ''
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText += res[0].transcript
        else interim += res[0].transcript
      }
      cb.current((finalText + interim).trim())
    }
    r.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'denied' : e.error === 'no-speech' ? 'noSpeech' : 'failed')
    }
    r.onend = () => setListening(false)
    rec.current = r
    r.start()
    setListening(true)
  }, [lang])

  useEffect(() => () => rec.current?.stop(), [])

  return { supported, listening, error, start, stop }
}

export interface VoiceOptions {
  voiceURI: string | null
  rate: number
  pitch: number
}

/** Cihazdaki seçilen dildeki sesler; liste tarayıcıya ve işletim sistemine göre değişir. */
export function useVoices(lang: Lang) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const read = () => {
      const all = window.speechSynthesis.getVoices()
      const list = all.filter((v) => v.lang.toLowerCase().startsWith(lang))
      // Doğal (bulut) sesler genellikle daha iyi; önce onları göster
      list.sort((a, b) => Number(/natural|online/i.test(b.name)) - Number(/natural|online/i.test(a.name)))
      setVoices(list)
    }
    read()
    window.speechSynthesis.addEventListener('voiceschanged', read)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', read)
  }, [lang])
  return voices
}

/* Ses adlarından cinsiyet tahmini (Windows, Edge, Chrome ve macOS'taki yaygın sesler) */
const FEMALE = /(emel|yelda|seda|filiz|zira|aria|jenny|michelle|hazel|susan|samantha|libby|sonia|ava|allison|female|kadın|google türkçe|google us english|google uk english female)/i
const MALE = /(tolga|ahmet|david|mark|guy|george|james|ryan|eric|daniel|alex|fred|male|erkek|google uk english male)/i

export type VoiceGender = 'female' | 'male'

/**
 * Dile ve cinsiyete göre ses seçer. O dilde istenen cinsiyette ses yoksa dilin ilk sesi kullanılır ve
 * "matched: false" döner (arayüz bunu kullanıcıya söyler).
 */
export function pickVoice(lang: Lang, gender: VoiceGender, preferredURI?: string | null): { voice: SpeechSynthesisVoice | null; matched: boolean } {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return { voice: null, matched: false }
  const all = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang))
  const byName = (re: RegExp) => all.filter((v) => re.test(v.name) && !(re === FEMALE ? MALE : FEMALE).test(v.name))
  const pool = byName(gender === 'female' ? FEMALE : MALE)
  // Doğal (bulut) sesler önce
  pool.sort((a, b) => Number(/natural|online/i.test(b.name)) - Number(/natural|online/i.test(a.name)))
  const preferred = pool.find((v) => v.voiceURI === preferredURI)
  if (preferred || pool[0]) return { voice: preferred ?? pool[0], matched: true }
  return { voice: all[0] ?? null, matched: false }
}

/** Tarayıcının sesleriyle seçilen dilde sesli cevap; bitince onEnd çağrılır */
export function speak(text: string, opts: VoiceOptions & { gender?: VoiceGender }, lang: Lang, onEnd?: () => void) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/[•\n]+/g, '. ').replace(/[✓🌙]/g, ''))
  u.lang = LOCALE[lang]
  u.rate = opts.rate
  u.pitch = opts.pitch
  const all = window.speechSynthesis.getVoices()
  const inLang = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith(lang)
  const picked = opts.gender ? pickVoice(lang, opts.gender, opts.voiceURI).voice : null
  // Kayıtlı ses başka bir dile aitse o dilin ilk sesi kullanılır
  const voice = picked ?? all.find((v) => v.voiceURI === opts.voiceURI && inLang(v)) ?? all.find(inLang)
  if (voice) u.voice = voice
  if (onEnd) {
    u.onend = onEnd
    u.onerror = onEnd
  }
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

/* ---------- Dikte (günlük): sürekli dinler, kesinleşen cümleleri ekler, mikrofon seviyesini ölçer ---------- */

export type DictationError = 'denied' | 'failed'

/**
 * Günlük için sesli yazma. Konuşma seçilen dilde yazıya çevrilir:
 * - Kesinleşen her parça onFinal ile bildirilir (metnin sonuna eklenir); henüz kesinleşmemiş kısım `interim` içindedir.
 * - Tarayıcı bir süre sessizlikten sonra tanımayı kapatır; kişi durdurmadıysa kendiliğinden yeniden başlatılır.
 * - Mikrofonun ses seviyesi ayrıca ölçülür (dalga görseli için, 0–1). Ölçüm için mikrofon izni gerekir; alınamazsa dikte
 *   yine çalışır, yalnızca görsel sakin kalır.
 * Not: Chrome ve Edge'de konuşma tanıma tarayıcının hizmetiyle yapılır; ses bu hizmete gidebilir (arayüz bunu söyler).
 */
export function useDictation(lang: Lang, onFinal: (text: string) => void) {
  const supported = typeof window !== 'undefined' && !!getCtor()
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<DictationError | null>(null)
  const [level, setLevel] = useState(0)
  const rec = useRef<Recognition | null>(null)
  const wanted = useRef(false)
  const cb = useRef(onFinal)
  cb.current = onFinal
  const meter = useRef<{ stream: MediaStream; ctx: AudioContext; raf: number } | null>(null)

  const stopMeter = () => {
    const m = meter.current
    if (!m) return
    cancelAnimationFrame(m.raf)
    m.stream.getTracks().forEach((tr) => tr.stop())
    void m.ctx.close().catch(() => {})
    meter.current = null
    setLevel(0)
  }

  const startMeter = async () => {
    if (meter.current || !navigator.mediaDevices?.getUserMedia) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      if (!wanted.current) {
        stream.getTracks().forEach((tr) => tr.stop())
        return
      }
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctor()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      let last = 0
      const tick = (now: number) => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (const v of data) sum += ((v - 128) / 128) ** 2
        const rms = Math.sqrt(sum / data.length)
        // Saniyede ~20 güncelleme yeter; konuşma seviyesi 0–1'e yayılır
        if (now - last > 50) {
          setLevel(Math.min(1, rms * 4.5))
          last = now
        }
        if (meter.current) meter.current.raf = requestAnimationFrame(tick)
      }
      meter.current = { stream, ctx, raf: requestAnimationFrame(tick) }
    } catch {
      /* izin yok ya da mikrofon yok: dikte yine çalışır, görsel sakin kalır */
    }
  }

  const begin = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) return
    const r = new Ctor()
    r.lang = LOCALE[lang]
    r.interimResults = true
    r.continuous = true
    r.onresult = (e) => {
      let pending = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) {
          const chunk = res[0].transcript.trim()
          if (chunk) cb.current(chunk)
        } else pending += res[0].transcript
      }
      setInterim(pending.trim())
    }
    r.onerror = (e) => {
      // Sessizlik bir hata değildir: dinleme sürer
      if (e.error === 'no-speech' || e.error === 'aborted') return
      wanted.current = false
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : 'failed')
    }
    r.onend = () => {
      setInterim('')
      if (wanted.current) {
        try {
          r.start()
          return
        } catch {
          /* yeniden başlatılamadı: dinleme biter */
        }
      }
      wanted.current = false
      setListening(false)
      stopMeter()
    }
    rec.current = r
    r.start()
  }, [lang])

  const start = useCallback(() => {
    if (!getCtor() || wanted.current) return
    setError(null)
    wanted.current = true
    setListening(true)
    begin()
    void startMeter()
    // stopMeter ve startMeter yalnızca ref'lere dokunur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [begin])

  const stop = useCallback(() => {
    wanted.current = false
    rec.current?.stop()
  }, [])

  useEffect(
    () => () => {
      wanted.current = false
      rec.current?.stop()
      stopMeter()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return { supported, listening, interim, error, level, start, stop }
}
