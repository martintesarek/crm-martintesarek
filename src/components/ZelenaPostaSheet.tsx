import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Deal } from '../lib/types'
import { Btn, Sheet } from './ui'

type DocFile = { id: string; name: string; kind: string; modified?: string }
type Rec = { name: string; street: string; city: string; zip: string }
const inp = 'h-11 px-3 rounded-[12px] border border-line bg-white outline-none text-[15px] w-full text-ink focus:border-navy'

export async function callZp<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('zelena-posta', { body })
  if (error) {
    let msg = error.message
    try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}

/** Poslat dopis klientovi Zelenou poštou: výběr dokumentu ze složky klienta → adresa → potvrzení → odeslání. */
export function ZelenaPostaSheet({ deal, open, onClose, reload }: { deal: Deal; open: boolean; onClose: () => void; reload?: () => void }) {
  const [step, setStep] = useState<'pick' | 'address' | 'confirm' | 'done'>('pick')
  const [files, setFiles] = useState<DocFile[] | null>(null)
  const [file, setFile] = useState<DocFile | null>(null)
  const [rec, setRec] = useState<Rec>({ name: '', street: '', city: '', zip: '' })
  const [contactId, setContactId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [price, setPrice] = useState<number | null>(null)

  const people = (deal.deal_contacts || []).filter((x) => x.contacts).map((x) => x.contacts!)
  const fill = (id: string) => {
    const c = people.find((p) => p.id === id)
    setContactId(id)
    if (!c) return
    setRec({
      name: [c.first_name, c.last_name].filter(Boolean).join(' '),
      street: [c.street, c.house_no].filter(Boolean).join(' ').trim(),
      city: c.city || '', zip: (c.zip || '').replace(/\s/g, ''),
    })
  }

  useEffect(() => {
    if (!open) return
    setStep('pick'); setFile(null); setErr(''); setFiles(null); setPrice(null)
    const first = people[0]
    if (first) fill(first.id); else { setContactId(''); setRec({ name: '', street: '', city: '', zip: '' }) }
    callZp<{ files: DocFile[] }>({ action: 'docs', deal_id: deal.id }).then((r) => setFiles(r.files)).catch((e) => { setErr(e.message); setFiles([]) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deal.id])

  const valid = rec.name.trim() && rec.street.trim() && rec.city.trim() && /^\d{5}$/.test(rec.zip.replace(/\s/g, ''))
  async function send() {
    if (!file) return
    setBusy(true); setErr('')
    try {
      const r = await callZp<{ price: number | null }>({ action: 'send', deal_id: deal.id, contact_id: contactId || undefined, file_id: file.id, file_name: file.name, recipient: rec })
      setPrice(r.price); setStep('done'); reload?.()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  const Err = err ? <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#FDE9E7', color: '#A12E2A' }}>{err}</div> : null

  return (
    <Sheet open={open} onClose={() => !busy && onClose()} title="Poslat dopis Zelenou poštou"
      footer={
        step === 'address' ? <div className="flex gap-2"><Btn kind="ghost" onClick={() => setStep('pick')} className="w-28">Zpět</Btn><Btn disabled={!valid} onClick={() => { setErr(''); setStep('confirm') }} className="flex-1 h-12">Pokračovat</Btn></div>
        : step === 'confirm' ? <div className="flex gap-2"><Btn kind="ghost" disabled={busy} onClick={() => setStep('address')} className="w-28">Zpět</Btn><Btn disabled={busy} onClick={send} className="flex-1 h-12 text-base">{busy ? 'Odesílám…' : 'Ano, odeslat dopis'}</Btn></div>
        : step === 'done' ? <Btn onClick={onClose} className="w-full h-12">Hotovo</Btn> : undefined
      }>
      <div className="flex flex-col gap-3">
        {step === 'pick' && (
          <>
            <p className="m-0 text-[15px] text-muted">Vyberte dokument ze složky klienta na Disku. Odešle se jako dopis (Google Dokument se převede na PDF).</p>
            {files === null && <div className="text-sm text-muted">Načítám složku klienta…</div>}
            {files && files.length === 0 && !err && <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: '#FFF3DC', color: '#7A4B00' }}>Ve složce klienta není žádný Google Dokument ani PDF.</div>}
            {files?.map((f) => (
              <button key={f.id} onClick={() => { setFile(f); setErr(''); setStep('address') }} className="text-left bg-white border border-line rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="text-xs font-extrabold px-2 py-1 rounded-lg bg-chip text-navy shrink-0 max-w-[40%] truncate">{f.kind}</span>
                <span className="font-bold text-[15px] min-w-0 break-words">{f.name}</span>
              </button>
            ))}
            {Err}
          </>
        )}
        {step === 'address' && (
          <>
            <div className="rounded-xl bg-bg px-3 py-2 text-sm"><b>Dokument:</b> {file?.name}</div>
            {people.length > 0 && (
              <label className="flex flex-col gap-1 text-sm font-bold">Komu
                <select className={inp} value={contactId} onChange={(e) => fill(e.target.value)}>
                  {people.map((p) => <option key={p.id} value={p.id}>{[p.first_name, p.last_name].filter(Boolean).join(' ')}</option>)}
                  <option value="">Jiný příjemce</option>
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm font-bold">Jméno na obálce<input className={inp} value={rec.name} onChange={(e) => setRec({ ...rec, name: e.target.value })} /></label>
            <label className="flex flex-col gap-1 text-sm font-bold">Ulice a číslo<input className={inp} value={rec.street} onChange={(e) => setRec({ ...rec, street: e.target.value })} /></label>
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 text-sm font-bold w-28">PSČ<input className={inp} inputMode="numeric" value={rec.zip} onChange={(e) => setRec({ ...rec, zip: e.target.value })} /></label>
              <label className="flex flex-col gap-1 text-sm font-bold flex-1">Město<input className={inp} value={rec.city} onChange={(e) => setRec({ ...rec, city: e.target.value })} /></label>
            </div>
            {Err}
          </>
        )}
        {step === 'confirm' && (
          <>
            <p className="m-0 text-[15px]">Opravdu odeslat tento dopis? Zelená pošta ho vytiskne a doručí, cena se účtuje za každou zásilku.</p>
            <dl className="m-0 rounded-2xl bg-bg px-4 py-3 flex flex-col gap-2 text-sm">
              <div className="flex gap-3"><dt className="w-20 shrink-0 text-muted font-bold">Dokument</dt><dd className="m-0 min-w-0 break-words font-bold">{file?.name}</dd></div>
              <div className="flex gap-3"><dt className="w-20 shrink-0 text-muted font-bold">Příjemce</dt><dd className="m-0 min-w-0 break-words">{rec.name}<br />{rec.street}<br />{rec.zip} {rec.city}</dd></div>
            </dl>
            {Err}
          </>
        )}
        {step === 'done' && (
          <div className="flex flex-col items-center text-center gap-2 py-4">
            <span className="w-16 h-16 rounded-full inline-flex items-center justify-center text-[32px]" style={{ background: '#DDF1E7' }}>✓</span>
            <b className="text-lg">Dopis byl podán</b>
            <span className="text-sm text-muted">{rec.name}, {rec.zip} {rec.city}{price != null ? ` · cena ${Math.round(price * 100) / 100} Kč` : ''}</span>
          </div>
        )}
      </div>
    </Sheet>
  )
}
