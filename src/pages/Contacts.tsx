import { useEffect, useMemo, useState } from 'react'
import { SanctionsCard } from '../components/SanctionsCard'
import { BankIdCard } from '../components/BankIdCard'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../lib/app'
import { supabase } from '../lib/supabase'
import type { Contact, Deal } from '../lib/types'
import { contactName, openGmail, smsStatus } from '../lib/format'
import { Avatar, Btn, Card, Sheet, Spinner, StagePill, StatusChip, StatusPicker, CONTACT_STATUSES, FieldInput, FormalityChip, DateField, Toggle } from '../components/ui'
import { Icon } from '../components/Icon'
import { CoverImg } from '../lib/streetview'
import { MASK, revealBirthNumber } from '../lib/secure'

type ColKey = string
type ColDef = { key: ColKey; label: string; options?: string[] }
const BASE_COLS: ColDef[] = [
  { key: 'status', label: 'Typ (prodávající…)' }, { key: 'phone', label: 'Telefon' }, { key: 'email', label: 'E-mail' }, { key: 'salutation', label: 'Oslovení' },
  { key: 'formality', label: 'Vykání / tykání' }, { key: 'city', label: 'Město' }, { key: 'street', label: 'Ulice' }, { key: 'zip', label: 'PSČ' }, { key: 'country', label: 'Země' },
  { key: 'gender', label: 'Pohlaví' }, { key: 'source', label: 'Zdroj' }, { key: 'birth_date', label: 'Datum narození' }, { key: 'name_day', label: 'Svátek' }, { key: 'birth_number', label: 'Rodné číslo' },
  { key: 'tags', label: 'Štítky' }, { key: 'created_at', label: 'Vytvořeno' }, { key: 'sms', label: 'Automatické SMS' },
]
const DEFAULT_COLS: ColKey[] = ['status', 'phone', 'email', 'salutation']
const isCustom = (k: ColKey) => k.startsWith('custom:')
/** Uložené pojmenované zobrazení seznamu kontaktů. */
type SavedView = { id: string; name: string; cols: ColKey[]; view: 'typ' | 'abc'; status: string; filters: Record<string, string>; onlyDups: boolean; q?: string }
const GROUPS = [...CONTACT_STATUSES.map((s) => ({ key: s.key })), { key: '' }]
type View = 'typ' | 'abc'
const norm = (v: string | null | undefined) => (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const normPhone = (v: string | null | undefined) => { const d = (v || '').replace(/\D/g, ''); const n = d.length >= 9 ? d.slice(-9) : ''; return /^(\d)\1+$/.test(n) || /^(123456789|987654321)$/.test(n) ? '' : n }
type Lite = { id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; status: string | null; created_at: string; dup_ignored?: boolean }
/** Najde duplicity: stejné jméno, stejný telefon nebo stejný e-mail. Vrací id → důvod. */
function findDuplicates(input: Lite[]): Map<string, string> {
  const out = new Map<string, string>()
  const all = input.filter((c) => !c.dup_ignored)
  const by = (key: (c: Lite) => string, reason: string) => {
    const m = new Map<string, Lite[]>()
    for (const c of all) { const k = key(c); if (k) m.set(k, [...(m.get(k) || []), c]) }
    for (const g of m.values()) if (g.length > 1) for (const c of g) {
      const others = g.filter((o) => o.id !== c.id).map((o) => [o.first_name, o.last_name].filter(Boolean).join(' ')).join(', ')
      const r = `${reason} jako ${others}`
      out.set(c.id, out.get(c.id) ? out.get(c.id) + '; ' + r : r)
    }
  }
  by((c) => { const n = norm(c.first_name + ' ' + c.last_name); return n.length > 3 ? n : '' }, 'stejné jméno')
  by((c) => normPhone(c.phone), 'stejný telefon')
  by((c) => norm(c.email), 'stejný e-mail')
  return out
}
const DUP_STYLE = { background: '#FFF4F4', boxShadow: 'inset 4px 0 0 #D9534F' }

const CELL_INP = 'h-9 px-2.5 rounded-[10px] border border-navy bg-white outline-none text-[14px] w-full min-w-[120px]'
/** Buňka v tabulce, kterou jde klepnutím rovnou upravit. */
function CellEdit({ c, k, options, onSave }: { c: Contact; k: ColKey; options?: string[]; onSave: (patch: Partial<Contact>) => Promise<void> }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState('')
  const start = () => {
    if (k === 'tags' || k === 'created_at') return
    setV(k === 'name_day' ? fmtNameDay(c.name_day) : k === 'birth_date' ? (c.birth_date || '') : isCustom(k) || k === 'street' ? colValue(c, k) : String((c as unknown as Record<string, unknown>)[k] ?? ''))
    setEdit(true)
  }
  const commit = async (val: string) => {
    setEdit(false)
    const t = val.trim()
    let patch: Partial<Contact>
    if (k === 'name_day') { if (t && !parseNameDay(t)) return; patch = { name_day: t ? parseNameDay(t) : null } }
    else if (k === 'birth_date') patch = { birth_date: t || null }
    else if (isCustom(k)) patch = { custom: { ...(c.custom || {}), [k.slice(7)]: t || null } }
    else if (k === 'street') { const m = /^(.*?)(?:\s+(\d[\w/]*))?$/.exec(t) || []; patch = { street: (m[1] || '').trim() || null, house_no: m[2] || null } }
    else patch = { [k]: t || null } as Partial<Contact>
    if (!isCustom(k) && k !== 'street' && String((c as unknown as Record<string, unknown>)[k] ?? '') === String((patch as Record<string, unknown>)[k] ?? '')) return
    await onSave(patch)
  }
  if (k === 'status') return <StatusPicker status={c.status} onChange={(st) => onSave({ status: st })} />
  if (k === 'formality') return <FormalityChip value={c.formality} onChange={(v) => onSave({ formality: v })} />
  if (k === 'tags') return <>{(c.tags || []).slice(0, 3).map((t) => <span key={t} className="inline-block mr-1 px-2 py-0.5 rounded-lg bg-chip text-xs font-bold text-ink">{t}</span>)}</>
  if (k === 'created_at') return <span>{colValue(c, k)}</span>
  if (k === 'gender' || (options && options.length)) {
    if (!edit) return <button onClick={start} title="Klepnutím upravit" className="text-left w-full h-9 -mx-2.5 px-2.5 rounded-[10px] hover:bg-navy-soft/60 truncate min-w-[96px]">{colValue(c, k) || <span className="opacity-50">–</span>}</button>
    const opts = k === 'gender' ? ['muž', 'žena'] : options!
    return <select autoFocus value={v} onChange={(e) => commit(e.target.value)} onBlur={(e) => commit(e.target.value)} className={CELL_INP}><option value="">—</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>
  }
  if (!edit) return <button onClick={start} title="Klepnutím upravit" className="text-left w-full h-9 -mx-2.5 px-2.5 rounded-[10px] hover:bg-navy-soft/60 truncate min-w-[96px]">{colValue(c, k) || <span className="opacity-50">–</span>}</button>
  const key = (e: React.KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEdit(false) }
  if (k === 'birth_date') return <DateField autoFocus value={v} onChange={(x) => { setV(x); commit(x) }} onBlur={() => setEdit(false)} className={CELL_INP} />
  return <input autoFocus type={k === 'birth_date' ? 'date' : k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'} value={v} onChange={(e) => setV(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={key} placeholder={k === 'name_day' ? '21. 4.' : ''} className={CELL_INP} />
}
function colValue(c: Contact, k: ColKey): string {
  if (isCustom(k)) { const v = (c.custom || {})[k.slice(7)]; return Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v) }
  switch (k) {
    case 'sms': { const x = smsStatus(c); return x.state === 'off' ? 'vypnuto' : x.state === 'ok' ? 'posílá se' : 'chybí: ' + x.missing.join(', ') }
    case 'phone': return c.phone || ''
    case 'email': return c.email || ''
    case 'salutation': return c.salutation || ''
    case 'formality': return c.formality === 'tykani' ? 'tykání' : c.formality === 'vykani' ? 'vykání' : ''
    case 'city': return c.city || ''
    case 'source': return c.source || ''
    case 'birth_date': return c.birth_date ? new Date(c.birth_date).toLocaleDateString('cs-CZ') : ''
    case 'name_day': return fmtNameDay(c.name_day)
    case 'street': return [c.street, c.house_no].filter(Boolean).join(' ')
    case 'zip': return c.zip || ''
    case 'country': return c.country || ''
    case 'gender': return c.gender === 'muž' ? 'muž' : c.gender === 'žena' ? 'žena' : (c.gender || '')
    case 'birth_number': return c.birth_number ? MASK : ''
    case 'created_at': return c.created_at ? new Date(c.created_at).toLocaleDateString('cs-CZ') : ''
    case 'tags': return (c.tags || []).join(', ')
    default: return ''
  }
}

const MONTHS = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro']
function ContactsStats({ created }: { created: string[] }) {
  const months = useMemo(() => {
    const now = new Date(); const out: { key: string; label: string; n: number; year: number }[] = []
    for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTHS[d.getMonth()], n: 0, year: d.getFullYear() }) }
    const idx = new Map(out.map((m, i) => [m.key, i]))
    for (const c of created) { const d = new Date(c); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; const i = idx.get(k); if (i != null) out[i].n++ }
    return out
  }, [created])
  const max = Math.max(1, ...months.map((m) => m.n))
  const thisMonth = months[months.length - 1]
  const lastMonth = months[months.length - 2]
  return (
    <Card className="p-4 md:p-5 flex flex-col md:flex-row gap-4 md:items-stretch">
      <div className="flex gap-4 md:gap-6 md:border-r md:border-line-soft md:pr-6">
        <div className="flex flex-col"><span className="text-xs font-bold text-muted">Celkem kontaktů</span><b className="text-3xl font-extrabold tracking-tight">{created.length}</b></div>
        <div className="flex flex-col"><span className="text-xs font-bold text-muted">Nových tento měsíc</span><b className="text-3xl font-extrabold tracking-tight text-navy">+{thisMonth?.n ?? 0}</b><span className="text-xs text-muted">minulý měsíc +{lastMonth?.n ?? 0}</span></div>
      </div>
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <span className="text-xs font-bold text-muted">Přírůstek nových kontaktů po měsících (1.–poslední den)</span>
        <div className="flex items-end gap-1.5 h-16">
          {months.map((m, i) => (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${m.label} ${m.year}: ${m.n}`}>
              <span className="text-[10px] font-bold text-muted leading-none">{m.n || ''}</span>
              <div className={`w-full rounded-t-md ${i === months.length - 1 ? 'bg-gold' : 'bg-navy/80'}`} style={{ height: Math.max(3, Math.round((m.n / max) * 40)) }} />
              <span className="text-[10px] text-muted leading-none">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

export function Contacts() {
  const { account, fields } = useApp()
  const COLS = useMemo<ColDef[]>(() => [...BASE_COLS, ...fields.filter((f) => f.entity === 'contact' && !f.is_core).map((f) => ({ key: 'custom:' + f.key, label: f.label, options: f.type === 'select' ? f.options : undefined }))], [fields])
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [filtOpen, setFiltOpen] = useState(false)
  const [views, setViews] = useState<SavedView[]>([])
  const [activeView, setActiveView] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [viewDel, setViewDel] = useState<SavedView | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [rows, setRows] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [created, setCreated] = useState<string[]>([])
  const [cols, setCols] = useState<ColKey[]>(DEFAULT_COLS)
  const [colsOpen, setColsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [view, setView] = useState<View>('typ')
  const [onlyDups, setOnlyDups] = useState(false)
  const [dups, setDups] = useState<Map<string, string>>(new Map())
  const [del, setDel] = useState<Contact | null>(null)
  const [deleting, setDeleting] = useState(false)
  async function patchRow(id: string, patch: Partial<Contact>) {
    const { data, error } = await supabase.from('contacts').update(patch).eq('id', id).select().single()
    if (error) { alert(error.message); return }
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...(data as Contact) } : x)))
  }
  async function ignoreDup(c: Contact) {
    const { error } = await supabase.from('contacts').update({ dup_ignored: true }).eq('id', c.id)
    if (error) { alert(error.message); return }
    setRows((r) => r.map((x) => (x.id === c.id ? { ...x, dup_ignored: true } : x)))
    const { data } = await supabase.from('contacts').select('id, first_name, last_name, phone, email, status, created_at, dup_ignored').eq('account_id', account!.id)
    setDups(findDuplicates((data || []) as Lite[]))
  }
  async function confirmDelete() {
    if (!del) return
    setDeleting(true)
    const { error } = await supabase.from('contacts').delete().eq('id', del.id)
    setDeleting(false)
    if (error) { alert(error.message); return }
    setRows((r) => r.filter((x) => x.id !== del.id)); setDel(null)
  }
  const { session } = useApp()
  const nav = useNavigate()
  useEffect(() => {
    if (!session) return
    supabase.from('profiles').select('settings').eq('id', session.user.id).single().then(({ data }) => {
      const st = (data?.settings || {}) as { contacts_columns?: ColKey[]; contacts_view?: View; contacts_views?: SavedView[] }
      if (Array.isArray(st.contacts_columns)) setCols(st.contacts_columns)
      if (st.contacts_view === 'abc' || st.contacts_view === 'typ') setView(st.contacts_view)
      if (Array.isArray(st.contacts_views)) setViews(st.contacts_views)
    })
  }, [session])
  async function saveCols(next: ColKey[]) {
    setCols(next)
    if (!session) return
    const { data } = await supabase.from('profiles').select('settings').eq('id', session.user.id).single()
    await supabase.from('profiles').update({ settings: { ...((data?.settings as object) || {}), contacts_columns: next } }).eq('id', session.user.id)
  }
  async function persistViews(next: SavedView[]) {
    setViews(next)
    if (!session) return
    const { data } = await supabase.from('profiles').select('settings').eq('id', session.user.id).single()
    await supabase.from('profiles').update({ settings: { ...((data?.settings as object) || {}), contacts_views: next } }).eq('id', session.user.id)
  }
  function applyView(v: SavedView) {
    setActiveView(v.id); setCols(v.cols); setView(v.view); setStatus(v.status || ''); setFilters(v.filters || {}); setOnlyDups(!!v.onlyDups); setQ(v.q || '')
    setFiltOpen(false); setColsOpen(false)
  }
  async function saveCurrentView(asNew = false) {
    const name = saveName.trim(); if (!name) return
    const cur = asNew ? undefined : views.find((v) => v.id === activeView)
    const nv: SavedView = { id: cur?.id || crypto.randomUUID(), name, cols, view, status, filters, onlyDups, q }
    await persistViews(cur ? views.map((v) => (v.id === cur.id ? nv : v)) : [...views, nv])
    setActiveView(nv.id); setSaveOpen(false); setSaveName('')
  }
  async function saveView(next: View) {
    setView(next)
    if (!session) return
    const { data } = await supabase.from('profiles').select('settings').eq('id', session.user.id).single()
    await supabase.from('profiles').update({ settings: { ...((data?.settings as object) || {}), contacts_view: next } }).eq('id', session.user.id)
  }

  useEffect(() => {
    if (!account) return
    const t = setTimeout(async () => {
      setLoading(true)
      let query = supabase.from('contacts').select('*').eq('account_id', account.id).order('last_name', { nullsFirst: false }).limit(2000)
      const s = q.trim().replace(/[%,()]/g, ' ')
      if (s) query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,city.ilike.%${s}%`)
      if (status) query = query.eq('status', status)
      const { data } = await query
      setRows((data as Contact[]) || []); setLoading(false)
    }, 200)
    return () => clearTimeout(t)
  }, [account, q, status])
  useEffect(() => {
    if (!account) return
    supabase.from('contacts').select('id, first_name, last_name, phone, email, status, created_at, dup_ignored').eq('account_id', account.id).then(({ data }) => {
      const all = (data || []) as Lite[]
      const m: Record<string, number> = {}; const cr: string[] = []
      for (const r of all) { m[r.status || ''] = (m[r.status || ''] || 0) + 1; cr.push(r.created_at) }
      setCounts(m); setCreated(cr); setDups(findDuplicates(all))
    })
  }, [account, rows.length])

  const active = Object.entries(filters).filter(([, v]) => v)
  const shown = useMemo(() => {
    let r = onlyDups ? rows.filter((c) => dups.has(c.id)) : rows
    for (const [k, v] of active) {
      if (k === 'sms') { r = r.filter((c) => smsStatus(c).state === v); continue }
      const needle = norm(v)
      r = r.filter((c) => { const val = norm(colValue(c, k)); return v === '__empty' ? !val : k === 'tags' ? (c.tags || []).some((t) => norm(t) === needle) : val === needle || val.includes(needle) })
    }
    return r
  }, [rows, onlyDups, dups, filters])
  /** Hodnoty pro filtr: všechny různé hodnoty daného pole v načtených kontaktech. */
  const distinct = (k: ColKey) => { const set = new Set<string>(); for (const c of rows) { if (k === 'tags') (c.tags || []).forEach((t) => set.add(t)); else { const v = colValue(c, k); if (v) set.add(v) } } return [...set].sort((a, b) => a.localeCompare(b, 'cs')) }
  const groups = useMemo(() => {
    if (view === 'abc') {
      const sorted = [...shown].sort((a, b) => (a.last_name || a.first_name || '').localeCompare(b.last_name || b.first_name || '', 'cs') || (a.first_name || '').localeCompare(b.first_name || '', 'cs'))
      const m = new Map<string, Contact[]>()
      for (const c of sorted) { const raw = (c.last_name || c.first_name || '#').charAt(0).toUpperCase(); const l = 'ČŘŠŽ'.includes(raw) ? raw : norm(raw).toUpperCase(); const k = /^[A-ZČŘŠŽ]$/.test(l) ? l : '#'; m.set(k, [...(m.get(k) || []), c]) }
      return [...m.entries()].map(([key, list]) => ({ key, list }))
    }
    return GROUPS.filter((g) => !status || g.key === status).map((g) => ({ key: g.key, list: shown.filter((c) => (c.status || '') === g.key) })).filter((g) => g.list.length)
  }, [shown, view, status])

  async function create() {
    if (!account) return
    const { data } = await supabase.from('contacts').insert({ country: 'Česká republika', account_id: account.id, first_name: 'Nový', last_name: 'kontakt' }).select().single()
    if (data) nav(`/kontakty/${data.id}`)
  }

  return (
    <div className="px-4 md:px-9 pt-11 md:pt-8 max-w-[1600px] min-[1500px]:max-w-[1900px] flex flex-col gap-4">
      <header className="flex items-center gap-2.5 min-h-[44px]">
        <h1 className="m-0 mr-auto text-[26px] md:text-[30px] font-extrabold tracking-tight">Kontakty</h1>
        <Btn onClick={create} icon="plus">Nový</Btn>
      </header>
      <ContactsStats created={created} />
      <label className="flex items-center gap-2.5 h-12 px-3.5 bg-white border border-line rounded-2xl">
        <Icon name="search" size={18} className="text-muted" />
        <input type="search" aria-label="Hledat kontakt" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jméno, telefon, e-mail, město"
          className="border-0 outline-none bg-transparent flex-1 min-w-0 text-[15px]" />
      </label>
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <button onClick={() => setStatus('')} className={`h-9 px-3.5 rounded-full text-sm font-bold whitespace-nowrap border ${!status ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}>Vše</button>
        {CONTACT_STATUSES.map((st) => (
          <button key={st.key} onClick={() => setStatus(status === st.key ? '' : st.key)} className={`h-9 px-3.5 rounded-full text-sm font-bold whitespace-nowrap border ${status === st.key ? 'border-navy' : 'border-line'}`} style={{ background: st.bg, color: st.fg }}>{st.label} <span className="opacity-70">{counts[st.key] || 0}</span></button>
        ))}
        {dups.size > 0 && (
          <button onClick={() => setOnlyDups(!onlyDups)} aria-pressed={onlyDups} title="Kontakty se stejným jménem, telefonem nebo e-mailem" className={`h-9 px-3.5 rounded-full text-sm font-bold whitespace-nowrap border ${onlyDups ? 'border-navy' : 'border-line'}`} style={{ background: '#FFE3E3', color: '#A12E2A' }}>Duplicity <span className="opacity-70">{dups.size}</span></button>
        )}
        <div className="ml-auto inline-flex rounded-full border border-line bg-white p-0.5 h-9 shrink-0">
          <button onClick={() => saveView('typ')} aria-pressed={view === 'typ'} className={`px-3 rounded-full text-sm font-bold whitespace-nowrap ${view === 'typ' ? 'bg-navy text-white' : 'text-muted'}`}>Podle typu</button>
          <button onClick={() => saveView('abc')} aria-pressed={view === 'abc'} className={`px-3 rounded-full text-sm font-bold whitespace-nowrap ${view === 'abc' ? 'bg-navy text-white' : 'text-muted'}`}>A–Z</button>
        </div>
        <button onClick={() => { setFiltOpen(!filtOpen); setColsOpen(false) }} aria-expanded={filtOpen} className={`h-9 px-3 rounded-full text-sm font-bold whitespace-nowrap border inline-flex items-center gap-1.5 shrink-0 ${active.length ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}><Icon name="search" size={14} />Filtr{active.length ? ` ${active.length}` : ''}</button>
        <button onClick={() => { setColsOpen(!colsOpen); setFiltOpen(false) }} aria-expanded={colsOpen} className="h-9 px-3 rounded-full text-sm font-bold whitespace-nowrap border border-line bg-white inline-flex items-center gap-1.5 shrink-0"><Icon name="layout" size={14} />Sloupce</button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-muted mr-1">Uložená zobrazení:</span>
        {views.map((v) => (
          <span key={v.id} className={`inline-flex items-center h-9 pl-3.5 pr-1 rounded-full border text-sm font-bold ${activeView === v.id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}>
            <button onClick={() => applyView(v)} className="pr-1">{v.name}</button>
            <button onClick={() => setViewDel(v)} aria-label="Smazat zobrazení" className="w-7 h-7 rounded-full inline-flex items-center justify-center hover:bg-white/60 opacity-60 hover:opacity-100"><Icon name="x" size={12} /></button>
          </span>
        ))}
        {views.length === 0 && <span className="text-sm text-muted">zatím žádná</span>}
        <button onClick={() => { setSaveName(views.find((v) => v.id === activeView)?.name || ''); setSaveOpen(true) }} className="h-9 px-3 rounded-full border border-dashed border-navy text-navy text-sm font-bold inline-flex items-center gap-1.5"><Icon name="plus" size={14} />{activeView && views.some((v) => v.id === activeView) ? 'Uložit změny / jako nové' : 'Uložit toto zobrazení'}</button>
      </div>
      {filtOpen && (
        <Card className="p-3 md:p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2"><b className="text-sm">Filtrovat podle polí</b>{active.length > 0 && <button onClick={() => setFilters({})} className="ml-auto text-xs font-bold text-navy">Zrušit filtry</button>}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <label className="flex flex-col gap-1 text-xs font-bold text-muted">Automatické SMS (svátek, narozeniny)
              <select value={filters.sms || ''} onChange={(e) => setFilters({ ...filters, sms: e.target.value })} className={`h-10 px-2.5 rounded-xl border bg-white outline-none text-[14px] font-normal text-ink ${filters.sms ? 'border-navy' : 'border-line'}`}>
                <option value="">— vše —</option><option value="ok">Zapnuto – SMS se pošle</option><option value="missing">Zapnuto – ale chybí údaje</option><option value="off">Vypnuto</option>
              </select>
              {filters.sms === 'missing' && <span className="font-normal text-[11px] text-muted">Chybí mobil, oslovení nebo datum svátku/narození.</span>}
            </label>
            {COLS.filter((c) => !['status', 'birth_number', 'source', 'zip', 'created_at', 'custom:drive_url', 'sms'].includes(c.key)).map((c) => {
              const vals = c.options && c.options.length ? c.options : distinct(c.key)
              const cur = filters[c.key] || ''
              const useSelect = vals.length <= 80 && c.key !== 'phone' && c.key !== 'email' && c.key !== 'birth_date' && c.key !== 'created_at'
              return (
                <label key={c.key} className="flex flex-col gap-1 text-xs font-bold text-muted">{c.label}
                  {useSelect
                    ? <select value={cur} onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })} className={`h-10 px-2.5 rounded-xl border bg-white outline-none text-[14px] font-normal text-ink ${cur ? 'border-navy' : 'border-line'}`}><option value="">— vše —</option><option value="__empty">(prázdné)</option>{vals.map((v) => <option key={v} value={v}>{v}</option>)}</select>
                    : <input value={cur === '__empty' ? '' : cur} onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })} placeholder="obsahuje…" className={`h-10 px-2.5 rounded-xl border bg-white outline-none text-[14px] font-normal text-ink ${cur ? 'border-navy' : 'border-line'}`} />}
                </label>
              )
            })}
          </div>
        </Card>
      )}
      {dups.size > 0 && !onlyDups && <p className="m-0 -mt-1 text-xs text-muted"><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1.5" style={{ background: '#D9534F' }} />Červeně označené kontakty jsou pravděpodobně duplicitní (stejné jméno, telefon nebo e-mail).</p>}
      {colsOpen && (
        <Card className="p-3 md:p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <b className="text-sm">Zobrazené sloupce – šipkami změníte pořadí</b>
            <div className="flex flex-wrap gap-2">
              {cols.map((k, i) => (
                <span key={k} className="inline-flex items-center gap-1 h-9 pl-3 pr-1 rounded-full border border-navy bg-navy-soft text-navy text-sm font-semibold">
                  {COLS.find((c) => c.key === k)?.label || k}
                  <button disabled={i === 0} onClick={() => { const n = [...cols]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; saveCols(n) }} aria-label="Posunout doleva" className="w-7 h-7 rounded-full hover:bg-white disabled:opacity-30 inline-flex items-center justify-center"><Icon name="chevL" size={14} /></button>
                  <button disabled={i === cols.length - 1} onClick={() => { const n = [...cols]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; saveCols(n) }} aria-label="Posunout doprava" className="w-7 h-7 rounded-full hover:bg-white disabled:opacity-30 inline-flex items-center justify-center rotate-180"><Icon name="chevL" size={14} /></button>
                  <button onClick={() => saveCols(cols.filter((x) => x !== k))} aria-label="Skrýt sloupec" className="w-7 h-7 rounded-full hover:bg-white inline-flex items-center justify-center"><Icon name="x" size={14} /></button>
                </span>
              ))}
              {cols.length === 0 && <span className="text-sm text-muted">Žádné sloupce – vyberte níže.</span>}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <b className="text-sm">Další pole</b>
            <div className="flex flex-wrap gap-2">
              {COLS.filter((c) => !cols.includes(c.key)).map((c) => (
                <button key={c.key} onClick={() => saveCols([...cols, c.key])} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-line bg-white text-sm font-semibold"><Icon name="plus" size={14} />{c.label}</button>
              ))}
            </div>
          </div>
        </Card>
      )}
      {loading ? <Spinner /> : shown.length === 0 ? <Card><p className="m-0 p-5 text-sm text-muted">Nic nenalezeno.</p></Card> : (
        groups.map((g) => {
          const list = g.list
          const open = !collapsed[g.key]
          const visible = cols.filter((k) => k !== 'status' || view === 'abc')
          return (
            <Card key={g.key} className="overflow-hidden">
              <button onClick={() => setCollapsed({ ...collapsed, [g.key]: open })} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <Icon name="chevD" size={16} className={`text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
                {view === 'abc' ? <span className="w-8 h-8 rounded-[10px] bg-navy-soft text-navy inline-flex items-center justify-center font-extrabold">{g.key}</span>
                  : g.key ? <StatusChip status={g.key} /> : <span className="inline-flex items-center rounded-[10px] px-2.5 py-1 text-xs font-bold bg-chip text-muted">Bez typu</span>}
                <span className="text-sm font-bold text-muted">{list.length}</span>
              </button>
              {open && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[14px]">
                    <thead className="hidden md:table-header-group">
                      <tr className="text-xs text-muted text-left border-t border-line-soft">
                        <th className="font-semibold px-4 py-2 w-[26%] min-w-[220px]">Jméno</th>
                        {visible.map((k) => <th key={k} className="font-semibold px-3 py-2 whitespace-nowrap">{COLS.find((c) => c.key === k)?.label}</th>)}
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((c) => (
                        <tr key={c.id} title={dups.get(c.id) ? 'Možná duplicita: ' + dups.get(c.id) : undefined} className="border-t border-line-soft hover:bg-bg" style={dups.has(c.id) ? DUP_STYLE : undefined}>
                          <td className="px-4 py-2.5">
                            <Link to={`/kontakty/${c.id}`} className="flex items-center gap-2.5 min-w-0 no-underline text-ink">
                              <Avatar name={contactName(c)} size={30} />
                              <span className="flex flex-col min-w-0">
                                <b className="truncate flex items-center gap-1.5">{contactName(c) || 'Bez jména'}{dups.has(c.id) && <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide" style={{ background: '#FFD6D6', color: '#A12E2A' }}>duplicita</span>}</b>
                                <span className="md:hidden text-xs text-muted truncate">{visible.filter((k) => k !== 'tags').map((k) => colValue(c, k)).filter(Boolean).join(' · ')}</span>
                                {dups.has(c.id) && (
                                  <span className="flex items-center gap-2 flex-wrap text-xs font-semibold" style={{ color: '#A12E2A' }}>
                                    <span>{dups.get(c.id)}</span>
                                    <button onClick={(e) => { e.preventDefault(); ignoreDup(c) }} title="Přestat označovat jako duplicitu" className="inline-flex items-center gap-1 px-2 h-6 rounded-md border border-current bg-white text-[11px] font-bold hover:bg-[#FFE3E3]"><Icon name="check" size={12} />Není duplicita</button>
                                  </span>
                                )}
                              </span>
                            </Link>
                          </td>
                          {visible.map((k) => (
                            <td key={k} className="hidden md:table-cell px-3 py-1.5 text-muted whitespace-nowrap min-w-[120px] max-w-[260px]">
                              <CellEdit c={c} k={k} options={COLS.find((x) => x.key === k)?.options} onSave={(patch) => patchRow(c.id, patch)} />
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-right">
                            <button onClick={() => setDel(c)} aria-label="Smazat kontakt" title="Smazat kontakt" className="w-9 h-9 rounded-[10px] inline-flex items-center justify-center hover:bg-[#FFE3E3]" style={{ color: '#D9534F' }}><Icon name="trash" size={16} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )
        })
      )}
      <Sheet open={saveOpen} onClose={() => setSaveOpen(false)} title="Uložit zobrazení" footer={<div className="flex gap-2 justify-end flex-wrap">
        <Btn kind="ghost" onClick={() => setSaveOpen(false)}>Zrušit</Btn>
        {activeView && views.some((v) => v.id === activeView) && <Btn kind="ghost" onClick={() => saveCurrentView(true)}>Uložit jako nové</Btn>}
        <Btn onClick={() => saveCurrentView()} disabled={!saveName.trim()} icon="check">{activeView && views.some((v) => v.id === activeView) ? 'Přepsat' : 'Uložit'}</Btn>
      </div>}>
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm text-muted">Uloží se sloupce a jejich pořadí, typ zobrazení (podle typu / A–Z), zvolený typ kontaktu, filtry i hledaný text.</p>
          <label className="flex flex-col gap-1.5 text-xs font-bold text-muted">Název zobrazení
            <input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveCurrentView() }} placeholder="např. Prodávající Praha" className="h-12 px-3.5 rounded-[14px] border border-line bg-white outline-none text-[15px] font-normal text-ink" />
          </label>
        </div>
      </Sheet>
      <Sheet open={!!viewDel} onClose={() => setViewDel(null)} title="Smazat zobrazení?" footer={<div className="flex gap-2 justify-end"><Btn kind="ghost" onClick={() => setViewDel(null)}>Zrušit</Btn><Btn className="bg-[#D9534F]!" icon="trash" onClick={async () => { if (!viewDel) return; await persistViews(views.filter((v) => v.id !== viewDel.id)); if (activeView === viewDel.id) setActiveView(null); setViewDel(null) }}>Ano, smazat</Btn></div>}>
        <p className="m-0 text-[15px]">Smazat uložené zobrazení <b>{viewDel?.name}</b>? Kontakty zůstanou, smaže se jen toto nastavení.</p>
      </Sheet>
      <Sheet open={!!del} onClose={() => setDel(null)} title="Smazat kontakt?" footer={<div className="flex gap-2 justify-end"><Btn kind="ghost" onClick={() => setDel(null)}>Zrušit</Btn><Btn onClick={confirmDelete} disabled={deleting} className="bg-[#D9534F]!" icon="trash">{deleting ? 'Mažu…' : 'Ano, smazat'}</Btn></div>}>
        <p className="m-0 text-[15px]">Opravdu chcete smazat kontakt <b>{del ? contactName(del) : ''}</b>? Tuto akci nejde vrátit.</p>
      </Sheet>
    </div>
  )
}

export const fmtNameDay = (v: string | null | undefined) => { const m = /^(\d{2})-(\d{2})$/.exec(v || ''); return m ? `${Number(m[2])}. ${Number(m[1])}.` : '' }
const parseNameDay = (v: string): string | null => { const m = /^(\d{1,2})\.\s*(\d{1,2})\.?$/.exec(v.trim()); return m ? `${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null }

const FIELDS: { key: keyof Contact; label: string; type?: string }[] = [
  { key: 'first_name', label: 'Jméno' }, { key: 'last_name', label: 'Příjmení' },
  { key: 'salutation', label: 'Oslovení (pane Nováku)' }, { key: 'formality', label: 'Vykání / tykání', type: 'formality' },
  { key: 'phone', label: 'Telefon', type: 'tel' }, { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'street', label: 'Ulice' }, { key: 'house_no', label: 'Číslo popisné / orientační' },
  { key: 'city', label: 'Město / obec' }, { key: 'zip', label: 'PSČ' },
  { key: 'birth_date', label: 'Datum narození', type: 'date' }, { key: 'name_day', label: 'Svátek (automaticky podle jména)', type: 'nameday' }, { key: 'birth_number', label: 'Rodné číslo', type: 'secret' }, { key: 'gender', label: 'Pohlaví', type: 'gender' }, { key: 'country', label: 'Země' }, { key: 'source', label: 'Zdroj kontaktu' },
]

export function ContactDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { stageById, fields, role } = useApp()
  const isAdmin = role === 'owner' || role === 'admin'
  const HIDDEN_FIELDS = ['zarazeni', 'provereni_registru', 'titul'] // skryté na přání (data v databázi zůstávají do smazání)
  const customFields = fields.filter((f) => f.entity === 'contact' && !f.is_core && !HIDDEN_FIELDS.includes(f.key))
  const [c, setC] = useState<Contact | null>(null)
  const [deals, setDeals] = useState<{ role: string; deals: Deal | null }[]>([])
  const [replyOpen, setReplyOpen] = useState(false)
  const [smsInit, setSmsInit] = useState('')
  const [sms, setSms] = useState<{ id: string; message: string; sent_at: string; status: string; kind: string; reply?: boolean }[]>([])

  useEffect(() => {
    if (!id) return
    supabase.from('contacts').select('*').eq('id', id).single().then(({ data }) => setC(data as Contact))
    supabase.from('deal_contacts').select('role, deals(*)').eq('contact_id', id).then(({ data }) => setDeals((data as never) || []))
    loadSms()
    // odpověď, která přijde při otevřeném kontaktu, se rovnou ukáže a je přečtená
    const iv = setInterval(() => { loadSms(); supabase.from('sms_replies').update({ seen: true }).eq('contact_id', id).eq('seen', false).then(() => window.dispatchEvent(new Event('sms-seen'))) }, 15000)
    // otevření kontaktu = odpovědi jsou přečtené (zmizí z nástěnky i ze zvonečku)
    supabase.from('sms_replies').update({ seen: true }).eq('contact_id', id).eq('seen', false).then(() => window.dispatchEvent(new Event('sms-seen')))
    return () => clearInterval(iv)
  }, [id])
  function loadSms() {
    if (!id) return
    Promise.all([
      supabase.from('sms_log').select('id, message, sent_at, status, kind').eq('contact_id', id).order('sent_at', { ascending: false }).limit(20),
      supabase.from('sms_replies').select('id, message, received_at').eq('contact_id', id).order('received_at', { ascending: false }).limit(20),
    ]).then(([a, b]) => {
      const out = [...((a.data || []) as { id: string; message: string; sent_at: string; status: string; kind: string }[]), ...((b.data || []) as { id: string; message: string; received_at: string }[]).map((r) => ({ id: r.id, message: r.message, sent_at: r.received_at, status: 'ok', kind: 'odpoved', reply: true }))]
      setSms(out.sort((x, y) => +new Date(y.sent_at) - +new Date(x.sent_at)))
    })
  }

  async function save(k: keyof Contact, v: unknown) {
    if (!c) return
    setC({ ...c, [k]: v } as Contact)
    const { error } = await supabase.from('contacts').update({ [k]: v === '' ? null : v }).eq('id', c.id)
    if (error) alert(error.message)
  }

  if (!c) return <Spinner />
  const inp = 'h-11 px-3 rounded-xl border border-line bg-white outline-none text-[15px] w-full'
  return (
    <div className="px-4 md:px-9 pt-11 md:pt-8 max-w-[900px] flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={() => nav(-1)} aria-label="Zpět" className="w-11 h-11 rounded-[14px] border border-line bg-white inline-flex items-center justify-center"><Icon name="chevL" /></button>
        <Avatar name={contactName(c)} size={44} />
        <h1 className="m-0 text-[26px] md:text-[30px] font-extrabold tracking-tight truncate mr-auto">{contactName(c) || 'Bez jména'}</h1>
        <StatusPicker status={c.status} onChange={(v) => save('status', v)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {c.phone ? <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="h-12 rounded-2xl bg-chip font-bold text-sm inline-flex items-center justify-center gap-2 no-underline text-ink"><Icon name="phone" size={18} />Volat</a> : <span />}
        {c.phone ? <a href={`sms:${c.phone.replace(/\s/g, '')}`} className="h-12 rounded-2xl bg-chip font-bold text-sm inline-flex items-center justify-center gap-2 no-underline text-ink"><Icon name="sms" size={18} />SMS</a> : <span />}
        {c.email ? <button onClick={() => openGmail(c.email!)} className="h-12 rounded-2xl bg-chip font-bold text-sm inline-flex items-center justify-center gap-2 text-ink"><Icon name="mail" size={18} />E-mail</button> : <span />}
      </div>
      <Link to={`/obchody/novy?contact=${c.id}`} className="h-12 rounded-2xl bg-navy text-white font-bold text-sm inline-flex items-center justify-center gap-2 no-underline"><Icon name="plus" size={18} />Založit nový obchod</Link>
      {deals.length > 0 && (
        <Card className="p-4 md:p-6 flex flex-col gap-2">
          <h2 className="m-0 text-base font-extrabold">Nemovitosti</h2>
          {deals.map((d) => d.deals && (
            <Link key={d.deals.id} to={`/obchody/${d.deals.id}`} className="flex items-center gap-3 py-2.5 border-t border-line-soft first-of-type:border-0 no-underline text-ink">
              <CoverImg d={d.deals} w={240} h={180} className="w-[72px] h-[54px] rounded-xl object-cover shrink-0"
                fallback={<span className="w-[72px] h-[54px] rounded-xl bg-navy-soft text-navy inline-flex items-center justify-center shrink-0"><Icon name="home" size={22} /></span>} />
              <span className="flex flex-col mr-auto min-w-0"><b className="text-[15px] truncate">{d.deals.title}</b><span className="text-xs text-muted">{d.role}</span></span>
              <StagePill stage={stageById(d.deals.stage_id)} size="sm" />
            </Link>
          ))}
        </Card>
      )}
      <Card className="p-4 md:p-6">
        <div className="grid md:grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-xs font-bold text-muted">{f.label}
              {f.type === 'gender'
                ? <select value={c.gender || ''} onChange={(e) => save('gender', e.target.value || null)} className={inp}><option value="">—</option><option value="muž">Muž</option><option value="žena">Žena</option></select>
                : f.type === 'nameday'
                ? <DeferredInput value={fmtNameDay(c.name_day)} onSave={(v) => save('name_day', parseNameDay(v))} className={inp} />
                : f.type === 'secret'
                ? <SecretField contactId={c.id} raw={c.birth_number} className={inp} />
                : f.type === 'formality'
                ? <div className="h-11 flex items-center"><FormalityChip value={c.formality} onChange={(v) => save('formality', v)} /></div>
                : <DeferredInput type={f.type || 'text'} value={(c[f.key] as string) || ''} onSave={(v) => save(f.key, v)} className={inp} />}
            </label>
          ))}
        </div>
        {customFields.length > 0 && (
          <div className="grid md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-line-soft">
            {customFields.map((f) => <FieldInput key={f.key} f={f} value={c.custom?.[f.key]} onSave={(v) => save('custom', { ...(c.custom || {}), [f.key]: v })} />)}
          </div>
        )}
        <label className="flex flex-col gap-1 text-xs font-bold text-muted mt-3">Štítky (oddělené čárkou)
          <DeferredInput value={c.tags.join(', ')} onSave={(v) => save('tags', v.split(',').map((x) => x.trim()).filter(Boolean))} className={inp} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted mt-3">Poznámky
          <DeferredText value={c.notes || ''} onSave={(v) => save('notes', v)} />
        </label>
      </Card>
      {(sms.length > 0 || !!c.phone) && (
        <Card className="p-4 md:p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-1"><h2 className="m-0 text-base font-extrabold">SMS komunikace</h2>{isAdmin && c.phone && <button onClick={() => { setSmsInit(''); setReplyOpen(true) }} className="ml-auto h-9 px-3 rounded-xl bg-navy text-white text-sm font-bold inline-flex items-center gap-2"><Icon name="sms" size={16} />Napsat SMS</button>}</div>
          {sms.length === 0 && <span className="text-sm text-muted">Zatím žádná SMS.</span>}
          {sms.map((m) => m.reply
            ? <div key={m.id} className="flex flex-col py-2 px-3 my-1 rounded-xl bg-gold-soft text-sm"><span className="text-xs text-gold-ink font-bold">{new Date(m.sent_at).toLocaleString('cs-CZ')} · odpověď klienta</span><span className="whitespace-pre-line font-semibold">{m.message}</span></div>
            : <div key={m.id} className="flex flex-col py-2 border-t border-line-soft text-sm"><span className="text-xs text-muted">{new Date(m.sent_at).toLocaleString('cs-CZ')} · {m.kind === 'svatek' ? 'přání k svátku' : m.kind === 'narozeniny' ? 'přání k narozeninám' : m.kind === 'odpoved' ? 'vaše SMS' : m.kind}{m.status === 'failed' ? ' · neodesláno' : ''}</span><span className="whitespace-pre-line">{m.message}</span></div>)}
        </Card>
      )}
      <SanctionsCard c={c} isAdmin={isAdmin} onChange={(sx) => setC({ ...c, sanctions: sx })} />
      <BankIdCard c={c} onSendLink={(t) => { setSmsInit(t); setReplyOpen(true) }} onFilled={() => supabase.from('contacts').select('*').eq('id', c.id).single().then(({ data }) => data && setC(data as Contact))} />
      {replyOpen && <SmsSheet key={smsInit} initial={smsInit} contact={c} onClose={() => { setReplyOpen(false); setSmsInit('') }} onSent={loadSms} />}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 text-sm text-muted"><Toggle on={!!c.dup_ignored} onChange={(v) => save('dup_ignored', v)} label="Neoznačovat tento kontakt jako duplicitu" />Neoznačovat tento kontakt jako duplicitu</div>
        <div className="flex items-center gap-3 text-sm text-muted"><Toggle on={c.auto_wishes !== false} onChange={(v) => save('auto_wishes', v)} label="Automatická přání SMS" />Automatická přání SMS (svátek, narozeniny)</div>
      </div>
      <button onClick={async () => { if (confirm('Smazat kontakt?')) { await supabase.from('contacts').delete().eq('id', c.id); nav('/kontakty') } }}
        className="self-start text-sm font-bold text-[#9A3A14] h-10 inline-flex items-center gap-2"><Icon name="trash" size={16} />Smazat kontakt</button>
      {isAdmin && (
        <Card className="p-4 md:p-5 flex flex-col gap-2">
          <b className="text-sm">Ochrana osobních údajů (GDPR)</b>
          <p className="m-0 text-xs text-muted">Na žádost klienta: export všech údajů o něm, nebo jejich úplné smazání (kontakt, SMS, aktivity, vazby na obchody). Rodné číslo se do exportu nedává. Obě akce se zapisují do auditního logu.</p>
          <div className="flex flex-wrap gap-2">
            <Btn kind="ghost" onClick={async () => {
              const { data, error } = await supabase.rpc('gdpr_export_contact', { p_contact: c.id })
              if (error || !data) { alert('Export se nepodařil: ' + (error?.message || 'bez dat')); return }
              const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
              const a = document.createElement('a'); a.href = url; a.download = `export-${(contactName(c) || 'klient').replace(/\s+/g, '-')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000)
            }}>Exportovat údaje klienta</Btn>
            <Btn kind="ghost" onClick={async () => {
              if (!confirm('Opravdu NENÁVRATNĚ smazat všechna data tohoto klienta (kontakt, SMS, aktivity, vazby na obchody)? Obchody zůstanou.')) return
              const { error } = await supabase.rpc('gdpr_erase_contact', { p_contact: c.id })
              if (error) { alert('Smazání se nepodařilo: ' + error.message); return }
              nav('/kontakty')
            }}>Smazat všechna data klienta</Btn>
          </div>
        </Card>
      )}
    </div>
  )
}

