import { createPortal } from 'react-dom'
import { useEffect, useState, type ReactNode } from 'react'
import type { Stage, FieldDef } from '../lib/types'
import { Icon } from './Icon'
import { initials, spaced } from '../lib/format'

export function StagePill({ stage, size = 'md' }: { stage?: Stage; size?: 'sm' | 'md' }) {
  if (!stage) return <span className="text-xs text-muted">Bez fáze</span>
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[10px] font-bold text-ink whitespace-nowrap ${size === 'sm' ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-[13px]'}`}
      style={{ background: stage.color + '24' }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color }} />
      {stage.name}
    </span>
  )
}

export function Avatar({ name, size = 30 }: { name?: string | null; size?: number }) {
  return (
    <span className="rounded-full bg-navy text-white font-extrabold inline-flex items-center justify-center shrink-0" style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {initials(name)}
    </span>
  )
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <button aria-label="Zavřít" className="absolute inset-0 bg-ink/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative bg-white w-full md:max-w-lg max-h-[90vh] rounded-t-[28px] md:rounded-[24px] flex flex-col">
        <div className="px-5 pt-3 pb-3 border-b border-line-soft">
          <div className="mx-auto w-10 h-1.5 rounded-full bg-[#D6D9E6] md:hidden mb-3" />
          <div className="flex items-center">
            <h2 className="m-0 text-xl font-extrabold mr-auto">{title}</h2>
            <button onClick={onClose} className="h-11 px-2 font-bold text-navy">Zavřít</button>
          </div>
        </div>
        <div className="overflow-y-auto px-4 py-3 flex-1">{children}</div>
        {footer && <div className="px-4 pt-4 border-t border-line-soft" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>{footer}</div>}
      </div>
    </div>
  )
}

export function Btn({ children, onClick, kind = 'primary', type = 'button', disabled, className = '', icon }: { children?: ReactNode; onClick?: () => void; kind?: 'primary' | 'gold' | 'ghost'; type?: 'button' | 'submit'; disabled?: boolean; className?: string; icon?: string }) {
  const k = kind === 'primary' ? 'bg-navy text-white' : kind === 'gold' ? 'bg-gold text-ink' : 'bg-white border border-line text-ink'
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`h-11 px-4 rounded-[14px] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50 ${k} ${className}`}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`bg-white border border-line rounded-[22px] ${className}`}>{children}</section>
}

export function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-[3px] border-line border-t-navy rounded-full animate-spin" /></div>
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative w-11 h-[26px] rounded-full transition-colors ${on ? 'bg-navy' : 'bg-[#D6D9E6]'}`}>
      <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[21px]' : 'left-[3px]'}`} />
    </button>
  )
}

export const CONTACT_STATUSES: { key: string; label: string; bg: string; fg: string }[] = [
  { key: 'prodávající', label: 'Prodávající', bg: '#FDE2EC', fg: '#9A1F4F' },
  { key: 'kupující', label: 'Kupující', bg: '#DDF5E6', fg: '#1F6B3F' },
  { key: 'kontakt', label: 'Kontakt', bg: '#E3E6F3', fg: '#253371' },
  { key: 'lead', label: 'Lead', bg: '#FFF1CC', fg: '#7A5A00' },
]
export function StatusChip({ status, size = 'md' }: { status?: string | null; size?: 'sm' | 'md' }) {
  const s = CONTACT_STATUSES.find((x) => x.key === (status || '').toLowerCase())
  if (!s) return null
  return <span className={`inline-flex items-center rounded-[10px] font-bold whitespace-nowrap ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`} style={{ background: s.bg, color: s.fg }}>{s.label}</span>
}

export function StatusPicker({ status, onChange }: { status?: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, up: false })
  const cur = CONTACT_STATUSES.find((x) => x.key === (status || '').toLowerCase())
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault(); e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    const up = window.innerHeight - r.bottom < 230
    setPos({ top: up ? r.top - 4 : r.bottom + 4, left: r.left, up })
    setOpen(!open)
  }
  return (
    <span className="relative inline-block">
      <button type="button" onClick={toggle} aria-haspopup="listbox" aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1 text-xs font-bold whitespace-nowrap border border-transparent hover:border-line"
        style={cur ? { background: cur.bg, color: cur.fg } : { background: '#ECEEF5', color: '#6B7390' }}>
        {cur ? cur.label : 'Typ'}<Icon name="chevD" size={12} />
      </button>
      {open && createPortal(
        <>
          <span className="fixed inset-0 z-40" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false) }} />
          <span role="listbox" className="fixed z-50 flex flex-col gap-1 p-1.5 bg-white border border-line rounded-xl shadow-lg min-w-[150px]" style={{ left: pos.left, top: pos.up ? undefined : pos.top, bottom: pos.up ? window.innerHeight - pos.top : undefined }}>
            {CONTACT_STATUSES.map((st) => (
              <button key={st.key} type="button" role="option" aria-selected={st.key === cur?.key} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onChange(st.key) }}
                className={`text-left rounded-lg px-2.5 py-1.5 text-xs font-bold ${st.key === cur?.key ? 'ring-2 ring-navy' : ''}`} style={{ background: st.bg, color: st.fg }}>{st.label}</button>
            ))}
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onChange(null) }} className="text-left rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted">Bez typu</button>
          </span>
        </>, document.body)}
    </span>
  )
}

