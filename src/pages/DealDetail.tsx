import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../lib/app'
import { supabase } from '../lib/supabase'
import { DEAL_SELECT, primaryContact, orderedContacts, contactWith } from '../lib/deals'
import type { Activity, Contact, Deal, FieldDef, Task } from '../lib/types'
import { BLOCKS, contactName, czk, spaced, dateLong, daysSince, openGmail } from '../lib/format'
import { Icon } from '../components/Icon'
import { Avatar, Btn, Card, Sheet, Spinner, StagePill, StatusPicker, CONTACT_STATUSES, FieldInput, Fold, DateField } from '../components/ui'
import { PortalCard } from '../components/PortalCard'
import { CoverImg } from '../lib/streetview'
import { MapCard } from '../components/MapCard'
import { CadastreCard } from '../components/CadastreCard'
import { progress } from '../lib/intake'
import { DocumentsCard } from '../components/DocumentsCard'
import { AutomationsCard } from '../components/AutomationsCard'
import { openVoiceNote } from '../components/VoiceNote'

const DEAL_COLS = new Set(['address', 'category', 'transaction_type', 'source', 'expected_commission', 'drive_folder_url'])

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
    // je-li zadáno procento provize, přepočítá se při změně inzerované ceny samo
    const pct = Number((patch.custom || deal.custom || {}).commission_pct)
    if ('listing_price' in patch && pct > 0 && !('expected_commission' in patch)) patch = { ...patch, expected_commission: patch.listing_price ? Math.round((patch.listing_price * pct) / 100) : null }
    setDeal({ ...deal, ...patch })
    const { error } = await supabase.from('deals').update(patch).eq('id', deal.id)
    if (error) alert('Uložení se nepovedlo: ' + error.message)
    if ('stage_id' in patch) load()
  }

  if (loading) return <Spinner />
  if (!deal) return <div className="p-8">Obchod nenalezen. <Link to="/obchody">Zpět</Link></div>

  const stage = stageById(deal.stage_id)
  const c = primaryContact(deal)
  const cp = contactWith(deal, 'phone'), ce = contactWith(deal, 'email')
  const ordered = orderedContacts(deal)
  const move = async (i: number, dir: -1 | 1) => {
    const arr = ordered.map((x) => x.contacts!.id); const j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    await Promise.all(arr.map((id, k) => supabase.from('deal_contacts').update({ position: k }).eq('deal_id', deal.id).eq('contact_id', id)))
    load()
  }
  const openStages = stages.filter((s) => s.kind === 'open' && !s.hidden)
  const idx = openStages.findIndex((s) => s.id === deal.stage_id)
  const next = idx >= 0 ? openStages[idx + 1] : undefined
  const blockIdx = stage ? BLOCKS.indexOf(stage.block as typeof BLOCKS[number]) : -1
  const memberName = (uid: string | null) => { const m = members.find((x) => x.user_id === uid); const n = m?.profiles?.full_name || m?.profiles?.email || 'Systém'; return /^reality(@|$)/i.test(n) ? 'Martin' : n }

  return (
    <div className="px-4 md:px-9 pt-11 md:pt-7 pb-6 max-w-[1240px] flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <button onClick={() => nav(-1)} aria-label="Zpět" className="w-11 h-11 rounded-[14px] border border-line bg-white inline-flex items-center justify-center"><Icon name="chevL" /></button>
        <Link to="/obchody" className="hidden md:inline text-[13px] font-bold no-underline text-navy">Obchody</Link>
        <span className="mr-auto" />
        {deal.clickup_id && <a href={`https://app.clickup.com/t/${deal.clickup_id}`} target="_blank" rel="noreferrer" className="text-xs text-muted no-underline">ClickUp</a>}
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-4 md:gap-5 items-start">
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
                <Quick icon="phone" label="Volat" href={cp?.phone ? `tel:${cp.phone.replace(/\s/g, '')}` : undefined} />
                <Quick icon="sms" label="SMS" href={cp?.phone ? `sms:${cp.phone.replace(/\s/g, '')}` : undefined} />
                <Quick icon="mail" label="E-mail" onClick={ce?.email ? () => openGmail(ce.email!, deal.title) : undefined} />
                <Quick icon="pin" label="Navigovat" href={deal.address ? `https://maps.google.com/?q=${encodeURIComponent(deal.address)}` : undefined} />
                <Quick icon="folder" label="Disk" href={deal.drive_folder_url || undefined} />
              </div>
              <div className="flex flex-col md:flex-row gap-2">
                <Btn kind="gold" onClick={() => openVoiceNote(deal.id)} className="w-full md:w-auto" icon="mic">Hlasová poznámka</Btn>
                {next && <Btn onClick={() => save({ stage_id: next.id })} className="w-full md:w-auto" icon="arrow">Posunout do: {next.name}</Btn>}
              </div>
            </div>
          </Card>

          {(() => {
            const t = deal.intake?.type
            const pr = t ? progress(t, (deal.intake?.values || {}) as Record<string, never>) : []
            const tot = pr.reduce((a, x) => a + x.total, 0), dn = pr.reduce((a, x) => a + x.done, 0)
            const pct = tot ? Math.round((dn / tot) * 100) : 0
            return (
              <Link to={`/obchody/${deal.id}/nabor`} className="no-underline text-ink">
                <Card className="px-4 md:px-6 py-4">
                  <div className="flex items-center gap-3.5">
                    <span className="w-11 h-11 rounded-2xl bg-navy text-white inline-flex items-center justify-center shrink-0"><Icon name="check" size={22} /></span>
                    <span className="min-w-0 mr-auto"><b className="block text-base font-extrabold">Náběrový formulář 📋</b>
                      <span className="text-sm text-muted">{t ? 'Pokračovat ve vyplňování' : 'Otevřít při schůzce s klientem'}</span></span>
                    {t && <b className={'text-lg font-extrabold ' + (pct === 100 ? 'text-green-600' : 'text-navy')}>{pct} %</b>}
                    <Icon name="chevD" size={18} className="-rotate-90 text-muted" />
                  </div>
                  {t && <div className="mt-3 h-2 rounded-full bg-[#e8eaf3] overflow-hidden"><div className={'h-full rounded-full transition-all ' + (pct === 100 ? 'bg-green-500' : 'bg-gold')} style={{ width: pct + '%' }} /></div>}
                </Card>
              </Link>
            )
          })()}

          <Prices deal={deal} onSave={save} />
          <Fields deal={deal} fields={fields.filter((f) => f.entity === 'deal')} onSave={save} />
          <MapCard deal={deal} />

          <Fold id="deal-kontakty" title="Kontakty 👥" summary={ordered.map((x) => contactName(x.contacts)).filter(Boolean).join(', ')}>
            <div className="flex items-center -mt-3 -mb-1">
              <button onClick={() => setContactOpen(true)} className="ml-auto text-sm font-bold text-navy h-8 px-1">+ Přidat</button>
            </div>
            {(deal.deal_contacts || []).length === 0 && <p className="m-0 text-sm text-muted">Zatím žádný kontakt.</p>}
            {ordered.map((dc, i) => dc.contacts && (
              <div key={dc.contacts.id} className="flex items-center gap-2 py-1.5 border-t border-line-soft first-of-type:border-0">
                {ordered.length > 1 && (
                  <div className="flex flex-col shrink-0">
                    <button aria-label="Posunout výš" disabled={i === 0} onClick={() => move(i, -1)} className="w-7 h-5 text-muted disabled:opacity-25 inline-flex items-center justify-center"><Icon name="chevD" size={14} className="rotate-180" /></button>
                    <button aria-label="Posunout níž" disabled={i === ordered.length - 1} onClick={() => move(i, 1)} className="w-7 h-5 text-muted disabled:opacity-25 inline-flex items-center justify-center"><Icon name="chevD" size={14} /></button>
                  </div>
                )}
                <Avatar name={contactName(dc.contacts)} size={30} />
                <Link to={`/kontakty/${dc.contacts.id}`} className="min-w-0 mr-auto no-underline text-ink"><b className="text-sm truncate block" title={i === 0 && ordered.length > 1 ? 'Hlavní kontakt: sem jdou telefon, SMS a e-mail' : undefined}>{contactName(dc.contacts) || 'Bez jména'}{i === 0 && ordered.length > 1 && <span className="ml-1.5 text-[11px] font-bold text-gold">hlavní</span>}</b></Link>
                <StatusPicker status={dc.contacts.status} onChange={async (v) => { await supabase.from('contacts').update({ status: v }).eq('id', dc.contacts!.id); load() }} />
                <button aria-label="Odebrat kontakt" onClick={async () => { await supabase.from('deal_contacts').delete().eq('deal_id', deal.id).eq('contact_id', dc.contacts!.id); load() }} className="w-8 h-8 rounded-lg text-muted inline-flex items-center justify-center"><Icon name="x" size={16} /></button>
              </div>
            ))}
          </Fold>

          <Fold id="deal-dokumenty" title="Dokumenty 📄" bare><DocumentsCard deal={deal} reload={load} /></Fold>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <Fold id="deal-portal" title="Klientský portál 🔑" bare><PortalCard deal={deal} onSave={save} /></Fold>
          <CadastreCard deal={deal} />
          <AutomationsCard deal={deal} reload={load} />
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

function Quick({ icon, label, href, onClick }: { icon: string; label: string; href?: string; onClick?: () => void }) {
  const cls = 'min-w-0 flex flex-col items-center gap-1.5 py-2.5 px-0.5 rounded-2xl text-[11px] sm:text-xs leading-tight text-center font-bold no-underline'
  if (onClick) return <button onClick={onClick} className={`${cls} bg-chip text-ink`}><span className="text-navy"><Icon name={icon} size={22} /></span>{label}</button>
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
  const auto = !deal.cover_url
  const placeholder = (
    <button onClick={() => ref.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) upload(f) }}
      className="w-full h-[120px] md:h-[150px] border-b-2 border-dashed border-[#C3C7DA] bg-bg flex items-center justify-center gap-3">
      <span className="w-12 h-12 rounded-2xl bg-navy-soft text-navy inline-flex items-center justify-center"><Icon name="camera" size={24} /></span>
      <span className="flex flex-col text-left"><b className="text-[15px] text-navy">{busy ? 'Nahrávám…' : 'Přidat náhledový obrázek'}</b><span className="text-xs text-muted">Vyfotit, vybrat z galerie nebo přetáhnout</span></span>
      {input}
    </button>
  )
  return (
    <CoverImg d={deal} w={1280} h={600} className="w-full h-[200px] md:h-[240px] xl:h-[300px] object-cover" fallback={placeholder}
      wrap={(img) => (
        <div className="relative">
          {img}
          {auto && <span className="absolute left-3 bottom-3 h-7 px-2.5 rounded-lg bg-black/55 text-white text-xs font-bold inline-flex items-center">Street View</span>}
          <button onClick={() => ref.current?.click()} className="absolute right-3 bottom-3 h-10 px-3.5 rounded-xl bg-white/95 text-sm font-bold inline-flex items-center gap-2"><Icon name="camera" size={18} />{busy ? 'Nahrávám…' : auto ? 'Přidat vlastní fotku' : 'Změnit'}</button>
          {input}
        </div>
      )} />
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
      <input inputMode="numeric" value={spaced(v)} onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ''))} onBlur={() => { const n = v ? Number(v) : null; if (n !== value) onSave(n) }}
        className="h-11 px-3 rounded-xl border border-line bg-white outline-none text-[15px] font-bold text-ink" placeholder="Kč" />
    </label>
  )
}

