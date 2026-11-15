import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CrewId } from '../core/crew'
import type { AssistRequestDoc } from '../core/crewAssist'
import { Engine } from '../core/engine'
import { dispatch } from '../core/rpc'
import { MemoryStore } from '../core/store'
import type { Backend } from '../data/backend'
import { HealthProvider, useHealth, type Profile } from '../data/health'
import { LanguageProvider } from '../i18n'
import { closeCrewAssist, openCrewAssist } from '../lib/emergencyFlow'
import { clearEmergencyNotices } from '../lib/emergencyNotices'
import { resetInteractions } from '../lib/interaction'
import { SettingsProvider } from '../lib/settings'
import { dictFor } from '../test/render'
import { EmergencyDock } from './CrewAssist'
import { EmergencyDialog } from './EmergencyDialog'

/*
 * Acil durum (üst çubuktaki düğme), ayrı istemcilerle (docs/wellbeing EM-03, EM-04): bildiren E. Yıldız, alıcı K. Mori ve
 * uçuş hekimi ayrı sağlayıcılarla, ayrı kimlikle kurulur ve aynı sunucu motoruna bağlanır. Ağ kesintisi ve sunucu hatası
 * backend katmanında taklit edilir.
 */

const t = dictFor('tr')
const a = t.mindPage.assist
const s = t.mindPage.sos

let now = Date.UTC(2026, 10, 12, 9, 0)
let engine: Engine
const net = { down: false, serverError: false }

function client(mode: 'server' | 'local' = 'server'): Backend {
  return {
    mode,
    async call(name, ...args) {
      if (net.down) throw new TypeError('Failed to fetch')
      if (net.serverError && name === 'sendAssistRequest') throw new Error('500')
      return structuredClone(dispatch(engine, name, args as unknown[]))
    },
    nasa: () => Promise.reject(new Error('yok')),
    importData: () => Promise.reject(new Error('yok')),
  }
}

type Who = CrewId | 'surgeon'
const refreshers = new Map<Who, () => void>()
function Grab({ who }: { who: Who }) {
  refreshers.set(who, useHealth().refresh)
  return null
}

function Client({ who, backend, children }: { who: Who; backend: Backend; children: ReactNode }) {
  const profile: Profile = who === 'surgeon' ? { role: 'surgeon', self: 'yildiz', viewing: 'yildiz' } : { role: 'astronaut', self: who, viewing: null }
  return (
    <LanguageProvider>
      <SettingsProvider>
        <HealthProvider backend={backend} initialProfile={profile}>
          <Grab who={who} />
          {children}
        </HealthProvider>
      </SettingsProvider>
    </LanguageProvider>
  )
}

/** Her istemcinin sağ alttaki bildirim bölgesi ayrı bir kapta (hangi ekranda göründüğü sorgulanabilsin) */
function renderClients(mode: 'server' | 'local' = 'server') {
  render(
    <>
      <Client who="yildiz" backend={client(mode)}>
        <EmergencyDialog />
        <div data-screen="yildiz">
          <EmergencyDock />
        </div>
      </Client>
      <Client who="mori" backend={client(mode)}>
        <div data-screen="mori">
          <EmergencyDock />
        </div>
      </Client>
      <Client who="surgeon" backend={client(mode)}>
        <div data-screen="surgeon">
          <EmergencyDock />
        </div>
      </Client>
    </>,
  )
}

const screenOf = (who: Who) => document.querySelector<HTMLElement>(`[data-screen="${who}"]`)!
/** Mürettebatın ekranının ortasındaki acil durum kutusu (sayfanın üstünde, portal ile) */
const modalOf = (who: CrewId) => document.querySelector<HTMLElement>(`[data-assist-modal="${who}"]`)
const findModal = async (who: CrewId) => {
  await waitFor(() => expect(modalOf(who)).not.toBeNull())
  return modalOf(who)!
}
const refresh = (who: Who) => act(() => refreshers.get(who)!())
const requests = () => engine.store.list<AssistRequestDoc>('assists')
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)))

