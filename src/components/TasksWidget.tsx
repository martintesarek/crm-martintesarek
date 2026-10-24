// Úkoly na přehledu Dnes: seznam (po termínu / dnes / zítra / později) nebo kalendář (týden, 10 dní, měsíc).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/app'
import type { Deal } from '../lib/types'
import { Icon } from './Icon'
import { Btn, Sheet, DateField } from './ui'
import { contactName } from '../lib/format'

type T = { id: string; title: string; due_at: string | null; done: boolean; deal_id: string | null; deals: { title: string } | null; contact_id?: string | null; contacts?: { first_name: string | null; last_name: string | null } | null }
type View = 'list' | 'cal'
type Range = 'week' | 'month'
type Filter = 'all' | 'late' | 'today' | 'tomorrow' | 'week'

const DAY = 86_400_000
const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const diffDays = (iso: string) => Math.round((sod(new Date(iso)).getTime() - sod(new Date()).getTime()) / DAY)
const noon = (k: string) => new Date(k + 'T12:00:00').toISOString()
const DOW = ['PO', 'ÚT', 'ST', 'ČT', 'PÁ', 'SO', 'NE']
const mondayOf = (d: Date) => addDays(sod(d), -((d.getDay() + 6) % 7))
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* */ } }

const TONE = {
  late: { bg: '#FBDAD5', fg: '#8F231C', dot: '#C8372D' },
  today: { bg: '#F3E2AE', fg: '#5E4306', dot: '#CB992E' },
  soon: { bg: '#E8EBF6', fg: '#253371', dot: '#253371' },
  done: { bg: '#DDF1E7', fg: '#1F6B49', dot: '#2E9E6B' },
}
const toneOf = (t: T) => (t.done ? 'done' : !t.due_at ? 'soon' : diffDays(t.due_at) < 0 ? 'late' : diffDays(t.due_at) === 0 ? 'today' : 'soon') as keyof typeof TONE
const whenLabel = (iso: string | null) => {
  if (!iso) return ''
  const n = diffDays(iso)
  if (n === -1) return 'včera'
  if (n < -1) return `před ${-n} dny`
  if (n === 0) return 'Dnes'
  if (n === 1) return 'Zítra'
  return new Date(iso).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })
}

