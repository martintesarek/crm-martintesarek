import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useApp } from './app'
import { supabase } from './supabase'
import type { Deal } from './types'

// Náhledový obrázek obchodu: vlastní fotka, a když chybí, automaticky Street View ulice (Google Street View Static API).
let cache: { acc: string; key: string } | null = null
export function useMapsKey(): string {
  const { account } = useApp()
  const [key, setKey] = useState(cache && account && cache.acc === account.id ? cache.key : '')
  useEffect(() => {
    if (!account) return
    if (cache && cache.acc === account.id) { setKey(cache.key); return }
    supabase.from('accounts').select('settings').eq('id', account.id).single().then(({ data }) => {
      const k = String((data?.settings as { maps_key?: string } | null)?.maps_key || '').trim()
      cache = { acc: account.id, key: k }; setKey(k)
    })
  }, [account])
  return key
}
export function setCachedMapsKey(acc: string, key: string) { cache = { acc, key } }

export function streetViewUrl(d: Pick<Deal, 'address' | 'intake'>, key: string, w = 640, h = 400): string | null {
  if (!key) return null
  const v = (d.intake?.values || {}) as Record<string, unknown>
  const lat = Number(v.lat), lng = Number(v.lng)
  const loc = lat && lng ? `${lat},${lng}` : (d.address || '').trim()
  if (!loc) return null
  return `https://maps.googleapis.com/maps/api/streetview?size=${w}x${h}&location=${encodeURIComponent(loc)}&fov=85&source=outdoor&return_error_code=true&key=${encodeURIComponent(key)}`
}

/** Fotka obchodu, nebo Street View; když není ani jedno, ukáže se `fallback`. */
export function CoverImg({ d, w = 640, h = 400, className, style, fallback, wrap }: { d: Deal; w?: number; h?: number; className?: string; style?: CSSProperties; fallback: ReactNode; wrap?: (img: ReactNode) => ReactNode }) {
  const key = useMapsKey()
  const [bad, setBad] = useState(false)
  const sv = d.cover_url ? null : streetViewUrl(d, key, w, h)
  const src = d.cover_url || (bad ? null : sv)
  useEffect(() => setBad(false), [d.id, d.address])
  if (!src) return <>{fallback}</>
  const img = <img src={src} alt="" loading="lazy" draggable={false} onError={() => { if (!d.cover_url) setBad(true) }} className={className} style={style} />
  return <>{wrap ? wrap(img) : img}</>
}
