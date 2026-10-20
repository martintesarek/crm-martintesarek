import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (error) setErr(error.message)
    else setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <div className="w-full max-w-sm bg-white border border-line rounded-3xl p-7 flex flex-col gap-5">
        <img src="/logo.webp" alt="Martin Tesárek – profesionální realitní makléř" className="w-56" />
        <div>
          <h1 className="m-0 text-2xl font-extrabold tracking-tight">Přihlášení do CRM</h1>
          <p className="mt-1 mb-0 text-sm text-muted">Pošleme vám přihlašovací odkaz na e-mail. Bez hesla.</p>
        </div>
        {sent ? (
          <div className="p-4 rounded-2xl bg-gold-soft text-sm leading-relaxed">
            <b>Odkaz je na cestě.</b> Otevřete e-mail <b>{email}</b> na tomto zařízení a klikněte na odkaz.
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              E-mail
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="h-12 px-4 rounded-[14px] border border-line bg-bg outline-none focus:border-navy" placeholder="reality@martintesarek.cz" />
            </label>
            {err && <p className="m-0 text-sm text-[#9A3A14]">{err}</p>}
            <button disabled={busy} className="h-12 rounded-[14px] bg-navy text-white font-bold disabled:opacity-60">{busy ? 'Odesílám…' : 'Poslat přihlašovací odkaz'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
