import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type WidgetSize = 'sm' | 'md' | 'lg'
export type WidgetId = 'pipeline' | 'next' | 'attention' | 'properties' | 'clients' | 'voice' | 'money' | 'recent' | 'namedays' | 'cadastre'
export type WidgetCfg = { id: WidgetId; size: WidgetSize; hidden?: boolean; stages?: string[] }

export const WIDGETS: Record<WidgetId, { title: string; desc: string; sizes: WidgetSize[] }> = {
  pipeline: { title: 'Přehled obchodů', desc: 'Počty aktivních obchodů po fázích', sizes: ['md', 'lg'] },
  next: { title: 'Úkoly', desc: 'Všechny úkoly po termínu a na příštích 10 dní, jdou rovnou splnit', sizes: ['sm', 'md', 'lg'] },
  attention: { title: 'Potřebuje pozornost', desc: 'Obchody bez pohybu déle než 3 týdny', sizes: ['sm', 'md', 'lg'] },
  properties: { title: 'Nemovitosti v prodeji', desc: 'Inzerované nemovitosti s fotkou a cenou', sizes: ['md', 'lg'] },
  clients: { title: 'Klienti', desc: 'Naposledy přidané a upravené kontakty', sizes: ['sm', 'md', 'lg'] },
  voice: { title: 'Hlasové poznámky', desc: 'Poslední nahrané poznámky', sizes: ['sm', 'md', 'lg'] },
  money: { title: 'Provize', desc: 'Očekávané provize v rozjetých obchodech a uzavřené letos', sizes: ['sm', 'md'] },
  recent: { title: 'Poslední aktivita', desc: 'Co se naposledy změnilo', sizes: ['sm', 'md', 'lg'] },
  cadastre: { title: 'Hlídač katastru', desc: 'Nové změny u hlídaných nemovitostí (nová řízení, změna listu vlastnictví)', sizes: ['sm', 'md'] },
  namedays: { title: 'Svátky a narozeniny', desc: 'Klienti, kteří mají svátek nebo narozeniny dnes a v příštích 7 dnech', sizes: ['sm', 'md'] },
}

export const DEFAULT_LAYOUT: WidgetCfg[] = [
  { id: 'cadastre', size: 'md' },
  { id: 'pipeline', size: 'lg' },
  { id: 'next', size: 'md' },
  { id: 'attention', size: 'md' },
  { id: 'properties', size: 'lg' },
  { id: 'clients', size: 'sm', hidden: true },
  { id: 'voice', size: 'sm', hidden: true },
  { id: 'money', size: 'sm', hidden: true },
  { id: 'recent', size: 'sm', hidden: true },
  { id: 'namedays', size: 'sm' },
]

function normalize(raw: unknown): WidgetCfg[] {
  const arr = Array.isArray(raw) ? (raw as WidgetCfg[]) : []
  const known = arr.filter((w) => w && WIDGETS[w.id]).map((w) => ({ id: w.id, size: WIDGETS[w.id].sizes.includes(w.size) ? w.size : WIDGETS[w.id].sizes[0], hidden: !!w.hidden, ...(Array.isArray(w.stages) ? { stages: w.stages } : {}) }))
  for (const d of DEFAULT_LAYOUT) if (!known.some((w) => w.id === d.id)) { if (d.id === 'cadastre') known.unshift({ ...d, hidden: false }); else known.push({ ...d, hidden: true }) }
  return known
}

export function useDashboardLayout(userId: string | undefined) {
  const [layout, setLayoutState] = useState<WidgetCfg[]>(DEFAULT_LAYOUT)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!userId) return
    supabase.from('profiles').select('settings').eq('id', userId).single().then(({ data }) => {
      const s = (data?.settings || {}) as { dashboard?: unknown }
      if (s.dashboard) setLayoutState(normalize(s.dashboard))
      setLoaded(true)
    })
  }, [userId])
  const setLayout = useCallback(async (next: WidgetCfg[]) => {
    setLayoutState(next)
    if (!userId) return
    const { data } = await supabase.from('profiles').select('settings').eq('id', userId).single()
    await supabase.from('profiles').update({ settings: { ...((data?.settings as object) || {}), dashboard: next } }).eq('id', userId)
  }, [userId])
  const reset = useCallback(() => setLayout(DEFAULT_LAYOUT), [setLayout])
  return { layout, setLayout, setLocal: setLayoutState, reset, loaded }
}
