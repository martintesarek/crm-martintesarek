import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Deal } from '../lib/types'
import { czk, dateTime } from '../lib/format'
import { Card } from './ui'
import { Icon } from './Icon'

type DFile = { id: string; name: string; path: string; mime: string; kind: string; size: number; modified?: string; link?: string; thumb?: string }
type Owner = { first_name?: string; last_name: string; phone?: string | null; email?: string | null; street?: string | null; city?: string | null; zip?: string | null; exists?: boolean }
type Scan = {
  scanned_at: string
  files: DFile[]; photos: DFile[]; docs_used: string[]
  counts: { total: number; photos: number; docs: number }
  proposal: { address?: string | null; category?: string | null; cadastre?: string | null; owners: Owner[]; listing_price?: number | null; expected_commission?: number | null; estimate_low?: number | null; estimate_high?: number | null; contract_date?: string | null; exclusivity_until?: string | null; summary?: string }
}
const KIND: Record<string, string> = { lv: 'List vlastnictví', smlouva: 'Smlouvy', penb: 'PENB', pudorys: 'Půdorysy', cena: 'Ceny a odhady', foto: 'Fotky', ostatni: 'Ostatní' }
const fmtSize = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? Math.round(b / 1e3) + ' kB' : '')

export function DriveCard({ deal, onSave, reload }: { deal: Deal; onSave: (p: Partial<Deal>) => Promise<void> | void; reload: () => void }) {
  const [scan, setScan] = useState<Scan | null>((deal.drive_scan as Scan) || null)
  const [busy, setBusy] = useState<'scan' | 'cover' | 'apply' | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(!!deal.drive_scan)
  const [pick, setPick] = useState<Record<string, boolean>>({})
  const [applied, setApplied] = useState('')

  async function call(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke('drive-scan', { body: { deal_id: deal.id, ...body } })
    if (error) { let msg = error.message; try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ } throw new Error(msg) }
    if (data?.error) throw new Error(data.error)
    return data
  }
  async function doScan() {
    setBusy('scan'); setErr(''); setApplied('')
    try {
      const r = (await call({ action: 'scan' })) as Scan
      setScan(r); setOpen(true)
      const p = r.proposal; const init: Record<string, boolean> = {}
      ;(['address', 'category', 'listing_price', 'expected_commission', 'estimate'] as const).forEach((k) => { init[k] = k === 'estimate' ? !!(p.estimate_low || p.estimate_high) : p[k] != null && p[k] !== '' })
      p.owners.forEach((o, i) => { init['owner' + i] = !o.exists })
      setPick(init)
    } catch (e) { setErr((e as Error).message) }
    setBusy(null)
  }
  async function useCover(fileId: string) {
    setBusy('cover'); setErr('')
    try { const r = await call({ action: 'cover', file_id: fileId }); await onSave({ cover_url: r.cover_url }); reload() } catch (e) { setErr((e as Error).message) }
    setBusy(null)
  }
  async function apply() {
    if (!scan) return
    setBusy('apply'); setErr('')
    const p = scan.proposal; const patch: Partial<Deal> = {}
    if (pick.address && p.address) patch.address = p.address
    if (pick.category && p.category) patch.category = p.category
    if (pick.listing_price && p.listing_price) patch.listing_price = p.listing_price
    if (pick.expected_commission && p.expected_commission) patch.expected_commission = p.expected_commission
    if (pick.estimate) { if (p.estimate_low) patch.estimate_low = p.estimate_low; if (p.estimate_high) patch.estimate_high = p.estimate_high }
    const custom = { ...(deal.custom || {}) } as Record<string, unknown>
    if (p.cadastre) custom.katastr = p.cadastre
    if (p.contract_date) custom.smlouva_podepsana = p.contract_date
    if (p.exclusivity_until) custom.exkluzivita_do = p.exclusivity_until
    patch.custom = custom
    try {
      if (Object.keys(patch).length) await onSave(patch)
      let added = 0
      for (let i = 0; i < p.owners.length; i++) {
        const o = p.owners[i]; if (!pick['owner' + i] || o.exists) continue
        const { data: c, error } = await supabase.from('contacts').insert({ account_id: deal.account_id, first_name: o.first_name || null, last_name: o.last_name, phone: o.phone || null, email: o.email || null, street: o.street || null, city: o.city || null, zip: o.zip || null, source: 'Disk' }).select('id').single()
        if (error) throw new Error(error.message)
        await supabase.from('deal_contacts').upsert({ deal_id: deal.id, contact_id: c.id, account_id: deal.account_id, role: i === 0 ? 'prodávající' : 'spoluprodávající' })
        added++
      }
      await supabase.from('activities').insert({ account_id: deal.account_id, deal_id: deal.id, type: 'system', body: `Doplněno z Disku: ${[...Object.keys(patch).filter((k) => k !== 'custom'), added ? `${added}× kontakt` : ''].filter(Boolean).join(', ') || 'bez změn'}` })
      setApplied('Uloženo. Údaje najdete v kartách Údaje, Ceny a Kontakty.')
      reload()
    } catch (e) { setErr((e as Error).message) }
    setBusy(null)
  }

  const p = scan?.proposal
  const byKind = scan ? Object.entries(scan.files.filter((f) => f.kind !== 'foto').reduce<Record<string, DFile[]>>((m, f) => ((m[f.kind] ||= []).push(f), m), {})) : []
  const inp = 'flex items-start gap-3 p-3 rounded-2xl border border-line text-sm'
  const Chk = ({ k, label, value }: { k: string; label: string; value: React.ReactNode }) => (
    <label className={`${inp} ${pick[k] ? 'bg-gold-soft/50 border-gold' : 'opacity-70'}`}>
      <input type="checkbox" checked={!!pick[k]} onChange={(e) => setPick({ ...pick, [k]: e.target.checked })} className="w-5 h-5 mt-0.5 accent-navy shrink-0" />
      <span className="flex flex-col min-w-0"><span className="text-xs font-bold text-muted">{label}</span><span className="font-semibold break-words">{value}</span></span>
    </label>
  )

  return (
    <Card className="p-4 md:p-6 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-navy-soft text-navy inline-flex items-center justify-center shrink-0"><Icon name="folder" size={18} /></span>
        <button onClick={() => setOpen(!open)} className="flex flex-col text-left mr-auto min-w-0" aria-expanded={open}>
          <h2 className="m-0 text-base font-extrabold">Nalezeno na Disku</h2>
          <span className="text-xs text-muted truncate">
            {!deal.drive_folder_url ? 'Obchod nemá přiřazenou složku na Disku' : scan ? `${scan.counts.total} souborů · ${scan.counts.photos} fotek · načteno ${dateTime(scan.scanned_at)}` : 'Složka zatím nebyla načtena'}
          </span>
        </button>
        <button onClick={doScan} disabled={busy !== null || !deal.drive_folder_url} className="h-10 px-3.5 rounded-xl bg-navy text-white text-sm font-bold disabled:opacity-50 shrink-0">
          {busy === 'scan' ? 'Načítám…' : scan ? 'Načíst znovu' : 'Načíst z Disku'}
        </button>
      </div>
      {busy === 'scan' && <p className="m-0 text-sm text-muted">Procházím složku a čtu dokumenty. U větších složek to může trvat až minutu.</p>}
      {err && <p className="m-0 p-3 rounded-xl bg-[#FDEEE6] text-sm text-[#9A3A14]">{err}</p>}
      {applied && <p className="m-0 p-3 rounded-xl bg-[#E6F4EC] text-sm text-[#2F7A4E] font-semibold">{applied}</p>}

      {open && scan && p && (
        <div className="flex flex-col gap-4 pt-2 border-t border-line-soft">
          {p.summary && <p className="m-0 text-sm leading-relaxed p-3 rounded-xl bg-bg">{p.summary}</p>}

          {scan.photos.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-muted">Fotky · klepnutím nastavíte náhled obchodu</span>
              <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                {scan.photos.map((f) => (
                  <button key={f.id} onClick={() => useCover(f.id)} disabled={busy !== null} title={f.name} className="relative aspect-square rounded-xl overflow-hidden bg-chip disabled:opacity-60">
                    {f.thumb ? <img src={f.thumb} alt={f.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <span className="w-full h-full inline-flex items-center justify-center text-muted"><Icon name="image" size={20} /></span>}
                  </button>
                ))}
              </div>
              {busy === 'cover' && <span className="text-xs text-muted">Ukládám náhled…</span>}
            </div>
          )}

          {(p.address || p.category || p.listing_price || p.expected_commission || p.estimate_low || p.estimate_high || p.owners.length > 0) && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-muted">Navržené údaje · zaškrtnuté se uloží</span>
              {p.address && <Chk k="address" label="Adresa nemovitosti" value={p.address} />}
              {p.category && <Chk k="category" label="Typ nemovitosti" value={p.category} />}
              {p.cadastre && <div className={inp}><span className="flex flex-col"><span className="text-xs font-bold text-muted">Katastr</span><span>{p.cadastre}</span></span></div>}
              {p.listing_price != null && <Chk k="listing_price" label="Cena" value={czk(p.listing_price)} />}
              {p.expected_commission != null && <Chk k="expected_commission" label="Provize" value={czk(p.expected_commission)} />}
              {(p.estimate_low || p.estimate_high) && <Chk k="estimate" label="Odhad" value={`${p.estimate_low ? czk(p.estimate_low) : '?'} – ${p.estimate_high ? czk(p.estimate_high) : '?'}`} />}
              {p.owners.map((o, i) => (
                <Chk key={i} k={'owner' + i} label={o.exists ? 'Vlastník · už je v kontaktech' : i === 0 ? 'Vlastník · nový kontakt (prodávající)' : 'Spoluvlastník · nový kontakt'}
                  value={<>{[o.first_name, o.last_name].filter(Boolean).join(' ')}{o.phone ? ' · ' + o.phone : ''}{o.email ? ' · ' + o.email : ''}{o.city ? <span className="block text-xs text-muted font-normal">{[o.street, o.zip, o.city].filter(Boolean).join(', ')}</span> : null}</>} />
              ))}
              <button onClick={apply} disabled={busy !== null} className="h-12 rounded-2xl bg-gold text-ink font-extrabold disabled:opacity-60">{busy === 'apply' ? 'Ukládám…' : 'Uložit zaškrtnuté do obchodu'}</button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-muted">Dokumenty ve složce</span>
            {byKind.length === 0 && <span className="text-sm text-muted">Žádné dokumenty, jen fotky.</span>}
            {byKind.map(([k, list]) => (
              <div key={k} className="flex flex-col">
                <b className="text-xs text-navy uppercase tracking-wide py-1">{KIND[k] || k}</b>
                {list.map((f) => (
                  <a key={f.id} href={f.link} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 py-1.5 text-sm no-underline text-ink border-t border-line-soft">
                    <Icon name="doc" size={16} className="text-muted shrink-0" />
                    <span className="truncate mr-auto">{f.path}{f.name}</span>
                    <span className="text-xs text-muted shrink-0">{fmtSize(f.size)}</span>
                  </a>
                ))}
              </div>
            ))}
            {scan.docs_used.length > 0 && <span className="text-xs text-muted">Údaje byly vytěženy z: {scan.docs_used.join(', ')}</span>}
          </div>
        </div>
      )}
    </Card>
  )
}