function DateInput({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string | null) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-bold text-muted">
      {label}
      <DateField value={value || ''} onChange={(x) => onSave(x || null)} className="h-11 px-3 rounded-xl border border-line bg-white outline-none text-[15px] text-ink w-full" />
    </label>
  )
}

function Prices({ deal, onSave }: { deal: Deal; onSave: (p: Partial<Deal>) => void }) {
  return (
    <Fold id="deal-ceny" title="Ceny 💰" summary={[deal.listing_price ? 'inzerce ' + czk(deal.listing_price) : '', deal.expected_commission ? 'provize ' + czk(deal.expected_commission) : '', deal.top_offer ? 'nabídka ' + czk(deal.top_offer) : ''].filter(Boolean).join(' · ')}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MoneyInput label="Inzerovaná cena" value={deal.listing_price} onSave={(v) => onSave({ listing_price: v })} />
        <div className="col-span-2"><CommissionField deal={deal} label="Předpokládaná provize" onSave={onSave} /></div>
        <MoneyInput label="Odhad od" value={deal.estimate_low} onSave={(v) => onSave({ estimate_low: v })} />
        <MoneyInput label="Odhad do" value={deal.estimate_high} onSave={(v) => onSave({ estimate_high: v })} />
        <DateInput label="Datum odhadu" value={deal.estimate_date} onSave={(v) => onSave({ estimate_date: v })} />
        <MoneyInput label="Nejvyšší nabídka" value={deal.top_offer} onSave={(v) => onSave({ top_offer: v })} />
        <DateInput label="Datum nabídky" value={deal.top_offer_date} onSave={(v) => onSave({ top_offer_date: v })} />
        <DateInput label="Prodej od (začátek inzerce)" value={deal.listing_started_at ? deal.listing_started_at.slice(0, 10) : null} onSave={(v) => onSave({ listing_started_at: v ? v + 'T12:00:00' : null })} />
        {deal.listing_started_at && <div className="flex flex-col gap-1 text-xs font-bold text-muted">V prodeji (v portálu klienta)<div className="h-11 px-3 rounded-xl bg-chip flex items-center text-[15px] text-ink">{daysSince(deal.listing_started_at)} dní</div></div>}
      </div>
    </Fold>
  )
}

