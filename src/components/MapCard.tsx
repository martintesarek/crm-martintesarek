import { useEffect, useState } from 'react'
import { useApp } from '../lib/app'
import { supabase } from '../lib/supabase'
import type { Deal } from '../lib/types'
import { Fold } from './ui'

// Mapa a Street View u obchodu. Klíč Google Maps (Embed API) se vkládá v Nastavení → Automatizace.
// Bez klíče se ukáže jen základní mapa; Street View potřebuje klíč a souřadnice (z RUIAN v náboru).
export function MapCard({ deal }: { deal: Deal }) {
  const { account } = useApp()
  const [key, setKey] = useState<string | null>(null)
  const [tab, setTab] = useState<'map' | 'sv'>('map')
  const [fresh, setFresh] = useState<{ address: string | null; vals: Record<string, unknown> } | null>(null)
  const [nonce, setNonce] = useState(0)
  const [busy, setBusy] = useState(false)
  async function refresh() {
    setBusy(true)
    const { data } = await supabase.from('deals').select('address, intake').eq('id', deal.id).single()
    if (data) setFresh({ address: data.address, vals: ((data.intake as { values?: Record<string, unknown> } | null)?.values || {}) })
    setNonce((n) => n + 1); setTab('map'); setBusy(false)
  }
  useEffect(() => {
    if (!account) return
    supabase.from('accounts').select('settings').eq('id', account.id).single().then(({ data }) => setKey(((data?.settings as { maps_key?: string })?.maps_key || '').trim()))
  }, [account])
  const vals = (fresh?.vals ?? deal.intake?.values ?? {}) as Record<string, unknown>
  const address = fresh ? fresh.address : deal.address
  const lat = Number(vals.lat), lng = Number(vals.lng)
  const hasPos = !fresh && Number.isFinite(lat) && Number.isFinite(lng) && !!lat && !!lng
  const sv = (k: string) => String(vals[k] ?? '').trim()
  // adresa z náběrového formuláře (ulice + č. popisné, PSČ + obec); když chybí, z adresy obchodu
  const intakeAddr = [[sv('street'), sv('cp')].filter(Boolean).join(' '), [sv('zip'), sv('city')].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const addr = (sv('street') || sv('city') ? intakeAddr : [address, sv('city')].filter(Boolean).join(', ')) || ''
  if (!hasPos && !addr) return null
  const q = hasPos ? `${lat},${lng}` : addr
  const src = key
    ? tab === 'sv' && hasPos
      ? `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(key)}&location=${lat},${lng}&fov=90`
      : `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&zoom=18&maptype=satellite`
    : `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=18&t=k&output=embed`
  const svLink = hasPos ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}` : null
  const pill = (on: boolean) => 'h-9 px-3.5 rounded-full text-sm font-bold ' + (on ? 'bg-navy text-white' : 'bg-chip text-ink')
  return (
    <Fold id="deal-mapa" title="Mapa a Street View 📍" summary={addr}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {key && hasPos
            ? <button className={pill(tab === 'sv')} onClick={() => setTab(tab === 'sv' ? 'map' : 'sv')}>Street View</button>
            : svLink && <a className={pill(false) + ' inline-flex items-center no-underline'} href={svLink} target="_blank" rel="noreferrer">Street View ↗</a>}
          <button onClick={refresh} disabled={busy} className={pill(false) + ' ml-auto inline-flex items-center gap-1.5'}>{busy ? 'Načítám…' : '↻ Obnovit mapu'}</button>
        </div>
        <iframe key={src + nonce} title="Mapa" src={src} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen
          className="w-full h-[300px] md:h-[380px] rounded-2xl border-0 bg-chip" />
      </div>
    </Fold>
  )
}