export function TasksWidget({ deals }: { deals: Deal[] }) {
  const { account } = useApp()
  const [view, setView] = useState<View>(() => (lsGet('tasks_view') === 'cal' ? 'cal' : 'list'))
  const [range, setRange] = useState<Range>(() => (['week', 'month'].includes(lsGet('tasks_range') || '') ? (lsGet('tasks_range') as Range) : 'month'))
  const [filter, setFilter] = useState<Filter>('all')
  const [anchor, setAnchor] = useState(() => sod(new Date()))
  const [tasks, setTasks] = useState<T[]>([])
  const [, setDoneToday] = useState({ done: 0, total: 0 })
  const [add, setAdd] = useState(false)
  const [addDate, setAddDate] = useState<string | null>(null)
  const [edit, setEdit] = useState<T | null>(null)
  const [full, setFull] = useState(false)
  useEffect(() => { const h = () => { setEdit(null); setAddDate(null); setAdd(true) }; window.addEventListener('new-task', h); return () => window.removeEventListener('new-task', h) }, [])

  // rozsah zobrazených dnů v kalendáři
  const grid = useMemo(() => {
    if (range === 'week') { const s = mondayOf(anchor); return { start: s, n: 7, cols: 7 } }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const s = mondayOf(first)
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    const n = Math.ceil((((last.getTime() - s.getTime()) / DAY) + 1) / 7) * 7
    return { start: s, n, cols: 7 }
  }, [range, anchor])

  const load = useCallback(async () => {
    if (!account) return
    const from = view === 'cal' ? grid.start : addDays(sod(new Date()), -3650)
    const to = view === 'cal' ? addDays(grid.start, grid.n) : addDays(sod(new Date()), 11)
    const run = (cols: string) => {
      let q = supabase.from('tasks').select(cols).eq('account_id', account.id).not('due_at', 'is', null)
        .gte('due_at', from.toISOString()).lt('due_at', to.toISOString()).order('due_at').limit(500)
      if (view === 'list') q = q.eq('done', false)
      return q
    }
    let { data, error } = await run('id, title, due_at, done, deal_id, deals(title), contact_id, contacts(first_name, last_name)')
    if (error) ({ data } = await run('id, title, due_at, done, deal_id, deals(title)')) // před migrací 21 sloupec contact_id ještě není
    setTasks((data as unknown as T[]) || [])
    const t0 = sod(new Date()).toISOString(), t1 = addDays(sod(new Date()), 1).toISOString()
    const { data: td } = await supabase.from('tasks').select('done').eq('account_id', account.id).gte('due_at', t0).lt('due_at', t1)
    setDoneToday({ done: (td || []).filter((x) => x.done).length, total: (td || []).length })
  }, [account, view, grid])
  useEffect(() => { load() }, [load])

  const pick = (v: View) => { setView(v); lsSet('tasks_view', v) }
  const pickRange = (r: Range) => { setRange(r); lsSet('tasks_range', r); setAnchor(sod(new Date())) }
  const shift = (dir: -1 | 1) => setAnchor(range === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1) : addDays(anchor, dir * 7))

  async function toggle(t: T) {
    const done = !t.done
    setTasks((all) => (view === 'list' && done ? all.filter((x) => x.id !== t.id) : all.map((x) => (x.id === t.id ? { ...x, done } : x))))
    setDoneToday((s) => (t.due_at && diffDays(t.due_at) === 0 ? { ...s, done: s.done + (done ? 1 : -1) } : s))
    await supabase.from('tasks').update({ done, completed_at: done ? new Date().toISOString() : null }).eq('id', t.id)
  }
  async function moveTo(id: string, k: string) {
    setTasks((all) => all.map((x) => (x.id === id ? { ...x, due_at: noon(k) } : x)))
    await supabase.from('tasks').update({ due_at: noon(k) }).eq('id', id)
    load()
  }

  // ---- seznam ----
  const counts = useMemo(() => {
    const open = tasks.filter((t) => !t.done)
    const n = (f: (d: number) => boolean) => open.filter((t) => t.due_at && f(diffDays(t.due_at))).length
    return { all: open.length, late: n((d) => d < 0), today: n((d) => d === 0), tomorrow: n((d) => d === 1), week: n((d) => d >= 2) }
  }, [tasks])
  const groups = useMemo(() => {
    const open = tasks.filter((t) => !t.done && t.due_at)
    const g = [
      { id: 'late', title: 'Po termínu', sub: 'vyřešit co nejdřív', tone: 'late', items: open.filter((t) => diffDays(t.due_at!) < 0) },
      { id: 'today', title: 'Dnes', sub: new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' }), tone: 'today', items: open.filter((t) => diffDays(t.due_at!) === 0) },
      { id: 'tomorrow', title: 'Zítra', sub: addDays(new Date(), 1).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' }), tone: 'soon', items: open.filter((t) => diffDays(t.due_at!) === 1) },
      { id: 'week', title: 'Později', sub: 'do 10 dnů', tone: 'later', items: open.filter((t) => diffDays(t.due_at!) >= 2) },
    ]
    return g.filter((x) => (filter === 'all' || filter === x.id) && x.items.length > 0)
  }, [tasks, filter])

  // filtry jako tiché textové záložky; „Po termínu“ jen když něco po termínu je
  const tab = (f: Filter, label: string, n: number, late = false) => {
    const on = filter === f
    return (
      <button key={f} role="tab" aria-selected={on} onClick={() => setFilter(f)}
        className={`h-11 -mb-px whitespace-nowrap shrink-0 text-[15px] border-b-2 ${on ? 'font-bold border-current' : 'font-semibold border-transparent'}`}
        style={{ color: late ? '#B42318' : on ? 'var(--color-ink)' : 'var(--color-muted)' }}>
        {label}{n > 0 ? ` ${n}` : ''}
      </button>
    )
  }
  const shortDate = (d: Date) => d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })

  return (
    <section className="bg-white border border-line rounded-[22px] p-4 md:p-6 flex flex-col gap-3">
      <div className="flex items-start gap-1">
        <div className="flex flex-col gap-0.5 mr-auto min-w-0">
          <h2 className="m-0 text-[22px] md:text-[26px] font-extrabold tracking-tight">Úkoly</h2>
        </div>
        <button aria-label={view === 'list' ? 'Zobrazit kalendář' : 'Zobrazit seznam'} title={view === 'list' ? 'Kalendář' : 'Seznam'} onClick={() => pick(view === 'list' ? 'cal' : 'list')}
          className="w-11 h-11 rounded-full text-ink hover:bg-bg inline-flex items-center justify-center shrink-0">
          <Icon name={view === 'list' ? 'cal' : 'list'} size={21} />
        </button>
        <button aria-label="Nový úkol" title="Nový úkol" onClick={() => { setEdit(null); setAddDate(null); setAdd(true) }}
          className="w-11 h-11 rounded-full bg-navy text-white inline-flex items-center justify-center shrink-0">
          <Icon name="plus" size={20} stroke={2.4} />
        </button>
      </div>

      {view === 'list' ? (
        <>
          <div role="tablist" aria-label="Filtr úkolů" className="flex gap-5 border-b border-line-soft overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            {tab('all', 'Vše', counts.all)}
            {counts.late > 0 && tab('late', 'Po termínu', counts.late, true)}
            {tab('today', 'Dnes', counts.today)}
            {tab('tomorrow', 'Zítra', counts.tomorrow)}
            {tab('week', 'Později', counts.week)}
          </div>
          {groups.length === 0 && <p className="m-0 py-3 text-sm text-muted">Na příštích 10 dní nic naplánováno.</p>}
          {groups.map((g) => {
            const label = g.id === 'late' ? 'Po termínu' : g.id === 'today' ? `Dnes · ${shortDate(new Date())}` : g.id === 'tomorrow' ? `Zítra · ${shortDate(addDays(new Date(), 1))}` : 'Později'
            const color = g.id === 'late' ? '#B42318' : g.id === 'today' ? 'var(--color-gold-ink)' : 'var(--color-muted)'
            const checkCol = g.id === 'late' ? '#C8372D' : g.id === 'today' ? '#CB992E' : '#8C93B8'
            const items = full || g.id !== 'week' ? g.items : g.items.slice(0, 8)
            return (
              <div key={g.id} className="flex flex-col pt-2">
                <h3 className="m-0 pb-1 text-xs font-bold uppercase tracking-[0.08em]" style={{ color }}>{label}</h3>
                <div className="flex flex-col">
                  {items.map((t) => <TaskRow key={t.id} t={t} checkCol={checkCol} showDate={g.id === 'late' || g.id === 'week'} onToggle={() => toggle(t)} onEdit={() => { setEdit(t); setAdd(true) }} />)}
                </div>
                {g.id === 'week' && g.items.length > 8 && !full && <button onClick={() => setFull(true)} className="self-start h-11 text-sm font-semibold text-navy">Zobrazit další {g.items.length - 8}</button>}
              </div>
            )
          })}
        </>
      ) : (
        <Calendar tasks={tasks} grid={grid} anchor={anchor} range={range} onRange={pickRange} onShift={shift} onToday={() => setAnchor(sod(new Date()))} onMove={moveTo} onToggle={toggle} onAdd={(k) => { setEdit(null); setAddDate(k); setAdd(true) }} onEdit={(t) => { setEdit(t); setAdd(true) }} />
      )}

      <NewTask open={add} task={edit} initialDue={addDate} onClose={() => setAdd(false)} deals={deals} onSaved={() => { setAdd(false); load() }} />
    </section>
  )
}

