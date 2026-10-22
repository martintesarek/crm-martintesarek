import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card } from './ui'
import { Icon } from './Icon'

type W = { id: string; active: boolean; frequency: string | null; error: string | null }
const ICONS = {
  shieldCheck: ['M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06', 'M15 19l2 2l4 -4'],
  bell: ['M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6', 'M9 17v1a3 3 0 0 0 6 0v-1', 'M21 6.727a11.05 11.05 0 0 0 -2.794 -3.727', 'M3 6.727a11.05 11.05 0 0 1 2.792 -3.727'],
  alert: ['M12 9v4', 'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z', 'M12 16h.01'],
  shield: ['M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3'],
}
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
  async function setActive(w: W, on: boolean) {
    setRows((r) => (r || []).map((x) => (x.id === w.id ? { ...x, active: on } : x)))
    const { error } = await supabase.from('cadastre_watch').update({ active: on }).eq('id', w.id)
    if (error) setRows((r) => (r || []).map((x) => (x.id === w.id ? { ...x, active: !on } : x)))
  }
  if (!rows) return null
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2"><Icon name="pin" size={18} /><b className="mr-auto">Hlídač katastru</b>
        <Link to={`/hlidac?deal=${deal.id}`} className="text-sm font-bold text-navy no-underline">{rows.length ? 'Přidat další' : ''}</Link></div>
      {rows.map((w) => {
        const f = FREQ[w.frequency || 'twice'] || FREQ.twice
        const s = !w.active ? { t: 'Hlídání vypnuto', bg: '#ECEEF4', fg: '#6B7194', dot: '#B9BED2', ic: '#FFFFFF', d: ICONS.shield }
          : w.error ? { t: 'Chyba kontroly', bg: '#FBE0DE', fg: '#9A1F14', dot: '#D9534A', ic: '#FFFFFF', d: ICONS.alert }
          : changed.has(w.id) ? { t: 'Změna v katastru', bg: '#F5DDAE', fg: '#6B4A14', dot: '#F0B64A', ic: '#1F1A0E', d: ICONS.bell }
          : { t: `Hlídání ${f} zapnuto`, bg: '#D9EDD3', fg: '#2F6B1A', dot: '#4C9A2A', ic: '#14210E', d: ICONS.shieldCheck }
        return (
          <div key={w.id} className="flex items-center gap-3 rounded-[20px] px-3 h-[42px]" style={{ background: s.bg }}>
            <Link to={`/hlidac?edit=${w.id}`} className="no-underline flex items-center gap-3 flex-1 min-w-0">
              <span className="flex items-center justify-center w-[28px] h-[28px] rounded-full shrink-0" style={{ background: s.dot }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={s.ic} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{s.d.map((d) => <path key={d} d={d} />)}</svg>
              </span>
              <span className="text-sm font-bold leading-tight" style={{ color: s.fg }}>{s.t}</span>
            </Link>
            <button type="button" role="switch" aria-checked={w.active} aria-label="Hlídání zapnout nebo vypnout" onClick={() => setActive(w, !w.active)} className="relative w-10 h-6 rounded-full shrink-0 transition-colors" style={{ background: s.dot }}>
              <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${w.active ? 'left-[19px]' : 'left-[3px]'}`} />
            </button>
          </div>
        )
      })}
      {!rows.length && (
        <Link to={`/hlidac?deal=${deal.id}`} className="no-underline flex items-center gap-3 rounded-[20px] px-3 h-[42px]" style={{ background: '#ECEEF4' }}>
          <span className="flex items-center justify-center w-[28px] h-[28px] rounded-full shrink-0" style={{ background: '#B9BED2' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS.shield.map((d) => <path key={d} d={d} />)}</svg>
          </span>
          <span className="text-sm font-bold leading-tight mr-auto" style={{ color: '#6B7194' }}>Hlídání vypnuto</span>
          <span className="relative w-10 h-6 rounded-full shrink-0" style={{ background: '#B9BED2' }}><span className="absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white" /></span>
        </Link>
      )}
    </Card>
  )
}
