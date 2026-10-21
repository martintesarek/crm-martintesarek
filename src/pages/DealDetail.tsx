import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../lib/app'
import { supabase } from '../lib/supabase'
import { DEAL_SELECT, primaryContact } from '../lib/deals'
import type { Activity, Contact, Deal, FieldDef, Task } from '../lib/types'
import { BLOCKS, contactName, czk, dateLong, dateTime, daysSince } from '../lib/format'
import { Icon } from '../components/Icon'
import { Avatar, Btn, Card, Sheet, Spinner, StagePill, StatusPicker, CONTACT_STATUSES, FieldInput } from '../components/ui'
import { PortalCard } from '../components/PortalCard'
import { DriveCard } from '../components/DriveCard'
import { DocumentsCard } from '../components/DocumentsCard'
import { openVoiceNote } from '../components/VoiceNote'

const DEAL_COLS = new Set(['address', 'category', 'transaction_type', 'source', 'expected_commission', 'listing_price', 'drive_folder_url'])

export function DealDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { stages, stageById, fields, members, session } = useApp()
  const [deal, setDeal] = useState<Deal | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [acts, setActs] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [stageOpen, setStageOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [d, t, a] = await Promise.all([
      supabase.from('deals').select(DEAL_SELECT).eq('id', id).single(),
      supabase.from('tasks').select('*').eq('deal_id', id).order('done').order('position').order('created_at'),
      supabase.from('activities').select('*').eq('deal_id', id).order('created_at', { ascending: false }).limit(200),
    ])
    setDeal(d.data as Deal); setTasks((t.data as Task[]) || []); setActs((a.data as Activity[]) || []); setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.dealId === id) load() }
    window.addEventListener('deal-updated', h)
    return () => window.removeEventListener('deal-updated', h)
  }, [id, load])

  async function save(patch: Partial<Deal>) {
    if (!deal) return
    setDeal({ ...deal, ...patch })
    const { error } = await supabase.from('deals').update(patch).eq('id', deal.id)
    if (error) alert('Uložení se nepovedlo: ' + error.message)
    if ('stage_id' in patch) load()
  }

  if (loading) return <Spinner />
  if (!deal) return <div className="p-8">Obchod nenalezen. <Link to="/obchody">Zpět</Link></div>

  const stage = stageById(deal.stage_id)
  const c = primaryContact(deal)
  const openStages = stages.filter((s) => s.kind === 'open' && !s.hidden)
  const idx = openStages.findIndex((s) => s.id === deal.stage_id)
  const next = idx >= 0 ? openStages[idx + 1] : undefined
  const blockIdx = stage ? BLOCKS.indexOf(stage.block as typeof BLOCKS[number]) : -1
  const memberName = (uid: string | null) => { const m = members.find((x) => x.user_id === uid); return m?.profiles?.full_name || m?.profiles?.email || 'Systém' }

  return (
    <div className="px-4 md:px-9 pt-11 md:pt-7 pb-6 max-w-[1240px] flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <button onClick={() => nav(-1)} aria-label="Zpět" className="w-11 h-11 rounded-[14px] border border-line bg-white inline-flex items-center justify-center"><Icon name="chevL" /></button>
        <Link to="/obchody" className="hidden md:inline text-[13px] font-bold no-underline text-navy">Obchody</Link>
        <span className="mr-auto" />
        {deal.clickup_id && <a href={`https://app.clickup.com/t/${deal.clickup_id}`} target="_blank" rel="noreferrer" className="text-xs text-muted no-underline">ClickUp</a>}
      </div>

      <div className="grid md:grid-cols-[minmax(0,1fr)_380px] gap-4 md:gap-5 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Card className="overflow-hidden">
            <Cover deal={deal} onChange={(url) => save({ cover_url: url })} />
            <div className="p-4 md:p-6 flex flex-col gap-3.5">
              <button onClick={() => setStageOpen(true)} className="self-start inline-flex items-center gap-1" aria-label="Změnit fázi">
                <StagePill stage={stage} /><Icon name="chevD" size={16} />
              </button>
              <InlineText value={deal.title} onSave={(v) => v && save({ title: v })} className="text-[22px] md:text-[28px] font-extrabold tracking-tight leading-tight" label="Název obchodu" />
              <span className="text-sm text-muted -mt-2">
                {[contactName(c), czk(deal.listing_price)].filter(Boolean).join(' · ')}{stage ? ` · ve fázi ${daysSince(deal.stage_changed_at)} dní` : ''}
              </span>
              <div className="grid grid-cols-6 gap-1" aria-label={`Průběh: ${stage?.block || ''}`}>
                {BLOCKS.slice(0, 6).map((b, i) => (
                  <span key={b} title={b} className="h-1.5 rounded-full" style={{ background: i < blockIdx ? '#282F69' : i === blockIdx ? '#CB992E' : '#E6E8F0' }} />
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2">
                <Quick icon="phone" label="Volat" href={c?.phone ? `tel:${c.phone.replace(/\s/g, '')}` : undefined} />
                <Quick icon="sms" label="SMS" href={c?.phone ? `sms:${c.phone.replace(/\s/g, '')}` : undefined} />
                <Quick icon="mail" label="E-mail" href={c?.email ? `mailto:${c.email}` : undefined} />
                <Quick icon="pin" label="Navigovat" href={deal.address ? `https://maps.google.com/?q=${encodeURIComponent(deal.address)}` : undefined} />
                <Quick icon="folder" label="Disk" href={deal.drive_folder_url || undefined} />
              </div>
              <div className="flex flex-col md:flex-row gap-2">
                <Btn kind="gold" onClick={() => openVoiceNote(deal.id)} className="w-full md:w-auto" icon="mic">Hlasová poznámka</Btn>
                {next && <Btn onClick={() => save({ stage_id: next.id })} className="w-full md:w-auto" icon="arrow">Posunout do: {next.name}</Btn>}
              </div>
            </div>
          </Card>

          <Prices deal={deal} onSave={save} />
          <Fields deal={deal} fields={fields.filter((f) => f.entity === 'deal')} onSave={save} />

          <Card className="p-4 md:p-6">
            <div className="flex items-center mb-2">
              <h2 className="m-0 mr-auto text-base font-extrabold">Kontakty</h2>
              <button onClick={() => setContactOpen(true)} className="text-sm font-bold text-navy h-10 px-2">+ Přidat</button>
            </div>
            {(deal.deal_contacts || []).length === 0 && <p className="m-0 text-sm text-muted">Zatím žádný kontakt.</p>}
            {(deal.deal_contacts || []).map((dc) => dc.contacts && (
              <div key={dc.contacts.id} className="flex items-center gap-3 py-2.5 border-t border-line-soft first-of-type:border-0">
                <Avatar name={contactName(dc.contacts)} size={36} />
                <Link to={`/kontakty/${dc.contacts.id}`} className="min-w-0 mr-auto no-underline text-ink"><b className="text-[15px] truncate block">{contactName(dc.contacts) || 'Bez jména'}</b></Link>
                <StatusPicker status={dc.contacts.status} onChange={async (v) => { await supabase.from('contacts').update({ status: v }).eq('id', dc.contacts!.id); load() }} />
                <button aria-label="Odebrat kontakt" onClick={async () => { await supabase.from('deal_contacts').delete().eq('deal_id', deal.id).eq('contact_id', dc.contacts!.id); load() }} className="w-10 h-10 rounded-xl text-muted inline-flex items-center justify-center"><Icon name="x" size={18} /></button>
              </div>
            ))}
          </Card>

          <DriveCard deal={deal} onSave={save} reload={load} />
          <DocumentsCard deal={deal} reload={load} />
          <Description deal={deal} onSave={save} />
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <PortalCard deal={deal} onSave={save} />
          <Tasks deal={deal} tasks={tasks} setTasks={setTasks} memberName={memberName} />
          <Activities deal={deal} acts={acts} reload={load} memberName={memberName} stageName={(sid) => stageById(sid)?.name || '—'} userId={session?.user.id} />
          <button onClick={async () => { if (confirm(`Opravdu smazat obchod „${deal.title}“?`)) { await supabase.from('deals').delete().eq('id', deal.id); nav('/obchody') } }}
            className="self-start text-sm font-bold text-[#9A3A14] h-10 inline-flex items-center gap-2"><Icon name="trash" size={16} />Smazat obchod</button>
        </div>
      </div>

      <Sheet open={stageOpen} onClose={() => setStageOpen(false)} title="Změnit fázi">
        {BLOCKS.map((b) => {
          const list = stages.filter((s) => s.block === b && (!s.hidden || s.id === deal.stage_id))
          if (!list.length) return null
          return (
            <div key={b}>
              <div className="px-2 pt-3.5 pb-1.5 text-[11px] font-extrabold tracking-[.06em] text-muted uppercase">{b}</div>
              {list.map((s) => (
                <button key={s.id} onClick={() => { save({ stage_id: s.id }); setStageOpen(false) }}
                  className="w-full flex items-center gap-3 min-h-[50px] px-3 rounded-[14px] text-left text-[15px]"
                  style={{ background: s.id === deal.stage_id ? s.color + '24' : undefined, fontWeight: s.id === deal.stage_id ? 700 : 500 }}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="mr-auto">{s.name}</span>
                  {s.id === deal.stage_id && <Icon name="check" className="text-navy" />}
                </button>
              ))}
            </div>
          )
        })}
      </Sheet>

      <AddContact open={contactOpen} onClose={() => setContactOpen(false)} deal={deal} onDone={() => { setContactOpen(false); load() }} />
    </div>
  )
}

function Quick({ icon, label, href }: { icon: string; label: string; href?: string }) {
  const cls = 'flex flex-col items-center gap-1.5 py-2.5 rounded-2xl text-xs font-bold no-underline'
  if (!href) return <span className={`${cls} bg-bg text-[#A2A7C2]`} aria-disabled="true"><Icon name={icon} size={22} />{label}</span>
  return <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={`${cls} bg-chip text-ink`}><span className="text-navy"><Icon name={icon} size={22} /></span>{label}</a>
}

function Cover({ deal, onChange }: { deal: Deal; onChange: (url: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function upload(file: File) {
    setBusy(true)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${deal.account_id}/${deal.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('covers').upload(path, file, { contentType: file.type })
    setBusy(false)
    if (error) { alert('Nahrání se nepovedlo: ' + error.message); return }
    onChange(supabase.storage.from('covers').getPublicUrl(path).data.publicUrl)
  }
  const input = <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }} />
  if (deal.cover_url) {
    return (
      <div className="relative">
        <img src={deal.cover_url} alt="" className="w-full h-[200px] md:h-[300px] object-cover" />
        <button onClick={() => ref.current?.click()} className="absolute right-3 bottom-3 h-10 px-3.5 rounded-xl bg-white/95 text-sm font-bold inline-flex items-center gap-2"><Icon name="camera" size={18} />{busy ? 'Nahrávám…' : 'Změnit'}</button>
        {input}
      </div>
    )
  }
  return (
    <button onClick={() => ref.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) upload(f) }}
      className="w-full h-[120px] md:h-[150px] border-b-2 border-dashed border-[#C3C7DA] bg-bg flex items-center justify-center gap-3">
      <span className="w-12 h-12 rounded-2xl bg-navy-soft text-navy inline-flex items-center justify-center"><Icon name="camera" size={24} /></span>
      <span className="flex flex-col text-left"><b className="text-[15px] text-navy">{busy ? 'Nahrávám…' : 'Přidat náhledový obrázek'}</b><span className="text-xs text-muted">Vyfotit, vybrat z galerie nebo přetáhnout</span></span>
      {input}
    </button>
  )
}

function InlineText({ value, onSave, className, label }: { value: string; onSave: (v: string) => void; className?: string; label: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input aria-label={label} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v.trim())}
    className={`w-full bg-transparent border-0 outline-none rounded-lg focus:bg-bg px-1 -mx-1 ${className || ''}`} />
}