// Jeden úkol: kroužek, název a pod ním tlumeně nemovitost / klient. Bez karty, jen tenká linka.
function TaskRow({ t, checkCol, showDate, onToggle, onEdit }: { t: T; checkCol: string; showDate: boolean; onToggle: () => void; onEdit: () => void }) {
  const late = !!t.due_at && diffDays(t.due_at) < 0
  const hasDeal = !!(t.deals?.title && t.deal_id)
  const hasContact = !!(t.contacts && t.contact_id)
  return (
    <div className="flex items-center gap-3 py-1 border-b border-line-soft">
      <button aria-label={`Splnit úkol ${t.title}`} title="Splnit" onClick={onToggle} className="group w-11 h-11 -m-[11px] shrink-0 inline-flex items-center justify-center">
        <span className="w-[22px] h-[22px] rounded-full inline-flex items-center justify-center text-transparent group-hover:text-navy" style={{ border: `1.5px solid ${checkCol}` }}><Icon name="check" size={13} stroke={2.4} /></span>
      </button>
      <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-0">
        <button type="button" onClick={onEdit} title="Upravit úkol" className="text-left text-[15px] md:text-base font-semibold leading-snug text-ink cursor-pointer">{t.title}</button>
        {(hasDeal || hasContact) && (
          <span className="text-sm text-muted min-w-0 truncate">
            {hasDeal && <Link to={`/obchody/${t.deal_id}`} title="Otevřít nemovitost" className="text-muted no-underline hover:underline">{t.deals!.title}</Link>}
            {hasDeal && hasContact && ' · '}
            {hasContact && <Link to={`/kontakty/${t.contact_id}`} title="Otevřít kontakt" className="text-muted no-underline hover:underline">{contactName(t.contacts)}</Link>}
          </span>
        )}
      </div>
      {showDate && <span className="text-[13px] leading-[22px] whitespace-nowrap shrink-0" style={{ color: late ? '#B42318' : 'var(--color-muted)', fontWeight: late ? 600 : 400 }}>{whenLabel(t.due_at)}</span>}
    </div>
  )
}

