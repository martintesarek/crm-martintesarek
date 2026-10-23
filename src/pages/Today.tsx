import { CoverImg } from '../lib/streetview'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/app'
import { useDeals } from '../lib/deals'
import { supabase } from '../lib/supabase'
import { BLOCKS, contactName, czk, dateTime, daysSince, isMobile } from '../lib/format'
import { WIDGETS, useDashboardLayout, type WidgetCfg, type WidgetId, type WidgetSize } from '../lib/dashboard'
import type { Contact, Deal, Stage } from '../lib/types'
import { Icon } from '../components/Icon'
import { Sheet, Spinner, StagePill } from '../components/ui'
import { GlobalSearch } from '../components/GlobalSearch'
import { HeaderInfo } from '../components/HeaderInfo'
import { TasksWidget } from '../components/TasksWidget'
import { openVoiceNote } from '../components/VoiceNote'

type DayItem = { c: Contact; kind: 'svatek' | 'narozeniny'; key: string; order: number; age?: number }
type VoiceRow = { id: string; created_at: string; transcript: string | null; deal_id: string | null; deals: { title: string } | null }
type ActRow = { id: string; type: string; body: string | null; created_at: string; deal_id: string | null; deals: { title: string } | null }

const BLOCK_COLORS: Record<string, string> = { Akvizice: '#3FAE7A', Čekající: '#E8822F', Smlouva: '#6FC08F', Prodej: '#8C8AE8', Uzavření: '#5B9BF0', 'Po prodeji': '#CB992E' }
const SPAN: Record<WidgetSize, string> = { sm: 'md:col-span-2', md: 'md:col-span-3', lg: 'md:col-span-6' }
const SIZE_LABEL: Record<WidgetSize, string> = { sm: 'S', md: 'M', lg: 'L' }

