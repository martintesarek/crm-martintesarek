import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/app'
import { Btn, Card, Sheet, Spinner, Toggle } from '../components/ui'
import { Icon } from '../components/Icon'
import { dateTime } from '../lib/format'

export type Watch = {
  id: string; account_id: string; deal_id: string | null; label: string; municipality: string | null; part_name: string | null
  kind: 'č.p.' | 'č.ev.' | 'parcela'; number: string; unit_no: string | null; note: string | null; code: number | null; active: boolean; frequency: 'twice' | 'daily' | 'weekly' | 'monthly'; is_mine: boolean
  last_state: string | null; last_checked: string | null; last_change_at: string | null; error: string | null
}
type Change = { id: string; watch_id: string; at: string; old_state: string | null; new_state: string | null; seen: boolean }
type Check = { id: string; at: string; result: 'ok' | 'change' | 'baseline' | 'error'; message: string | null }
const RESULT: Record<Check['result'], { l: string; c: string }> = {
  ok: { l: 'beze změny', c: 'bg-[#DDF5E6] text-[#1F6B3F]' }, change: { l: 'změna', c: 'bg-gold-soft text-navy' },
  baseline: { l: 'výchozí stav uložen', c: 'bg-navy-soft text-navy' }, error: { l: 'chyba', c: 'bg-[#FDE2E2] text-[#B42318]' },
}
type DealLite = { id: string; title: string }

const INPUT = 'w-full h-12 px-3.5 rounded-[14px] border border-line bg-white text-[15px] font-semibold text-ink min-w-0'
const LABEL = 'flex flex-col gap-1.5 text-xs font-bold text-muted'
const KINDS: Watch['kind'][] = ['č.p.', 'č.ev.', 'parcela']
const FREQ: { k: Watch['frequency']; l: string }[] = [{ k: 'twice', l: '2× denně' }, { k: 'daily', l: '1× denně' }, { k: 'weekly', l: 'Týdně' }, { k: 'monthly', l: 'Měsíčně' }]
const EMPTY = { frequency: 'twice' as Watch['frequency'], is_mine: false, label: '', municipality: '', part_name: '', kind: 'č.p.' as Watch['kind'], number: '', unit_no: '', note: '', code: '' as string, deal_id: '' }

/** Rozdíl dvou stavů čitelně: co zmizelo a co přibylo. */
function diffText(a: string | null, b: string | null) {
  const parts = (s: string | null) => String(s || '').split(' | ')
  const pa = parts(a), pb = parts(b)
  const out = pb.filter((x) => !pa.includes(x))
  return out.length ? out.join(' · ') : b || ''
}

