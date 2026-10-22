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
  useEffect(() => {
    if (!account) return
    supabase.from('accounts').select('settings').eq('id', account.id).single().then(({ data }) => setKey(((data?.settings as { maps_key?: string })?.maps_key || '').trim()))
  }, [account])
  const vals = (deal.intake?.values || {}) as Record<string, unknown>
  const lat = Number(vals.lat), lng = Number(vals.lng)
  const hasPos = Number.isFinite(lat) && Number.isFinite(lng) && !!lat && !!lng
  const addr = [deal.address, vals.city].filter(Boolean).join(', ') || String(vals.street || '')
  if (!hasPos && !deal.address) return null
  const q = hasPos ? `${lat},${lng}` : addr
  const src = key
    ? tab === 'sv' && hasPos
      ? `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(key)}&location=${lat},${lng}&fov=90`
      : `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&zoom=17`
    : `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=17&output=embed`
  const svLink = hasPos ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}` : null
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
  const pill = (on: boolean) => 'h-9 px-3.5 rounded-full text-sm font-bold ' + (on ? 'bg-navy text-white' : 'bg-chip text-ink')
  return (
    <Fold id="deal-mapa" title="Mapa a Street View 📍" summary={addr}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button className={pill(tab === 'map')} onClick={() => setTab('map')}>Mapa</button>
          {key && hasPos
            ? <button className={pill(tab === 'sv')} onClick={() => setTab('sv')}>Street View</button>
            : svLink && <a className={pill(false) + ' inline-flex items-center no-underline'} href={svLink} target="_blank" rel="noreferrer">Street View ↗</a>}
          <a href={mapLink} target="_blank" rel="noreferrer" className="ml-auto text-sm font-bold text-navy no-underline">Otevřít v Google Mapách ↗</a>
        </div>
        <iframe key={src} title="Mapa" src={src} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen
          className="w-full h-[300px] md:h-[380px] rounded-2xl border-0 bg-chip" />
      </div>
    </Fold>
  )
}
