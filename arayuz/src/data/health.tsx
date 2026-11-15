import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isCrewId, type CrewId } from '../core/crew'
import type { Finding, Snapshot } from '../core/model'
import type { RpcArgs, RpcName, RpcResult } from '../core/rpc'
import { connect, type Backend } from './backend'

/*
 * Sağlık verisinin arayüzdeki merkezi: backend bağlantısı, kimin verisinin görüntülendiği (rol), düzenli güncelleme.
 *
 * Roller:
 * - astronot: kendi verisini görür ve değiştirir (ölçüm, şikayet, su, ruh hali...)
 * - uçuş hekimi: önce mürettebat listesini görür; bir isme tıklayınca o astronotun arayüzünü salt okunur açar
 */

export type Role = 'astronaut' | 'surgeon'

export interface Profile {
  role: Role
  /** Astronot rolünde kullanıcının kendisi */
  self: CrewId
  /** Hekimin görüntülediği astronot (null: mürettebat listesi) */
  viewing: CrewId | null
}

interface HealthValue {
  backend: Backend | null
  profile: Profile
  setRole: (role: Role) => void
  setSelf: (id: CrewId) => void
  view: (id: CrewId | null) => void
  /** Arayüzün gösterdiği astronot (hekim listedeyken null) */
  astronaut: CrewId | null
  canEdit: boolean
  snapshot: Snapshot | null
  /** Her güncellemede artar; sorgular bununla yenilenir */
  version: number
  mutate: <K extends RpcName>(name: K, ...args: RpcArgs<K>) => Promise<RpcResult<K> | null>
  refresh: () => void
  /**
   * Yeni uyarılar için dinleyici. initial: oturumun ilk güncellemesi (uygulama kapalıyken oluşmuş durumlar);
   * bunlar bildirim olarak açılmaz, okunmamış olarak kaydedilir.
   */
  onFresh: (fn: (f: Finding[], initial: boolean) => void) => () => void
}

const Ctx = createContext<HealthValue | null>(null)
const KEY = 'vitalis.profile'
/** Düzenli güncelleme aralığı */
const TICK_MS = 5000

function loadProfile(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Profile> | null
    if (raw) {
      return {
        role: raw.role === 'surgeon' ? 'surgeon' : 'astronaut',
        self: isCrewId(raw.self) ? raw.self : 'yildiz',
        viewing: isCrewId(raw.viewing) ? raw.viewing : null,
      }
    }
  } catch {
    /* varsayılan */
  }
  return { role: 'astronaut', self: 'yildiz', viewing: null }
}

/** initialProfile: testlerde iki ayrı mürettebat istemcisini aynı sayfada kurmak için (varsayılan: kayıtlı profil) */
export function HealthProvider({ children, backend: injected, initialProfile }: { children: ReactNode; backend?: Backend; initialProfile?: Profile }) {
  const [backend, setBackend] = useState<Backend | null>(injected ?? null)
  const [profile, setProfile] = useState<Profile>(() => initialProfile ?? loadProfile())
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [version, setVersion] = useState(0)
  const listeners = useRef(new Set<(f: Finding[], initial: boolean) => void>())
  /** Oturumun ilk başarılı güncellemesi yapıldı mı */
  const firstTickDone = useRef(false)

  useEffect(() => {
    if (injected) return
    let live = true
    void connect().then((b) => live && setBackend(b))
    return () => {
      live = false
    }
  }, [injected])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(profile))
    } catch {
      /* yoksay */
    }
  }, [profile])

  const astronaut = profile.role === 'astronaut' ? profile.self : profile.viewing
  const canEdit = profile.role === 'astronaut'

  const tick = useCallback(async () => {
    if (!backend || !astronaut) return
    try {
      // Hekim görüntülerken astronota gelen mürettebat uyarıları "gösterildi" sayılmaz
      const { snapshot: s, fresh, incoming } = await backend.call('tick', astronaut, canEdit ? 'astronaut' : 'surgeon')
      setSnapshot(s)
      setVersion((v) => v + 1)
      const all = [...fresh, ...incoming]
      const initial = !firstTickDone.current
      firstTickDone.current = true
      if (all.length && canEdit) for (const fn of listeners.current) fn(all, initial)
    } catch {
      /* Geçici bağlantı hatası: bir sonraki turda yeniden denenir */
    }
  }, [backend, astronaut, canEdit])

  useEffect(() => {
    setSnapshot(null)
    void tick()
    const timer = setInterval(() => void tick(), TICK_MS)
    return () => clearInterval(timer)
  }, [tick])

  const mutate = useCallback(
    async <K extends RpcName>(name: K, ...args: RpcArgs<K>): Promise<RpcResult<K> | null> => {
      if (!backend) return null
      const result = await backend.call(name, ...args)
      await tick()
      return result
    },
    [backend, tick],
  )

  const value = useMemo<HealthValue>(
    () => ({
      backend,
      profile,
      setRole: (role) => setProfile((p) => ({ ...p, role, viewing: role === 'surgeon' ? null : p.viewing })),
      setSelf: (self) => setProfile((p) => ({ ...p, self })),
      view: (viewing) => setProfile((p) => ({ ...p, viewing })),
      astronaut,
      canEdit,
      snapshot,
      version,
      mutate,
      refresh: () => void tick(),
      onFresh: (fn) => {
        listeners.current.add(fn)
        return () => listeners.current.delete(fn)
      },
    }),
    [backend, profile, astronaut, canEdit, snapshot, version, mutate, tick],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useHealth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useHealth, HealthProvider içinde kullanılmalı')
  return v
}

/**
 * Backend'den veri okur; her güncellemede (version) yenilenir. args null ise sorgu yapılmaz.
 * Son başarılı sonuç, yenisi gelene kadar gösterilir (titreme olmaz).
 */
export function useQuery<K extends RpcName>(name: K, args: RpcArgs<K> | null): RpcResult<K> | null {
  const { backend, version } = useHealth()
  const [data, setData] = useState<RpcResult<K> | null>(null)
  const key = JSON.stringify(args)
  const lastKey = useRef(key)
  useEffect(() => {
    if (!backend || !args) return
    // Parametre değişince eski sonuç gösterilmez
    if (lastKey.current !== key) {
      lastKey.current = key
      setData(null)
    }
    let live = true
    backend
      .call(name, ...args)
      .then((d) => live && setData(d))
      .catch(() => {})
    return () => {
      live = false
    }
    // args, key üzerinden izlenir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, version, name, key])
  return data
}

/** NASA verisi (DONKI, EPIC, OSDR); bir kez okunur */
export function useNasa<T>(name: 'donki' | 'epic' | 'osdr-blood'): T | null {
  const { backend } = useHealth()
  const [data, setData] = useState<T | null>(null)
  useEffect(() => {
    if (!backend) return
    let live = true
    backend
      .nasa<T>(name)
      .then((d) => live && setData(d))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [backend, name])
  return data
}
