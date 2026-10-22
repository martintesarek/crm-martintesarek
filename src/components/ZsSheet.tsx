import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Deal } from '../lib/types'
import { Btn, Sheet } from './ui'

type Result = { link: string; doc_name: string; place: string; date: string; commission: number; listing_price: number | null; to_fill: string[]; missing: string[]; leftover?: string[]; lv_pages?: number }

/** Vyplnění zprostředkovatelské smlouvy ve složce klienta „ZS“ z údajů v CRM a z LV (přímo do existujícího dokumentu). */
export function ZsSheet({ deal, open, onClose, reload }: { deal: Deal; open: boolean; onClose: () => void; reload?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pct, setPct] = useState('4')
  const [company, setCompany] = useState('re')
  const [res, setRes] = useState<Result | null>(null)

  async function run() {
    setBusy(true); setErr('')
    try {
      const { data, error } = await supabase.functions.invoke('zs-fill', { body: { deal_id: deal.id, commission: pct, company } })
      if (error) { let msg = error.message; try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ } throw new Error(msg) }
      if (data?.error) throw new Error(data.error)
      setRes(data as Result)
      const it = deal.intake || {}
      await supabase.from('deals').update({ intake: { ...it, values: { ...(it.values || {}), zs_at: new Date().toISOString() } } }).eq('id', deal.id)
      reload?.()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  return (
    <Sheet open={open} onClose={() => !busy && onClose()} title="Vyplnit zprostředkovatelskou smlouvu"
      footer={<div className="flex flex-col-reverse sm:flex-row gap-2">
        <Btn kind="ghost" onClick={onClose} disabled={busy} className="w-full sm:w-28 !h-12 shrink-0">Zavřít</Btn>
        {res
          ? <a href={res.link} target="_blank" rel="noreferrer" className="w-full sm:flex-1 h-14 rounded-2xl bg-navy text-white text-lg font-extrabold no-underline inline-flex items-center justify-center">Otevřít smlouvu</a>
          : <Btn onClick={run} disabled={busy} className="w-full sm:flex-1 !h-14 shrink-0 text-lg">{busy ? 'Vyplňuji…' : 'Vyplnit smlouvu'}</Btn>}
      </div>}>
      <div className="flex flex-col gap-4">
        {!res && (
          <>
            <p className="m-0 text-[15px] text-muted">Smlouva ve složce klienta „ZS“ se vyplní přímo v ní (nevznikne kopie). Údaje o nemovitosti a podílech se přečtou z LV ve složce klienta. Co v CRM ani v LV chybí, zapíše se žlutě.</p>
            <label className="flex flex-col gap-1 text-xs font-bold text-muted">Zprostředkovatel (firma)
              <select className="h-11 px-3 rounded-[12px] border border-line bg-white outline-none text-[15px] w-full text-ink focus:border-navy" value={company} onChange={(e) => setCompany(e.target.value)}>
                <option value="re">MARTIN TESAREK REAL ESTATE s.r.o.</option>
                <option value="reality">MARTIN TESÁREK REALITY s.r.o. (Valtice)</option>
                <option value="prm">PROFESIONÁLNÍ REALITNÍ MAKLÉŘ s.r.o.</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-muted">Provize v % z kupní ceny (smluvní pokuta je vždy 4 %)
              <input className="h-11 px-3 rounded-[12px] border border-line bg-white outline-none text-[15px] w-full text-ink focus:border-navy" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.,]/g, ''))} />
            </label>
          </>
        )}
        {err && <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#FDE9E7', color: '#A12E2A' }}>{err}</div>}
        {res && (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#E6F4EC', color: '#1F7A4D' }}>✓ Vyplněno v dokumentu „{res.doc_name}“ · {res.place} dne {res.date} · provize {res.commission} %, smluvní pokuta 4 %.{res.lv_pages ? ` LV vloženo jako příloha (${res.lv_pages} ${res.lv_pages === 1 ? 'strana' : res.lv_pages < 5 ? 'strany' : 'stran'}).` : ''}</div>
            {res.to_fill.length > 0 && (
              <div className="rounded-2xl px-4 py-3 text-sm flex flex-col gap-1" style={{ background: '#FFF3DC', color: '#7A4B00' }}>
                <b>Žlutě zbývá doplnit:</b>
                {res.to_fill.map((x) => <span key={x}>• {x}</span>)}
              </div>
            )}
            {res.leftover && res.leftover.length > 0 && (
              <div className="rounded-2xl px-4 py-3 text-sm flex flex-col gap-1" style={{ background: '#FDE9E7', color: '#A12E2A' }}>
                <b>Ve smlouvě zůstalo nevyplněné (zkontrolujte v dokumentu):</b>
                {res.leftover.map((x) => <span key={x}>• {x}</span>)}
              </div>
            )}
            {res.missing.map((x) => <div key={x} className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#FDE9E7', color: '#A12E2A' }}>{x}</div>)}
          </div>
        )}
      </div>
    </Sheet>
  )
}