function DeferredInput({ value, onSave, className, type = 'text' }: { value: string; onSave: (v: string) => void; className: string; type?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input type={type} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v.trim())} className={className} />
}

function DeferredText({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <textarea rows={4} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} className="p-3 rounded-xl border border-line outline-none text-[15px] text-ink font-normal" />
}

// Rodné číslo je v databázi zašifrované: zobrazí se až po klepnutí (zapíše se do auditního logu), uložení ho znovu zašifruje.
function SecretField({ contactId, raw, className }: { contactId: string; raw?: string | null; className: string }) {
  const [shown, setShown] = useState<string | null>(null)
  const [has, setHas] = useState(!!raw)
  const [busy, setBusy] = useState(false)
  async function show() { setBusy(true); setShown(await revealBirthNumber(contactId, raw)); setBusy(false) }
  async function save(v: string) {
    const { error } = await supabase.from('contacts').update({ birth_number: v.trim() === '' ? null : v.trim() }).eq('id', contactId)
    if (error) { alert(error.message); return }
    setHas(v.trim() !== ''); setShown(null)
  }
  if (shown === null) {
    return (
      <div className="flex items-center gap-2">
        <span className={`${className} flex items-center text-muted`}>{has ? MASK : 'není zadáno'}</span>
        <button type="button" onClick={show} disabled={busy} className="h-11 px-3 rounded-xl border border-line bg-white text-sm font-bold text-navy whitespace-nowrap">{has ? 'Zobrazit' : 'Zadat'}</button>
      </div>
    )
  }
  return <DeferredInput value={shown} onSave={save} className={className} />
}