function MoneyInput({ label, value, onSave }: { label: string; value: number | null; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(value == null ? '' : String(value))
  useEffect(() => setV(value == null ? '' : String(value)), [value])
  return (
    <label className="flex flex-col gap-1 text-xs font-bold text-muted">
      {label}
      <input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ''))} onBlur={() => { const n = v ? Number(v) : null; if (n !== value) onSave(n) }}
        className="h-11 px-3 rounded-xl border border-line bg-white outline-none text-[15px] font-bold text-ink" placeholder="Kč" />
      {value != null && <span className="font-semibold">{czk(value)}</span>}
    </label>
  )
}

function DateInput({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string | null) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-bold text-muted">
      {label}
      <input type="date" value={value || ''} onChange={(e) => onSave(e.target.value || null)} className="h-11 px-3 rounded-xl border border-line bg-white outline-none text-[15px] text-ink" />
    </label>
  )
}

function Prices({ deal, onSave }: { deal: Deal; onSave: (p: Partial<Deal>) => void }) {
  return (
    <Card className="p-4 md:p-6 flex flex-col gap-3">
      <h2 className="m-0 text-base font-extrabold">Ceny</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MoneyInput label="Inzerovaná cena" value={deal.listing_price} onSave={(v) => onSave({ listing_price: v })} />
        <MoneyInput label="Odhad od" value={deal.estimate_low} onSave={(v) => onSave({ estimate_low: v })} />
        <MoneyInput label="Odhad do" value={deal.estimate_high} onSave={(v) => onSave({ estimate_high: v })} />
        <DateInput label="Datum odhadu" value={deal.estimate_date} onSave={(v) => onSave({ estimate_date: v })} />
        <MoneyInput label="Nejvyšší nabídka" value={deal.top_offer} onSave={(v) => onSave({ top_offer: v })} />
        <DateInput label="Datum nabídky" value={deal.top_offer_date} onSave={(v) => onSave({ top_offer_date: v })} />
      </div>
    </Card>
  )
}

