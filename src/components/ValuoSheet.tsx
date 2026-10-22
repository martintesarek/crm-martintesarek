import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Deal } from '../lib/types'
import { Btn, Sheet } from './ui'
import { ValuoCardView, valuoMissing, type ValuoResult } from './ValuoView'
import { FORMS, type IField } from '../lib/intake'

/** Ocenění nemovitosti přes Valuo z údajů náborového formuláře (spouští se v Automatizacích u obchodu). */
export function ValuoSheet({ deal, open, onClose, reload }: { deal: Deal; open: boolean; onClose: () => void; reload: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<ValuoResult | null | undefined>(undefined)
  const [shared, setShared] = useState<boolean | undefined>(undefined)
  const [priceSet, setPriceSet] = useState(false)
  const [local, setLocal] = useState<Record<string, unknown> | null>(null)
  const values = (local ?? deal.intake?.values ?? {}) as Record<string, unknown>
  const type = deal.intake?.type
  let saved: ValuoResult | null = null
  try { saved = values.valuo ? (JSON.parse(String(values.valuo)) as ValuoResult) : null } catch { saved = null }
  const r = res === undefined ? saved : res
  const priceUsed = priceSet || (!!r?.avg && Number(deal.listing_price) === r.avg)
  const sh = shared === undefined ? !!deal.valuo?.shared : shared

  async function save(next: ValuoResult, isShared: boolean) {
    const intake = { type, values: { ...values, valuo: JSON.stringify(next) } }
    const { error } = await supabase.from('deals').update({ intake, valuo: { ...next, shared: isShared } }).eq('id', deal.id)
    if (error) throw new Error('Uložení se nepovedlo: ' + error.message)
  }
  async function run() {
    if (missing.length) return
    setBusy(true); setErr('')
    try {
      await supabase.from('deals').update({ intake: { type, values } }).eq('id', deal.id)
      const { data, error } = await supabase.functions.invoke('valuo-estimate', { body: { deal_id: deal.id, type, values } })
      if (error) { let msg = error.message; try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ } throw new Error(msg) }
      if (data?.error) throw new Error(data.error)
      const next: ValuoResult = { type, avg: data.avg, min: data.min, max: data.max, perM2: data.perM2, at: data.at, index: data.index || [], yoy: data.yoy ?? null }
      await save(next, sh)
      setRes(next); reload()
    } catch (e) { const m = (e as Error).message; setErr(/^Valuo \(5|nedostupn/.test(m) ? 'Valuo teď neodpovídá nebo si s údaji neporadilo. Zkontrolujte údaje v náboru a zkuste to za chvíli znovu.' : m) }
    setBusy(false)
  }
  async function toggleShare() {
    if (!r) return
    setErr('')
    try { await save(r, !sh); setShared(!sh); reload() } catch (e) { setErr((e as Error).message) }
  }
  async function usePrice() {
    if (!r?.avg) return
    setErr('')
    const intake = { type, values: { ...values, price: String(r.avg), valuo: JSON.stringify(r) } }
    const { error } = await supabase.from('deals').update({ listing_price: r.avg, intake }).eq('id', deal.id)
    if (error) setErr('Uložení se nepovedlo: ' + error.message); else { setPriceSet(true); reload() }
  }
  const missing = valuoMissing(type, values)
  const [asked, setAsked] = useState<{ k: string; l: string }[]>([])
  useEffect(() => { if (open) { setLocal(null); setAsked(valuoMissing(deal.intake?.type, (deal.intake?.values || {}) as Record<string, unknown>)) } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const def = (k: string): IField | undefined => { for (const st of FORMS[type || 'byt']) for (const sec of st.s) for (const f of sec.f) if (f.k === k) return f }
  async function fill(k: string, val: string) {
    const nv = { ...values, [k]: val }
    setLocal(nv)
    if (val === '') return
    const { error } = await supabase.from('deals').update({ intake: { type, values: nv } }).eq('id', deal.id)
    if (error) setErr('Uložení se nepovedlo: ' + error.message); else { setErr(''); reload() }
  }
  const ready = missing.length === 0

  return (
    <Sheet open={open} onClose={() => !busy && onClose()} title="Ocenit nemovitost přes Valuo"
      footer={<div className="flex flex-col-reverse sm:flex-row gap-2">
        <Btn kind="ghost" onClick={onClose} disabled={busy} className="w-full sm:w-28 !h-12 shrink-0">Zavřít</Btn>
        {ready && <Btn onClick={run} disabled={busy} className="w-full sm:flex-1 !h-14 shrink-0 text-lg">{busy ? 'Oceňuji…' : r ? 'Ocenit znovu' : 'Ocenit nemovitost'}</Btn>}
      </div>}>
      <div className="flex flex-col gap-4">
        {asked.length > 0 && (
          <div className="rounded-2xl px-4 py-3 text-sm flex flex-col gap-3" style={{ background: '#FFF3DC', color: '#7A4B00' }}>
            <b>{ready ? 'Údaje jsou doplněné, můžete ocenit.' : 'Před oceněním doplňte (uloží se rovnou do náborového formuláře):'}</b>
            {asked.map((m) => {
              const f = m.k ? def(m.k) : undefined
              const cls = 'h-11 px-3 rounded-[12px] border border-line bg-white outline-none text-[15px] w-full text-ink focus:border-navy'
              const opts = f && (f.t === 'sel' || f.t === 'chips' || f.t === 'seg') ? f.o : null
              return (
                <label key={m.k + m.l} className="flex flex-col gap-1 text-xs font-bold">{m.l}
                  {!m.k ? null : opts
                    ? <select className={cls} value={String(values[m.k] ?? '')} onChange={(e) => fill(m.k, e.target.value)}><option value="">Vyberte…</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                    : <input className={cls} inputMode={f && (f.t === 'num' || f.t === 'step') ? 'decimal' : undefined} value={String(values[m.k] ?? '')} onChange={(e) => setLocal({ ...values, [m.k]: e.target.value })} onBlur={(e) => fill(m.k, e.target.value.trim())} />}
                </label>
              )
            })}
          </div>
        )}
        {ready && !r && !err && <p className="m-0 text-[15px] text-muted">Odhadní cena se spočítá z údajů náborového formuláře. Čím víc údajů je vyplněno, tím je přesnější.</p>}
        {err && <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#FDE9E7', color: '#A12E2A' }}>{err}</div>}
        {r && (
          <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
            <ValuoCardView r={r} kind={type || deal.category} />
            <div className="grid grid-cols-2 gap-2 mt-1">
              {r.avg ? (priceUsed
                ? <button onClick={usePrice} className="h-11 rounded-[14px] text-sm font-extrabold bg-[#E6F4EC] text-[#2F7A4E]">✓ Použito jako cena</button>
                : <Btn kind="ghost" onClick={usePrice}>Použít jako cenu</Btn>) : <span />}
              <button onClick={toggleShare} className={`h-11 rounded-[14px] text-sm font-extrabold ${sh ? 'bg-[#E6F4EC] text-[#2F7A4E]' : 'bg-[#F6EBCB] text-[#6B4A14]'}`}>{sh ? '✓ Klient vidí · skrýt' : 'Ukázat klientovi'}</button>
            </div>
            <p className="m-0 text-xs text-muted">Orientační odhad. Inzerovanou cenu přepíše jen po klepnutí na „Použít jako cenu“. Klientovi se v portálu zobrazí jen po klepnutí na „Ukázat klientovi“.</p>
          </div>
        )}
      </div>
    </Sheet>
  )
}
