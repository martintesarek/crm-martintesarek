import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Spinner } from './ui'
import type { IValues } from '../lib/intake'

type Res = { ok?: boolean; error?: string; missing?: string[]; advert_id?: number; url?: string | null; status_message?: string; photos_sent?: number; photos_total?: number; photo_problems?: { n: number; status: number; msg: string }[]; video?: string | null; published?: number | null; sellers?: { client_name?: string }[]; adverts?: unknown[]; dry?: boolean; photos?: number }

async function call(body: Record<string, unknown>): Promise<Res> {
  const { data, error } = await supabase.functions.invoke('sreality-export', { body })
  if (error) { let msg = error.message; try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ } return { error: msg } }
  return data as Res
}

/** Export inzerátu na Sreality (zatím testovací účet). */
export function SrealityCard({ dealId, v, flush, set }: { dealId: string; v: IValues; flush: () => Promise<void>; set: (k: string, val: IValues[string]) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [res, setRes] = useState<Res | null>(null)
  const sr = v.sreality as { advert_id?: number; url?: string | null; at?: string; photos?: number } | undefined
  async function run(kind: 'ping' | 'dry' | 'export') {
    setBusy(kind); setRes(null)
    try {
      if (kind !== 'ping') await flush()
      const r = await call(kind === 'ping' ? { action: 'ping' } : { action: 'export', deal_id: dealId, dry: kind === 'dry' })
      setRes(r)
      if (kind === 'export' && r.advert_id) set('sreality', { advert_id: r.advert_id, url: r.url ?? null, at: new Date().toISOString(), photos: r.photos_sent } as unknown as IValues[string])
    } catch (e) { setRes({ error: e instanceof Error ? e.message : String(e) }) }
    setBusy(null)
  }
  const btn = 'h-11 px-4 rounded-full border border-line bg-white text-navy text-[13.5px] font-bold disabled:opacity-60'
  return (
    <section className="bg-white border border-line rounded-[22px] p-[18px] md:p-6 flex flex-col gap-3">
      <div className="text-sm font-extrabold text-navy">Export na Sreality (test)</div>
      <p className="m-0 text-[13px] text-muted leading-relaxed">Odešle inzerát s vybranými fotkami na testovací účet Sreality. Platnost je vždy 360 dnů. Opakované odeslání inzerát jen aktualizuje.</p>
      {sr?.advert_id && <p className="m-0 text-[13px] font-semibold text-[#1F7A4F]">Odesláno · inzerát č. {sr.advert_id}{sr.photos != null ? ` · ${sr.photos} fotek` : ''}{sr.url ? <> · <a href={sr.url} target="_blank" rel="noreferrer" className="underline">otevřít</a></> : null}</p>}
      <div className="flex gap-2 flex-wrap">
        <button type="button" className={btn} disabled={!!busy} onClick={() => run('ping')}>Ověřit spojení</button>
        <button type="button" className={btn} disabled={!!busy} onClick={() => run('dry')}>Zkontrolovat údaje</button>
        <button type="button" disabled={!!busy} onClick={() => run('export')} className="h-11 px-5 rounded-full bg-navy text-white text-[13.5px] font-extrabold disabled:opacity-60">{sr?.advert_id ? 'Odeslat znovu' : 'Odeslat na Sreality'}</button>
      </div>
      {busy && <div className="flex items-center gap-2 text-sm text-muted"><Spinner />{busy === 'export' ? 'Odesílám inzerát a fotky, může to trvat až minutu…' : 'Pracuji…'}</div>}
      {res && (
        <div className={`p-3 rounded-xl text-sm leading-relaxed ${res.error || res.ok === false ? 'bg-[#FDEEE6] text-[#9A3A14]' : 'bg-[#EAF6EF] text-[#1F7A4F]'}`}>
          {res.error && <div>{res.error}</div>}
          {res.missing?.length ? <div className="mt-1">Doplňte: <b>{res.missing.join(', ')}</b></div> : null}
          {res.sellers && <div>Spojení funguje. Makléři na účtu: {res.sellers.length ? res.sellers.map((x) => x.client_name).join(', ') : 'žádný'}. Inzerátů na účtu: {res.adverts?.length ?? 0}.</div>}
          {res.dry && <div>Údaje jsou v pořádku, nic se neodeslalo. Vybraných fotek: {res.photos}.</div>}
          {res.advert_id && <div>Hotovo – inzerát č. {res.advert_id} ({res.status_message}). Fotky: {res.photos_sent} z {res.photos_total}.{res.url ? <> <a href={res.url} target="_blank" rel="noreferrer" className="underline">Otevřít na Sreality</a></> : null}</div>}
          {res.photo_problems?.length ? <div className="mt-1">Problémy s fotkami: {res.photo_problems.map((p) => `č. ${p.n} (${p.status} ${p.msg})`).join('; ')}</div> : null}
          {res.video && <div className="mt-1">{res.video}</div>}
        </div>
      )}
    </section>
  )
}
