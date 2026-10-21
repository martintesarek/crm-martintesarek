// Úkoly na přehledu Dnes: seznam (po termínu / dnes / zítra / později) nebo kalendář (týden, 10 dní, měsíc).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/app'
import type { Deal } from '../lib/types'
import { Icon } from './Icon'
import { Btn, Sheet } from './ui'

type T = { id: string; title: string; due_at: string | null; done: boolean; deal_id: string | null; deals: { title: string } | null }
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
  const [doneToday, setDoneToday] = useState({ done: 0, total: 0 })
  const [add, setAdd] = useState(false)
  const [addDate, setAddDate] = useState<string | null>(null)
  const [full, setFull] = useState(false)

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
    let q = supabase.from('tasks').select('id, title, due_at, done, deal_id, deals(title)').eq('account_id', account.id).not('due_at', 'is', null)
      .gte('due_at', from.toISOString()).lt('due_at', to.toISOString()).order('due_at').limit(500)
    if (view === 'list') q = q.eq('done', false)
    const { data } = await q
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
    return { all: open.length, late: n((d) => d < 0), today: n((d) => d === 0), tomorrow: n((d) => d === 1), week: n((d) => d >= 2 && d <= 6) }
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

  const progress = doneToday.total ? Math.round((doneToday.done / doneToday.total) * 100) : 0
  const chip = (f: Filter, label: string, n: number, on: string, off = '') => (
    <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
      className="h-10 px-4 rounded-full border text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0"
      style={filter === f ? { background: '#253371', borderColor: '#253371', color: '#fff' } : { background: off || '#fff', borderColor: '#DDE0EC', color: on }}>
      {label} <b className="font-extrabold">{n}</b>
    </button>
  )

  return (
    <section className="bg-white border border-line rounded-[24px] md:rounded-[28px] p-4 md:p-7 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 mr-auto">
          <span className="w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-navy text-white inline-flex items-center justify-center"><Icon name="check" size={24} /></span>
          <div className="flex flex-col">
            <h2 className="m-0 text-xl md:text-[26px] font-extrabold tracking-tight">Úkoly</h2>
            <span className="text-[13px] text-muted">{counts.all} otevřených · {counts.late} po termínu · {counts.today} na dnes</span>
          </div>
        </div>
        <div role="tablist" aria-label="Zobrazení úkolů" className="inline-flex p-1 rounded-[14px] bg-[#ECEEF5] gap-0.5">
          {([['list', 'Seznam', 'list'], ['cal', 'Kalendář', 'cal']] as const).map(([v, l, ic]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => pick(v)} className={`h-9 px-3.5 rounded-[11px] text-sm inline-flex items-center gap-1.5 ${view === v ? 'bg-white font-extrabold shadow-sm' : 'text-muted font-bold'}`}><Icon name={ic} size={16} />{l}</button>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-[18px] bg-bg">
          <div className="flex flex-col gap-1.5 w-32"><span className="text-[11px] font-bold text-muted tracking-wide">SPLNĚNO DNES</span><div className="h-2 rounded bg-[#DDE0EC] overflow-hidden"><div className="h-full rounded bg-[#2E9E6B]" style={{ width: progress + '%' }} /></div></div>
          <b className="text-xl font-extrabold">{doneToday.done}<span className="text-sm text-muted font-semibold"> / {doneToday.total}</span></b>
        </div>
        <button onClick={() => { setAddDate(null); setAdd(true) }} className="h-11 md:h-12 px-4 md:px-5 rounded-2xl bg-gold text-ink font-extrabold text-[15px] inline-flex items-center gap-2"><Icon name="plus" size={18} />Nový úkol</button>
      </div>

      {view === 'list' ? (
        <>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
            {chip('all', 'Vše', counts.all, '#3A4270')}
            {chip('late', 'Po termínu', counts.late, '#A12E2A', '#FFF3F0')}
            {chip('today', 'Dnes', counts.today, '#6B4D0B', '#FBF4E0')}
            {chip('tomorrow', 'Zítra', counts.tomorrow, '#3A4270')}
            {chip('week', 'Tento týden', counts.week, '#3A4270')}
          </div>
          {groups.length === 0 && <p className="m-0 text-sm text-muted bg-bg rounded-2xl p-4">Na příštích 10 dní nic naplánováno.</p>}
          {groups.map((g) => {
            const box = g.tone === 'late' ? { background: '#FFF3F0', border: '1px solid #F6D2CC' } : g.tone === 'today' ? { background: '#FBF4E0', border: '1px solid #EBD9A4' } : {}
            const dot = g.tone === 'late' ? '#C8372D' : g.tone === 'today' ? '#CB992E' : g.tone === 'soon' ? '#253371' : '#8C93B8'
            const checkCol = g.tone === 'late' ? '#C8372D' : g.tone === 'today' ? '#A57A18' : g.tone === 'soon' ? '#8C93B8' : '#B4B9D2'
            const items = full || g.id !== 'week' ? g.items : g.items.slice(0, 8)
            return (
              <div key={g.id} className={`flex flex-col gap-2.5 ${g.tone === 'late' || g.tone === 'today' ? 'rounded-[20px] p-3 md:p-4' : 'px-0.5'}`} style={box}>
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: dot }} />
                  <h3 className="m-0 text-base md:text-[17px] font-extrabold" style={{ color: g.tone === 'late' ? '#A12E2A' : g.tone === 'today' ? '#6B4D0B' : undefined }}>{g.title}</h3>
                  <span className="text-[13px] font-semibold text-muted">{g.sub}</span>
                  <span className="ml-auto text-[13px] font-bold text-muted">{g.items.length} {g.items.length === 1 ? 'úkol' : g.items.length < 5 ? 'úkoly' : 'úkolů'}</span>
                </div>
                <div className="grid md:grid-cols-2 gap-1.5">
                  {items.map((t) => <TaskRow key={t.id} t={t} checkCol={checkCol} onToggle={() => toggle(t)} />)}
                </div>
                {g.id === 'week' && g.items.length > 8 && !full && <button onClick={() => setFull(true)} className="self-center text-sm font-bold text-navy py-1">Zobrazit dalších {g.items.length - 8} úkolů</button>}
              </div>
            )
          })}
        </>
      ) : (
        <Calendar tasks={tasks} grid={grid} anchor={anchor} range={range} onRange={pickRange} onShift={shift} onToday={() => setAnchor(sod(new Date()))} onMove={moveTo} onToggle={toggle} onAdd={(k) => { setAddDate(k); setAdd(true) }} />
      )}

      <NewTask open={add} initialDue={addDate} onClose={() => setAdd(false)} deals={deals} onSaved={() => { setAdd(false); load() }} />
    </section>
  )
}