const SMS_SIGN = '\n\nMartin Tesárek www.martintesarek.cz (odesláno prostřednictvím SMS brány, pro případnou odpověď použijte prosím moje osobní číslo 776 252 777)'
// Ruční SMS klientovi: nejdřív náhled celého textu, odeslání až po potvrzení.
function SmsSheet({ contact, onClose, onSent, initial = '' }: { contact: Contact; onClose: () => void; onSent: () => void; initial?: string }) {
  const [text, setText] = useState(initial)
  const [step, setStep] = useState<'edit' | 'confirm'>(initial ? 'confirm' : 'edit')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const full = text.trim() + SMS_SIGN
  async function send() {
    setBusy(true); setErr('')
    const { data, error } = await supabase.functions.invoke('sms-send', { body: { contact_id: contact.id, message: full } })
    setBusy(false)
    const msg = error ? ((await (error as { context?: Response }).context?.json?.().catch(() => null))?.error || error.message) : (data as { error?: string })?.error
    if (msg) { setErr(String(msg)); return }
    onSent(); onClose()
  }
  return (
    <Sheet open onClose={onClose} title={`SMS pro ${contactName(contact)}`}
      footer={step === 'edit'
        ? <Btn className="w-full" disabled={!text.trim()} onClick={() => setStep('confirm')}>Zkontrolovat před odesláním</Btn>
        : <div className="flex gap-2 w-full"><Btn kind="ghost" className="flex-1" onClick={() => setStep('edit')}>Upravit</Btn><Btn kind="gold" className="flex-1" disabled={busy} onClick={send}>{busy ? 'Odesílám…' : 'Odeslat SMS'}</Btn></div>}>
      <div className="flex flex-col gap-3">
        <span className="text-sm text-muted">Na číslo {contact.phone}</span>
        {step === 'edit'
          ? <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} autoFocus placeholder="Napište odpověď…" className="w-full rounded-xl border border-line p-3 text-[15px] outline-none focus:border-navy" />
          : <div className="rounded-xl bg-chip p-3 text-[15px] whitespace-pre-line">{full}</div>}
        {step === 'confirm' && <span className="text-sm font-bold">Takto SMS odejde. Potvrďte odeslání.</span>}
        {err && <span className="text-sm text-[#B42318]">{err}</span>}
      </div>
    </Sheet>
  )
}
