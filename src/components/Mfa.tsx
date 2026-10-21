// Dvoufázové ověření (TOTP – Google Authenticator, Authy, 1Password…)
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Btn, Card } from './ui'

const inp = 'h-12 px-4 rounded-[14px] border border-line bg-bg outline-none focus:border-navy text-center text-xl tracking-[0.3em] w-full'

/** Po přihlášení: když má účet zapnuté 2FA, ale relace ještě není ověřená kódem, zobrazí se zadání kódu. */
export function MfaChallenge({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    const { data: f } = await supabase.auth.mfa.listFactors()
    const factor = f?.totp?.[0]
    if (!factor) { setBusy(false); onDone(); return }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s/g, '') })
    setBusy(false)
    if (error) { setErr('Kód nesedí. Zkuste to znovu.'); setCode(''); return }
    onDone()
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-line rounded-3xl p-7 flex flex-col gap-4">
        <img src="/logo.webp" alt="Martin Tesárek" className="w-52" />
        <h1 className="m-0 text-xl font-extrabold">Potvrďte přihlášení</h1>
        <p className="m-0 text-sm text-muted">Zadejte šestimístný kód z ověřovací aplikace v telefonu.</p>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" aria-label="Ověřovací kód" className={inp} />
        {err && <p className="m-0 text-sm text-[#9A3A14]">{err}</p>}
        <Btn type="submit" disabled={busy || code.replace(/\s/g, '').length < 6}>Potvrdit</Btn>
        <button type="button" onClick={() => supabase.auth.signOut()} className="h-10 text-sm font-bold text-muted">Odhlásit</button>
      </form>
    </div>
  )
}

/** Nastavení → Můj účet: zapnutí a vypnutí 2FA. */
export function MfaCard() {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const { data } = await supabase.auth.mfa.listFactors()
    setFactorId(data?.totp?.[0]?.id || null)
    setLoaded(true)
  }
  useEffect(() => { load() }, [])

  async function start() {
    setErr(''); setMsg('')
    // zapomenuté nedokončené nastavení se uklidí
    const { data: f } = await supabase.auth.mfa.listFactors()
    for (const x of f?.all || []) if (x.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: x.id })
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'CRM ' + new Date().toLocaleDateString('cs-CZ') })
    if (error || !data) { setErr(error?.message || 'Nepodařilo se zahájit nastavení.'); return }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!enroll) return
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.replace(/\s/g, '') })
    if (error) { setErr('Kód nesedí. Zkuste to znovu.'); return }
    setEnroll(null); setCode(''); setMsg('Dvoufázové ověření je zapnuté. Při každém přihlášení budete zadávat kód z telefonu.'); load()
  }
  async function off() {
    if (!factorId || !confirm_('Opravdu vypnout dvoufázové ověření?')) return
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) setErr('Vypnutí vyžaduje čerstvé potvrzení kódem. Odhlaste se, přihlaste se znovu s kódem a zkuste to znovu.')
    else { setMsg('Dvoufázové ověření je vypnuté.'); load() }
  }
  const confirm_ = (t: string) => window.confirm(t)

  if (!loaded) return null
  return (
    <Card className="p-4 md:p-6 flex flex-col gap-3 max-w-md">
      <b className="text-base">Dvoufázové ověření (2FA)</b>
      <p className="m-0 text-sm text-muted">Chrání účet i při úniku hesla. Doporučené pro všechny administrátory. Použijte aplikaci jako Google Authenticator, Authy nebo 1Password.</p>
      {factorId && !enroll && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#2F7A4E]">Zapnuto</span>
          <Btn kind="ghost" onClick={off}>Vypnout</Btn>
        </div>
      )}
      {!factorId && !enroll && <Btn onClick={start} className="self-start">Zapnout 2FA</Btn>}
      {enroll && (
        <form onSubmit={confirm} className="flex flex-col gap-3">
          <p className="m-0 text-sm">1. V aplikaci naskenujte tento kód:</p>
          <img src={enroll.qr} alt="QR kód pro ověřovací aplikaci" className="w-44 h-44 self-center bg-white border border-line rounded-xl p-2" />
          <p className="m-0 text-xs text-muted break-all">Nejde to naskenovat? Opište klíč ručně: <b className="text-ink">{enroll.secret}</b></p>
          <p className="m-0 text-sm">2. Opište šestimístný kód, který aplikace ukazuje:</p>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" aria-label="Ověřovací kód" className={inp} />
          <div className="flex gap-2"><Btn type="submit" disabled={code.replace(/\s/g, '').length < 6}>Potvrdit</Btn><Btn kind="ghost" onClick={() => { supabase.auth.mfa.unenroll({ factorId: enroll.id }); setEnroll(null) }}>Zrušit</Btn></div>
        </form>
      )}
      {err && <p className="m-0 text-sm text-[#9A3A14]">{err}</p>}
      {msg && <p className="m-0 text-sm text-[#2F7A4E] font-semibold">{msg}</p>}
    </Card>
  )
}