async function openSender() {
  act(() => openCrewAssist())
  return screen.findByRole('dialog', { name: s.title })
}

/** Klavyede Boşluk basılı tutulur ve bırakılır */
async function holdFor(dialog: HTMLElement, ms: number) {
  const button = await within(dialog).findByRole('button', { name: s.hold })
  button.focus()
  fireEvent.keyDown(button, { key: ' ' })
  await wait(ms)
  fireEvent.keyUp(button, { key: ' ' })
}

async function activate() {
  const dialog = await openSender()
  await holdFor(dialog, 600)
  await screen.findByRole('dialog', { name: s.activeTitle })
  return screen.getByRole('dialog', { name: s.activeTitle })
}

beforeEach(() => {
  localStorage.setItem('vitalis.lang', 'tr')
  localStorage.removeItem('vitalis.assistSeen')
  now = Date.UTC(2026, 10, 12, 9, 0)
  engine = new Engine(new MemoryStore(), () => now, { transport: 'server' })
  net.down = false
  net.serverError = false
  resetInteractions()
  closeCrewAssist()
  clearEmergencyNotices()
  refreshers.clear()
})
afterEach(() => {
  closeCrewAssist()
  clearEmergencyNotices()
})

describe('acil durum: basılı tutarak etkinleştirme', () => {
  it('pencereyi açmak ve kısa basmak hiçbir şey göndermez; "biraz daha basılı tutun" denir', async () => {
    renderClients()
    const dialog = await openSender()
    expect(within(dialog).getByText(s.armLead)).toBeInTheDocument()
    expect(within(dialog).getByText(s.releaseSafe)).toBeInTheDocument()
    await holdFor(dialog, 150)
    expect(await within(dialog).findByText(s.tooShort)).toBeInTheDocument()
    // Fare ile kısa basış da göndermez
    const button = within(dialog).getByRole('button', { name: s.hold })
    fireEvent.pointerDown(button)
    await wait(200)
    fireEvent.pointerUp(button)
    expect(requests()).toHaveLength(0)
    expect(screenOf('yildiz').querySelector('[data-sos-notice]')).toBeNull()
  })

  it('yarım saniye basılı tutunca etkinleşir: bildirenin ekranında sağ altta tek bildirim; mürettebatın ekranının ortasında kutu, hekimde sağ altta bildirim; alındı ve "geliyorum" döner', async () => {
    const user = userEvent.setup()
    renderClients()
    const dialog = await activate()
    expect(requests()).toHaveLength(1)
    expect(dialog.querySelector('[data-sos-notified]')).toHaveTextContent(s.notified('x').replace(' · x', ''))
    expect(within(dialog).getByText(s.prompt)).toBeInTheDocument()
    // Bildirenin kendi ekranı: bir olay = tek bildirim
    const own = within(screenOf('yildiz')).getAllByRole('alertdialog')
    expect(own).toHaveLength(1)
    expect(own[0]).toHaveTextContent(s.noticeStart('E. Yıldız'))
    expect(own[0]).toHaveTextContent(s.noticeTo)

    // Mürettebat (Mori) yoklar: ekranın ortasında kutu açılır (sağ altta ayrıca bildirim yok); alındı onayı Mori'nin uygulamasından gider
    now += 5000
    await refresh('mori')
    const card = await findModal('mori')
    expect(card).toHaveAccessibleName(a.inboxTitle('E. Yıldız'))
    expect(card).toHaveAttribute('aria-modal', 'true')
    expect(card).toHaveAttribute('data-assist-request', requests()[0].requestId)
    await waitFor(() => expect(within(card).getByRole('button', { name: s.modalOk })).toHaveFocus())
    expect(within(screenOf('mori')).queryAllByRole('alertdialog')).toHaveLength(0)
    await waitFor(() => expect(requests()[0].deliveries.mori).toMatchObject({ transport: 'server' }))

    // Sağlık ekibi (uçuş hekimi görünümü) de görür; yanıt düğmesi yalnızca mürettebatta
    await refresh('surgeon')
    const doc = await within(screenOf('surgeon')).findByRole('alertdialog', { name: a.inboxTitle('E. Yıldız') })
    expect(within(doc).queryByRole('button', { name: a.ack })).toBeNull()

    await refresh('yildiz')
    await waitFor(() => expect(dialog.querySelector('[data-recipient="mori"]')).toHaveAttribute('data-state', 'received'))
    now += 60_000
    await user.click(within(card).getByRole('button', { name: a.ack }))
    await waitFor(() => expect(within(card).getByRole('status')).toHaveTextContent(a.acked))
    await refresh('yildiz')
    await waitFor(() => expect(dialog.querySelector('[data-recipient="mori"]')).toHaveAttribute('data-state', 'coming'))
    expect(dialog.querySelector('[data-recipient="medical"]')).toBeInTheDocument()
  })

  it('cevap (yazarak da) acil duruma eklenir ve mürettebatın bildiriminde görünür', async () => {
    const user = userEvent.setup()
    renderClients()
    const dialog = await activate()
    await user.type(within(dialog).getByLabelText(s.typeLabel), 'Başım dönüyor{Enter}')
    await waitFor(() => expect(dialog.querySelector('[data-said="ok"]')).toHaveTextContent('Başım dönüyor'))
    expect(requests()[0].notes?.map((n) => n.text)).toEqual(['Başım dönüyor'])
    await refresh('mori')
    expect(await findModal('mori')).toHaveTextContent(a.inboxNote('Başım dönüyor'))
  })

  it('sonlandırınca "kapatıldı" ekranı; bildirenin ve alıcının ekranında tek "kapattı" bildirimi', async () => {
    const user = userEvent.setup()
    renderClients()
    const dialog = await activate()
    await refresh('mori')
    await findModal('mori')
    now += 120_000
    await user.click(within(dialog).getByRole('button', { name: s.end }))
    expect(await within(dialog).findByText(s.endedTitle)).toBeInTheDocument()
    expect(requests()[0].endedAt).toBe(now)
    // Bildirenin ekranında açılış bildirimi kalkar, yerine kapanış gelir
    const own = within(screenOf('yildiz')).getAllByRole('alertdialog')
    expect(own).toHaveLength(1)
    expect(own[0]).toHaveTextContent(s.noticeEnd('E. Yıldız'))
    await refresh('mori')
    // Kapanış sağ altta; ortadaki kutu kalkar (bir olay = tek kutu)
    await waitFor(() => expect(within(screenOf('mori')).getByRole('alertdialog', { name: a.inboxEnded('E. Yıldız') })).toBeInTheDocument())
    await waitFor(() => expect(modalOf('mori')).toBeNull())
    expect(within(screenOf('mori')).getAllByRole('alertdialog')).toHaveLength(1)
    // Yeniden açınca yeni bir acil durum başlatılabilir
    await user.click(within(dialog).getByRole('button', { name: s.done }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const again = await openSender()
    expect(await within(again).findByRole('button', { name: s.hold })).toBeInTheDocument()
  })

  it('açılışını hiç görmediği, çoktan kapanmış acil durum için mürettebata bildirim yığılmaz; gösterilen kapanış yenilemede tekrar çıkmaz', async () => {
    const user = userEvent.setup()
    renderClients()
    const dialog = await activate()
    // Hekimin ekranı açılışı görür (sağ altta); Mori'nin ekranı yoklamaz
    await refresh('surgeon')
    await within(screenOf('surgeon')).findByRole('alertdialog', { name: a.inboxTitle('E. Yıldız') })
    await user.click(within(dialog).getByRole('button', { name: s.end }))
    await within(dialog).findByText(s.endedTitle)
    // Mori bu acil durumu hiç görmedi: ne ortada kutu ne sağ altta "kapattı"
    await refresh('mori')
    await wait(50)
    expect(modalOf('mori')).toBeNull()
    expect(within(screenOf('mori')).queryAllByRole('alertdialog')).toHaveLength(0)
    // Hekim açılışı gördü (sağ alttaki bildirim): kapanış bir kez gelir, yeniden yüklemede gelmez
    await refresh('surgeon')
    await waitFor(() => expect(within(screenOf('surgeon')).getByRole('alertdialog', { name: a.inboxEnded('E. Yıldız') })).toBeInTheDocument())
    cleanup()
    renderClients()
    await refresh('surgeon')
    await wait(50)
    expect(within(screenOf('surgeon')).queryAllByRole('alertdialog')).toHaveLength(0)
  })

  it('pencere kapatılsa da acil durum sürer; yeniden açınca aynı ekran gelir, ikinci istek açılmaz', async () => {
    const user = userEvent.setup()
    renderClients()
    await activate()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    act(() => openCrewAssist())
    const dialog = await screen.findByRole('dialog', { name: s.activeTitle })
    expect(within(dialog).queryByRole('button', { name: s.hold })).toBeNull()
    expect(requests()).toHaveLength(1)
  })

  it('yinelenen olaylar tek bildirim ve tek alındı kaydı üretir', async () => {
    renderClients()
    await activate()
    await refresh('mori')
    await findModal('mori')
    const first = requests()[0].deliveries.mori?.at
    now += 20_000
    await refresh('mori')
    await refresh('mori')
    expect(document.querySelectorAll('[data-assist-modal="mori"]')).toHaveLength(1)
    await waitFor(() => expect(requests()[0].deliveries.mori?.at).toBe(first))
  })

  it('bağlantı kopuksa açık bir hata; yeniden basılı tutmak aynı isteği bir kez kaydeder', async () => {
    renderClients()
    const dialog = await openSender()
    net.down = true
    await holdFor(dialog, 600)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(s.failed)
    expect(requests()).toHaveLength(0)
    net.down = false
    await holdFor(dialog, 600)
    await screen.findByRole('dialog', { name: s.activeTitle })
    expect(requests()).toHaveLength(1)
  })

  it('sunucu yoksa demo modu açıkça yazılır; alıcının bildirimi yerel demo olarak işaretlenir', async () => {
    engine = new Engine(new MemoryStore(), () => now, { transport: 'local' })
    renderClients('local')
    const dialog = await activate()
    expect(within(dialog).getByText(s.demo)).toBeInTheDocument()
    await refresh('mori')
    expect(await findModal('mori')).toHaveTextContent(a.inboxDemo)
  })

  it('ortadaki kutu Tamam ile kapanır; aynı acil durum yeniden açılmaz (yeniden yüklemede de); Yardıma gidiyorum yanıtı iletir', async () => {
    const user = userEvent.setup()
    renderClients()
    await activate()
    await refresh('mori')
    const card = await findModal('mori')
    await user.click(within(card).getByRole('button', { name: s.modalOk }))
    await waitFor(() => expect(modalOf('mori')).toBeNull())
    expect(JSON.parse(localStorage.getItem('vitalis.assistSeen')!)).toEqual([`mori|${requests()[0].requestId}|start`])
    await refresh('mori')
    expect(modalOf('mori')).toBeNull()
    // Yeni oturumda kutu yeniden gelir; Yardıma gidiyorum yanıtı bildirene ulaşır
    localStorage.removeItem('vitalis.assistSeen')
    cleanup()
    renderClients()
    await refresh('mori')
    const again = await findModal('mori')
    await user.click(within(again).getByRole('button', { name: a.ack }))
    await waitFor(() => expect(within(again).getByRole('status')).toHaveTextContent(a.acked))
    expect(requests()[0].acks.mori).toMatchObject({ transport: 'server' })
  })
})
