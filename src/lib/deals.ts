import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Deal, FieldDef } from './types'
import { contactName, czk } from './format'

export const DEAL_SELECT = '*, deal_contacts(role, position, contacts(*)), tasks(id, done)'

export function useDeals(accountId: string | undefined) {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    const all: Deal[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('deals').select(DEAL_SELECT).eq('account_id', accountId)
        .order('position').order('updated_at', { ascending: false }).range(from, from + 999)
      if (error || !data) break
      all.push(...(data as Deal[]))
      if (data.length < 1000) break
    }
    setDeals(all); setLoading(false)
  }, [accountId])
  useEffect(() => { reload() }, [reload])
  return { deals, setDeals, loading, reload }
}

// Kontakty obchodu podle pořadí, které si Martin nastavil (první = hlavní kontakt)
export function orderedContacts(d: Deal) {
  return [...(d.deal_contacts || [])].filter((x) => x.contacts)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || Number(b.role === 'prodávající') - Number(a.role === 'prodávající'))
}

export function primaryContact(d: Deal) {
  return orderedContacts(d)[0]?.contacts || null
}

// Kontakt pro volání / SMS / e-mail: hlavní kontakt; když u něj údaj chybí, první další, který ho má
export function contactWith(d: Deal, field: 'phone' | 'email') {
  const list = orderedContacts(d)
  return (list.find((x) => x.contacts?.[field]) || list[0])?.contacts || null
}

export type FieldView = { key: string; label: string; text: string; href?: string }

export function fieldValue(d: Deal, f: FieldDef): FieldView | null {
  const c = primaryContact(d)
  let text = ''
  let href: string | undefined
  switch (f.key) {
    case 'cover_url': return null
    case 'expected_commission': text = czk(d.expected_commission); break
    case 'listing_price': text = czk(d.listing_price); break
    case 'client': text = contactName(c); break
    case 'phone': text = c?.phone || ''; if (text) href = 'tel:' + text.replace(/\s/g, ''); break
    case 'address': text = d.address || ''; break
    case 'category': text = d.category || ''; break
    case 'transaction_type': text = d.transaction_type || ''; break
    case 'source': text = d.source || ''; break
    case 'drive_folder_url': if (d.drive_folder_url) { text = 'Složka na Disku'; href = d.drive_folder_url } break
    case 'next_step': return null
    case 'tasks': { const t = d.tasks || []; if (t.length) text = `Úkoly ${t.filter((x) => x.done).length}/${t.length}`; break }
    default: {
      const v = d.custom?.[f.key]
      if (v == null || v === '') break
      text = f.type === 'money' ? czk(Number(v)) : String(v)
      if (f.type === 'url') href = String(v)
    }
  }
  if (!text) return null
  return { key: f.key, label: f.label, text, href }
}