export function Watchdog() {
  const { account } = useApp()
  const [params, setParams] = useSearchParams()
  const [watches, setWatches] = useState<Watch[] | null>(null)
  const [changes, setChanges] = useState<Change[]>([])
  const [deals, setDeals] = useState<DealLite[]>([])
  const [busy, setBusy] = useState(false)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const toggleOpen = (id: string) => setOpenIds((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const [msg, setMsg] = useState<string | null>(null)
  const [edit, setEdit] = useState<(typeof EMPTY & { id?: string }) | null>(null)
  const [cands, setCands] = useState<{ code: number; name: string }[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hist, setHist] = useState<{ title: string; rows: Check[] | null } | null>(null)
  async function openHistory(id: string, title: string) {
    setHist({ title, rows: null })
    const { data } = await supabase.from('cadastre_checks').select('id, at, result, message').eq('watch_id', id).order('at', { ascending: false }).limit(20)
    setHist({ title, rows: (data || []) as Check[] })
  }

  const load = useCallback(async () => {
    const [w, c, d] = await Promise.all([
      supabase.from('cadastre_watch').select('*').order('created_at'),
      supabase.from('cadastre_changes').select('*').order('at', { ascending: false }).limit(40),
      supabase.from('deals').select('id, title').order('created_at', { ascending: false }).limit(300),
    ])
    setWatches((w.data || []) as Watch[]); setChanges((c.data || []) as Change[]); setDeals((d.data || []) as DealLite[])
  }, [])
  useEffect(() => { load() }, [load])
  // odkaz z detailu obchodu: otevřít přidání s údaji z obchodu (náborový formulář) a rovnou dohledat kód
  useEffect(() => {
    const d = params.get('deal'); if (!d) return
    setParams({}, { replace: true })
    ;(async () => {
      const { data: deal } = await supabase.from('deals').select('title, address, category, intake').eq('id', d).single()
      const v = ((deal?.intake as { type?: string; values?: Record<string, string> } | null)?.values || {}) as Record<string, string>
      const type = (deal?.intake as { type?: string } | null)?.type
      const first = (x?: string) => String(x || '').split('/')[0].trim()
      const kind: Watch['kind'] = type === 'pozemek' ? 'parcela' : 'č.p.'
      const e = {
        ...EMPTY, deal_id: d, label: deal?.title || '', kind,
        municipality: kind === 'parcela' ? v.cadastre || v.city || '' : v.city || '',
        part_name: kind === 'parcela' ? '' : v.cadastre && v.cadastre !== v.city ? v.cadastre : '',
        number: kind === 'parcela' ? String(v.parcel || '').split(',')[0].trim() : first(v.cp),
        unit_no: kind === 'parcela' || type !== 'byt' ? '' : String(v.unit_no || '').split('/').pop()!.trim(),
      }
      setEdit(e); setCands(null); setErr(null)
      if (e.municipality) lookup(e)
    })()
  }, [params, setParams])  // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map((watches || []).map((w) => [w.id, w]))
  const unseen = changes.filter((c) => !c.seen)

  async function checkNow() {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.functions.invoke('cadastre-watch', { body: { action: 'check' } })
    setBusy(false)
    if (error || data?.error) { setMsg(String(data?.error || error?.message || 'Kontrola se nepodařila.')); return }
    setMsg(`Zkontrolováno ${data.checked}: změn ${data.changed}, chyb ${data.errors}${data.baseline ? `, výchozí stav uložen u ${data.baseline}` : ''}.`)
    load()
  }
  async function markSeen() { await supabase.from('cadastre_changes').update({ seen: true }).eq('seen', false); load(); window.dispatchEvent(new Event('cadastre-seen')) }
  async function toggle(w: Watch, on: boolean) { await supabase.from('cadastre_watch').update({ active: on }).eq('id', w.id); load() }
  async function remove(w: Watch) { if (!confirm(`Přestat hlídat „${w.label}“ a smazat jeho historii změn?`)) return; await supabase.from('cadastre_watch').delete().eq('id', w.id); load() }

  async function lookup(cur = edit) {
    if (!cur) return
    setErr(null); setCands(null)
    const { data, error } = await supabase.functions.invoke('cadastre-watch', { body: { action: 'lookup', kind: cur.kind, municipality: cur.municipality, part: cur.part_name } })
    if (error || data?.error) { setErr(String(data?.error || error?.message)); return }
    const c = (data?.candidates || []) as { code: number; name: string }[]
    if (!c.length) setErr('Kód jsem nenašel automaticky. Zkontrolujte název obce a části obce.')
    else if (c.length === 1) { setEdit({ ...cur, code: String(c[0].code) }); setCands([]) }
    else setCands(c)
  }

  async function save() {
    if (!edit || !account) return
    if (!edit.label.trim() || !edit.number.trim()) { setErr('Vyplňte název a číslo.'); return }
    if (!/^\d+$/.test(edit.code.trim())) { setErr('Chybí kód. Klepněte na „Najít kód“.'); return }
    setSaving(true); setErr(null)
    const row = {
      label: edit.label.trim(), municipality: edit.municipality.trim() || null, part_name: edit.part_name.trim() || null, kind: edit.kind, number: edit.number.trim(),
      frequency: edit.frequency, is_mine: edit.is_mine, unit_no: edit.kind === 'parcela' ? null : edit.unit_no.trim() || null, note: edit.note.trim() || null, code: Number(edit.code), deal_id: edit.deal_id || null,
    }
    // stav v katastru se maže jen když se změnilo, CO se hlídá (číslo, kód…); frekvence, poznámka, „moje“ ho nechají
    const old = edit.id ? byId.get(edit.id) : undefined
    const moved = !!old && (old.kind !== row.kind || old.number !== row.number || (old.unit_no || null) !== row.unit_no || Number(old.code) !== row.code)
    const q = edit.id ? supabase.from('cadastre_watch').update(moved ? { ...row, last_state: null, error: null } : row).eq('id', edit.id) : supabase.from('cadastre_watch').insert({ ...row, account_id: account.id })
    const { error } = await q
    setSaving(false)
    if (error) { setErr(error.message); return }
    setEdit(null); setCands(null)
    // žádná kontrola při ukládání: výchozí stav se uloží při nejbližší plánované kontrole nebo na „Zkontrolovat teď“
    load()
  }

  if (!watches) return <Spinner />
  return (
    <div className="px-4 md:px-8 pt-6 pb-8 max-w-4xl mx-auto flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="m-0 text-2xl md:text-[28px] font-extrabold mr-auto">Hlídač katastru</h1>
        <Btn kind="ghost" onClick={checkNow} disabled={busy} icon="clock">{busy ? 'Kontroluji…' : 'Zkontrolovat teď'}</Btn>
        <Btn onClick={() => { setEdit({ ...EMPTY }); setCands(null); setErr(null) }} icon="plus">Přidat</Btn>
      </div>
      <p className="m-0 text-sm text-muted">Kontrola probíhá automaticky každý den v 10:00 a 16:00. Když se u nemovitosti objeví nové řízení (vklad, zástava, exekuce…) nebo se změní list vlastnictví, uvidíte to tady.</p>
      {msg && <div className="rounded-2xl bg-navy-soft text-navy text-sm font-semibold px-4 py-3">{msg}</div>}

      {unseen.length > 0 && (
        <Card className="p-4 border-gold bg-gold-soft/50">
          <div className="flex items-center gap-2 mb-2"><Icon name="clock" size={18} /><b className="mr-auto">Nové změny v katastru ({unseen.length})</b><button onClick={markSeen} className="text-sm font-bold text-navy">Označit jako přečtené</button></div>
          <div className="flex flex-col gap-2">
            {unseen.map((c) => (
              <div key={c.id} className="text-sm"><b>{byId.get(c.watch_id)?.label || 'Nemovitost'}</b> <span className="text-muted">· {dateTime(c.at)}</span><br /><span>{diffText(c.old_state, c.new_state)}</span></div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2.5">
        {[{ t: 'Moje nemovitosti', l: watches.filter((x) => x.is_mine) }, { t: 'Ostatní hlídané (klienti, obchody)', l: watches.filter((x) => !x.is_mine) }].filter((g) => g.l.length).map((g) => (
          <div key={g.t} className="flex flex-col gap-2.5">
            <h2 className="m-0 mt-2 text-sm font-extrabold text-muted uppercase tracking-wide">{g.t} ({g.l.length})</h2>
            {g.l.map((w) => {
          const hasChange = changes.some((c) => c.watch_id === w.id && !c.seen)
          const deal = deals.find((d) => d.id === w.deal_id)
          const freqLabel = FREQ.find((f) => f.k === w.frequency)?.l || '2× denně'
          if (w.is_mine && !openIds.has(w.id)) return (
            <button key={w.id} type="button" onClick={() => toggleOpen(w.id)} className={`w-full text-left bg-white border border-line rounded-2xl px-4 py-2.5 flex items-center gap-3 ${!w.active ? 'opacity-60' : ''}`}>
              <b className="text-sm truncate mr-auto">{w.label}</b>
              <span className="text-xs text-muted shrink-0">{w.active ? freqLabel : 'vypnuto'}</span>
              {w.error ? <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-[#FDE8E8] text-[#B42318] shrink-0">chyba</span>
                : hasChange ? <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-gold text-ink shrink-0">změna</span>
                : <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-[#E3F6E8] text-[#0F4A1E] shrink-0">beze změny</span>}
            </button>
          )
          return (
            <Card key={w.id} className={`p-4 flex flex-col gap-1.5 ${!w.active ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-2">
                <div className="flex flex-col min-w-0 mr-auto">
                  <b className="text-[15px] break-words">{w.label}</b>
                  <span className="text-xs text-muted">{[w.kind === 'parcela' ? `parcela ${w.number}` : `${w.kind} ${w.number}${w.unit_no ? ', jednotka ' + w.unit_no : ' (celý dům)'}`, w.municipality, w.part_name].filter(Boolean).join(' · ')}</span>
                </div>
                {w.error ? <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-[#FDE8E8] text-[#B42318]">chyba</span>
                  : hasChange ? <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-gold text-ink">změna</span>
                  : w.last_state ? <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-[#E3F6E8] text-[#0F4A1E]">beze změny</span> : null}
              </div>
              {w.error ? <div className="text-sm text-[#B42318]">{w.error}</div> : w.last_state && <div className="text-sm break-words">{w.last_state}</div>}
              <div className="text-xs text-muted flex flex-wrap gap-x-3 gap-y-1">
                <span>{FREQ.find((f) => f.k === w.frequency)?.l || '2× denně'}</span>
                {w.last_checked && <span>Zkontrolováno {dateTime(w.last_checked)}</span>}
                {w.last_change_at && <span>Poslední změna {dateTime(w.last_change_at)}</span>}
                {deal && <Link to={`/obchody/${deal.id}`} className="font-bold text-navy">Obchod: {deal.title}</Link>}
                {w.note && <span>{w.note}</span>}
              </div>
              <div className="flex items-center gap-3 pt-1">
                {w.is_mine && <button className="text-sm font-bold text-muted" onClick={() => toggleOpen(w.id)}>Sbalit</button>}
                <Toggle on={w.active} onChange={(v) => toggle(w, v)} label="Hlídat" />
                <span className="mr-auto" />
                <button className="text-sm font-bold text-navy" onClick={() => { setEdit({ id: w.id, label: w.label, municipality: w.municipality || '', part_name: w.part_name || '', kind: w.kind, number: w.number, unit_no: w.unit_no || '', note: w.note || '', code: w.code ? String(w.code) : '', deal_id: w.deal_id || '', frequency: w.frequency || 'twice', is_mine: !!w.is_mine }); setCands(null); setErr(null) }}>Upravit</button>
                <button className="text-sm font-bold text-[#B42318]" onClick={() => remove(w)}>Smazat</button>
              </div>
            </Card>
          )
            })}
          </div>
        ))}
        {!watches.length && <Card className="p-6 text-center text-muted text-sm">Zatím nic nehlídáte. Klepněte na „Přidat“.</Card>}
      </div>

      {changes.length > 0 && (
        <Card className="p-4">
          <b className="block mb-2">Historie změn</b>
          <div className="flex flex-col gap-2.5">
            {changes.map((c) => (
              <div key={c.id} className="text-sm border-t border-line-soft pt-2 first:border-0 first:pt-0"><b>{byId.get(c.watch_id)?.label || 'Nemovitost'}</b> <span className="text-muted">· {dateTime(c.at)}</span>
                <div className="text-muted">Dřív: {c.old_state}</div><div>Teď: {c.new_state}</div></div>
            ))}
          </div>
        </Card>
      )}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Upravit hlídanou nemovitost' : 'Přidat hlídanou nemovitost'}
        footer={<Btn onClick={save} disabled={saving} className="w-full">{saving ? 'Ukládám…' : 'Uložit'}</Btn>}>
        {edit && (
          <div className="flex flex-col gap-3 pb-2">
            <label className={LABEL}>Název<input className={INPUT} value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="Např. Fazekaš – byt Zákostelní 665/9" /></label>
            <div className="flex gap-2 flex-wrap">
              {KINDS.map((k) => <button key={k} type="button" aria-pressed={edit.kind === k} onClick={() => setEdit({ ...edit, kind: k, code: '' })} className={`h-11 px-4 rounded-full text-[13.5px] font-bold ${edit.kind === k ? 'bg-navy text-white' : 'bg-white text-navy border border-line'}`}>{k === 'parcela' ? 'Parcela' : k === 'č.p.' ? 'Číslo popisné' : 'Číslo evidenční'}</button>)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className={LABEL}>{edit.kind === 'parcela' ? 'Katastrální území' : 'Obec'}<input className={INPUT} value={edit.municipality} onChange={(e) => setEdit({ ...edit, municipality: e.target.value, code: '' })} /></label>
              {edit.kind !== 'parcela' && <label className={LABEL}>Část obce (prázdné = jako obec)<input className={INPUT} value={edit.part_name} onChange={(e) => setEdit({ ...edit, part_name: e.target.value, code: '' })} /></label>}
              <label className={LABEL}>{edit.kind === 'parcela' ? 'Číslo parcely' : 'Číslo domovní'}<input className={INPUT} value={edit.number} onChange={(e) => setEdit({ ...edit, number: e.target.value })} placeholder={edit.kind === 'parcela' ? '640/4' : '665'} /></label>
              {edit.kind !== 'parcela' && <label className={LABEL}>Číslo jednotky (prázdné = celý dům)<input className={INPUT} value={edit.unit_no} onChange={(e) => setEdit({ ...edit, unit_no: e.target.value })} /></label>}
            </div>
            <div className="flex items-end gap-2">
              <label className={`${LABEL} flex-1`}>Kód {edit.kind === 'parcela' ? 'katastrálního území' : 'části obce'}<input className={INPUT} inputMode="numeric" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.replace(/\D/g, '') })} /></label>
              <Btn kind="ghost" onClick={() => lookup()}>Najít kód</Btn>
            </div>
            {cands && cands.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted">Vyberte správnou položku:</span>
                {cands.map((c) => <button key={c.code} type="button" onClick={() => { setEdit({ ...edit, code: String(c.code) }); setCands([]) }} className="text-left px-3.5 py-2.5 rounded-[14px] border border-line text-sm font-semibold">{c.name} <span className="text-muted">({c.code})</span></button>)}
              </div>
            )}
            <div className={LABEL}>Jak často kontrolovat
              <div className="flex gap-2 flex-wrap">{FREQ.map((f) => <button key={f.k} type="button" aria-pressed={edit.frequency === f.k} onClick={() => setEdit({ ...edit, frequency: f.k })} className={`h-11 px-4 rounded-full text-[13.5px] font-bold ${edit.frequency === f.k ? 'bg-navy text-white' : 'bg-white text-navy border border-line'}`}>{f.l}</button>)}</div>
              <span className="text-[11.5px] font-medium">Kontroly běží v 10:00 a 16:00. Týdně = v pondělí v 10:00, měsíčně = 1. v měsíci v 10:00.</span>
            </div>
            <button type="button" role="checkbox" aria-checked={edit.is_mine} onClick={() => setEdit({ ...edit, is_mine: !edit.is_mine })} className="flex items-center gap-3 text-left">
              <span className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center text-white text-base font-black ${edit.is_mine ? 'bg-navy border-navy' : 'bg-white border-line'}`}>{edit.is_mine ? '✓' : ''}</span>
              <span className="text-[15px] font-bold text-navy">Moje nemovitost <span className="font-medium text-muted">(ukáže se v seznamu zvlášť)</span></span>
            </button>
            <label className={LABEL}>Propojit s obchodem (nepovinné)
              <select className={INPUT} value={edit.deal_id} onChange={(e) => setEdit({ ...edit, deal_id: e.target.value })}><option value="">—</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
            </label>
            <label className={LABEL}>Poznámka<input className={INPUT} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
            {edit.id && <Btn kind="ghost" icon="clock" onClick={() => openHistory(edit.id!, edit.label)}>Historie kontrol</Btn>}
            {err && <div className="text-sm font-semibold text-[#B42318]">{err}</div>}
          </div>
        )}
      </Sheet>

      <Sheet open={!!hist} onClose={() => setHist(null)} title="Historie kontrol">
        {hist && (
          <div className="flex flex-col gap-2 pb-2">
            <div className="text-sm font-bold text-navy">{hist.title}</div>
            {!hist.rows ? <Spinner /> : hist.rows.length === 0 ? <div className="text-sm text-muted">Zatím žádná kontrola. Historie se začne plnit od další kontroly.</div> : hist.rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-[14px] border border-line px-3.5 py-2.5">
                <span className="text-sm font-semibold mr-auto">{dateTime(r.at)}</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${RESULT[r.result].c}`}>{RESULT[r.result].l}</span>
              </div>
            ))}
            {hist.rows?.some((r) => r.result === 'error' && r.message) && <div className="text-xs text-muted">Poslední chyba: {hist.rows.find((r) => r.result === 'error')?.message}</div>}
          </div>
        )}
      </Sheet>
    </div>
  )
}