function Calendar({ tasks, grid, anchor, range, onRange, onShift, onToday, onMove, onToggle, onAdd, onEdit }: {
  tasks: T[]; grid: { start: Date; n: number; cols: number }; anchor: Date; range: Range
  onRange: (r: Range) => void; onShift: (d: -1 | 1) => void; onToday: () => void; onMove: (id: string, k: string) => void; onToggle: (t: T) => void; onAdd: (k: string) => void; onEdit: (t: T) => void
}) {
  const byDay = useMemo(() => { const m: Record<string, T[]> = {}; for (const t of tasks) if (t.due_at) (m[key(new Date(t.due_at))] ||= []).push(t); return m }, [tasks])
  const days = Array.from({ length: grid.n }, (_, i) => addDays(grid.start, i))
  const todayK = key(new Date())
  const title = range === 'month' ? anchor.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })
    : `${days[0].toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })} – ${days[days.length - 1].toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })}`
  const maxShown = range === 'month' ? 3 : 8
  const [openDay, setOpenDay] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button aria-label="Předchozí" onClick={() => onShift(-1)} className="w-10 h-10 rounded-xl border border-line bg-white text-navy inline-flex items-center justify-center"><Icon name="chevL" size={18} /></button>
        <h3 className="m-0 mx-1 text-lg md:text-[22px] font-extrabold capitalize min-w-[120px]">{title}</h3>
        <button aria-label="Další" onClick={() => onShift(1)} className="w-10 h-10 rounded-xl border border-line bg-white text-navy inline-flex items-center justify-center"><Icon name="chevR" size={18} /></button>
        <button onClick={onToday} className="h-10 px-4 rounded-xl border border-line bg-white text-sm font-bold text-navy">Dnes</button>
        <div className="ml-auto inline-flex p-1 rounded-xl bg-[#ECEEF5] gap-0.5">
          {([['week', 'Týden'], ['month', 'Měsíc']] as const).map(([r, l]) => (
            <button key={r} onClick={() => onRange(r)} className={`h-8 px-3 rounded-[9px] text-[13px] ${range === r ? 'bg-white font-extrabold shadow-sm' : 'text-muted font-bold'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="grid border border-line rounded-[18px] overflow-hidden bg-line gap-px" style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}>
        {grid.cols === 7 && DOW.map((d) => <div key={d} className="bg-bg px-2 md:px-3 py-2 text-[11px] md:text-xs font-extrabold text-muted tracking-wide">{d}</div>)}
        {days.map((d) => {
          const k = key(d), list = byDay[k] || [], isToday = k === todayK
          const other = range === 'month' && d.getMonth() !== anchor.getMonth()
          const expanded = openDay === k
          const shown = expanded ? list : list.slice(0, maxShown)
          return (
            <div key={k} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData('text/task'); if (id) onMove(id, k) }}
              className="flex flex-col gap-1 p-1.5 md:p-2 min-h-[84px] md:min-h-[112px]" style={{ background: isToday ? '#FFFBEE' : other ? '#FAFAFD' : '#fff', boxShadow: isToday ? 'inset 0 0 0 2px #CB992E' : undefined }}>
              <div className="flex items-start justify-between">
              <span className={`self-start text-[13px] font-bold px-1 ${isToday ? 'bg-gold text-ink rounded-full min-w-[26px] h-[26px] inline-flex items-center justify-center font-extrabold' : other ? 'text-[#9AA0BE]' : ''}`}>
                {d.getDate() === 1 ? `${d.getDate()}. ${d.getMonth() + 1}.` : d.getDate()}
              </span>
              <button aria-label={`Přidat úkol na ${d.getDate()}. ${d.getMonth() + 1}.`} title="Přidat úkol" onClick={() => onAdd(k)} className="w-7 h-7 -m-0.5 rounded-lg text-[#8C93B8] hover:bg-navy hover:text-white inline-flex items-center justify-center"><Icon name="plus" size={16} /></button>
              </div>
              {shown.map((t) => {
                const tone = TONE[toneOf(t)]
                return (
                  <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/task', t.id)} className="group flex items-center gap-1.5 h-6 px-2 rounded-lg text-xs font-bold cursor-grab" style={{ background: tone.bg, color: tone.fg, textDecoration: t.done ? 'line-through' : undefined }}>
                    <button aria-label={t.done ? 'Vrátit mezi otevřené' : `Splnit ${t.title}`} onClick={() => onToggle(t)} className="w-2 h-2 rounded-full shrink-0" style={{ background: tone.dot }} />
                    <button type="button" onClick={() => onEdit(t)} title={`Upravit: ${t.title}`} className="truncate text-left flex-1 min-w-0 font-bold" style={{ color: 'inherit' }}>{t.title}</button>
                  </div>
                )
              })}
              {list.length > maxShown && <button onClick={() => setOpenDay(expanded ? null : k)} className="self-start text-[11.5px] font-bold text-navy px-1">{expanded ? 'méně' : `+ ${list.length - maxShown} další`}</button>}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted font-semibold">
        {([['late', 'Po termínu'], ['today', 'Dnes'], ['soon', 'Nadcházející'], ['done', 'Splněno']] as const).map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: TONE[k].dot }} />{l}</span>)}
        <span className="md:ml-auto">Úkol přetáhnete na jiný den (na počítači) a změní se termín. Tečkou ho splníte.</span>
      </div>
    </div>
  )
}

type Opt = { kind: 'deal' | 'contact'; id: string; label: string; sub?: string }
const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function NewTask({ open, onClose, deals, onSaved, initialDue, task }: { task?: T | null; initialDue?: string | null; open: boolean; onClose: () => void; deals: Deal[]; onSaved: () => void }) {
  const { account } = useApp()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(() => key(addDays(new Date(), 3)))
  const [sel, setSel] = useState<Opt | null>(null)
  const [q, setQ] = useState('')
  const [contacts, setContacts] = useState<{ id: string; first_name: string | null; last_name: string | null; phone: string | null }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    setTitle(task?.title || ''); setDue(task ? (task.due_at ? key(new Date(task.due_at)) : '') : initialDue || key(addDays(new Date(), 3))); setQ(''); setErr('')
    setSel(task?.deal_id ? { kind: 'deal', id: task.deal_id, label: task.deals?.title || 'Obchod' } : task?.contact_id ? { kind: 'contact', id: task.contact_id, label: contactName(task.contacts) || 'Kontakt' } : null)
    if (account && !contacts.length) supabase.from('contacts').select('id, first_name, last_name, phone').eq('account_id', account.id).limit(5000).then(({ data }) => setContacts((data as never) || []))
  }, [open, initialDue, task])
  const results = useMemo(() => {
    const t = fold(q.trim())
    if (!t) return []
    const words = t.split(/\s+/)
    const hit = (hay: string) => words.every((w) => hay.includes(w))
    const d: Opt[] = deals.filter((x) => hit(fold(x.title))).slice(0, 6).map((x) => ({ kind: 'deal', id: x.id, label: x.title }))
    const c: Opt[] = contacts.filter((x) => hit(fold([x.first_name, x.last_name, x.phone].filter(Boolean).join(' ')))).slice(0, 6).map((x) => ({ kind: 'contact', id: x.id, label: contactName(x) || 'Bez jména', sub: x.phone || undefined }))
    return [...d, ...c]
  }, [q, deals, contacts])
  async function save() {
    if (!account || !title.trim()) return
    setBusy(true); setErr('')
    const link: Record<string, unknown> = { deal_id: sel?.kind === 'deal' ? sel.id : null }
    if (sel?.kind === 'contact' || task?.contact_id) link.contact_id = sel?.kind === 'contact' ? sel.id : null // sloupec existuje až po migraci 21
    const row = { ...link, title: title.trim(), due_at: due ? noon(due) : null }
    const { error } = task ? await supabase.from('tasks').update(row).eq('id', task.id) : await supabase.from('tasks').insert({ account_id: account.id, ...row, position: 0 })
    setBusy(false)
    if (error) { setErr(/contact_id/.test(error.message) ? 'Úkol ke klientovi zatím nejde uložit: v databázi chybí poslední úprava (migrace 21).' : error.message); return }
    onSaved()
  }
  async function remove() {
    if (!task) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }
  const footer = (
    <div className="flex flex-col gap-2">
      <Btn onClick={save} disabled={busy || !title.trim()} className="w-full h-12 text-base">{busy ? 'Ukládám…' : task ? 'Uložit změny' : 'Přidat úkol'}</Btn>
      {task && (
        <button type="button" onClick={remove} disabled={busy} className="w-full h-11 rounded-[14px] text-[#C8372D] font-bold text-[15px] inline-flex items-center justify-center gap-2 hover:bg-[#FFF3F0] disabled:opacity-50"><Icon name="trash" size={18} />Smazat úkol</button>
      )}
    </div>
  )
  const inp ='h-11 px-3 rounded-xl border border-line bg-white outline-none text-[15px] w-full'
  return (
    <Sheet open={open} onClose={onClose} title={task ? 'Upravit úkol' : 'Nový úkol'} footer={footer}>
      <div className="flex flex-col gap-3 pb-2">
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">Co je potřeba udělat<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="např. Zavolat klientovi" className={inp} /></label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">Termín<DateField value={due} onChange={setDue} className={inp} /></label>
        <div className="flex flex-col gap-1 text-xs font-bold text-muted">K obchodu nebo klientovi (nepovinné)
          {sel ? (
            <div className="h-11 px-3 rounded-xl border border-line bg-chip flex items-center gap-2 text-[15px] text-ink font-semibold">
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-white text-navy">{sel.kind === 'deal' ? 'Obchod' : 'Klient'}</span>
              <Link to={sel.kind === 'deal' ? `/obchody/${sel.id}` : `/kontakty/${sel.id}`} onClick={onClose} title={sel.kind === 'deal' ? 'Otevřít obchod' : 'Otevřít klienta'} className="truncate mr-auto text-ink no-underline hover:underline">{sel.label}</Link>
              <button type="button" aria-label="Zrušit propojení" onClick={() => setSel(null)} className="w-7 h-7 rounded-lg text-muted hover:bg-white inline-flex items-center justify-center"><Icon name="x" size={16} /></button>
            </div>
          ) : (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat obchod, jméno nebo telefon…" className={inp} />
              {q.trim() && (
                <div className="rounded-xl border border-line bg-white max-h-[260px] overflow-auto">
                  {results.length === 0 ? <span className="block px-3 py-3 text-sm font-medium text-muted">Nic nenalezeno.</span> : results.map((o) => (
                    <button key={o.kind + o.id} type="button" onClick={() => { setSel(o); setQ('') }} className="w-full text-left px-3 py-2.5 flex items-center gap-2 border-t border-line-soft first:border-0 hover:bg-chip text-[15px] text-ink font-semibold">
                      <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-chip text-navy shrink-0">{o.kind === 'deal' ? 'Obchod' : 'Klient'}</span>
                      <span className="truncate mr-auto">{o.label}</span>{o.sub && <span className="text-xs text-muted font-medium shrink-0">{o.sub}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {err && <span className="text-sm font-semibold text-[#B42318]">{err}</span>}
      </div>
    </Sheet>
  )
}
