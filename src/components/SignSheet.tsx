import { useEffect, useState } from 'react'
import type { Deal } from '../lib/types'
import { callSign, type Place } from '../lib/sign'
import { Btn } from './ui'
import { PdfPages, type Marker } from './PdfPages'

type DocFile = { id: string; name: string; kind: string; modified?: string }
type Prepared = { request_id: string; title: string; page_count: number; pdf: string }
type Signer = { key: string; name: string; phone: string; on: boolean; places: Place[] }
const COLORS = ['#253371', '#A8822E', '#1F7A4D', '#A12E2A', '#6B3FA0', '#0E7C86']
const SMS_DEFAULT = 'Dobrý den, posílám Vám dokument k elektronickému podpisu. Otevřete ho prosím zde: {odkaz} Martin Tesárek'
const inp = 'h-11 px-3 rounded-[12px] border border-line bg-white outline-none text-[15px] w-full text-ink focus:border-navy'

/** Poslat smlouvu (ZS, RS) k elektronickému podpisu: výběr dokumentu → umístění podpisů → SMS klientům. */
export function SignSheet({ deal, open, onClose, reload }: { deal: Deal; open: boolean; onClose: () => void; reload?: () => void }) {
  const [step, setStep] = useState<'pick' | 'place' | 'send' | 'done'>('pick')
  const [files, setFiles] = useState<DocFile[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [prep, setPrep] = useState<Prepared | null>(null)
  const [signers, setSigners] = useState<Signer[]>([])
  const [active, setActive] = useState('')
  const [sms, setSms] = useState(SMS_DEFAULT)
  const [failed, setFailed] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setStep('pick'); setErr(''); setPrep(null); setFiles(null); setSms(SMS_DEFAULT); setFailed([])
    const list: Signer[] = (deal.deal_contacts || []).filter((x) => x.contacts).map((x, i) => ({
      key: 'c' + i, name: [x.contacts!.first_name, x.contacts!.last_name].filter(Boolean).join(' '), phone: x.contacts!.phone || '',
      on: /prodav|seller/i.test(x.role || '') && !!x.contacts!.phone, places: [],
    }))
    if (!list.some((s) => s.on) && list[0]) list[0].on = true
    setSigners(list); setActive(list.find((s) => s.on)?.key || '')
    callSign<{ files: DocFile[] }>({ action: 'docs', deal_id: deal.id }).then((r) => setFiles(r.files)).catch((e) => { setErr(e.message); setFiles([]) })
  }, [open, deal])

  if (!open) return null
  const set = (key: string, patch: Partial<Signer>) => setSigners((l) => l.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  const chosen = signers.filter((s) => s.on)
  const colorOf = (key: string) => COLORS[signers.findIndex((s) => s.key === key) % COLORS.length]
  const markers: Marker[] = chosen.flatMap((s) => s.places.map((p, i) => ({ ...p, key: s.key + i, label: s.name.split(' ')[0] || 'Podpis', color: colorOf(s.key) })))

  async function pick(f: DocFile) {
    setBusy(true); setErr('')
    try { setPrep(await callSign<Prepared>({ action: 'prepare', deal_id: deal.id, file_id: f.id })); setStep('place') } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  function addPlace(p: Place) {
    const s = chosen.find((x) => x.key === active)
    if (!s) { setErr('Nejdřív nahoře vyberte, kdo se tady podepíše.'); return }
    setErr(''); set(s.key, { places: [...s.places, p] })
  }
  function removePlace(m: Marker) {
    const s = signers.find((x) => m.key?.startsWith(x.key)); if (!s) return
    const idx = Number(m.key!.slice(s.key.length))
    set(s.key, { places: s.places.filter((_, i) => i !== idx) })
  }
  const missing = chosen.filter((s) => s.places.length === 0)
  const badPhone = chosen.filter((s) => !/^(\+?\d[\d\s]{8,16})$/.test(s.phone.trim()))
  async function send() {
    if (!prep) return
    setBusy(true); setErr('')
    try {
      const r = await callSign<{ failed: string[] }>({ action: 'send', request_id: prep.request_id, sms_text: sms, signers: chosen.map((s) => ({ name: s.name, phone: s.phone, placements: s.places })) })
      setFailed(r.failed || []); setStep('done'); reload?.()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  const Err = err ? <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#FDE9E7', color: '#A12E2A' }}>{err}</div> : null

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col">
      <div className="px-4 md:px-9 pt-4 pb-3 bg-white border-b border-line-soft flex items-center gap-3" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <h2 className="m-0 text-xl font-extrabold mr-auto">Poslat k podpisu{prep ? ` · ${prep.title}` : ''}</h2>
        <button onClick={() => !busy && onClose()} className="h-11 px-2 font-bold text-navy">Zavřít</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-9 py-4">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          {step === 'pick' && (
            <>
              <p className="m-0 text-[15px] text-muted">Vyberte smlouvu ze složky klienta (ZS nebo RS). Pošle se k podpisu jako PDF; podpisy si umístíte sami.</p>
              {files === null && <div className="text-sm text-muted">Načítám složku klienta…</div>}
              {files && files.length === 0 && !err && <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: '#FFF3DC', color: '#7A4B00' }}>Ve složkách ZS a RS nebyl nalezen žádný Google Dokument ani PDF.</div>}
              {files?.map((f) => (
                <button key={f.id} disabled={busy} onClick={() => pick(f)} className="text-left bg-white border border-line rounded-2xl px-4 py-3 flex items-center gap-3 disabled:opacity-50">
                  <span className="text-xs font-extrabold px-2 py-1 rounded-lg bg-chip text-navy">{f.kind}</span>
                  <span className="font-bold text-[15px] min-w-0 break-words">{f.name}</span>
                </button>
              ))}
              {busy && <div className="text-sm text-muted">Připravuji dokument…</div>}
              {Err}
            </>
          )}

          {step === 'place' && prep && (
            <>
              <div className="bg-white border border-line rounded-2xl p-3 flex flex-col gap-2">
                <b className="text-sm">Kdo podepisuje</b>
                {signers.map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <input type="checkbox" className="w-5 h-5" checked={s.on} onChange={(e) => { set(s.key, { on: e.target.checked, places: e.target.checked ? s.places : [] }); if (e.target.checked && !active) setActive(s.key) }} />
                    <button type="button" disabled={!s.on} onClick={() => setActive(s.key)} className="flex-1 min-w-0 text-left h-10 px-3 rounded-xl font-bold text-sm truncate disabled:opacity-40" style={s.on ? { background: active === s.key ? colorOf(s.key) : colorOf(s.key) + '22', color: active === s.key ? '#fff' : colorOf(s.key) } : undefined}>
                      {s.name || 'Bez jména'} · {s.places.length}× podpis
                    </button>
                  </div>
                ))}
                <button type="button" className="self-start text-sm font-bold text-navy h-9" onClick={() => { const k = 'm' + Date.now(); setSigners((l) => [...l, { key: k, name: '', phone: '', on: true, places: [] }]); setActive(k) }}>+ Přidat další osobu</button>
              </div>
              <p className="m-0 text-[15px] text-muted">Klepněte do dokumentu tam, kde se má vybraný člověk podepsat (smlouva, PEP prohlášení, čestné prohlášení… klidně na víc místech i stránkách; klient se podepíše jednou a podpis se vloží na všechna místa). Zbarvené pole odeberete klepnutím na něj.</p>
              {Err}
              <PdfPages pdf={prep.pdf} markers={markers} onPick={addPlace} onMarker={removePlace} />
            </>
          )}

          {step === 'send' && (
            <>
              <div className="bg-white border border-line rounded-2xl p-4 flex flex-col gap-3">
                <b>Komu se SMS pošle</b>
                {chosen.map((s) => (
                  <div key={s.key} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input className={inp} placeholder="Jméno" value={s.name} onChange={(e) => set(s.key, { name: e.target.value })} />
                    <input className={inp} placeholder="Telefon" inputMode="tel" value={s.phone} onChange={(e) => set(s.key, { phone: e.target.value })} />
                    <span className="text-xs text-muted sm:col-span-2">{s.places.length}× podpis v dokumentu</span>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-line rounded-2xl p-4 flex flex-col gap-2">
                <b>Text SMS (odkaz se doplní každému zvlášť)</b>
                <textarea className="min-h-[96px] p-3 rounded-[12px] border border-line outline-none text-[15px] focus:border-navy" value={sms} onChange={(e) => setSms(e.target.value)} />
                {!sms.includes('{odkaz}') && <span className="text-sm font-bold" style={{ color: '#A12E2A' }}>Text musí obsahovat {'{odkaz}'}.</span>}
                <div className="rounded-xl bg-bg px-3 py-2 text-sm"><span className="text-muted text-xs font-bold block">Takhle ji dostane klient</span>{sms.replace('{odkaz}', 'https://crm.martintesarek.cz/podpis/…')}</div>
              </div>
              {Err}
            </>
          )}

          {step === 'done' && (
            <div className="bg-white border border-line rounded-2xl p-6 flex flex-col items-center text-center gap-2">
              <span className="text-4xl">✅</span>
              <b className="text-lg">SMS jsou odeslané</b>
              <p className="m-0 text-muted text-[15px]">Až klient podepíše, uvidíte to v Automatizacích u tohoto obchodu. Hotový podepsaný dokument se uloží do složky klienta na Disku.</p>
              {failed.length > 0 && <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#FDE9E7', color: '#A12E2A' }}>SMS se nepodařilo odeslat: {failed.join(', ')}.</div>}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 md:px-9 pt-3 bg-white border-t border-line-soft" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-3xl mx-auto flex gap-2">
          {step === 'place' && <>
            <Btn kind="ghost" onClick={() => { setStep('pick'); setPrep(null) }} className="!h-12 w-28">Zpět</Btn>
            <Btn disabled={!chosen.length || missing.length > 0} onClick={() => { setErr(''); setStep('send') }} className="flex-1 !h-12 text-base">{missing.length ? `Chybí podpis: ${missing.map((s) => s.name.split(' ')[0] || 'osoba').join(', ')}` : 'Pokračovat'}</Btn>
          </>}
          {step === 'send' && <>
            <Btn kind="ghost" onClick={() => setStep('place')} disabled={busy} className="!h-12 w-28">Zpět</Btn>
            <Btn disabled={busy || !sms.includes('{odkaz}') || badPhone.length > 0 || chosen.some((s) => !s.name.trim())} onClick={send} className="flex-1 !h-12 text-base">{busy ? 'Odesílám…' : 'Odeslat SMS k podpisu'}</Btn>
          </>}
          {(step === 'pick' || step === 'done') && <Btn onClick={onClose} className="flex-1 !h-12 text-base" kind={step === 'done' ? 'primary' : 'ghost'}>Zavřít</Btn>}
        </div>
      </div>
    </div>
  )
}