function Fields({ deal, fields, onSave }: { deal: Deal; fields: FieldDef[]; onSave: (p: Partial<Deal>) => void }) {
  const editable = fields.filter((f) => f.key !== 'expected_commission' && (DEAL_COLS.has(f.key) || !f.is_core))
  return (
    <Fold id="deal-udaje" title="Údaje 📋" summary={[deal.address, deal.category, deal.transaction_type].filter(Boolean).join(' · ')}>
      <div className="grid md:grid-cols-2 gap-3">
        {editable.map((f) => {
          const isCol = DEAL_COLS.has(f.key)
          const raw = isCol ? (deal as unknown as Record<string, unknown>)[f.key] : deal.custom?.[f.key]
          const set = (v: unknown) => isCol ? onSave({ [f.key]: v } as Partial<Deal>) : onSave({ custom: { ...(deal.custom || {}), [f.key]: v } })
          return <FieldInput key={f.key} f={f} value={raw} onSave={set} />
        })}
      </div>
    </Fold>
  )
}

// Provize v Kč i v %: zadáte-li procento, spočítá se z inzerované ceny; zadáte-li částku, dopočítá se procento.
function CommissionField({ deal, label, onSave }: { deal: Deal; label: string; onSave: (p: Partial<Deal>) => void }) {
  const price = deal.listing_price || 0
  const pctSaved = Number(deal.custom?.commission_pct) || (price && deal.expected_commission ? Math.round((deal.expected_commission / price) * 1000) / 10 : 0)
  const [kc, setKc] = useState(deal.expected_commission != null ? String(deal.expected_commission) : '')
  const [pct, setPct] = useState(pctSaved ? String(pctSaved).replace('.', ',') : '')
  useEffect(() => { setKc(deal.expected_commission != null ? String(deal.expected_commission) : ''); setPct(pctSaved ? String(pctSaved).replace('.', ',') : '') }, [deal.expected_commission, deal.listing_price, deal.custom?.commission_pct]) // eslint-disable-line
  const base = 'h-11 px-3 rounded-xl border border-line bg-white outline-none text-[15px] text-ink w-full'
  const saveKc = () => {
    const n = kc === '' ? null : Number(kc)
    if (n === (deal.expected_commission ?? null)) return
    const custom = { ...(deal.custom || {}) }; delete custom.commission_pct
    onSave({ expected_commission: n, custom })
  }
  const savePct = () => {
    const n = Number(pct.replace(',', '.'))
    if (!pct.trim() || !(n >= 0)) return
    if (!price) { alert('Nejdřív vyplňte inzerovanou cenu, z ní se provize spočítá.'); return }
    onSave({ expected_commission: Math.round((price * n) / 100), custom: { ...(deal.custom || {}), commission_pct: n } })
  }
  return (
    <div className="flex flex-col gap-1 text-xs font-bold text-muted">
      {label}
      <div className="flex gap-2">
        <input inputMode="numeric" value={spaced(kc)} placeholder="Kč" aria-label="Provize v Kč" onChange={(e) => setKc(e.target.value.replace(/[^\d.]/g, ''))} onBlur={saveKc} className={base} />
        <div className="relative w-28 shrink-0">
          <input inputMode="decimal" value={pct} placeholder="4" aria-label="Provize v procentech" onChange={(e) => setPct(e.target.value.replace(/[^\d.,]/g, ''))} onBlur={savePct} className={base + ' pr-8'} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">%</span>
        </div>
      </div>
    </div>
  )
}

