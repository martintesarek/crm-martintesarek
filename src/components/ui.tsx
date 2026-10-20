import { useEffect, type ReactNode } from 'react'
import type { Stage } from '../lib/types'
import { Icon } from './Icon'
import { initials } from '../lib/format'

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
        {footer && <div className="px-4 pt-3 pb-6 border-t border-line-soft safe-bottom">{footer}</div>}
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
