import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { callSign, downloadPdf } from '../lib/sign'
import { PdfPages } from '../components/PdfPages'

type View = { title: string; broker: string; completed: boolean; pdf: string; signer: { name: string; status: string; placements: { page: number; x: number; y: number }[]; phone: string } }
const inp = 'h-12 px-3 rounded-[12px] border border-line bg-white outline-none text-lg w-full text-ink focus:border-navy tracking-widest text-center font-bold'
const btn = 'h-14 rounded-2xl bg-navy text-white text-lg font-extrabold w-full disabled:opacity-50'

function SignaturePad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const has = useRef(false)
  const pos = (e: React.PointerEvent) => { const c = ref.current!, r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height } }
  function down(e: React.PointerEvent) {
    const c = ref.current!, g = c.getContext('2d')!
    c.setPointerCapture(e.pointerId); drawing.current = true
    const p = pos(e); g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#10172e'
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + 0.1, p.y + 0.1); g.stroke()
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return
    const g = ref.current!.getContext('2d')!, p = pos(e)
    g.lineTo(p.x, p.y); g.stroke(); g.beginPath(); g.moveTo(p.x, p.y)
  }
  function up() {
    if (!drawing.current) return
    drawing.current = false; has.current = true
    onChange(ref.current!.toDataURL('image/png'))
  }
  function clear() { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); has.current = false; onChange(null) }
  return (
    <div className="flex flex-col gap-2">
      <canvas ref={ref} width={900} height={300} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className="w-full rounded-2xl border-2 border-dashed border-line bg-white" style={{ touchAction: 'none', aspectRatio: '3 / 1' }} />
      <div className="flex items-center text-sm text-muted"><span className="mr-auto">Podepište se prstem do rámečku</span><button type="button" onClick={clear} className="font-bold text-navy h-9 px-2">Smazat</button></div>
    </div>
  )
}

/** Veřejná stránka pro klienta: prohlédne si dokument, ověří se SMS kódem a podepíše prstem. */
export function Podpis() {
  const { token } = useParams()
  const [v, setV] = useState<View | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [sig, setSig] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [fin, setFin] = useState(false)

  const load = () => callSign<View>({ action: 'view', token }).then(setV).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  async function otp() {
    setBusy(true); setMsg('')
    try { await callSign({ action: 'otp', token }); setSent(true) } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  async function sign() {
    setBusy(true); setMsg('')
    try {
      const r = await callSign<{ completed: boolean }>({ action: 'sign', token, code, signature: sig, consent: true })
      setFin(r.completed); setOpen(false); await load()
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }

  if (err) return <Shell><div className="m-auto max-w-sm text-center p-6"><div className="text-4xl mb-2">🔒</div><b className="text-lg">{err}</b></div></Shell>
  if (!v) return <Shell><div className="m-auto text-muted">Načítám dokument…</div></Shell>
  const signed = v.signer.status === 'signed'

  return (
    <Shell>
      <header className="bg-white border-b border-line-soft px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-xs font-bold text-muted">{v.broker} · elektronický podpis</div>
          <h1 className="m-0 text-lg font-extrabold leading-tight">{v.title}</h1>
          <div className="text-sm text-muted">Podepisuje: <b className="text-ink">{v.signer.name}</b></div>
        </div>
      </header>
      <main className="flex-1 px-3 py-4 pb-40">
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          {signed && <div className="rounded-2xl px-4 py-3 text-[15px] font-semibold" style={{ background: '#E6F4EC', color: '#1F7A4D' }}>✓ Děkujeme, dokument jste podepsal(a). {v.completed || fin ? 'Podepsali všichni, hotový dokument si můžete stáhnout.' : 'Čekáme ještě na ostatní podepisující.'}</div>}
          {!signed && <div className="rounded-2xl px-4 py-3 text-[15px]" style={{ background: '#FFF3DC', color: '#7A4B00' }}>Prosím přečtěte si celý dokument. Na místech označených rámečkem se po ověření SMS kódem podepíšete prstem.</div>}
          <PdfPages pdf={v.pdf} markers={signed ? [] : v.signer.placements.map((p, i) => ({ ...p, key: 'p' + i, label: 'Zde podepište', color: '#253371' }))} />
        </div>
      </main>

      {(!signed || v.completed) && !open && (
        <div className="fixed left-0 right-0 bottom-0 bg-white border-t border-line-soft px-4 pt-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="max-w-3xl mx-auto">
            {v.completed
              ? <button className={btn} onClick={() => downloadPdf(v.pdf, v.title + ' – podepsáno')}>Stáhnout podepsaný dokument</button>
              : <button className={btn} onClick={() => setOpen(true)}>Podepsat dokument</button>}
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <button aria-label="Zavřít" className="absolute inset-0 bg-ink/50" onClick={() => !busy && setOpen(false)} />
          <div className="relative bg-white w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-[28px] sm:rounded-[24px] p-5 flex flex-col gap-4" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            <div className="flex items-center"><h2 className="m-0 text-xl font-extrabold mr-auto">Podpis dokumentu</h2><button onClick={() => setOpen(false)} className="h-11 px-2 font-bold text-navy">Zavřít</button></div>
            {!sent ? (
              <>
                <p className="m-0 text-[15px] text-muted">Pro ověření vám pošleme SMS s kódem na číslo <b className="text-ink">{v.signer.phone}</b>.</p>
                <button className={btn} disabled={busy} onClick={otp}>{busy ? 'Odesílám…' : 'Poslat SMS kód'}</button>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-sm font-bold text-muted">Kód z SMS
                  <input className={inp} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
                </label>
                <button type="button" onClick={otp} disabled={busy} className="self-start text-sm font-bold text-navy h-9">Poslat kód znovu</button>
                <SignaturePad onChange={setSig} />
                <label className="flex items-start gap-3 text-[15px]"><input type="checkbox" className="w-6 h-6 mt-0.5 shrink-0" checked={ok} onChange={(e) => setOk(e.target.checked)} />
                  <span>Přečetl(a) jsem dokument a souhlasím s ním. Chci ho podepsat v elektronické podobě; zaznamená se čas, IP adresa a zařízení.</span></label>
                <button className={btn} disabled={busy || code.length !== 6 || !sig || !ok} onClick={sign}>{busy ? 'Podepisuji…' : 'Podepsat'}</button>
              </>
            )}
            {msg && <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#FDE9E7', color: '#A12E2A' }}>{msg}</div>}
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg flex flex-col">{children}</div>
}
