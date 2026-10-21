import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/app'
import { useDeals } from '../lib/deals'
import { supabase } from '../lib/supabase'
import { BLOCKS, contactName, czk, dateShort, dateTime, daysSince } from '../lib/format'
import { WIDGETS, useDashboardLayout, type WidgetCfg, type WidgetId, type WidgetSize } from '../lib/dashboard'
import type { Contact, Deal } from '../lib/types'
import { Icon } from '../components/Icon'
import { Spinner, StagePill } from '../components/ui'
import { openVoiceNote } from '../components/VoiceNote'

type DayItem = { c: Contact; kind: 'svatek' | 'narozeniny'; key: string; order: number; age?: number }
type TaskRow = { id: string; title: string; due_at: string | null; deal_id: string | null; deals: { title: string } | null }
type VoiceRow = { id: string; created_at: string; transcript: string | null; deal_id: string | null; deals: { title: string } | null }
type ActRow = { id: string; type: string; body: string | null; created_at: string; deal_id: string | null; deals: { title: string } | null }

const BLOCK_COLORS: Record<string, string> = { Akvizice: '#3FAE7A', Čekající: '#E8822F', Smlouva: '#6FC08F', Prodej: '#8C8AE8', Uzavření: '#5B9BF0', 'Po prodeji': '#CB992E' }
const SPAN: Record<WidgetSize, string> = { sm: 'md:col-span-2', md: 'md:col-span-3', lg: 'md:col-span-6' }
const SIZE_LABEL: Record<WidgetSize, string> = { sm: 'S', md: 'M', lg: 'L' }