function Tasks({ deal, tasks, setTasks, memberName }: { deal: Deal; tasks: Task[]; setTasks: (t: Task[]) => void; memberName: (id: string | null) => string }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(defaultDue())
  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const { data } = await supabase.from('tasks').insert({ account_id: deal.account_id, deal_id: deal.id, title: title.trim(), position: tasks.length, due_at: dueIso(due) }).select().single()
    if (data) setTasks([...tasks, data as Task]); setTitle(''); setDue(defaultDue())
  }
  async function setDueDate(t: Task, v: string) {
    const iso = dueIso(v)
    setTasks(tasks.map((x) => (x.id === t.id ? { ...x, due_at: iso } : x)))
    await supabase.from('tasks').update({ due_at: iso }).eq('id', t.id)
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
  const sorted = [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.due_at ? new Date(a.due_at).getTime() : Infinity) - (b.due_at ? new Date(b.due_at).getTime() : Infinity))
  return (
    <Fold id="deal-ukoly" title={`Úkoly ☑️ ${done}/${tasks.length}`} summary={tasks.filter((t) => !t.done).slice(0, 2).map((t) => t.title).join(', ')}>
     <div className="flex flex-col gap-1">
      {sorted.map((t) => (
        <div key={t.id} className="flex items-start gap-3 min-h-[44px] py-1.5 group">
          <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label={t.title} className="w-5 h-5 mt-0.5 accent-navy shrink-0" />
          <span className="flex flex-col min-w-0 mr-auto">
            <span className={`text-sm ${t.done ? 'line-through text-muted' : ''}`}>{t.title}</span>
            <span className="text-xs text-muted flex items-center gap-1.5 flex-wrap">
              <label className="relative inline-flex items-center gap-1 font-bold cursor-pointer" style={{ color: t.due_at && !t.done && new Date(t.due_at).getTime() < startOfToday() ? '#A12E2A' : undefined }}>
                📅 {t.due_at ? dateLong(t.due_at) : 'Přidat termín'}
                <input type="date" value={t.due_at ? t.due_at.slice(0, 10) : ''} onChange={(e) => setDueDate(t, e.target.value)} aria-label="Termín splnění" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
              </label>
              {t.assignee_id && <span>· {memberName(t.assignee_id)}</span>}
            </span>
          </span>
          <button aria-label="Smazat úkol" onClick={() => remove(t)} className="w-8 h-8 rounded-lg text-muted md:opacity-0 group-hover:opacity-100 inline-flex items-center justify-center"><Icon name="x" size={16} /></button>
        </div>
      ))}
      <form onSubmit={add} className="flex flex-col gap-2 mt-1">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nový úkol…" aria-label="Nový úkol" className="w-full min-w-0 h-11 px-3 rounded-xl border border-line bg-bg outline-none text-sm" />
        <div className="flex gap-2">
          <div className="flex-1 min-w-0"><DateField label="Termín splnění" value={due} onChange={setDue} className="h-11 px-3 w-full rounded-xl border border-line bg-bg outline-none text-sm" /></div>
          <button aria-label="Přidat úkol" className="w-11 h-11 shrink-0 rounded-xl bg-navy text-white inline-flex items-center justify-center"><Icon name="plus" size={18} /></button>
        </div>
      </form>
     </div>
    </Fold>
  )
}