function TaskRow({ t, checkCol, onToggle }: { t: T; checkCol: string; onToggle: () => void }) {
  const tone = TONE[toneOf(t)]
  return (
    <div className="flex items-center gap-2.5 bg-white border border-line rounded-xl px-3 py-1.5 min-h-[44px]">
      <button aria-label={`Splnit úkol ${t.title}`} title="Splnit" onClick={onToggle} className="w-5 h-5 shrink-0 rounded-full inline-flex items-center justify-center text-transparent hover:text-navy" style={{ border: `2px solid ${checkCol}` }}><Icon name="check" size={12} /></button>
      <Link to={t.deal_id ? `/obchody/${t.deal_id}` : '#'} className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center md:gap-3 no-underline text-ink">
        <b className="text-sm font-bold leading-tight md:flex-1 md:truncate">{t.title}</b>
        <span className="text-xs text-muted font-medium truncate md:max-w-[150px]">{t.deals?.title}</span>
      </Link>
      <span className="h-[22px] px-2.5 rounded-full text-[11.5px] font-extrabold inline-flex items-center whitespace-nowrap" style={{ background: tone.bg, color: tone.fg }}>{whenLabel(t.due_at)}</span>
    </div>
  )
}

function Calendar({ tasks, grid, anchor, range, onRange, onShift, onToday, onMove, onToggle, onAdd }: {
  tasks: T[]; grid: { start: Date; n: number; cols: number }; anchor: Date; range: Range
  onRange: (r: Range) => void; onShift: (d: -1 | 1) => void; onToday: () => void; onMove: (id: string, k: string) => void; onToggle: (t: T) => void; onAdd: (k: string) => void
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
                    <Link to={t.deal_id ? `/obchody/${t.deal_id}` : '#'} title={t.title} className="truncate no-underline" style={{ color: 'inherit' }}>{t.title}</Link>
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

function NewTask({ open, onClose, deals, onSaved, initialDue }: { initialDue?: string | null; open: boolean; onClose: () => void; deals: Deal[]; onSaved: () => void }) {
  const { account } = useApp()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(() => key(addDays(new Date(), 3)))
  const [dealId, setDealId] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setTitle(''); setDue(initialDue || key(addDays(new Date(), 3))); setDealId('') } }, [open, initialDue])
  const sorted = useMemo(() => [...deals].sort((a, b) => a.title.localeCompare(b.title, 'cs')), [deals])
  async function save() {
    if (!account || !title.trim()) return
    setBusy(true)
    await supabase.from('tasks').insert({ account_id: account.id, deal_id: dealId || null, title: title.trim(), due_at: due ? noon(due) : null, position: 0 })
    setBusy(false); onSaved()
  }
  const inp = 'h-11 px-3 rounded-xl border border-line bg-white outline-none text-[15px] w-full'
  return (
    <Sheet open={open} onClose={onClose} title="Nový úkol" footer={<Btn onClick={save} disabled={busy || !title.trim()} className="w-full h-12 text-base">{busy ? 'Ukládám…' : 'Přidat úkol'}</Btn>}>
      <div className="flex flex-col gap-3 pb-2">
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">Co je potřeba udělat<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="např. Zavolat klientovi" className={inp} /></label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">Termín<input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inp} /></label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">K obchodu (nepovinné)
          <select value={dealId} onChange={(e) => setDealId(e.target.value)} className={inp}><option value="">— bez obchodu —</option>{sorted.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
        </label>
      </div>
    </Sheet>
  )
}