export function Today() {
  const { account, stageById, session } = useApp()
  const { deals, loading } = useDeals(account?.id)
  const { layout, setLayout, setLocal, reset } = useDashboardLayout(session?.user.id)
  const [edit, setEdit] = useState(false)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [nameDays, setNameDays] = useState<DayItem[]>([])
  const [voice, setVoice] = useState<VoiceRow[]>([])
  const [acts, setActs] = useState<ActRow[]>([])

  const visible = layout.filter((w) => !w.hidden)
  const need = (id: WidgetId) => visible.some((w) => w.id === id)

  useEffect(() => {
    if (!account) return
    if (need('next')) supabase.from('tasks').select('id, title, due_at, deal_id, deals(title)').eq('account_id', account.id).eq('done', false)
      .not('due_at', 'is', null).lte('due_at', new Date(Date.now() + 10 * 86_400_000).toISOString()).order('due_at').limit(100)
      .then(({ data }) => setTasks((data as unknown as TaskRow[]) || []))
    if (need('clients')) supabase.from('contacts').select('*').eq('account_id', account.id).order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => setContacts((data as Contact[]) || []))
    if (need('namedays')) {
      const mk = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const keys = Array.from({ length: 8 }, (_, i) => mk(new Date(Date.now() + i * 86_400_000)))
      Promise.all([
        supabase.from('contacts').select('*').eq('account_id', account.id).in('name_day', keys).limit(100),
        supabase.from('contacts').select('*').eq('account_id', account.id).not('birth_date', 'is', null).limit(2000),
      ]).then(([nd, bd]) => {
        const items: DayItem[] = []
        for (const c of (nd.data as Contact[]) || []) items.push({ c, kind: 'svatek', key: c.name_day!, order: keys.indexOf(c.name_day!) })
        for (const c of (bd.data as Contact[]) || []) {
          const k = String(c.birth_date).slice(5, 10)
          if (keys.includes(k)) items.push({ c, kind: 'narozeniny', key: k, order: keys.indexOf(k), age: new Date().getFullYear() - Number(String(c.birth_date).slice(0, 4)) + (keys.indexOf(k) > 0 && k < keys[0] ? 1 : 0) })
        }
        setNameDays(items.sort((a, b) => a.order - b.order || (a.kind === 'narozeniny' ? -1 : 1)))
      })
    }
    if (need('voice')) supabase.from('voice_notes').select('id, created_at, transcript, deal_id, deals(title)').eq('account_id', account.id).eq('status', 'applied').order('created_at', { ascending: false }).limit(6)
      .then(({ data }) => setVoice((data as unknown as VoiceRow[]) || []))
    if (need('recent')) supabase.from('activities').select('id, type, body, created_at, deal_id, deals(title)').eq('account_id', account.id).order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setActs((data as unknown as ActRow[]) || []))
  }, [account, visible.map((w) => w.id).join()]) // eslint-disable-line

  const open = useMemo(() => deals.filter((d) => stageById(d.stage_id)?.kind === 'open'), [deals, stageById])
  const hour = new Date().getHours()
  const hello = hour < 10 ? 'Dobré ráno' : hour < 18 ? 'Dobrý den' : 'Dobrý večer'
  const name = session?.user.email?.startsWith('reality@') ? 'Martine' : ''

  // ---- úprava rozložení ----
  const gridRef = useRef<HTMLDivElement>(null)
  const [dragId, setDragId] = useState<WidgetId | null>(null)
  const dragFrom = useRef<WidgetCfg[] | null>(null)
  const update = (id: WidgetId, patch: Partial<WidgetCfg>) => setLayout(layout.map((w) => (w.id === id ? { ...w, ...patch } : w)))
  const move = (id: WidgetId, dir: -1 | 1) => {
    const ids = visible.map((w) => w.id); const i = ids.indexOf(id); const j = i + dir
    if (j < 0 || j >= ids.length) return
    const next = [...layout]; const a = next.findIndex((w) => w.id === ids[i]); const b = next.findIndex((w) => w.id === ids[j])
    ;[next[a], next[b]] = [next[b], next[a]]; setLayout(next)
  }
  function onHandleDown(id: WidgetId, e: React.PointerEvent) {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragFrom.current = layout; setDragId(id)
    navigator.vibrate?.(15)
  }
  function onHandleMove(e: React.PointerEvent) {
    if (!dragId) return
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-widget]') as HTMLElement | null
    const over = el?.dataset.widget as WidgetId | undefined
    if (!over || over === dragId) return
    const next = [...layout]; const a = next.findIndex((w) => w.id === dragId); const b = next.findIndex((w) => w.id === over)
    const [item] = next.splice(a, 1); next.splice(b, 0, item)
    setLocal(next)
  }
  function onHandleUp() {
    if (!dragId) return
    setDragId(null); dragFrom.current = null
    setLayout(layout)
  }

  const render = (w: WidgetCfg) => {
    switch (w.id) {
      case 'pipeline': return <Pipeline open={open} stageById={stageById} />
      case 'next': return <NextSteps tasks={tasks} setTasks={setTasks} size={w.size} />
      case 'attention': return <Attention open={open} stageById={stageById} size={w.size} />
      case 'properties': return <Properties open={open} stageById={stageById} size={w.size} />
      case 'clients': return <Clients contacts={contacts} size={w.size} />
      case 'namedays': return <NameDays items={nameDays} size={w.size} />
      case 'voice': return <VoiceList items={voice} />
      case 'money': return <Money deals={deals} stageById={stageById} />
      case 'recent': return <Recent items={acts} size={w.size} />
    }
  }

  return (
    <div className="px-4 md:px-9 pt-11 md:pt-8 max-w-[1240px] flex flex-col gap-4 md:gap-5">
      <header className="flex items-center gap-3">
        <img src="/icons/icon-192.png" alt="" className="md:hidden w-10 h-10 rounded-lg" />
        <div className="flex flex-col mr-auto">
          <span className="text-[13px] text-muted">{new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h1 className="m-0 text-xl md:text-[28px] font-extrabold tracking-tight">{hello}{name ? `, ${name}` : ''}</h1>
        </div>
        <button onClick={() => setEdit(!edit)} className={`h-10 px-3.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 ${edit ? 'bg-navy text-white' : 'bg-white border border-line text-ink'}`}>
          <Icon name={edit ? 'check' : 'layout'} size={16} />{edit ? 'Hotovo' : 'Upravit'}
        </button>
      </header>

      {edit && (
        <div className="p-4 rounded-2xl bg-gold-soft text-sm flex flex-col gap-2">
          <b>Úprava nástěnky</b>
          <span className="text-[#5A4A1E]">Přetáhněte dlaždici za úchyt <span className="inline-block align-middle"><Icon name="grip" size={14} /></span>, změňte velikost (S / M / L) nebo ji skryjte křížkem. Skryté dlaždice přidáte dole. Nastavení se ukládá k vašemu účtu.</span>
          <button onClick={reset} className="self-start text-xs font-bold text-navy">Obnovit výchozí rozložení</button>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-6 gap-4 md:gap-5 items-start">
          {visible.map((w, i) => (
            <section key={w.id} data-widget={w.id}
              className={`${SPAN[w.size]} min-w-0 relative transition-opacity ${dragId === w.id ? 'opacity-50' : ''} ${edit ? 'rounded-[24px] ring-2 ring-dashed ring-[#C3C7DA] p-1.5' : ''}`}>
              {edit && (
                <div className="flex items-center gap-1 px-2 pb-1.5">
                  <button aria-label="Přesunout" onPointerDown={(e) => onHandleDown(w.id, e)} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
                    className="w-9 h-9 rounded-lg bg-white border border-line inline-flex items-center justify-center text-muted cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }}>
                    <Icon name="grip" size={18} />
                  </button>
                  <span className="text-xs font-extrabold text-muted mr-auto truncate">{WIDGETS[w.id].title}</span>
                  <button aria-label="Posunout dřív" disabled={i === 0} onClick={() => move(w.id, -1)} className="md:hidden w-9 h-9 rounded-lg bg-white border border-line inline-flex items-center justify-center text-muted disabled:opacity-30"><Icon name="chevD" size={16} className="rotate-180" /></button>
                  <button aria-label="Posunout později" disabled={i === visible.length - 1} onClick={() => move(w.id, 1)} className="md:hidden w-9 h-9 rounded-lg bg-white border border-line inline-flex items-center justify-center text-muted disabled:opacity-30"><Icon name="chevD" size={16} /></button>
                  <span className="hidden md:inline-flex rounded-lg bg-white border border-line overflow-hidden">
                    {WIDGETS[w.id].sizes.map((s) => (
                      <button key={s} onClick={() => update(w.id, { size: s })} className={`w-9 h-9 text-xs font-extrabold ${w.size === s ? 'bg-navy text-white' : 'text-muted'}`}>{SIZE_LABEL[s]}</button>
                    ))}
                  </span>
                  <button aria-label="Skrýt" onClick={() => update(w.id, { hidden: true })} className="w-9 h-9 rounded-lg bg-white border border-line inline-flex items-center justify-center text-muted"><Icon name="x" size={16} /></button>
                </div>
              )}
              <div className={edit ? 'pointer-events-none' : ''}>{render(w)}</div>
            </section>
          ))}
          {edit && layout.some((w) => w.hidden) && (
            <div className="md:col-span-6 flex flex-col gap-2 p-4 rounded-[22px] bg-white border border-line">
              <b className="text-sm">Skryté dlaždice</b>
              <div className="flex flex-wrap gap-2">
                {layout.filter((w) => w.hidden).map((w) => (
                  <button key={w.id} onClick={() => update(w.id, { hidden: false })} className="h-10 px-3.5 rounded-xl bg-chip text-sm font-bold inline-flex items-center gap-2">
                    <Icon name="plus" size={16} />{WIDGETS[w.id].title}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!edit && visible.length === 0 && (
            <p className="md:col-span-6 m-0 p-6 text-center text-sm text-muted bg-white border border-line rounded-[22px]">Nástěnka je prázdná. Klepněte na „Upravit“ a přidejte dlaždice.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Dlaždice ----------
type SB = (id: string | null | undefined) => ReturnType<ReturnType<typeof useApp>['stageById']>
const Card = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <div className="flex flex-col gap-2.5">
    <div className="flex items-baseline gap-2"><h2 className="m-0 mr-auto text-[17px] font-extrabold">{title}</h2>{action}</div>
    {children}
  </div>
)
const Empty = ({ text }: { text: string }) => <p className="m-0 text-sm text-muted bg-white border border-line rounded-[18px] p-4">{text}</p>
const Row = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link to={to} className="flex gap-3 items-center bg-white border border-line rounded-[18px] p-3.5 no-underline text-ink">{children}</Link>
)

function Pipeline({ open, stageById }: { open: Deal[]; stageById: SB }) {
  const counts = BLOCKS.slice(0, 6).map((b) => ({ b, n: open.filter((d) => stageById(d.stage_id)?.block === b).length }))
  return (
    <section aria-label="Pipeline" className="bg-navy text-white rounded-[22px] p-5 flex flex-col gap-3.5">
      <div className="flex items-baseline gap-2"><span className="text-[34px] font-extrabold tracking-tight">{open.length}</span><span className="text-sm text-[#D3D7EE]">aktivních obchodů</span></div>
      <div className="flex h-2.5 rounded-md overflow-hidden gap-0.5" aria-hidden="true">
        {counts.filter((c) => c.n).map((c) => <span key={c.b} style={{ flex: c.n, background: BLOCK_COLORS[c.b] }} />)}
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-x-2 gap-y-2.5 text-xs text-[#D3D7EE]">
        {counts.map((c) => <Link key={c.b} to={`/obchody?b=${encodeURIComponent(c.b)}`} className="no-underline text-[#D3D7EE]"><b className="text-white text-[15px]">{c.n}</b> {c.b}</Link>)}
      </div>
    </section>
  )
}

function NextSteps({ tasks, setTasks }: { tasks: TaskRow[]; setTasks: (t: TaskRow[]) => void; size: WidgetSize }) {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
  const dayKey = (d: Date) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - startToday.getTime()) / 86_400_000)
  const label = (iso: string | null) => {
    if (!iso) return ''
    const n = dayKey(new Date(iso))
    return n < 0 ? `Po termínu · ${dateShort(iso)}` : n === 0 ? 'Dnes' : n === 1 ? 'Zítra' : dateShort(iso)
  }
  async function done(t: TaskRow) {
    setTasks(tasks.filter((x) => x.id !== t.id))
    await supabase.from('tasks').update({ done: true, completed_at: new Date().toISOString() }).eq('id', t.id)
  }
  return (
    <Card title={`Úkoly (${tasks.length})`}>
      {tasks.length === 0 && <Empty text="Na příštích 10 dní nic naplánováno." />}
      <div className="flex flex-col gap-2.5 max-h-[520px] overflow-y-auto pr-1">
        {tasks.map((t) => {
          const late = t.due_at ? dayKey(new Date(t.due_at)) < 0 : false
          const today = t.due_at ? dayKey(new Date(t.due_at)) === 0 : false
          return (
            <div key={t.id} className="flex items-center gap-3 bg-white border border-line rounded-[18px] p-3.5">
              <button aria-label={`Splnit úkol ${t.title}`} title="Splnit" onClick={() => done(t)} className="w-7 h-7 shrink-0 rounded-full border-2 border-[#C3C7DA] hover:border-navy inline-flex items-center justify-center text-transparent hover:text-navy"><Icon name="check" size={14} /></button>
              <Link to={t.deal_id ? `/obchody/${t.deal_id}` : '#'} className="flex flex-col min-w-0 flex-1 no-underline text-ink">
                <b className="text-[15px] truncate">{t.title}</b>
                <span className="text-[13px] truncate"><span style={{ color: late ? '#A12E2A' : today ? '#9A6A00' : undefined, fontWeight: late || today ? 700 : 400 }} className={late || today ? '' : 'text-muted'}>{label(t.due_at)}</span><span className="text-muted"> · {t.deals?.title}</span></span>
              </Link>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function Attention({ open, stageById, size }: { open: Deal[]; stageById: SB; size: WidgetSize }) {
  const lim = size === 'sm' ? 4 : size === 'md' ? 6 : 12
  const stale = open.filter((d) => { const s = stageById(d.stage_id); return s && ['Čekající', 'Akvizice'].includes(s.block) && daysSince(d.stage_changed_at) >= 21 && !d.next_step_at })
    .sort((a, b) => +new Date(a.stage_changed_at) - +new Date(b.stage_changed_at)).slice(0, lim)
  return (
    <Card title="Potřebuje pozornost">
      {stale.length === 0 && <Empty text="Všechno je pod kontrolou." />}
      <div className={size === 'lg' ? 'grid md:grid-cols-2 gap-2.5' : 'flex flex-col gap-2.5'}>
        {stale.map((d) => (
          <Row key={d.id} to={`/obchody/${d.id}`}>
            <span className="w-10 h-10 rounded-xl bg-[#FDEEE6] text-[#B4471C] inline-flex items-center justify-center shrink-0"><Icon name="clock" size={20} /></span>
            <span className="flex flex-col gap-1 min-w-0 mr-auto">
              <b className="text-[15px] truncate">{d.title}</b>
              <span className="flex items-center gap-2 text-[13px] text-muted"><StagePill stage={stageById(d.stage_id)} size="sm" />{daysSince(d.stage_changed_at)} dní</span>
            </span>
          </Row>
        ))}
      </div>
    </Card>
  )
}

function Properties({ open, stageById, size }: { open: Deal[]; stageById: SB; size: WidgetSize }) {
  const items = open.filter((d) => ['Prodej', 'Uzavření'].includes(stageById(d.stage_id)?.block || '')).sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)).slice(0, size === 'lg' ? 8 : 4)
  return (
    <Card title="Nemovitosti v prodeji" action={<Link to="/obchody?b=Prodej" className="text-[13px] font-bold text-navy no-underline">Všechny</Link>}>
      {items.length === 0 && <Empty text="Teď není v prodeji žádná nemovitost." />}
      <div className={`grid gap-3 ${size === 'lg' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'}`}>
        {items.map((d) => (
          <Link key={d.id} to={`/obchody/${d.id}`} className="flex flex-col bg-white border border-line rounded-[18px] overflow-hidden no-underline text-ink">
            {d.cover_url
              ? <img src={d.cover_url} alt="" loading="lazy" className="w-full h-[110px] object-cover" />
              : <span className="w-full h-[110px] bg-navy-soft text-navy inline-flex items-center justify-center"><Icon name="home" size={28} /></span>}
            <span className="flex flex-col gap-1 p-3">
              <b className="text-sm leading-snug line-clamp-2">{d.title}</b>
              <span className="text-xs text-muted truncate">{d.listing_price ? czk(d.listing_price) : stageById(d.stage_id)?.name}</span>
            </span>
          </Link>
        ))}
      </div>
    </Card>
  )
}

function Clients({ contacts, size }: { contacts: Contact[]; size: WidgetSize }) {
  const items = contacts.slice(0, size === 'sm' ? 4 : size === 'md' ? 6 : 8)
  return (
    <Card title="Klienti" action={<Link to="/kontakty" className="text-[13px] font-bold text-navy no-underline">Všichni</Link>}>
      {items.length === 0 && <Empty text="Zatím žádné kontakty." />}
      <div className={size === 'lg' ? 'grid md:grid-cols-2 gap-2.5' : 'flex flex-col gap-2.5'}>
        {items.map((c) => (
          <Row key={c.id} to={`/kontakty/${c.id}`}>
            <span className="w-10 h-10 rounded-full bg-navy text-white font-extrabold inline-flex items-center justify-center shrink-0 text-sm">{(contactName(c) || '?').split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
            <span className="flex flex-col min-w-0"><b className="text-[15px] truncate">{contactName(c) || 'Bez jména'}</b><span className="text-[13px] text-muted truncate">{[c.phone, c.city].filter(Boolean).join(' · ')}</span></span>
          </Row>
        ))}
      </div>
    </Card>
  )
}

function NameDays({ items, size }: { items: DayItem[]; size: WidgetSize }) {
  const today = new Date(); const tk = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const shown = items.slice(0, size === 'sm' ? 12 : 30)
  const dayLabel = (k: string) => { const [m, d] = k.split('-').map(Number); return `${d}. ${m}.` }
  return (
    <Card title="Svátky a narozeniny">
      {shown.length === 0 && <Empty text="Příštích 7 dní nemá nikdo svátek ani narozeniny." />}
      <div className="flex flex-col max-h-[520px] overflow-y-auto pr-1">
        {shown.map((it) => (
          <Row key={it.c.id + it.kind} to={`/kontakty/${it.c.id}`}>
            <span className={`w-[58px] shrink-0 text-center font-extrabold text-sm rounded-xl py-1.5 ${it.key === tk ? 'bg-gold text-ink' : 'bg-chip'}`}>{it.key === tk ? 'Dnes' : dayLabel(it.key)}</span>
            <span className="flex flex-col min-w-0">
              <b className="text-[15px] truncate">{it.kind === 'narozeniny' ? '🎂' : '🎉'} {contactName(it.c) || 'Bez jména'}</b>
              <span className="text-[13px] text-muted truncate">{it.kind === 'narozeniny' ? `Narozeniny${it.age && it.age > 0 && it.age < 120 ? ` · ${it.age} let` : ''}` : 'Svátek'}{it.c.phone ? ` · ${it.c.phone}` : ''}</span>
            </span>
          </Row>
        ))}
      </div>
    </Card>
  )
}

function VoiceList({ items }: { items: VoiceRow[] }) {
  return (
    <Card title="Hlasové poznámky" action={<button onClick={() => openVoiceNote()} className="text-[13px] font-bold text-navy inline-flex items-center gap-1"><Icon name="mic" size={14} />Nahrát</button>}>
      {items.length === 0 && <Empty text="Zatím žádná hlasová poznámka. Klepněte na mikrofon a mluvte." />}
      {items.map((v) => (
        <Row key={v.id} to={v.deal_id ? `/obchody/${v.deal_id}` : '#'}>
          <span className="w-10 h-10 rounded-xl bg-gold-soft text-gold-ink inline-flex items-center justify-center shrink-0"><Icon name="mic" size={18} /></span>
          <span className="flex flex-col min-w-0"><span className="text-sm line-clamp-2 italic">„{v.transcript}“</span><span className="text-xs text-muted truncate">{v.deals?.title || 'Bez obchodu'} · {dateTime(v.created_at)}</span></span>
        </Row>
      ))}
    </Card>
  )
}

function Money({ deals, stageById }: { deals: Deal[]; stageById: SB }) {
  const y = new Date().getFullYear()
  const open = deals.filter((d) => stageById(d.stage_id)?.kind === 'open')
  const expected = open.reduce((s, d) => s + (d.expected_commission || 0), 0)
  const late = open.filter((d) => ['Uzavření', 'Po prodeji'].includes(stageById(d.stage_id)?.block || '')).reduce((s, d) => s + (d.expected_commission || 0), 0)
  const won = deals.filter((d) => stageById(d.stage_id)?.kind === 'won' && d.closed_at && new Date(d.closed_at).getFullYear() === y)
  const wonSum = won.reduce((s, d) => s + (d.expected_commission || 0), 0)
  return (
    <Card title="Provize">
      <div className="bg-white border border-line rounded-[18px] p-4 flex flex-col gap-3">
        <div><span className="text-xs font-bold text-muted">V rozjetých obchodech</span><br /><b className="text-2xl tracking-tight">{czk(expected)}</b></div>
        <div><span className="text-xs font-bold text-muted">Z toho těsně před uzavřením</span><br /><b className="text-lg">{czk(late)}</b></div>
        <div className="pt-3 border-t border-line-soft"><span className="text-xs font-bold text-muted">Uzavřeno {y}</span><br /><b className="text-lg text-[#2F7A4E]">{czk(wonSum)}</b> <span className="text-xs text-muted">· {won.length} obchodů</span></div>
      </div>
    </Card>
  )
}

function Recent({ items, size }: { items: ActRow[]; size: WidgetSize }) {
  return (
    <Card title="Poslední aktivita">
      {items.length === 0 && <Empty text="Zatím žádná aktivita." />}
      <div className="bg-white border border-line rounded-[18px] px-4 py-1">
        {items.slice(0, size === 'sm' ? 5 : 10).map((a) => (
          <Link key={a.id} to={a.deal_id ? `/obchody/${a.deal_id}` : '#'} className="flex gap-3 py-2.5 border-t border-line-soft first:border-0 no-underline text-ink">
            <span className="w-7 h-7 rounded-full bg-navy-soft text-navy inline-flex items-center justify-center shrink-0"><Icon name={a.type === 'stage_change' ? 'arrow' : a.type === 'ai' ? 'mic' : 'edit'} size={13} /></span>
            <span className="flex flex-col min-w-0"><span className="text-sm truncate">{a.type === 'stage_change' ? 'Změna fáze' : a.body}</span><span className="text-xs text-muted truncate">{a.deals?.title} · {dateTime(a.created_at)}</span></span>
          </Link>
        ))}
      </div>
    </Card>
  )
}