export function FieldInput({ f, value, onSave }: { f: FieldDef; value: unknown; onSave: (v: unknown) => void }) {
  const [v, setV] = useState(value == null ? '' : String(value))
  useEffect(() => setV(value == null ? '' : String(value)), [value])
  const base = 'h-11 px-3 rounded-xl border border-line bg-white outline-none text-[15px] text-ink w-full'
  const commit = (x: string) => {
    const out = x === '' ? null : (f.type === 'money' || f.type === 'number') ? Number(x) : x
    if (String(out ?? '') !== String(value ?? '')) onSave(out)
  }
  let control
  if (f.type === 'select') {
    control = <select value={v} onChange={(e) => { setV(e.target.value); commit(e.target.value) }} className={base}>
      <option value="">—</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}{v && !f.options.includes(v) && <option value={v}>{v}</option>}
    </select>
  } else if (f.type === 'date') {
    control = <input type="date" value={v} onChange={(e) => { setV(e.target.value); commit(e.target.value) }} className={base} />
  } else {
    const t = f.type === 'money' || f.type === 'number' ? 'text' : f.type === 'url' ? 'url' : f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'
    control = (
      <div className="flex gap-2">
        <input type={t} inputMode={f.type === 'money' || f.type === 'number' ? 'numeric' : undefined} value={f.type === 'money' ? spaced(v) : v}
          onChange={(e) => setV(f.type === 'money' || f.type === 'number' ? e.target.value.replace(/[^\d.]/g, '') : e.target.value)} onBlur={() => commit(v.trim())} className={base} />
        {f.type === 'url' && v && <a href={v} target="_blank" rel="noreferrer" aria-label="Otevřít odkaz" className="w-11 h-11 shrink-0 rounded-xl bg-chip inline-flex items-center justify-center text-navy"><Icon name="link" size={18} /></a>}
      </div>
    )
  }
  return (
    <label className="flex flex-col gap-1 text-xs font-bold text-muted">
      {f.label}{control}
    </label>
  )
}


export const FORMALITY = { vykani: { label: 'Vykání', bg: '#A8822E', fg: '#FFFFFF' }, tykani: { label: 'Tykání', bg: '#6FCF7A', fg: '#0F4A1E' } } as const
/** Štítek Vykání / Tykání – klepnutím se přepne. */
export function FormalityChip({ value, onChange }: { value?: string | null; onChange?: (v: 'vykani' | 'tykani') => void }) {
  const k = value === 'tykani' ? 'tykani' : 'vykani'
  const f = FORMALITY[k]
  return (
    <button type="button" disabled={!onChange} title={onChange ? 'Klepnutím přepnout' : undefined} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange?.(k === 'vykani' ? 'tykani' : 'vykani') }}
      className="inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1 text-xs font-bold whitespace-nowrap" style={{ background: f.bg, color: f.fg }}>
      {f.label}{onChange && <Icon name="chevD" size={12} />}
    </button>
  )
}

/** Sbalitelná sekce. Stav si pamatuje (localStorage), aby vyplněné sekce nepřekážely.
 *  `bare`: potomek je sám Card – v rozbaleném stavu se zobrazí on, ve sbaleném jen úzká lišta s názvem. */
export function Fold({ id, title, summary, defaultOpen = true, bare, children }: { id: string; title: string; summary?: ReactNode; defaultOpen?: boolean; bare?: boolean; children: ReactNode }) {
  const key = 'fold:' + id
  const [open, setOpen] = useState<boolean>(() => { try { const v = localStorage.getItem(key); return v == null ? defaultOpen : v === '1' } catch { return defaultOpen } })
  const toggle = () => { setOpen((o) => { try { localStorage.setItem(key, o ? '0' : '1') } catch { /* ignore */ } return !o }) }
  const head = (
    <button onClick={toggle} aria-expanded={open} className="w-full flex items-center gap-3 text-left min-h-[44px]">
      <h2 className="m-0 text-base font-extrabold">{title}</h2>
      {!open && summary && <span className="text-sm text-muted truncate min-w-0">{summary}</span>}
      <Icon name="chevD" size={18} className={`ml-auto shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  )
  if (bare) {
    if (!open) return <Card className="px-4 md:px-6 py-1">{head}</Card>
    return (
      <div className="flex flex-col gap-1">
        {children}
        <button onClick={toggle} className="self-center h-8 px-3 rounded-full text-xs font-bold text-muted inline-flex items-center gap-1 hover:bg-white"><Icon name="chevD" size={14} className="rotate-180" />Sbalit {title}</button>
      </div>
    )
  }
  return (
    <Card className={`px-4 md:px-6 ${open ? 'py-4 md:py-6' : 'py-1'}`}>
      {head}
      {open && <div className="mt-3">{children}</div>}
    </Card>
  )
}
