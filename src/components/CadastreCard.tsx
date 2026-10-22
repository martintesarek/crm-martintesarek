import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card } from './ui'
import { Icon } from './Icon'

type W = { id: string; active: boolean; frequency: string | null; error: string | null }
const FREQ: Record<string, string> = { twice: '2× denně', daily: '1× denně', weekly: '1× týdně', monthly: '1× měsíčně' }

/** Karta v detailu obchodu: jeden barevný řádek na každou hlídanou nemovitost propojenou s obchodem. */
export function CadastreCard({ deal }: { deal: { id: string } }) {
  const [rows, setRows] = useState<W[] | null>(null)
  const [changed, setChanged] = useState<Set<string>>(new Set())
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('cadastre_watch').select('id, active, frequency, error').eq('deal_id', deal.id)
      const w = (data || []) as W[]
      if (w.length) {
        const { data: c } = await supabase.from('cadastre_changes').select('watch_id').eq('seen', false).in('watch_id', w.map((x) => x.id))
        setChanged(new Set((c || []).map((x: { watch_id: string }) => x.watch_id)))
      }
      setRows(w)
    })()
  }, [deal.id])
  if (!rows) return null
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2"><Icon name="pin" size={18} /><b className="mr-auto">Hlídač katastru</b>
        <Link to={`/hlidac?deal=${deal.id}`} className="text-sm font-bold text-navy no-underline">{rows.length ? 'Přidat další' : 'Hlídat nemovitost'}</Link></div>
      {rows.map((w) => {
        const f = FREQ[w.frequency || 'twice'] || FREQ.twice
        const s = !w.active ? { t: 'Hlídání vypnuto', c: 'bg-[#EEF0F6] text-muted' }
          : w.error ? { t: 'Chyba kontroly', c: 'bg-[#FDE2E2] text-[#B42318]' }
          : changed.has(w.id) ? { t: 'Změna v katastru', c: 'bg-gold-soft text-navy' }
          : { t: `Hlídání ${f} zapnuto`, c: 'bg-[#DDF5E6] text-[#1F6B3F]' }
        return <Link key={w.id} to="/hlidac" className={`no-underline rounded-2xl px-4 py-3.5 text-base font-bold ${s.c}`}>{s.t}</Link>
      })}
      {!rows.length && <span className="text-sm text-muted">Zatím nic nehlídáte.</span>}
    </Card>
  )
}