/** Text aktivity pro zobrazení: bez odkazů a technických kódů, česky. */
function cleanActivity(t: string | null): string {
  return String(t || '')
    .replace(/\s*https?:\/\/\S+/g, '')
    .replace(/:\s*$/gm, '')
    .replace(/\s+\(\s*\)/g, '')
    .trim()
}

/** Kdo záznam vytvořil: automatizace = Mr. Robot, asistentka = Věruška, jinak jméno člena týmu. */
function actAuthor(a: Activity, name: (id: string | null) => string): string {
  const b = String(a.body || '')
  if (b.startsWith('⚙️') || a.type === 'system') return 'Mr. Robot 🤖'
  if (b.startsWith('Věruška')) return 'Věruška'
  return name(a.author_id)
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
    <Fold id="deal-aktivita" title="Aktivita 🕘" summary={acts.length ? `${acts.length} záznamů` : ''}>
     <div className="flex flex-col gap-3">
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
              : <Avatar name={actAuthor(a, memberName).replace(/\s*🤖/, '')} size={30} />}
            <span className="flex flex-col min-w-0 text-sm leading-relaxed">
              <span className="whitespace-pre-wrap break-words">
                {a.type === 'stage_change' ? <>Fáze: {stageName(String(a.data.from || ''))} → <b>{stageName(String(a.data.to || ''))}</b></> : cleanActivity(a.body)}
              </span>
              <span className="text-xs text-muted">{a.type !== 'stage_change' ? actAuthor(a, memberName) + ' · ' : ''}{dateLong(a.created_at)}</span>
              {a.type === 'ai' && typeof a.data?.audio_path === 'string' && <VoicePlayback path={a.data.audio_path} transcript={typeof a.data?.transcript === 'string' ? a.data.transcript : ''} />}
            </span>
          </li>
        ))}
      </ol>
     </div>
    </Fold>
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
    const { data, error } = await supabase.from('contacts').insert({ country: 'Česká republika', account_id: deal.account_id, ...form }).select().single()
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
    const { data, error } = await supabase.storage.from('voice').createSignedUrl(path, 600)
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

const dueIso = (v: string) => (v ? new Date(v + 'T12:00:00').toISOString() : null)
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

// výchozí termín nového úkolu: dnes + 3 dny (místní datum, ne UTC)
function defaultDue() { const d = new Date(Date.now() + 3 * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
