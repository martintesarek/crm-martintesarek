import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icon'
import { DateField, Spinner, Toggle } from '../components/ui'
import { MediaCard } from '../components/MediaCard'
import { SrealityCard } from '../components/SrealityCard'
import { FORMS, TYPES, TEXT_STEP_TITLE, MEDIA_STEP_TITLE, describeFacts, LV_LABELS, RUIAN_LABELS, lvKeys, missing, withDealData, withDefaults, progress, isVisible, suggestTitle, typeFromCategory, type IField, type IType, type IValues } from '../lib/intake'

type DealRow = { drive_folder_url?: string | null; account_id?: string; id: string; title: string; category: string | null; address: string | null; listing_price: number | null; intake: { type?: IType; values?: IValues } | null }

const INPUT = 'w-full h-12 px-3.5 rounded-[14px] border border-line bg-white text-[15px] font-semibold text-ink min-w-0'
const LABEL = 'flex flex-col gap-1.5 text-xs font-bold text-muted'
const PILL = 'w-full md:w-auto inline-flex items-center justify-between md:justify-start gap-3 min-h-[48px] pl-4 pr-3 py-1 rounded-full border transition-colors'

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={`h-11 px-4 rounded-full text-[13.5px] font-bold ${on ? 'bg-navy text-white' : 'bg-white text-navy border border-line'}`}>{children}</button>
}

/** Částky v Kč se zobrazují s mezerami mezi tisíci (6 578 900). */
const grp = (x: unknown) => String(x ?? '').replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

