import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../lib/app'
import { supabase } from '../lib/supabase'
import type { Contact } from '../lib/types'
import { contactName } from '../lib/format'
import { Avatar, Btn, Card, Spinner, StagePill, StatusChip, CONTACT_STATUSES } from '../components/ui'
import { Icon } from '../components/Icon'

export function Contacts() {
  const { account } = useApp()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [rows, setRows] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()

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
    supabase.from('contacts').select('status').eq('account_id', account.id).then(({ data }) => { const m: Record<string, number> = {}; for (const r of (data || []) as { status: string | null }[]) m[r.status || ''] = (m[r.status || ''] || 0) + 1; setCounts(m) })
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
      </div>
      {loading ? <Spinner /> : (
        <Card className="overflow-hidden">
          {rows.length === 0 && <p className="m-0 p-5 text-sm text-muted">Nic nenalezeno.</p>}
          {rows.map((c) => (
            <Link key={c.id} to={`/kontakty/${c.id}`} className="flex items-center gap-3 px-4 py-3 border-t border-line-soft first:border-0 no-underline text-ink hover:bg-bg">
              <Avatar name={contactName(c)} size={38} />
              <span className="flex flex-col min-w-0 mr-auto">
                <b className="text-[15px] truncate">{contactName(c) || 'Bez jména'}</b>
                <span className="text-[13px] text-muted truncate">{[c.phone, c.email, c.city].filter(Boolean).join(' · ')}</span>
              </span>
              <StatusChip status={c.status} size="sm" />
              {c.tags.slice(0, 2).map((t) => <span key={t} className="hidden md:inline px-2 py-1 rounded-lg bg-chip text-xs font-bold">{t}</span>)}
            </Link>
          ))}
        </Card>
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
        <select aria-label="Typ kontaktu" value={c.status || ''} onChange={(e) => save('status', e.target.value || null)} className="h-10 px-3 rounded-xl border border-line bg-white text-sm font-bold shrink-0">
          <option value="">— typ —</option>{CONTACT_STATUSES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
        </select>
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
