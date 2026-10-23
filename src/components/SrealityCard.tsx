import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Spinner } from './ui'
import type { IValues } from '../lib/intake'

type Res = { ok?: boolean; error?: string; missing?: string[]; advert_id?: number; url?: string | null; status_message?: string; photos_sent?: number; photos_total?: number; photo_problems?: { n: number; status: number; msg: string }[]; video?: string | null; published?: number | null; sellers?: { client_name?: string }[]; adverts?: unknown[]; dry?: boolean; photos?: number; message?: string }

async function call(body: Record<string, unknown>): Promise<Res> {
  const { data, error } = await supabase.functions.invoke('sreality-export', { body })
  if (error) { let msg = error.message; try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ } return { error: msg } }
  return data as Res
}

/** Export inzerátu na Sreality (zatím testovací účet). */
export function SrealityCard({ dealId, v, flush, set }: { dealId: string; v: IValues; flush: () => Promise<void>; set: (k: string, val: IValues[string]) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [res, setRes] = useState<Res | null>(null)
  type Sr = { advert_id?: number; url?: string | null; at?: string; photos?: number; auto_top?: boolean; top_hour?: number; top_days?: number[]; topped_on?: string; top_at?: string; top_msg?: string }
  const sr = v.sreality as Sr | undefined
  const [topMsg, setTopMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const setSr = (patch: Partial<Sr>) => set('sreality', { ...(sr || {}), ...patch } as unknown as IValues[string])
  async function top() {
    setBusy('top'); setTopMsg(null)
    const r = await call({ action: 'top', deal_id: dealId })
    const rr = r as Res & { ok?: boolean; sreality?: Sr }
    setTopMsg({ ok: !!rr.ok, text: rr.error || rr.message || '' })
    if (rr.sreality) set('sreality', rr.sreality as unknown as IValues[string])
    setBusy(null)
  }
  async function run(kind: 'ping' | 'dry' | 'export') {
    setBusy(kind); setRes(null)
    try {
      if (kind !== 'ping') await flush()
      const r = await call(kind === 'ping' ? { action: 'ping' } : { action: 'export', deal_id: dealId, dry: kind === 'dry' })
      setRes(r)
      if (kind === 'export' && r.advert_id) setSr({ advert_id: r.advert_id, url: r.url ?? null, at: new Date().toISOString(), photos: r.photos_sent })
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
      {sr?.advert_id && (
        <div className="flex flex-col gap-2.5 pt-3 border-t border-line-soft">
          <div className="text-sm font-extrabold text-navy">Topování</div>
          <p className="m-0 text-[13px] text-muted leading-relaxed">Přesune inzerát na přední pozici ve výpisu. Každé topování stojí 25 Kč bez DPH. První den po vložení topovat nejde.</p>
          <div className="flex gap-2 flex-wrap items-center">
            <button type="button" className={btn} disabled={!!busy} onClick={top}>Topovat teď</button>
            {sr.topped_on && <span className="text-[13px] text-muted">Naposledy topováno {sr.topped_on.split('-').reverse().map((x, i) => (i < 2 ? String(Number(x)) : x)).join('. ')}</span>}
          </div>
          <label className="flex items-center gap-2.5 text-[14px] font-bold text-navy cursor-pointer">
            <input type="checkbox" checked={!!sr.auto_top} onChange={(e) => setSr({ auto_top: e.target.checked, top_hour: sr.top_hour ?? 10 })} className="w-5 h-5 accent-[#253371]" />
            Topovat automaticky
          </label>
          {sr.auto_top && (
            <div className="flex flex-col gap-2.5">
              <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Dny topování">
                {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((n, i) => {
                  const d = i + 1; const days = sr.top_days?.length ? sr.top_days : [1, 2, 3, 4, 5, 6, 7]; const on = days.includes(d)
                  return <button key={n} type="button" aria-pressed={on} onClick={() => { const nx = on ? days.filter((x) => x !== d) : [...days, d].sort(); if (nx.length) setSr({ top_days: nx.length === 7 ? [] : nx }) }}
                    className={`w-11 h-11 rounded-full text-[13.5px] font-extrabold border ${on ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-line'}`}>{n}</button>
                })}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button type="button" className="h-9 px-3.5 rounded-full border border-line bg-white text-navy text-[12.5px] font-bold" onClick={() => setSr({ top_days: [] })}>Každý den</button>
                <button type="button" className="h-9 px-3.5 rounded-full border border-line bg-white text-navy text-[12.5px] font-bold" onClick={() => setSr({ top_days: [1, 2, 3, 4, 5] })}>Pracovní dny</button>
                <button type="button" className="h-9 px-3.5 rounded-full border border-line bg-white text-navy text-[12.5px] font-bold" onClick={() => setSr({ top_days: [3] })}>Jednou týdně (středa)</button>
              </div>
              <label className="flex items-center gap-2 text-[13.5px] text-muted">v kolik hodin:
                <select value={sr.top_hour ?? 10} onChange={(e) => setSr({ top_hour: Number(e.target.value) })} className="h-10 px-3 rounded-[12px] border border-line bg-white text-ink">
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                </select>
                <span>(pražský čas)</span>
              </label>
              <p className="m-0 text-[12.5px] text-muted">{(() => { const days = sr.top_days?.length ? sr.top_days : [1, 2, 3, 4, 5, 6, 7]; const nm = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']; return `Topuje se ${days.length === 7 ? 'každý den' : days.map((d) => nm[d - 1]).join(', ')} v ${sr.top_hour ?? 10}:00. Cena ${days.length === 7 ? '25 Kč denně' : `25 Kč za každé topování`}.` })()}</p>
            </div>
          )}
          {topMsg && <div className={`p-3 rounded-xl text-sm ${topMsg.ok ? 'bg-[#EAF6EF] text-[#1F7A4F]' : 'bg-[#FDEEE6] text-[#9A3A14]'}`}>{topMsg.text}</div>}
          {!topMsg && sr.top_msg && sr.auto_top && <p className="m-0 text-[12.5px] text-muted">Poslední výsledek: {sr.top_msg}</p>}
        </div>
      )}
      {busy && <div className="flex items-center gap-2 text-sm text-muted"><Spinner />{busy === 'export' ? 'Odesílám inzerát a fotky, může to trvat až minutu…' : busy === 'top' ? 'Topuji inzerát…' : 'Pracuji…'}</div>}
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