export function Today() {
  const { account, stageById, session, stages } = useApp()
  const { deals, loading } = useDeals(account?.id)
  const { layout, setLayout, setLocal, reset } = useDashboardLayout(session?.user.id)
  const [edit, setEdit] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [nameDays, setNameDays] = useState<DayItem[]>([])
  const [smsOn, setSmsOn] = useState({ svatek: true, narozeniny: true })
  const [smsSent, setSmsSent] = useState<Set<string>>(new Set())
  const [voice, setVoice] = useState<VoiceRow[]>([])
  const [acts, setActs] = useState<ActRow[]>([])
  const [replies, setReplies] = useState<ReplyRow[]>([])
  const showReplies = layout.some((w) => w.id === 'replies' && !w.hidden)
  useEffect(() => {
    if (!showReplies) return
    let off = false
    const load = () => supabase.from('sms_replies').select('id, message, received_at, phone, contact_id, contacts(first_name, last_name)').eq('seen', false).order('received_at', { ascending: false }).limit(10)
      .then(({ data }) => { if (!off) setReplies((data as unknown as ReplyRow[]) || []) })
    load()
    const iv = setInterval(load, 20000)
    const vis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', vis); window.addEventListener('sms-seen', load)
    return () => { off = true; clearInterval(iv); document.removeEventListener('visibilitychange', vis); window.removeEventListener('sms-seen', load) }
  }, [showReplies])
  const markReplies = async () => { await supabase.from('sms_replies').update({ seen: true }).in('id', replies.map((r) => r.id)); setReplies([]); window.dispatchEvent(new Event('sms-seen')) }
  const [cadErr, setCadErr] = useState<{ id: string; label: string; error: string }[]>([])
  const [cad, setCad] = useState<{ id: string; at: string; watch_id: string; old_state: string | null; new_state: string | null; label?: string }[]>([])

  const visible = layout.filter((w) => !w.hidden)
  const need = (id: WidgetId) => visible.some((w) => w.id === id)

  useEffect(() => {
    if (!account) return
    if (need('clients')) supabase.from('contacts').select('*').eq('account_id', account.id).order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => setContacts((data as Contact[]) || []))
    if (need('namedays')) {
      const mk = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const keys = Array.from({ length: 8 }, (_, i) => mk(new Date(Date.now() + i * 86_400_000)))
      Promise.all([
        supabase.from('contacts').select('*').eq('account_id', account.id).in('name_day', keys).limit(100),
        supabase.from('contacts').select('*').eq('account_id', account.id).not('birth_date', 'is', null).limit(2000),
        supabase.from('accounts').select('settings').eq('id', account.id).single(),
        supabase.from('sms_log').select('contact_id, kind').eq('account_id', account.id).eq('year', new Date().getFullYear()).eq('status', 'sent'),
      ]).then(([nd, bd, acc, log]) => {
        const st = (acc.data?.settings || {}) as Record<string, { enabled?: boolean } | undefined>
        setSmsOn({ svatek: st.nameday_sms?.enabled !== false, narozeniny: st.birthday_sms?.enabled !== false })
        setSmsSent(new Set(((log.data || []) as { contact_id: string; kind: string }[]).map((x) => x.contact_id + x.kind)))
        const items: DayItem[] = []
        for (const c of (nd.data as Contact[]) || []) items.push({ c, kind: 'svatek', key: c.name_day!, order: keys.indexOf(c.name_day!) })
        for (const c of (bd.data as Contact[]) || []) {
          const k = String(c.birth_date).slice(5, 10)
          if (keys.includes(k)) items.push({ c, kind: 'narozeniny', key: k, order: keys.indexOf(k), age: new Date().getFullYear() - Number(String(c.birth_date).slice(0, 4)) + (keys.indexOf(k) > 0 && k < keys[0] ? 1 : 0) })
        }
        setNameDays(items.sort((a, b) => a.order - b.order || (a.kind === 'narozeniny' ? -1 : 1)))
      })
    }
    if (need('cadastre')) supabase.from('cadastre_watch').select('id, label, error').not('error', 'is', null).eq('active', true).limit(10)
      .then(({ data }) => setCadErr((data || []) as { id: string; label: string; error: string }[]))
    if (need('cadastre')) supabase.from('cadastre_changes').select('id, at, watch_id, old_state, new_state, cadastre_watch(label)').eq('seen', false).order('at', { ascending: false }).limit(10)
      .then(({ data }) => setCad(((data || []) as unknown as { id: string; at: string; watch_id: string; old_state: string | null; new_state: string | null; cadastre_watch: { label: string } | null }[]).map((x) => ({ ...x, label: x.cadastre_watch?.label }))))
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
      case 'next': return <TasksWidget deals={deals} />
      case 'attention': return <Attention deals={deals} open={open} stageById={stageById} stages={stages} size={w.size} selected={w.stages} onChange={(ids) => update('attention', { stages: ids })} />
      case 'properties': return <Properties deals={deals} open={open} stageById={stageById} stages={stages} size={w.size} selected={w.stages} onChange={(ids) => update('properties', { stages: ids })} />
      case 'clients': return <Clients contacts={contacts} size={w.size} />
      case 'cadastre': return <CadastreAlert items={cad} errors={cadErr} />
      case 'replies': return <SmsReplies items={replies} onSeen={markReplies} />
      case 'namedays': return <NameDays items={nameDays} size={w.size} smsOn={smsOn} smsSent={smsSent} />
      case 'voice': return <VoiceList items={voice} />
      case 'money': return <Money deals={deals} stageById={stageById} />
      case 'recent': return <Recent items={acts} size={w.size} />
    }
  }

  return (
    <div className="px-4 md:px-9 pt-11 md:pt-8 max-w-[1240px] min-[1500px]:max-w-[1900px] flex flex-col gap-4 md:gap-5">
      <header className="flex items-center gap-3 min-h-[44px]">
        <img src="/icons/icon-192.png" alt="" className="md:hidden w-10 h-10 rounded-lg" />
        <div className="flex flex-col mr-auto">
          <h1 className="m-0 text-[26px] md:text-[30px] font-extrabold tracking-tight">{hello}{name ? `, ${name}` : ''}</h1>
        </div>
        <HeaderInfo />
        <span className="hidden md:inline text-[13px] text-muted">{new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <button onClick={() => setEdit(!edit)} className={`h-10 px-3.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 ${edit ? 'bg-navy text-white' : 'bg-white border border-line text-ink'}`}>
          <Icon name={edit ? 'check' : 'layout'} size={16} />{edit ? 'Hotovo' : 'Upravit'}
        </button>
      </header>

      <div className="sticky z-30 -mx-4 px-4 md:mx-0 md:px-0 py-2 bg-bg/95 backdrop-blur" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <GlobalSearch deals={deals} />
      </div>

      {edit && (
        <div className="p-4 rounded-2xl bg-gold-soft text-sm flex flex-col gap-2">
          <b>Úprava nástěnky</b>
          <span className="text-[#5A4A1E]">Přetáhněte dlaždici za úchyt <span className="inline-block align-middle"><Icon name="grip" size={14} /></span>, změňte velikost (S / M / L) nebo ji skryjte křížkem. Skryté dlaždice přidáte dole. Nastavení se ukládá k vašemu účtu.</span>
          <button onClick={reset} className="self-start text-xs font-bold text-navy">Obnovit výchozí rozložení</button>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-6 min-[1500px]:grid-cols-12 gap-4 md:gap-5 items-start">
          {visible.map((w, i) => {
            // na mobilu prázdné SMS odpovědi a Hlídač katastru nezabírají místo – úkoly jsou hned nahoře
            const emptyOnMobile = !edit && ((w.id === 'replies' && replies.length === 0) || (w.id === 'cadastre' && cad.length === 0 && cadErr.length === 0))
            return (
            <section key={w.id} data-widget={w.id}
              className={`${SPAN[w.size]} min-w-0 relative transition-opacity ${emptyOnMobile ? 'hidden md:block' : ''} ${dragId === w.id ? 'opacity-50' : ''} ${edit ? 'rounded-[24px] ring-2 ring-dashed ring-[#C3C7DA] p-1.5' : ''}`}>
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
            )
          })}
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

function Attention({ deals, open, stageById, stages, size, selected, onChange }: { deals: Deal[]; open: Deal[]; stageById: SB; stages: Stage[]; size: WidgetSize; selected?: string[]; onChange: (ids: string[] | undefined) => void }) {
  const [pick, setPick] = useState(false)
  const lim = size === 'sm' ? 4 : size === 'md' ? 6 : 12
  const pool = selected
    ? deals.filter((d) => d.stage_id && selected.includes(d.stage_id))
    : open.filter((d) => { const s = stageById(d.stage_id); return s && ['Čekající', 'Akvizice'].includes(s.block) && daysSince(d.stage_changed_at) >= 21 && !d.next_step_at })
  const stale = pool.sort((a, b) => +new Date(a.stage_changed_at) - +new Date(b.stage_changed_at)).slice(0, lim)
  const vis = stages.filter((s) => !s.hidden)
  const cur = selected ?? vis.filter((s) => s.kind === 'open' && ['Čekající', 'Akvizice'].includes(s.block)).map((s) => s.id)
  const toggle = (id: string) => onChange(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  return (
    <Card title="Potřebuje pozornost" action={<button onClick={() => setPick(true)} className="text-[13px] font-bold text-navy bg-transparent border-0 p-0 cursor-pointer">Filtr{selected ? ' ●' : ''}</button>}>
      <Sheet open={pick} onClose={() => setPick(false)} title="Které fáze ukazovat jako pozornost"
        footer={<button onClick={() => setPick(false)} className="h-12 w-full rounded-[14px] bg-navy text-white font-extrabold border-0">Hotovo</button>}>
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted">Zaškrtněte fáze Monitoru obchodu, jejichž nemovitosti se tu mají zobrazovat. Nahoře jsou ty, které v dané fázi stojí nejdéle.</p>
          {BLOCKS.map((bl) => { const ss = vis.filter((x) => x.block === bl); return ss.length > 0 && (
            <div key={bl} className="flex flex-col gap-1.5">
              <b className="text-xs uppercase tracking-wide text-muted">{bl}</b>
              {ss.map((x) => (
                <label key={x.id} className="flex items-center gap-3 h-10 text-[15px]"><input type="checkbox" checked={cur.includes(x.id)} onChange={() => toggle(x.id)} className="w-5 h-5 accent-[#253371]" />{x.name}</label>
              ))}
            </div>) })}
          {selected && <button onClick={() => onChange(undefined)} className="self-start text-xs font-bold text-navy bg-transparent border-0 p-0">Obnovit výchozí (dlouho nehnuté Čekající a Akvizice)</button>}
        </div>
      </Sheet>
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

function Properties({ deals, open, stageById, stages, size, selected, onChange }: { deals: Deal[]; open: Deal[]; stageById: SB; stages: Stage[]; size: WidgetSize; selected?: string[]; onChange: (ids: string[] | undefined) => void }) {
  const [pick, setPick] = useState(false)
  const pool = selected ? deals.filter((d) => d.stage_id && selected.includes(d.stage_id)) : open.filter((d) => ['Prodej', 'Uzavření'].includes(stageById(d.stage_id)?.block || ''))
  const items = pool.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)).slice(0, size === 'lg' ? 12 : 6)
  const vis = stages.filter((s) => !s.hidden)
  const cur = selected ?? vis.filter((s) => s.kind === 'open' && ['Prodej', 'Uzavření'].includes(s.block)).map((s) => s.id)
  const toggle = (id: string) => onChange(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  return (
    <Card title="Nemovitosti v prodeji" action={<span className="flex items-center gap-3"><button onClick={() => setPick(true)} className="text-[13px] font-bold text-navy bg-transparent border-0 p-0 cursor-pointer">Filtr{selected ? ' ●' : ''}</button><Link to="/obchody?b=Prodej" className="text-[13px] font-bold text-navy no-underline">Všechny</Link></span>}>
      <Sheet open={pick} onClose={() => setPick(false)} title="Které nemovitosti ukazovat"
        footer={<button onClick={() => setPick(false)} className="h-12 w-full rounded-[14px] bg-navy text-white font-extrabold border-0">Hotovo</button>}>
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted">Zaškrtněte fáze, ve kterých chcete nemovitosti na nástěnce vidět.</p>
          {BLOCKS.map((bl) => { const ss = vis.filter((s) => s.block === bl); return ss.length > 0 && (
            <div key={bl} className="flex flex-col gap-1.5">
              <b className="text-xs uppercase tracking-wide text-muted">{bl}</b>
              {ss.map((s) => (
                <label key={s.id} className="flex items-center gap-3 h-10 text-[15px]"><input type="checkbox" checked={cur.includes(s.id)} onChange={() => toggle(s.id)} className="w-5 h-5 accent-[#253371]" />{s.name}</label>
              ))}
            </div>) })}
          {selected && <button onClick={() => onChange(undefined)} className="self-start text-xs font-bold text-navy bg-transparent border-0 p-0">Obnovit výchozí (Prodej a Uzavření)</button>}
        </div>
      </Sheet>
      {items.length === 0 && <Empty text="V těchto fázích teď není žádná nemovitost." />}
      <div className={`grid gap-3 ${size === 'lg' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'}`}>
        {items.map((d) => (
          <Link key={d.id} to={`/obchody/${d.id}`} className="flex flex-col bg-white border border-line rounded-[18px] overflow-hidden no-underline text-ink">
            <CoverImg d={d} w={640} h={480} className="w-full aspect-[16/9] object-cover"
              fallback={<span className="w-full aspect-[16/9] bg-navy-soft text-navy inline-flex items-center justify-center"><Icon name="home" size={28} /></span>} />
            <span className="flex flex-col gap-1 p-3">
              <b className="text-[15px] leading-snug line-clamp-2">{d.title}</b>
              <span className="text-[13px] text-muted truncate">{d.listing_price ? czk(d.listing_price) : stageById(d.stage_id)?.name}</span>
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

function CadastreAlert({ items, errors }: { items: { id: string; at: string; old_state: string | null; new_state: string | null; label?: string }[]; errors: { id: string; label: string; error: string }[] }) {
  const diff = (a: string | null, b: string | null) => { const pa = String(a || '').split(' | '); const o = String(b || '').split(' | ').filter((x) => !pa.includes(x)); return o.length ? o.join(' · ') : b || '' }
  return (
    <Card title="Hlídač katastru">
      {items.length === 0 && errors.length === 0 && <Empty text="V katastru je u hlídaných nemovitostí všechno beze změny." />}
      <div className="flex flex-col">
        {errors.map((e) => (
          <Row key={'e' + e.id} to="/hlidac">
            <span className="shrink-0 relative text-[#B42318]"><Icon name="bell" size={22} stroke={2} /><span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#B42318]" /></span>
            <span className="flex flex-col min-w-0"><b className="text-[15px] truncate">{e.label || 'Nemovitost'} · chyba kontroly</b><span className="text-[13px] text-[#B42318] break-words">{e.error}</span></span>
          </Row>
        ))}
        {items.map((it) => (
          <Row key={it.id} to="/hlidac">
            <span className="shrink-0 relative text-[#D92D20]"><Icon name="bell" size={22} stroke={2} /><span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#D92D20]" /></span>
            <span className="flex flex-col min-w-0"><b className="text-[15px] truncate">{it.label || 'Nemovitost'}</b><span className="text-[13px] text-muted break-words">{diff(it.old_state, it.new_state)}</span></span>
          </Row>
        ))}
      </div>
    </Card>
  )
}

type ReplyRow = { id: string; message: string; received_at: string; phone: string | null; contact_id: string | null; contacts: { first_name: string | null; last_name: string | null } | null }
function SmsReplies({ items, onSeen }: { items: ReplyRow[]; onSeen: () => void }) {
  return (
    <Card title="Odpovědi na SMS">
      {items.length === 0 && <Empty text="Žádná nová odpověď od klientů." />}
      <div className="flex flex-col gap-2">
        {items.map((r) => (
          <Row key={r.id} to={r.contact_id ? `/kontakty/${r.contact_id}` : '/kontakty'}>
            <span className="shrink-0 relative text-[#D92D20]"><Icon name="sms" size={22} stroke={2} /><span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#D92D20]" /></span>
            <span className="flex flex-col min-w-0"><b className="text-[15px] truncate">{r.contacts ? `${r.contacts.first_name || ''} ${r.contacts.last_name || ''}`.trim() : r.phone || 'Neznámé číslo'} <span className="font-normal text-xs text-muted">· {new Date(r.received_at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></b><span className="text-[14px] break-words whitespace-pre-line line-clamp-3">{r.message}</span></span>
          </Row>
        ))}
      </div>
      {items.length > 0 && <button onClick={onSeen} className="mt-2 h-9 rounded-xl bg-chip text-sm font-bold text-ink">Označit vše jako přečtené</button>}
    </Card>
  )
}

const DAY_WORDS = ['Dnes', 'Zítra', 'Pozítří', 'Za 3 dny']

function NameDays({ items, size, smsOn, smsSent }: { items: DayItem[]; size: WidgetSize; smsOn: Record<DayItem['kind'], boolean>; smsSent: Set<string> }) {
  const shown = items.slice(0, size === 'sm' ? 12 : 30)
  const dayLabel = (it: DayItem) => { if (it.order >= 0 && it.order < DAY_WORDS.length) return DAY_WORDS.at(it.order)!; const [m, d] = it.key.split('-').map(Number); return `${d}. ${m}.` }
  const badge = (it: DayItem) => {
    if (smsSent.has(it.c.id + it.kind)) return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#E3F4EA] text-[#1E7A44]">SMS odeslána</span>
    if (it.c.auto_wishes === false) return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-chip text-muted">Automatická SMS vypnutá u kontaktu</span>
    const miss: string[] = []
    if (!isMobile(it.c.phone)) miss.push(it.c.phone ? 'mobil (je pevná linka)' : 'mobil')
    if (it.kind === 'svatek' ? !it.c.name_day : !it.c.birth_date) miss.push(it.kind === 'svatek' ? 'datum svátku' : 'datum narození')
    if (!String(it.c.salutation || '').trim()) miss.push('oslovení')
    if (miss.length) return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FDE4E4] text-[#B42318]">Doplnit: {miss.join(', ')}</span>
    if (!smsOn[it.kind]) return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-chip text-muted">Automatická SMS vypnutá</span>
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#E3F4EA] text-[#1E7A44]">Automatická SMS naplánovaná</span>
  }
  return (
    <Card title="Svátky a narozeniny">
      {shown.length === 0 && <Empty text="Příštích 7 dní nemá nikdo svátek ani narozeniny." />}
      <div className="flex flex-col max-h-[520px] overflow-y-auto pr-1">
        {shown.map((it) => (
          <Row key={it.c.id + it.kind} to={`/kontakty/${it.c.id}`}>
            <span className={`w-[72px] shrink-0 text-center font-extrabold text-[13px] leading-tight rounded-xl py-1.5 ${it.order === 0 ? 'bg-gold text-ink' : 'bg-chip'}`}>{dayLabel(it)}</span>
            <span className="flex flex-col min-w-0 gap-1">
              <b className="text-[15px] truncate">{it.kind === 'narozeniny' ? '🎂' : '🎉'} {contactName(it.c) || 'Bez jména'}</b>
              <span className="text-[13px] text-muted truncate">{it.kind === 'narozeniny' ? `Narozeniny${it.age && it.age > 0 && it.age < 120 ? ` · ${it.age} let` : ''}` : 'Svátek'}</span>
              <span className="flex flex-wrap">{badge(it)}</span>
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

