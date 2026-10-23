import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Deal } from '../lib/types'
import { useApp } from '../lib/app'
import { PORTAL_STEPS } from '../lib/portalSteps'
import { dateTime } from '../lib/format'
import { Card, Toggle } from './ui'
import { Icon } from './Icon'

type Ev = { id: string; at: string; title: string; note: string | null }

const newToken = () => {
  const a = new Uint8Array(18)
  crypto.getRandomValues(a)
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function PortalCard({ deal, onSave }: { deal: Deal; onSave: (p: Partial<Deal>) => void }) {
  const { stageById } = useApp()
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<Ev[]>([])
  const [copied, setCopied] = useState(false)
  const [ev, setEv] = useState({ at: '', title: 'Prohlídka', note: '' })
  const [link, setLink] = useState({ label: '', url: '' })

  const url = deal.portal_token ? `${location.origin}/p/${deal.portal_token}` : ''
  const autoStep = stageById(deal.stage_id)?.portal_step || 1
  const show = deal.portal_show_prices || { estimate: true, listing: true, offer: true }
  const stats = deal.portal_stats || {}
  const links = deal.portal_links || []

  useEffect(() => {
    if (!open) return
    supabase.from('portal_events').select('id, at, title, note').eq('deal_id', deal.id).order('at', { ascending: false })
      .then(({ data }) => setEvents((data as Ev[]) || []))
  }, [open, deal.id])

  // Portál se vytváří vždy: když ještě není zapnutý nebo nemá odkaz, založí se sám
  useEffect(() => {
    if (!deal.portal_enabled || !deal.portal_token) onSave({ portal_enabled: true, portal_token: deal.portal_token || newToken() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id])
  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }
  async function share() {
    if (navigator.share) await navigator.share({ title: 'Přehled prodeje vaší nemovitosti', url }).catch(() => {})
    else copy()
  }
  async function addEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!ev.at || !ev.title.trim()) return
    const { data, error } = await supabase.from('portal_events').insert({ account_id: deal.account_id, deal_id: deal.id, at: new Date(ev.at).toISOString(), title: ev.title.trim(), note: ev.note.trim() || null }).select('id, at, title, note').single()
    if (error) { alert(error.message); return }
    setEvents([data as Ev, ...events].sort((a, b) => +new Date(b.at) - +new Date(a.at)))
    setEv({ at: '', title: 'Prohlídka', note: '' })
  }
  async function delEvent(id: string) {
    setEvents(events.filter((x) => x.id !== id))
    await supabase.from('portal_events').delete().eq('id', id)
  }
  function addLink() {
    if (!link.url.trim()) return
    let label = link.label.trim()
    if (!label) { try { label = new URL(link.url.trim()).hostname.replace(/^www\./, '') } catch { label = link.url.trim() } }
    onSave({ portal_links: [...links, { label, url: link.url.trim() }] })
    setLink({ label: '', url: '' })
  }

  const inp = 'h-11 px-3 rounded-xl border border-line bg-white outline-none text-[15px] text-ink w-full'
  const lbl = 'flex flex-col gap-1 text-xs font-bold text-muted'

  return (
    <Card className="p-4 md:p-6 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-gold-soft text-gold-ink inline-flex items-center justify-center shrink-0"><Icon name="link" size={20} /></span>
        <div className="flex flex-col min-w-0">
          <h2 className="m-0 text-base md:text-lg font-extrabold">Klientský portál</h2>
          <span className="text-xs md:text-[13px] text-muted">
            {deal.portal_view_count ? `Klient ho otevřel ${deal.portal_view_count}×, naposledy ${dateTime(deal.portal_viewed_at)}` : 'Klient ho zatím neotevřel'}
          </span>
        </div>
      </div>

      {url ? (
        <div className="grid grid-cols-2 gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="col-span-2 h-12 rounded-2xl bg-navy text-white text-[15px] font-extrabold no-underline inline-flex items-center justify-center gap-2 whitespace-nowrap"><Icon name="arrow" size={17} />Otevřít portál</a>
          <button onClick={copy} className="h-12 px-3 rounded-2xl bg-chip text-navy text-[14px] font-extrabold whitespace-nowrap">{copied ? 'Zkopírováno ✓' : 'Kopírovat odkaz'}</button>
          <button onClick={share} className="h-12 px-3 rounded-2xl bg-gold text-ink text-[14px] font-extrabold whitespace-nowrap">Poslat klientovi</button>
        </div>
      ) : <div className="h-12 rounded-2xl bg-bg flex items-center justify-center text-sm text-muted">Zakládám odkaz…</div>}

      <button onClick={() => setOpen(!open)} aria-expanded={open} className="self-start inline-flex items-center gap-1.5 text-sm font-bold text-navy min-h-[36px]">
        <span className={`inline-flex transition-transform ${open ? 'rotate-180' : ''}`}><Icon name="chevD" size={16} /></span>
        {open ? 'Skrýt nastavení portálu' : 'Nastavit, co klient vidí'}
      </button>

      {open && (
        <div className="flex flex-col gap-4 pt-2 border-t border-line-soft">
          <div className="grid md:grid-cols-2 gap-3">
            <label className={lbl}>Krok v časové ose
              <select className={inp} value={deal.portal_step_override ?? ''} onChange={(e) => onSave({ portal_step_override: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Automaticky podle fáze (krok {autoStep})</option>
                {PORTAL_STEPS.map((s, i) => <option key={i} value={i + 1}>{i + 1}. {s.name}</option>)}
              </select>
            </label>
            <Deferred label="Předání (orientačně)" placeholder="např. cca březen 2027" value={deal.portal_eta || ''} onSave={(v) => onSave({ portal_eta: v || null })} cls={inp} lbl={lbl} />
          </div>
          <Deferred label="Vzkaz pro klienta (zobrazí se, když není naplánovaná událost)" placeholder="např. Čekáme na odhad banky" value={deal.portal_note || ''} onSave={(v) => onSave({ portal_note: v || null })} cls={inp} lbl={lbl} />

          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-muted">Ceny viditelné pro klienta</span>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {([['estimate', 'Tržní odhad'], ['listing', 'Inzerovaná cena'], ['offer', 'Nejvyšší nabídka']] as const).map(([k, l]) => (
                <span key={k} className="flex items-center gap-2 text-sm font-semibold">
                  <Toggle on={show[k] !== false} onChange={(v) => onSave({ portal_show_prices: { ...show, [k]: v } })} label={l} />{l}
                </span>
              ))}
            </div>
            <span className="text-xs text-muted">Samotné částky zadáváš v kartě Ceny. Čísla níže si CRM pamatuje po dnech, klientovi z nich v portálu kreslí vývoj a nárůst za týden.</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([['views', 'Zobrazení'], ['inquiries', 'Dotazy'], ['showings', 'Prohlídky']] as const).map(([k, l]) => (
              <Deferred key={k} label={l} value={stats[k] != null ? String(stats[k]) : ''} numeric onSave={(v) => { const ns = { ...stats, [k]: v ? Number(v) : undefined }; const day = new Date().toISOString().slice(0, 10); const h = (stats.history || []).filter((x) => x.at !== day); h.push({ at: day, views: ns.views || 0, inquiries: ns.inquiries || 0, showings: ns.showings || 0 }); onSave({ portal_stats: { ...ns, history: h.slice(-40) } }) }} cls={inp} lbl={lbl} />
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-muted">Kde je nemovitost inzerovaná</span>
            {links.map((l, i) => (
              <div key={i} className="flex items-center gap-2 min-h-[40px] px-3 rounded-xl bg-bg text-sm">
                <b className="mr-auto truncate">{l.label}</b>
                <button aria-label="Odebrat odkaz" onClick={() => onSave({ portal_links: links.filter((_, j) => j !== i) })} className="w-8 h-8 rounded-lg text-muted inline-flex items-center justify-center"><Icon name="x" size={16} /></button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <input value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} placeholder="Název (Sreality.cz)" aria-label="Název odkazu" className={`${inp} flex-[1_1_140px]`} />
              <input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://…" aria-label="Adresa odkazu" className={`${inp} flex-[2_1_200px]`} />
              <button onClick={addLink} className="h-11 px-4 rounded-xl bg-chip text-sm font-bold">Přidat</button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-muted">Prohlídky a události pro klienta</span>
            {events.map((x) => (
              <div key={x.id} className="flex items-start gap-3 py-2 border-t border-line-soft first-of-type:border-0">
                <span className="flex flex-col min-w-0 mr-auto text-sm"><b>{x.title}</b><span className="text-xs text-muted">{dateTime(x.at)}{x.note ? ' · ' + x.note : ''}</span></span>
                <button aria-label="Smazat událost" onClick={() => delEvent(x.id)} className="w-8 h-8 rounded-lg text-muted inline-flex items-center justify-center"><Icon name="x" size={16} /></button>
              </div>
            ))}
            <form onSubmit={addEvent} className="grid md:grid-cols-[180px_1fr] gap-2">
              <input type="datetime-local" required value={ev.at} onChange={(e) => setEv({ ...ev, at: e.target.value })} aria-label="Termín" className={inp} />
              <input required value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} aria-label="Název události" className={inp} />
              <input value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} placeholder="Poznámka pro klienta (např. zpětná vazba z prohlídky)" aria-label="Poznámka" className={`${inp} md:col-span-2`} />
              <button className="h-11 rounded-xl bg-navy text-white text-sm font-bold md:col-span-2">Přidat událost</button>
            </form>
          </div>
        </div>
      )}
    </Card>
  )
}

function Deferred({ label, value, onSave, cls, lbl, placeholder, numeric }: { label: string; value: string; onSave: (v: string) => void; cls: string; lbl: string; placeholder?: string; numeric?: boolean }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <label className={lbl}>{label}
      <input value={v} placeholder={placeholder} inputMode={numeric ? 'numeric' : undefined}
        onChange={(e) => setV(numeric ? e.target.value.replace(/[^\d]/g, '') : e.target.value)}
        onBlur={() => v.trim() !== value && onSave(v.trim())} className={cls} />
    </label>
  )
}