function Fields({ deal, fields, onSave }: { deal: Deal; fields: FieldDef[]; onSave: (p: Partial<Deal>) => void }) {
  const editable = fields.filter((f) => DEAL_COLS.has(f.key) || !f.is_core)
  return (
    <Card className="p-4 md:p-6">
      <h2 className="m-0 mb-3 text-base font-extrabold">Údaje</h2>
      <div className="grid md:grid-cols-2 gap-3">
        {editable.map((f) => {
          const isCol = DEAL_COLS.has(f.key)
          const raw = isCol ? (deal as unknown as Record<string, unknown>)[f.key] : deal.custom?.[f.key]
          const set = (v: unknown) => isCol ? onSave({ [f.key]: v } as Partial<Deal>) : onSave({ custom: { ...(deal.custom || {}), [f.key]: v } })
          return <FieldInput key={f.key} f={f} value={raw} onSave={set} />
        })}
      </div>
    </Card>
  )
}

function Description({ deal, onSave }: { deal: Deal; onSave: (p: Partial<Deal>) => void }) {
  const [v, setV] = useState(deal.description || '')
  const [open, setOpen] = useState(false)
  useEffect(() => setV(deal.description || ''), [deal.description])
  return (
    <Card className="p-4 md:p-6">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center text-left" aria-expanded={open}>
        <h2 className="m-0 mr-auto text-base font-extrabold">Popis nemovitosti</h2>
        <Icon name="chevD" size={18} className={`text-muted ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (deal.description || '') && onSave({ description: v })} rows={10}
        className="mt-3 w-full p-3 rounded-xl border border-line outline-none text-[15px] leading-relaxed resize-y" />}
    </Card>
  )
}

function Tasks({ deal, tasks, setTasks, memberName }: { deal: Deal; tasks: Task[]; setTasks: (t: Task[]) => void; memberName: (id: string | null) => string }) {
  const [title, setTitle] = useState('')
  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const { data } = await supabase.from('tasks').insert({ account_id: deal.account_id, deal_id: deal.id, title: title.trim(), position: tasks.length }).select().single()
    if (data) setTasks([...tasks, data as Task]); setTitle('')
  }
  async function toggle(t: Task) {
    setTasks(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
    await supabase.from('tasks').update({ done: !t.done, completed_at: !t.done ? new Date().toISOString() : null }).eq('id', t.id)
  }
  async function remove(t: Task) {
    setTasks(tasks.filter((x) => x.id !== t.id))
    await supabase.from('tasks').delete().eq('id', t.id)
  }
  const done = tasks.filter((t) => t.done).length
  return (
    <Card className="p-4 md:p-5 flex flex-col gap-1">
      <div className="flex items-center mb-1"><h2 className="m-0 mr-auto text-base font-extrabold">Úkoly</h2><span className="text-[13px] font-bold text-muted">{done}/{tasks.length}</span></div>
      {tasks.map((t) => (
        <div key={t.id} className="flex items-start gap-3 min-h-[44px] py-1.5 group">
          <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label={t.title} className="w-5 h-5 mt-0.5 accent-navy shrink-0" />
          <span className="flex flex-col min-w-0 mr-auto">
            <span className={`text-sm ${t.done ? 'line-through text-muted' : ''}`}>{t.title}</span>
            {(t.due_at || t.assignee_id || t.tags.length > 0) && <span className="text-xs text-muted">{[t.due_at ? dateLong(t.due_at) : '', t.assignee_id ? memberName(t.assignee_id) : '', ...t.tags].filter(Boolean).join(' · ')}</span>}
          </span>
          <button aria-label="Smazat úkol" onClick={() => remove(t)} className="w-8 h-8 rounded-lg text-muted md:opacity-0 group-hover:opacity-100 inline-flex items-center justify-center"><Icon name="x" size={16} /></button>
        </div>
      ))}
      <form onSubmit={add} className="flex gap-2 mt-1">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nový úkol…" aria-label="Nový úkol" className="flex-1 h-11 px-3 rounded-xl border border-line bg-bg outline-none text-sm" />
        <button aria-label="Přidat úkol" className="w-11 h-11 rounded-xl bg-navy text-white inline-flex items-center justify-center"><Icon name="plus" size={18} /></button>
      </form>
    </Card>
  )
}

function Activities({ deal, acts, reload, memberName, stageName, userId }: { deal: Deal; acts: Activity[]; reload: () => void; memberName: (id: string | null) => string; stageName: (id: string) => string; userId?: string }) {
  const [body, setBody] = useState('')
  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    await supabase.from('activities').insert({ account_id: deal.account_id, deal_id: deal.id, type: 'comment', body: body.trim(), author_id: userId })
    setBody(''); reload()
  }
  return (
    <Card className="p-4 md:p-5 flex flex-col gap-3">
      <h2 className="m-0 text-base font-extrabold">Aktivita</h2>
      <form onSubmit={add} className="flex flex-col gap-2">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Napiš poznámku…" aria-label="Nová poznámka"
          className="p-3 rounded-[14px] border border-line bg-bg outline-none text-sm resize-y" />
        <Btn type="submit" className="self-end h-10">Uložit</Btn>
      </form>
      <ol className="list-none m-0 p-0 flex flex-col gap-3.5">
        {acts.map((a) => (
          <li key={a.id} className="flex gap-2.5">
            {a.type === 'stage_change'
              ? <span className="w-[30px] h-[30px] rounded-full bg-navy-soft text-navy inline-flex items-center justify-center shrink-0"><Icon name="arrow" size={14} /></span>
              : <Avatar name={memberName(a.author_id)} size={30} />}
            <span className="flex flex-col min-w-0 text-sm leading-relaxed">
              <span className="whitespace-pre-wrap break-words">
                {a.type === 'stage_change' ? <>Fáze: {stageName(String(a.data.from || ''))} → <b>{stageName(String(a.data.to || ''))}</b></> : a.body}
              </span>
              <span className="text-xs text-muted">{a.type !== 'stage_change' ? memberName(a.author_id) + ' · ' : ''}{dateTime(a.created_at)}</span>
              {a.type === 'ai' && typeof a.data?.audio_path === 'string' && <VoicePlayback path={a.data.audio_path} transcript={typeof a.data?.transcript === 'string' ? a.data.transcript : ''} />}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function AddContact({ open, onClose, deal, onDone }: { open: boolean; onClose: () => void; deal: Deal; onDone: () => void }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Contact[]>([])
  const [role, setRole] = useState('prodávající')
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '' })
  useEffect(() => {
    if (!open || q.trim().length < 2) { setFound([]); return }
    const t = setTimeout(async () => {
      const s = q.trim().replace(/[%,()]/g, ' ')
      const { data } = await supabase.from('contacts').select('*').eq('account_id', deal.account_id)
        .or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`).limit(8)
      setFound((data as Contact[]) || [])
    }, 250)
    return () => clearTimeout(t)
  }, [q, open, deal.account_id])
  async function link(contactId: string) {
    await supabase.from('deal_contacts').upsert({ deal_id: deal.id, contact_id: contactId, account_id: deal.account_id, role })
    await supabase.from('contacts').update({ status: role }).eq('id', contactId)
    onDone()
  }
  async function create() {
    if (!form.first_name && !form.last_name) return
    const { data, error } = await supabase.from('contacts').insert({ account_id: deal.account_id, ...form }).select().single()
    if (error) { alert(error.message); return }
    await link((data as Contact).id)
    setForm({ first_name: '', last_name: '', phone: '', email: '' })
  }
  const inp = 'h-11 px-3 rounded-xl border border-line bg-white outline-none text-[15px] w-full'
  return (
    <Sheet open={open} onClose={onClose} title="Přidat kontakt">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">Role v obchodu
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inp}>{CONTACT_STATUSES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">Najít existující kontakt
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jméno, telefon, e-mail" className={inp} />
        </label>
        {found.map((c) => (
          <button key={c.id} onClick={() => link(c.id)} className="flex items-center gap-3 p-2.5 rounded-xl bg-bg text-left">
            <Avatar name={contactName(c)} size={32} /><span className="flex flex-col"><b className="text-sm">{contactName(c)}</b><span className="text-xs text-muted">{c.phone || c.email}</span></span>
          </button>
        ))}
        <div className="border-t border-line-soft pt-4 flex flex-col gap-2.5">
          <b className="text-sm">Nebo založit nový</b>
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Jméno" placeholder="Jméno" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={inp} />
            <input aria-label="Příjmení" placeholder="Příjmení" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={inp} />
          </div>
          <input aria-label="Telefon" type="tel" placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inp} />
          <input aria-label="E-mail" type="email" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} />
          <Btn onClick={create}>Založit a přidat</Btn>
        </div>
      </div>
    </Sheet>
  )
}

function VoicePlayback({ path, transcript }: { path: string; transcript: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [showT, setShowT] = useState(false)
  const [err, setErr] = useState('')
  async function play() {
    const { data, error } = await supabase.storage.from('voice').createSignedUrl(path, 3600)
    if (error || !data) { setErr('Nahrávku se nepodařilo načíst.'); return }
    setUrl(data.signedUrl)
  }
  return (
    <span className="flex flex-col gap-1.5 mt-1.5">
      {url
        ? <audio controls autoPlay src={url} className="w-full h-9" />
        : <button onClick={play} className="self-start h-8 px-3 rounded-lg bg-chip text-xs font-bold inline-flex items-center gap-1.5 text-navy"><Icon name="play" size={14} />Přehrát nahrávku</button>}
      {transcript && (
        <button onClick={() => setShowT(!showT)} className="self-start text-xs font-bold text-muted">{showT ? 'Skrýt přepis' : 'Zobrazit přepis'}</button>
      )}
      {showT && <span className="text-xs text-muted italic whitespace-pre-wrap">„{transcript}“</span>}
      {err && <span className="text-xs text-[#9A3A14]">{err}</span>}
    </span>
  )
}
