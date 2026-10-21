import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../lib/app'
import { supabase } from '../lib/supabase'
import type { Contact } from '../lib/types'
import { contactName } from '../lib/format'
import { Avatar, Btn, Card, Spinner, StagePill, StatusChip, StatusPicker, CONTACT_STATUSES } from '../components/ui'
import { Icon } from '../components/Icon'

type ColKey = 'status' | 'phone' | 'email' | 'salutation' | 'city' | 'source' | 'birth_date' | 'name_day' | 'tags' | 'formality'
const COLS: { key: ColKey; label: string }[] = [
  { key: 'status', label: 'Typ (prodávající…)' }, { key: 'phone', label: 'Telefon' }, { key: 'email', label: 'E-mail' }, { key: 'salutation', label: 'Oslovení' },
  { key: 'formality', label: 'Vykání / tykání' }, { key: 'city', label: 'Město' }, { key: 'source', label: 'Zdroj' }, { key: 'birth_date', label: 'Datum narození' }, { key: 'name_day', label: 'Svátek' }, { key: 'tags', label: 'Štítky' },
]
const DEFAULT_COLS: ColKey[] = ['status', 'phone', 'email', 'salutation']
const GROUPS = [...CONTACT_STATUSES.map((s) => ({ key: s.key })), { key: '' }]
function colValue(c: Contact, k: ColKey): string {
  switch (k) {
    case 'phone': return c.phone || ''
    case 'email': return c.email || ''
    case 'salutation': return c.salutation || ''
    case 'formality': return c.formality === 'tykani' ? 'tykání' : c.formality === 'vykani' ? 'vykání' : ''
    case 'city': return c.city || ''
    case 'source': return c.source || ''
    case 'birth_date': return c.birth_date ? new Date(c.birth_date).toLocaleDateString('cs-CZ') : ''
    case 'name_day': return c.name_day ? 'svátek ' + fmtNameDay(c.name_day) : ''
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
  const { account } = useApp()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [rows, setRows] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [created, setCreated] = useState<string[]>([])
  const [cols, setCols] = useState<ColKey[]>(DEFAULT_COLS)
  const [colsOpen, setColsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const { session } = useApp()
  const nav = useNavigate()
  useEffect(() => {
    if (!session) return
    supabase.from('profiles').select('settings').eq('id', session.user.id).single().then(({ data }) => {
      const c = ((data?.settings || {}) as { contacts_columns?: ColKey[] }).contacts_columns
      if (Array.isArray(c)) setCols(c.filter((k) => COLS.some((x) => x.key === k)))
    })
  }, [session])
  async function saveCols(next: ColKey[]) {
    setCols(next)
    if (!session) return
    const { data } = await supabase.from('profiles').select('settings').eq('id', session.user.id).single()
    await supabase.from('profiles').update({ settings: { ...((data?.settings as object) || {}), contacts_columns: next } }).eq('id', session.user.id)
  }

  useEffect(() => {
    if (!account) return
    const t = setTimeout(async () => {
      setLoading(true)
      let query = supabase.from('contacts').select('*').eq('account_id', account.id).order('last_name', { nullsFirst: false }).limit(200)
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
    supabase.from('contacts').select('status, created_at').eq('account_id', account.id).then(({ data }) => { const m: Record<string, number> = {}; const cr: string[] = []; for (const r of (data || []) as { status: string | null; created_at: string }[]) { m[r.status || ''] = (m[r.status || ''] || 0) + 1; cr.push(r.created_at) } setCounts(m); setCreated(cr) })
  }, [account, rows.length])

  async function create() {
    if (!account) return
    const { data } = await supabase.from('contacts').insert({ account_id: account.id, first_name: 'Nový', last_name: 'kontakt' }).select().single()
    if (data) nav(`/kontakty/${data.id}`)
  }

  return (
    <div className="px-4 md:px-9 pt-11 md:pt-8 max-w-[1000px] flex flex-col gap-4">
      <header className="flex items-center gap-2.5">
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
        <button onClick={() => setColsOpen(!colsOpen)} aria-expanded={colsOpen} className="ml-auto h-9 px-3 rounded-full text-sm font-bold whitespace-nowrap border border-line bg-white inline-flex items-center gap-1.5"><Icon name="layout" size={14} />Sloupce</button>
      </div>
      {colsOpen && (
        <Card className="p-3 flex flex-wrap gap-2">
          {COLS.map((c) => (
            <label key={c.key} className={`inline-flex items-center gap-2 h-9 px-3 rounded-full border text-sm font-semibold cursor-pointer ${cols.includes(c.key) ? 'bg-navy-soft border-navy text-navy' : 'border-line'}`}>
              <input type="checkbox" className="accent-navy" checked={cols.includes(c.key)} onChange={(e) => saveCols(e.target.checked ? [...cols, c.key] : cols.filter((k) => k !== c.key))} />{c.label}
            </label>
          ))}
        </Card>
      )}
      {loading ? <Spinner /> : rows.length === 0 ? <Card><p className="m-0 p-5 text-sm text-muted">Nic nenalezeno.</p></Card> : (
        GROUPS.filter((g) => !status || g.key === status).map((g) => {
          const list = rows.filter((c) => (c.status || '') === g.key)
          if (!list.length) return null
          const open = !collapsed[g.key]
          const visible = cols.filter((k) => k !== 'status')
          return (
            <Card key={g.key} className="overflow-hidden">
              <button onClick={() => setCollapsed({ ...collapsed, [g.key]: open })} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <Icon name="chevD" size={16} className={`text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
                {g.key ? <StatusChip status={g.key} /> : <span className="inline-flex items-center rounded-[10px] px-2.5 py-1 text-xs font-bold bg-chip text-muted">Bez typu</span>}
                <span className="text-sm font-bold text-muted">{list.length}</span>
              </button>
              {open && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[14px]">
                    <thead className="hidden md:table-header-group">
                      <tr className="text-xs text-muted text-left border-t border-line-soft">
                        <th className="font-semibold px-4 py-2 w-[32%]">Jméno</th>
                        {visible.map((k) => <th key={k} className="font-semibold px-3 py-2 whitespace-nowrap">{COLS.find((c) => c.key === k)?.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((c) => (
                        <tr key={c.id} onClick={() => nav(`/kontakty/${c.id}`)} className="border-t border-line-soft hover:bg-bg cursor-pointer">
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-2.5 min-w-0">
                              <Avatar name={contactName(c)} size={30} />
                              <span className="flex flex-col min-w-0">
                                <b className="truncate">{contactName(c) || 'Bez jména'}</b>
                                <span className="md:hidden text-xs text-muted truncate">{visible.filter((k) => k !== 'tags').map((k) => colValue(c, k)).filter(Boolean).join(' · ')}</span>
                              </span>
                            </span>
                          </td>
                          {visible.map((k) => (
                            <td key={k} className="hidden md:table-cell px-3 py-2.5 text-muted whitespace-nowrap max-w-[220px] truncate">
                              {k === 'tags' ? c.tags.slice(0, 3).map((t) => <span key={t} className="inline-block mr-1 px-2 py-0.5 rounded-lg bg-chip text-xs font-bold text-ink">{t}</span>) : (colValue(c, k) || '–')}
                            </td>
                          ))}
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
  { key: 'birth_date', label: 'Datum narození', type: 'date' }, { key: 'name_day', label: 'Svátek (automaticky podle jména)', type: 'nameday' }, { key: 'source', label: 'Zdroj kontaktu' },
]

export function ContactDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { stageById } = useApp()
  const [c, setC] = useState<Contact | null>(null)
  const [deals, setDeals] = useState<{ role: string; deals: { id: string; title: string; stage_id: string | null } | null }[]>([])
  const [sms, setSms] = useState<{ id: string; message: string; sent_at: string; status: string; kind: string }[]>([])

  useEffect(() => {
    if (!id) return
    supabase.from('contacts').select('*').eq('id', id).single().then(({ data }) => setC(data as Contact))
    supabase.from('deal_contacts').select('role, deals(id, title, stage_id)').eq('contact_id', id).then(({ data }) => setDeals((data as never) || []))
    supabase.from('sms_log').select('id, message, sent_at, status, kind').eq('contact_id', id).order('sent_at', { ascending: false }).limit(10).then(({ data }) => setSms((data as never) || []))
  }, [id])

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
        <h1 className="m-0 text-2xl font-extrabold tracking-tight truncate mr-auto">{contactName(c) || 'Bez jména'}</h1>
        <StatusPicker status={c.status} onChange={(v) => save('status', v)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {c.phone ? <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="h-12 rounded-2xl bg-chip font-bold text-sm inline-flex items-center justify-center gap-2 no-underline text-ink"><Icon name="phone" size={18} />Volat</a> : <span />}
        {c.phone ? <a href={`sms:${c.phone.replace(/\s/g, '')}`} className="h-12 rounded-2xl bg-chip font-bold text-sm inline-flex items-center justify-center gap-2 no-underline text-ink"><Icon name="sms" size={18} />SMS</a> : <span />}
        {c.email ? <a href={`mailto:${c.email}`} className="h-12 rounded-2xl bg-chip font-bold text-sm inline-flex items-center justify-center gap-2 no-underline text-ink"><Icon name="mail" size={18} />E-mail</a> : <span />}
      </div>
      {deals.length > 0 && (
        <Card className="p-4 md:p-6 flex flex-col gap-2">
          <h2 className="m-0 text-base font-extrabold">Obchody</h2>
          {deals.map((d) => d.deals && (
            <Link key={d.deals.id} to={`/obchody/${d.deals.id}`} className="flex items-center gap-3 py-2 border-t border-line-soft first-of-type:border-0 no-underline text-ink">
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
              {f.type === 'nameday'
                ? <DeferredInput value={fmtNameDay(c.name_day)} onSave={(v) => save('name_day', parseNameDay(v))} className={inp} />
                : f.type === 'formality'
                ? <select value={c.formality || ''} onChange={(e) => save('formality', e.target.value || null)} className={inp}><option value="">—</option><option value="vykani">Vykání</option><option value="tykani">Tykání</option></select>
                : <DeferredInput type={f.type || 'text'} value={(c[f.key] as string) || ''} onSave={(v) => save(f.key, v)} className={inp} />}
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted mt-3">Štítky (oddělené čárkou)
          <DeferredInput value={c.tags.join(', ')} onSave={(v) => save('tags', v.split(',').map((x) => x.trim()).filter(Boolean))} className={inp} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted mt-3">Poznámky
          <DeferredText value={c.notes || ''} onSave={(v) => save('notes', v)} />
        </label>
      </Card>
      {sms.length > 0 && (
        <Card className="p-4 md:p-6 flex flex-col">
          <h2 className="m-0 mb-1 text-base font-extrabold">Odeslané SMS</h2>
          {sms.map((m) => <div key={m.id} className="flex flex-col py-2 border-t border-line-soft text-sm"><span className="text-xs text-muted">{new Date(m.sent_at).toLocaleString('cs-CZ')} · {m.kind === 'svatek' ? 'přání k svátku' : m.kind === 'narozeniny' ? 'přání k narozeninám' : m.kind}{m.status === 'failed' ? ' · neodesláno' : ''}</span><span className="whitespace-pre-line">{m.message}</span></div>)}
        </Card>
      )}
      <button onClick={async () => { if (confirm('Smazat kontakt?')) { await supabase.from('contacts').delete().eq('id', c.id); nav('/kontakty') } }}
        className="self-start text-sm font-bold text-[#9A3A14] h-10 inline-flex items-center gap-2"><Icon name="trash" size={16} />Smazat kontakt</button>
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
