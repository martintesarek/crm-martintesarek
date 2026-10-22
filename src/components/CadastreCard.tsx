import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card } from './ui'
import { Icon } from './Icon'
import { dateTime } from '../lib/format'

type W = { id: string; label: string; last_state: string | null; last_checked: string | null; last_change_at: string | null; error: string | null }

/** Karta v detailu obchodu: nemovitosti z Hlídače katastru propojené s tímto obchodem. */
export function CadastreCard({ deal }: { deal: { id: string } }) {
  const [rows, setRows] = useState<W[] | null>(null)
  useEffect(() => {
    supabase.from('cadastre_watch').select('id, label, last_state, last_checked, last_change_at, error').eq('deal_id', deal.id).then(({ data }) => setRows((data || []) as W[]))
  }, [deal.id])
  if (!rows) return null
  return (
    <Card className="p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2"><Icon name="pin" size={18} /><b className="mr-auto">Hlídač katastru</b>
        <Link to={`/hlidac?deal=${deal.id}`} className="text-sm font-bold text-navy no-underline">{rows.length ? 'Přidat další' : 'Hlídat nemovitost'}</Link></div>
      {rows.map((w) => (
        <div key={w.id} className="text-sm">
          <b>{w.label}</b>
          <div className={w.error ? 'text-[#B42318]' : ''}>{w.error || w.last_state || 'Čeká na první kontrolu'}</div>
          <div className="text-xs text-muted">{w.last_checked ? `Zkontrolováno ${dateTime(w.last_checked)}` : ''}{w.last_change_at ? ` · změna ${dateTime(w.last_change_at)}` : ''}</div>
        </div>
      ))}
      {!rows.length && <span className="text-sm text-muted">Zatím nic nehlídáte. Po přidání se v katastru sleduje nové řízení (vklad, zástava, exekuce) i změna listu vlastnictví.</span>}
    </Card>
  )
}