// Pole definuji na úrovni modulu (jinak by při psaní ztrácela fokus)
function Field({ f, v, set }: { f: IField; v: IValues; set: (k: string, val: IValues[string]) => void }) {
  const val = v[f.k]
  switch (f.t) {
    case 'text':
      return (
        <label className={LABEL}>{f.l}
          <input className={INPUT} value={String(val ?? '')} placeholder={f.ph} onChange={(e) => set(f.k, e.target.value)} />
          {f.hint && <span className="text-[11.5px] font-medium">{f.hint}</span>}
        </label>
      )
    case 'num':
      return (
        <label className={LABEL}>{f.l}
          <div className="relative">
            <input className={`${INPUT} ${f.unit ? 'pr-16' : ''} ${f.big ? '!h-[60px] !text-2xl !font-extrabold !border-[1.5px] !border-gold !bg-[#FFF9EC] !rounded-2xl' : ''}`} inputMode={f.unit === 'Kč' ? 'numeric' : 'decimal'} value={f.unit === 'Kč' ? grp(val) : String(val ?? '')}
              onChange={(e) => set(f.k, f.unit === 'Kč' ? grp(e.target.value) : e.target.value.replace(/[^\d.,\s]/g, ''))} />
            {f.unit && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted">{f.unit}</span>}
          </div>
        </label>
      )
    case 'area':
      return (
        <label className={LABEL}>{f.l}
          <textarea className={`${INPUT} !h-auto py-3 leading-relaxed`} rows={f.rows || 6} value={String(val ?? '')} onChange={(e) => set(f.k, e.target.value)} />
          {f.hint && <span className="text-[11.5px] font-medium">{f.hint}</span>}
        </label>
      )
    case 'date':
      return <label className={LABEL}>{f.l}<DateField className={INPUT} value={String(val ?? '')} onChange={(x) => set(f.k, x)} /></label>
    case 'sel':
      return (
        <label className={LABEL}>{f.l}
          <select className={INPUT} value={String(val ?? '')} onChange={(e) => set(f.k, e.target.value)}>
            <option value="">—</option>{f.o.map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
      )
    case 'seg':
      return (
        <div className="flex flex-col gap-2"><div className="text-xs font-bold text-muted">{f.l}</div>
          <div className="flex bg-[#EEF0F7] rounded-[14px] p-1 gap-1">
            {f.o.map((o) => <button key={o} type="button" aria-pressed={val === o} onClick={() => set(f.k, val === o ? undefined : o)}
              className={`flex-1 h-11 rounded-[11px] text-[13px] ${val === o ? 'bg-navy text-white font-extrabold' : 'text-muted font-bold'}`}>{o}</button>)}
          </div>
        </div>
      )
    case 'chips': {
      const arr = Array.isArray(val) ? val : []
      return (
        <div className="flex flex-col gap-2"><div className="flex items-center gap-3 flex-wrap text-xs font-bold text-muted"><span>{f.l}{f.multi && <span className="font-medium"> · více možností</span>}</span>
          {f.multi && f.k !== 'penb_class' && (
            <button type="button" onClick={() => set(f.k, arr.length === f.o.length ? [] : [...f.o])} className="h-8 px-3 rounded-full border border-line bg-white text-navy text-[12px] font-bold">{arr.length === f.o.length ? 'Zrušit vše' : 'Označit vše'}</button>
          )}</div>
          {f.k === 'penb_class' ? (
            <div className="grid grid-cols-7 gap-2 max-w-md">
              {f.o.map((o) => (
                <button key={o} type="button" onClick={() => set(f.k, val === o ? undefined : o)} aria-pressed={val === o}
                  className={`h-14 rounded-[14px] text-white text-base font-extrabold transition ${val === o ? 'ring-2 ring-offset-2 ring-navy scale-105' : 'opacity-55'}`}
                  style={{ background: PENB_COLORS[o] }}>{o}</button>
              ))}
            </div>
          ) : <div className="flex flex-wrap gap-2">
            {f.o.map((o) => f.multi
              ? <Chip key={o} on={arr.includes(o)} onClick={() => set(f.k, arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])}>{o}</Chip>
              : <Chip key={o} on={val === o} onClick={() => set(f.k, val === o ? undefined : o)}>{o}</Chip>)}
          </div>}
        </div>
      )
    }
    case 'tog':
      // přepínač: popisek a přepínač těsně vedle sebe v jedné „pilulce“ (na mobilu přes celou šířku)
      return (
        <label className={`${PILL} cursor-pointer ${val ? 'border-navy bg-[#F1F3FA]' : 'border-line bg-white'}`}>
          <span className="text-[13.5px] font-bold text-ink">{f.l}</span>
          <Toggle on={!!val} onChange={(x) => set(f.k, x)} label={f.l} />
        </label>
      )
    case 'step': {
      const n = Number(val ?? 0)
      return (
        <div className={`${PILL} !pr-1.5 ${n > 0 ? 'border-navy bg-[#F1F3FA]' : 'border-line bg-white'}`}>
          <span className="text-[13.5px] font-bold text-ink">{f.l}</span>
          <span className="inline-flex items-center gap-1">
            <button type="button" aria-label="Méně" onClick={() => set(f.k, Math.max(0, n - 1))} className="w-9 h-9 rounded-full border border-line bg-white text-lg font-bold text-navy">−</button>
            <b className="w-6 text-center text-[16px]">{n}</b>
            <button type="button" aria-label="Více" onClick={() => set(f.k, n + 1)} className="w-9 h-9 rounded-full border border-line bg-white text-lg font-bold text-navy">+</button>
          </span>
        </div>
      )
    }
  }
}

function Fields({ list, v, set }: { list: IField[]; v: IValues; set: (k: string, val: IValues[string]) => void }) {
  // text/číslo/výběr/datum: na počítači vedle sebe ve dvou sloupcích; chipy přes celou šířku;
  // za sebou jdoucí přepínače a počítadla se spojí do jedné řady pilulek těsně vedle sebe (ne přes celou šířku)
  const span = (f: IField) => {
    if ('half' in f && f.half) return 'col-span-1'
    if (f.t === 'text' || f.t === 'num' || f.t === 'sel' || f.t === 'date' || f.t === 'area') return f.t === 'num' && f.big ? 'col-span-2' : f.k === 'title' || f.k === 'price_note' || f.t === 'area' ? 'col-span-2' : 'col-span-2 lg:col-span-1'
    return 'col-span-2'
  }
  const vis = list.filter((f) => isVisible(f, v, list))
  const out: React.ReactNode[] = []
  for (let i = 0; i < vis.length; i++) {
    const f = vis[i]
    if (f.t === 'tog' || f.t === 'step') {
      const run: IField[] = [f]
      while (i + 1 < vis.length && (vis[i + 1].t === 'tog' || vis[i + 1].t === 'step')) run.push(vis[++i])
      out.push(<div key={run[0].k} className="col-span-2 flex flex-wrap gap-2">{run.map((x) => <Field key={x.k} f={x} v={v} set={set} />)}</div>)
    } else out.push(<div key={f.k} className={span(f)}><Field f={f} v={v} set={set} /></div>)
  }
  return <div className="grid grid-cols-2 gap-x-4 gap-y-4 items-end">{out}</div>
}

const PENB_COLORS: Record<string, string> = { A: '#1F8A57', B: '#4FA640', C: '#8DBB2E', D: '#D6BE1E', E: '#E39A1B', F: '#DB6A1F', G: '#C73A2B' }

// Vyplnění z dokumentů klienta na Disku (LV, Evidenční list, PENB). Nic se nevyplní bez zaškrtnutí.
type LvProposal = Record<string, string | number | boolean | string[] | null>
type LvOwner = { first_name: string | null; last_name: string; street: string | null; house_no: string | null; city: string | null; zip: string | null; birth_number: string | null; birth_date: string | null; gender: string | null; in_deal: boolean; contact_id: string | null }/** Jednotná karta automatizace v náboru: ikona, název, popis a tlačítko vpravo (na mobilu pod textem). `off` = zatím vypnutá. */
function AutoCard({ icon, title, desc, btn, onClick, disabled, done, off, children }: { icon: string; title: string; desc: string; btn: string; onClick?: () => void; disabled?: boolean; done?: boolean; off?: boolean; children?: React.ReactNode }) {
  return (
    <section className={`bg-white border border-line rounded-[22px] p-4 md:p-5 flex flex-col gap-3 ${off ? 'opacity-60' : ''}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3.5 mr-auto min-w-0">
          <span className={`w-11 h-11 rounded-2xl inline-flex items-center justify-center shrink-0 text-[22px] ${done ? 'bg-[#E6F4EC]' : 'bg-chip'}`}>{done ? '✓' : icon}</span>
          <div className="min-w-0">
            <h2 className="m-0 text-[15px] md:text-base leading-tight font-extrabold text-navy">{title}{off && <span className="ml-2 align-middle text-[11px] font-bold px-2 py-0.5 rounded-full bg-chip text-muted">zatím vypnuto</span>}</h2>
            <p className="m-0 mt-0.5 text-[13px] text-muted">{desc}</p>
          </div>
        </div>
        <button type="button" onClick={onClick} disabled={off || disabled} className="h-11 px-5 shrink-0 rounded-[14px] bg-navy text-white text-sm font-bold disabled:opacity-50 w-full sm:w-auto">{btn}</button>
      </div>
      {children}
    </section>
  )
}


function LvCard({ dealId, accountId, hasFolder, type, v, set }: { dealId: string; accountId?: string; hasFolder: boolean; type: IType; v: IValues; set: (k: string, val: IValues[string]) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [prop, setProp] = useState<LvProposal | null>(null)
  const [pick, setPick] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState('')
  const [missing, setMissing] = useState<string[]>([])
  const [owners, setOwners] = useState<LvOwner[]>([])
  const [pickOwner, setPickOwner] = useState<Record<number, boolean>>({})
  const keys = lvKeys(type)
  async function run() {
    setBusy(true); setErr(''); setDone('')
    try {
      const { data, error } = await supabase.functions.invoke('lv-extract', { body: { deal_id: dealId } })
      if (error) { let msg = error.message; try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ } throw new Error(msg) }
      if (data?.error) throw new Error(data.error)
      const p = data.proposal as LvProposal
      setProp(p)
      setMissing((data.missing as string[]) || [])
      const ow = ((data.owners as LvOwner[]) || [])
      setOwners(ow)
      setPickOwner(Object.fromEntries(ow.map((o, i) => [i, !o.in_deal || (!!o.contact_id && !!(o.birth_number || o.street))])))
      const init: Record<string, boolean> = {}
      keys.forEach((k) => { init[k] = p[k] != null && p[k] !== '' && (v[k] == null || v[k] === '') })
      setPick(init)
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  const found = prop ? keys.filter((k) => prop[k] != null && prop[k] !== '') : []
  const notes = (prop?.notes as string[] | undefined) || []
  async function apply() {
    let n = 0
    let added = 0
    let filled = 0
    try {
      for (let i = 0; i < owners.length; i++) {
        const o = owners[i]; if (!pickOwner[i] || !accountId) continue
        let cid = o.contact_id
        if (!cid) {
          const { data: c, error } = await supabase.from('contacts').insert({ country: 'Česká republika', account_id: accountId, first_name: o.first_name || null, last_name: o.last_name, street: o.street || null, house_no: o.house_no || null, city: o.city || null, zip: o.zip || null, birth_number: o.birth_number || null, birth_date: o.birth_date || null, gender: o.gender || null, source: 'Disk', status: 'prodávající' }).select('id').single()
          if (error) throw new Error(error.message)
          cid = c.id
        } else {
          // existující kontakt: doplnit jen to, co v něm chybí (nic se nepřepisuje)
          const { data: ex } = await supabase.from('contacts').select('street, house_no, city, zip, birth_number, birth_date, gender').eq('id', cid).single()
          const patch: Record<string, string> = {}
          const fill = (k: 'street' | 'house_no' | 'city' | 'zip' | 'birth_number' | 'birth_date' | 'gender', val: string | null) => { if (val && ex && !ex[k]) patch[k] = val }
          fill('street', o.street); fill('house_no', o.house_no); fill('city', o.city); fill('zip', o.zip); fill('birth_number', o.birth_number); fill('birth_date', o.birth_date); fill('gender', o.gender)
          if (Object.keys(patch).length) { const { error: e3 } = await supabase.from('contacts').update(patch).eq('id', cid); if (e3) throw new Error(e3.message); filled++ }
        }
        if (o.in_deal) continue
        const { error: e2 } = await supabase.from('deal_contacts').upsert({ deal_id: dealId, contact_id: cid, account_id: accountId, role: 'prodávající' })
        if (e2) throw new Error(e2.message)
        added++
      }
    } catch (e) { setErr((e as Error).message); return }
    if (prop!.lat && prop!.lng) { set('lat', String(prop!.lat)); set('lng', String(prop!.lng)) }
    found.forEach((k) => { if (pick[k]) { set(k, typeof prop![k] === 'boolean' ? (prop![k] as boolean) : String(prop![k])); n++ } })
    setDone([n ? `Vyplněno ${n} ${n === 1 ? 'údaj' : n < 5 ? 'údaje' : 'údajů'}. Zkontrolujte je prosím níže.` : '', added ? `Přidáno ${added} ${added === 1 ? 'prodávající' : 'prodávající'} do obchodu a kontaktů.` : '', filled ? `Doplněny údaje u ${filled} stávajících kontaktů.` : ''].filter(Boolean).join(' ') || 'Nic nebylo zaškrtnuto.')
    setProp(null); setOwners([])
  }
  return (
    <AutoCard icon="📂" title="Načíst informace z Google Disku klienta" done={!!prop}
      desc={hasFolder ? 'Přečtu LV, Evidenční list a PENB: adresa, parcely, plochy, poplatky, energie.' : 'Obchod nemá složku na Disku – vložte odkaz na složku v detailu obchodu.'}
      btn={busy ? 'Čtu dokumenty…' : prop ? 'Načíst znovu' : 'Načíst z Disku'} onClick={run} disabled={busy || !hasFolder}>
      {busy && <p className="m-0 text-sm text-muted">Čtu dokumenty ve složkách LV, Evidenční list a PENB. Trvá to asi půl minuty.</p>}
      {err && <p className="m-0 p-3 rounded-xl bg-[#FDEEE6] text-sm text-[#9A3A14]">{err}</p>}
      {done && <p className="m-0 p-3 rounded-xl bg-[#E6F4EC] text-sm text-[#2F7A4E] font-semibold">{done}</p>}
      {prop && (
        <div className="flex flex-col gap-2">
          {found.length === 0 && <p className="m-0 text-sm text-muted">V dokumentech jsem nenašel nic, co by šlo do formuláře vyplnit.</p>}
          <div className="grid md:grid-cols-2 gap-2">
            {found.map((k) => (
              <label key={k} className={`flex items-start gap-3 p-3 rounded-2xl border text-sm ${pick[k] ? 'border-gold bg-gold-soft/50' : 'border-line opacity-80'}`}>
                <input type="checkbox" checked={!!pick[k]} onChange={(e) => setPick({ ...pick, [k]: e.target.checked })} className="w-5 h-5 mt-0.5 accent-navy shrink-0" />
                <span className="flex flex-col min-w-0"><span className="text-xs font-bold text-muted">{LV_LABELS[k]}</span><span className="font-semibold break-words">{prop[k] === true ? 'Ano, je zapsané' : String(prop[k])}</span>
                  {v[k] != null && v[k] !== '' && String(v[k]) !== String(prop[k]) && <span className="text-xs text-[#9A3A14]">teď vyplněno: {String(v[k])}</span>}</span>
              </label>
            ))}
          </div>
          {missing.length > 0 && <p className="m-0 text-xs text-muted">Nenašel jsem složku nebo soubory: {missing.map((m) => ({ lv: 'LV', ev: 'Evidenční list', penb: 'PENB' } as Record<string, string>)[m]).join(', ')}.</p>}
          {notes.length > 0 && <div className="p-3 rounded-2xl bg-bg text-[13px] leading-relaxed"><b className="block text-xs text-muted mb-1">V dokumentech je také uvedeno</b>{notes.map((n) => <div key={n}>• {n}</div>)}</div>}
          {owners.length > 0 && (
            <div className="flex flex-col gap-2"><b className="text-xs text-muted">Vlastníci a spoluvlastníci z LV</b>
              <div className="grid md:grid-cols-2 gap-2">
                {owners.map((o, i) => (
                  <label key={i} className={`flex items-start gap-3 p-3 rounded-2xl border text-sm ${o.in_deal && !o.contact_id ? 'border-line opacity-60' : pickOwner[i] ? 'border-gold bg-gold-soft/50' : 'border-line opacity-80'}`}>
                    <input type="checkbox" disabled={o.in_deal && !o.contact_id} checked={!!pickOwner[i]} onChange={(e) => setPickOwner({ ...pickOwner, [i]: e.target.checked })} className="w-5 h-5 mt-0.5 accent-navy shrink-0" />
                    <span className="flex flex-col min-w-0"><span className="font-semibold break-words">{[o.first_name, o.last_name].filter(Boolean).join(' ')}</span>
                      {(o.birth_date || o.street) && <span className="text-xs text-muted">{[o.birth_date && `nar. ${o.birth_date.split('-').reverse().map(Number).join('. ')} (z rodného čísla)`, o.street && [[o.street, o.house_no].filter(Boolean).join(' '), [o.zip, o.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span>}
                      <span className="text-xs text-muted">{o.in_deal ? (o.contact_id ? 'Už je v obchodě – doplnit chybějící údaje v kontaktu' : 'Už je v obchodě') : o.contact_id ? 'Kontakt už existuje – přidat jen do obchodu jako Prodávající' : 'Nový kontakt + do obchodu jako Prodávající'}</span></span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {(found.length > 0 || owners.length > 0) && <button onClick={apply} className="h-12 rounded-2xl bg-gold text-ink font-extrabold">Vyplnit zaškrtnuté</button>}
        </div>
      )}
    </AutoCard>
  )
}

// Údaje o domě z registru RUIAN (ČÚZK) podle adresy. Nic se nevyplní bez zaškrtnutí.
function RuianCard({ type, v, set }: { type: IType; v: IValues; set: (k: string, val: IValues[string]) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [prop, setProp] = useState<Record<string, string | number | boolean | null> | null>(null)
  const [pick, setPick] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState('')
  const ready = type === 'pozemek' ? !!(v.cadastre && v.parcel) : !!((v.city && v.cp) || (type === 'dum' && v.cadastre && v.parcel))
  const [notes, setNotes] = useState<string[]>([])
  async function run() {
    setBusy(true); setErr(''); setDone('')
    try {
      const { data, error } = await supabase.functions.invoke('ruian-building', { body: { type, street: v.street, cp: v.cp, city: v.city, cadastre: v.cadastre, parcel: v.parcel } })
      if (error) { let msg = error.message; try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ } throw new Error(msg) }
      if (data?.error) throw new Error(data.error)
      const p = data.proposal as Record<string, string | number | boolean | null>
      setProp(p); setNotes((data.notes as string[]) || [])
      setPick(Object.fromEntries(Object.keys(p).filter((k) => p[k] != null).map((k) => [k, v[k] == null || v[k] === '' || v[k] === false])))
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  const found = prop ? Object.keys(prop).filter((k) => prop[k] != null && RUIAN_LABELS[k]) : []
  function apply() {
    let n = 0
    found.forEach((k) => { if (pick[k]) { set(k, typeof prop![k] === 'boolean' ? (prop![k] as boolean) : k === 'heating' && type === 'dum' ? prop![k] as string : String(prop![k])); n++ } })
    setDone(n ? `Vyplněno ${n} ${n === 1 ? 'údaj' : n < 5 ? 'údaje' : 'údajů'}. Zkontrolujte je prosím v dalších krocích.` : 'Nic nebylo zaškrtnuto.')
    setProp(null)
  }
  return (
    <AutoCard icon="🏠" title="Načíst údaje o domě z registru" done={!!prop}
      desc={ready ? (type === 'pozemek' ? 'Podle katastrálního území a čísla parcely najdu v registru výměru, druh pozemku a upozorním na chráněná území.' : 'Počet bytů a podlaží, rok, konstrukce, výtah, vytápění, PSČ, parcely, chráněná území.') : (type === 'pozemek' ? 'Nejdřív vyplňte katastrální území a číslo parcely.' : 'Nejdřív vyplňte obec a číslo popisné.')}
      btn={busy ? 'Hledám…' : prop ? 'Načíst znovu' : 'Načíst z registru'} onClick={run} disabled={busy || !ready}>
      {err && <p className="m-0 p-3 rounded-xl bg-[#FDEEE6] text-sm text-[#9A3A14]">{err}</p>}
      {done && <p className="m-0 p-3 rounded-xl bg-[#E6F4EC] text-sm text-[#2F7A4E] font-semibold">{done}</p>}
      {prop && (
        <div className="flex flex-col gap-2">
          {found.length === 0 && <p className="m-0 text-sm text-muted">V registru nejsou o této budově použitelné údaje.</p>}
          <div className="grid md:grid-cols-3 gap-2">
            {found.map((k) => (
              <label key={k} className={`flex items-start gap-3 p-3 rounded-2xl border text-sm ${pick[k] ? 'border-gold bg-gold-soft/50' : 'border-line opacity-80'}`}>
                <input type="checkbox" checked={!!pick[k]} onChange={(e) => setPick({ ...pick, [k]: e.target.checked })} className="w-5 h-5 mt-0.5 accent-navy shrink-0" />
                <span className="flex flex-col min-w-0"><span className="text-xs font-bold text-muted">{RUIAN_LABELS[k]}</span><span className="font-semibold break-words">{prop[k] === true ? 'Ano' : String(prop[k])}</span>
                  {v[k] != null && v[k] !== '' && v[k] !== false && String(v[k]) !== String(prop[k]) && <span className="text-xs text-[#9A3A14]">teď vyplněno: {String(v[k])}</span>}</span>
              </label>
            ))}
          </div>
          {notes.length > 0 && <div className="p-3 rounded-2xl bg-bg text-[13px] leading-relaxed"><b className="block text-xs text-muted mb-1">Dále z registru</b>{notes.map((n) => <div key={n}>• {n}</div>)}</div>}
          {(found.length > 0 || prop.lat) && <button onClick={apply} className="h-12 rounded-2xl bg-gold text-ink font-extrabold">Vyplnit zaškrtnuté</button>}
          <p className="m-0 text-xs text-muted">Zdroj: registr RUIAN (ČÚZK). U výtahu a vytápění může být zápis zastaralý, proto je potvrďte.</p>
        </div>
      )}
    </AutoCard>
  )
}

function GenCard({ dealId, type, v, set }: { dealId: string; type: IType; v: IValues; set: (k: string, val: IValues[string]) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const has = !!(String(v.title || '').trim() || String(v.description || '').trim())
  async function run() {
    setBusy(true); setErr(''); setOk('')
    try {
      const { data, error } = await supabase.functions.invoke('listing-text', { body: { deal_id: dealId, type, addr_mode: v.addr_mode || 'Přesně', facts: describeFacts(type, v) } })
      if (error) { let msg = error.message; try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ } throw new Error(msg) }
      if (data?.error) throw new Error(data.error)
      set('title', data.title); set('description', data.description)
      setOk('Hotovo. Text si prosím přečtěte a upravte podle potřeby.')
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  return (
    <div className="flex flex-col gap-2">
      <button onClick={run} disabled={busy} className="h-14 w-full rounded-full bg-gold text-ink text-base font-extrabold disabled:opacity-60 inline-flex items-center justify-center gap-2">
        <span aria-hidden>✨</span>{busy ? 'Píšu nadpis a popis…' : has ? 'Vygenerovat nadpis a popis znovu pomocí AI' : 'Vygenerovat nadpis a popis inzerátu pomocí AI'}
      </button>
      <p className="m-0 text-[12.5px] text-muted">Text se napíše z údajů vyplněných v předchozích krocích. {has ? 'Pozor: přepíše se text výše.' : 'Potom ho můžete libovolně upravit.'}</p>
      {err && <p className="m-0 p-3 rounded-xl bg-[#FDEEE6] text-sm text-[#9A3A14]">{err}</p>}
      {ok && <p className="m-0 p-3 rounded-xl bg-[#E6F4EC] text-sm text-[#2F7A4E] font-semibold">{ok}</p>}
    </div>
  )
}

export function Intake() {
  const { id } = useParams()
  const nav = useNavigate()
  const [deal, setDeal] = useState<DealRow | null>(null)
  const [type, setType] = useState<IType | null>(null)
  const [v, setV] = useState<IValues>({})
  const [step, setStep] = useState(0)
  const [saved, setSaved] = useState(true)
  const [needSave, setNeedSave] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef<{ type: IType | null; v: IValues }>({ type: null, v: {} })

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('deals').select('id,account_id,title,category,address,listing_price,intake,drive_folder_url').eq('id', id).single()
      const d = data as DealRow | null
      setDeal(d)
      const t = d?.intake?.type || typeFromCategory(d?.category)
      const dv = withDefaults(d?.intake?.values || {})
      const dd = withDealData(dv.values, { listing_price: d?.listing_price, address: d?.address })
      setType(t || null); setV(dd.values)
      latest.current = { type: t || null, v: dd.values }
      if (t && (dv.changed || dd.changed)) setNeedSave(true)
    })()
  }, [id])

  const flush = useCallback(async () => {
    const { type: t, v: vals } = latest.current
    if (!deal || !t) return
    const patch: Record<string, unknown> = { intake: { type: t, values: vals } }
    const price = Number(String(vals.price ?? '').replace(/\s/g, '').replace(',', '.'))
    if (price > 0 && price !== deal.listing_price) patch.listing_price = price
    if (!deal.address && vals.city) patch.address = [[vals.street, vals.cp].filter(Boolean).join(' '), vals.city].filter(Boolean).join(', ')
    if (!deal.category) patch.category = TYPES.find((x) => x.key === t)?.label
    const { error } = await supabase.from('deals').update(patch).eq('id', deal.id)
    if (error) alert('Uložení se nepovedlo: ' + error.message)
    else { setSaved(true); setDeal((d) => (d ? { ...d, listing_price: (patch.listing_price as number) ?? d.listing_price, address: (patch.address as string) ?? d.address, category: (patch.category as string) ?? d.category } : d)) }
  }, [deal])

  useEffect(() => { if (needSave && deal) { setNeedSave(false); flush() } }, [needSave, deal, flush])
  const queue = () => { setSaved(false); window.clearTimeout(timer.current); timer.current = window.setTimeout(flush, 700) }
  useEffect(() => () => { window.clearTimeout(timer.current) }, [])
  const set = (k: string, val: IValues[string]) => { const nv = { ...latest.current.v, [k]: val }; latest.current.v = nv; setV(nv); queue() }
  const pick = (t: IType) => { setType(t); latest.current.type = t; setStep(0); queue() }
  // PSČ se doplní samo z ulice, čísla a obce (jen když je prázdné); lze přepsat
  const pscKey = useRef('')
  useEffect(() => {
    const vv = v
    if (!deal || vv.zip || !vv.city) return
    if (!vv.street && !vv.cp && !vv.cadastre) return
    const key = [vv.street, vv.cp, vv.city, vv.cadastre].join('|')
    if (pscKey.current === key) return
    const t = window.setTimeout(async () => {
      pscKey.current = key
      const { data } = await supabase.functions.invoke('psc-lookup', { body: { street: vv.street, cp: vv.cp, city: vv.city, cadastre: vv.cadastre } })
      const z = (data as { zip?: string; exact?: boolean } | null)?.zip
      if (z && !latest.current.v.zip && latest.current.v.city === vv.city && ((data as { exact?: boolean }).exact || (!vv.street && !/praha|brno|ostrava|plze/i.test(String(vv.city))))) set('zip', z)
    }, 1200)
    return () => window.clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.street, v.cp, v.city, v.cadastre, v.zip, deal])
  const goto = async (n: number) => { window.clearTimeout(timer.current); await flush(); setStep(n); window.scrollTo({ top: 0 }) }

  if (!deal) return <Spinner />

  // 1) výběr typu
  if (!type) {
    return (
      <div className="px-4 md:px-9 pt-11 md:pt-8 pb-8 md:max-w-[900px] flex flex-col gap-5">
        <div className="flex items-center gap-2.5"><Link to={`/obchody/${deal.id}`} aria-label="Zpět" className="w-11 h-11 rounded-[14px] border border-line bg-white inline-flex items-center justify-center text-ink"><Icon name="chevL" /></Link></div>
        <div><h1 className="m-0 text-[26px] md:text-[30px] font-extrabold tracking-tight">Náběr nemovitosti</h1><p className="m-0 mt-1 text-sm text-muted">{deal.title}</p></div>
        <div className="text-sm font-bold text-muted">Co se nabízí?</div>
        <div className="grid md:grid-cols-3 gap-3">
          {TYPES.map((t) => (
            <button key={t.key} onClick={() => pick(t.key)} className="flex items-center gap-4 min-h-[84px] px-5 rounded-[22px] bg-white border border-line text-left">
              <span className="w-12 h-12 rounded-2xl bg-navy text-white inline-flex items-center justify-center"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg></span>
              <b className="text-xl font-extrabold">{t.label}</b>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const steps = FORMS[type]
  const typeLabel = TYPES.find((x) => x.key === type)!.label
  const summary = step >= steps.length
  const prog = progress(type, v)
  const miss = missing(type, v)
  const total = steps.length + 1
  const title = String(v.title || '') || suggestTitle(type, v)
  const back = () => (step > 0 ? goto(step - 1) : (flush(), nav(`/obchody/${deal.id}`)))
  const savedLine = <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${saved ? 'text-[#2E9E6B]' : 'text-muted'}`}>{saved ? <><Icon name="check" size={14} />Průběžně uloženo k obchodu</> : 'Ukládám…'}</span>
  const grid = 'md:columns-2 min-[1700px]:columns-3 md:gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid'

  return (
    <div className="md:px-9 md:pt-7 pb-36 md:pb-8 md:grid md:grid-cols-[270px_minmax(0,1fr)] md:gap-7 md:items-start">
      {/* Levý panel – jen na počítači: kroky, postup, uložení */}
      <aside className="hidden md:flex flex-col gap-4 sticky top-6">
        <button onClick={() => { flush(); nav(`/obchody/${deal.id}`) }} className="self-start inline-flex items-center gap-2 text-[13px] font-bold text-navy h-9"><Icon name="chevL" size={18} />Zpět na obchod</button>
        <div className="bg-white border border-line rounded-[22px] p-5 flex flex-col gap-4">
          <div><div className="text-xs font-semibold text-muted">Náběr · {typeLabel} · Prodej</div>
            <div className="mt-1 text-[17px] font-extrabold leading-snug tracking-tight">{title}</div></div>
          <nav className="flex flex-col gap-1" aria-label="Kroky náběru">
            {steps.map((st, i) => {
              const done = prog[i].done >= prog[i].total
              return (
                <button key={st.title} onClick={() => goto(i)} aria-current={i === step ? 'step' : undefined}
                  className={`flex items-center gap-3 min-h-[48px] px-3 rounded-[14px] text-left ${i === step ? 'bg-navy-soft text-navy' : 'hover:bg-bg'}`}>
                  <span className={`w-7 h-7 shrink-0 rounded-full inline-flex items-center justify-center text-xs font-extrabold ${done ? 'bg-[#2E9E6B] text-white' : i === step ? 'bg-navy text-white' : 'bg-chip text-navy'}`}>{done ? <Icon name="check" size={14} /> : i + 1}</span>
                  <span className="flex-1 text-sm font-bold leading-tight">{st.title}</span>
                  <span className="text-[11px] font-semibold text-muted">{prog[i].done}/{prog[i].total}</span>
                </button>
              )
            })}
            <button onClick={() => goto(steps.length)} aria-current={summary ? 'step' : undefined}
              className={`flex items-center gap-3 min-h-[48px] px-3 rounded-[14px] text-left ${summary ? 'bg-navy-soft text-navy' : 'hover:bg-bg'}`}>
              <span className={`w-7 h-7 shrink-0 rounded-full inline-flex items-center justify-center text-xs font-extrabold ${summary ? 'bg-navy text-white' : 'bg-chip text-navy'}`}>{total}</span>
              <span className="flex-1 text-sm font-bold">Souhrn a export</span>
              {miss.length > 0 && <span className="text-[11px] font-extrabold text-[#A97B1A]">chybí {miss.length}</span>}
            </button>
          </nav>
          {savedLine}
        </div>
      </aside>

      <div className="min-w-0 flex flex-col md:gap-4">
        {/* Hlavička: na telefonu velká modrá, na počítači nadpis kroku */}
        <div className="md:hidden px-5 pt-12 pb-5 bg-navy text-white flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <button aria-label="Zpět" onClick={back} className="w-11 h-11 rounded-[14px] bg-white/15 inline-flex items-center justify-center"><Icon name="chevL" /></button>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold opacity-75 truncate">Náběr · {typeLabel} · Prodej</div>
              <div className="text-xl font-extrabold tracking-tight">{summary ? 'Souhrn a export' : steps[step].title}</div>
            </div>
            <span className="text-[13px] font-extrabold text-gold">{step + 1} / {total}</span>
          </div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0,1fr))` }}>
            {Array.from({ length: total }).map((_, i) => <button key={i} aria-label={`Krok ${i + 1}`} onClick={() => goto(i)} className="h-2 rounded-full" style={{ background: i === step ? '#CB992E' : i < step ? '#fff' : 'rgba(255,255,255,.25)' }} />)}
          </div>
          {summary && <div className="flex flex-col gap-1"><div className="text-[22px] font-extrabold leading-tight tracking-tight">{title}</div>{v.price ? <div className="text-sm font-bold text-gold">{String(v.price)} Kč</div> : null}</div>}
        </div>
        <div className="hidden md:flex items-end gap-4">
          <div className="mr-auto"><div className="text-xs font-bold text-gold tracking-wide uppercase">Krok {step + 1} z {total}</div>
            <h1 className="m-0 text-[26px] md:text-[30px] font-extrabold tracking-tight">{summary ? 'Souhrn a export' : steps[step].title}</h1></div>
          {summary && v.price ? <div className="text-xl font-extrabold text-navy">{String(v.price)} Kč</div> : null}
        </div>

        <div className="px-4 md:px-0 pt-4 md:pt-0 flex flex-col gap-4">
          {step === 0 && !summary && (
            <div className="flex flex-col gap-2 md:max-w-[760px]">
              <div><h2 className="m-0 text-base md:text-lg font-extrabold text-navy">Automatizace ⚙️</h2><p className="m-0 mt-0.5 text-xs md:text-[13px] text-muted">Spouštějte shora dolů. Zbytek doplňte ručně.</p></div>
              <LvCard dealId={deal.id} accountId={deal.account_id} hasFolder={!!deal.drive_folder_url} type={type} v={v} set={set} />
              <RuianCard type={type} v={v} set={set} />
              <AutoCard icon="📜" title="Stáhnout aktuální LV do složky klienta" desc="Stáhne čerstvý list vlastnictví z katastru a uloží ho do složky LV na Disku klienta." btn="Stáhnout LV" off />
            </div>
          )}
          {!summary && (
            <div className={`flex flex-col gap-4 ${(steps[step].title === TEXT_STEP_TITLE || steps[step].title === MEDIA_STEP_TITLE || step <= 2) ? '' : `${grid} md:block`}`}>
              {steps[step].title === MEDIA_STEP_TITLE && <MediaCard dealId={deal.id} accountId={deal.account_id} hasFolder={!!deal.drive_folder_url} v={v} set={set} />}
              {steps[step].s.map((sec) => (
                <section key={sec.title} className="bg-white border border-line rounded-[22px] p-[18px] md:p-6 flex flex-col gap-4">
                  <h2 className="m-0 text-[15px] font-extrabold text-navy">{sec.title}</h2>
                  <Fields list={sec.f.map((f) => (f.k === 'title' && f.t === 'text' ? { ...f, ph: suggestTitle(type, v) } : f.t === 'area' ? { ...f, rows: 16 } : f))} v={v} set={set} />
                  {steps[step].title === TEXT_STEP_TITLE && <GenCard dealId={deal.id} type={type} v={v} set={set} />}
                </section>
              ))}
            </div>
          )}

          {summary && (
            <div className="grid lg:grid-cols-2 gap-4 items-start">
              <section className="bg-white border border-line rounded-[22px] p-[18px] md:p-6 flex flex-col gap-3">
                <div className="text-base font-extrabold">{miss.length ? `Chybí ${miss.length} ${miss.length === 1 ? 'povinný údaj' : miss.length < 5 ? 'povinné údaje' : 'povinných údajů'} pro inzerci` : 'Hotovo – vše potřebné pro inzerci je vyplněno'}</div>
                {steps.map((st, i) => (
                  <button key={st.title} onClick={() => goto(i)} className="flex items-center gap-3 min-h-[52px] border-t border-line-soft text-left">
                    <span className={`w-[26px] h-[26px] rounded-full inline-flex items-center justify-center text-white text-sm font-extrabold ${prog[i].done >= prog[i].total ? 'bg-[#2E9E6B]' : 'bg-gold'}`}>{prog[i].done >= prog[i].total ? <Icon name="check" size={14} /> : '!'}</span>
                    <span className="flex-1 text-sm font-bold">{st.title}</span>
                    <span className="text-xs font-semibold text-muted">{prog[i].done} / {prog[i].total}</span>
                  </button>
                ))}
              </section>
              <div className="flex flex-col gap-4">
                {miss.length > 0 && (
                  <section className="bg-[#FFF9EC] border border-[#F0DFB5] rounded-[22px] p-[18px] md:p-6 flex flex-col gap-2">
                    <div className="text-sm font-extrabold text-[#7A5A12]">Ještě doplnit</div>
                    {miss.map((m) => {
                      const si = steps.findIndex((st) => st.s.some((sc) => sc.f.some((f) => f.k === m.k)))
                      return <button key={m.k} onClick={() => goto(Math.max(0, si))} className="min-h-12 px-3.5 rounded-[14px] border border-[#F0DFB5] bg-white flex items-center gap-2.5 text-left text-[13.5px] font-bold"><span className="flex-1">{m.l}</span><Icon name="chevD" size={16} className="-rotate-90 text-[#A97B1A]" /></button>
                    })}
                  </section>
                )}
                <SrealityCard dealId={deal.id} v={v} flush={flush} set={set} />
              </div>
            </div>
          )}
        </div>

        {/* Spodní lišta: na telefonu přilepená dole, na počítači pod obsahem */}
        <div className="fixed bottom-0 inset-x-0 z-50 md:static md:z-auto md:mt-2 bg-white md:bg-transparent border-t border-line md:border-0 px-4 md:px-0 pt-3 pb-6 md:pb-0 flex flex-col gap-2">
          <div className="md:hidden flex justify-center">{savedLine}</div>
          <div className="flex gap-2.5 md:justify-end">
            {step > 0 && <button onClick={() => goto(step - 1)} className="flex-1 md:flex-none md:px-8 h-[54px] rounded-2xl border border-line bg-white text-navy text-[15px] font-extrabold">Zpět</button>}
            {!summary
              ? <button onClick={() => goto(step + 1)} className="flex-[2] md:flex-none md:px-10 h-[54px] rounded-2xl bg-navy text-white text-[15px] font-extrabold">{step === steps.length - 1 ? 'Souhrn →' : 'Pokračovat →'}</button>
              : <button onClick={async () => { await flush(); nav(`/obchody/${deal.id}`) }} className="flex-[2] md:flex-none md:px-10 h-[54px] rounded-2xl bg-navy text-white text-[15px] font-extrabold">Uložit náběr k obchodu</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
