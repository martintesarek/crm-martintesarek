import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { LoginArt } from '../components/LoginArt'

type Mode = 'password' | 'link' | 'reset'

const MSG: Record<string, string> = {
  'Invalid login credentials': 'Nesprávný e-mail nebo heslo.',
  'email rate limit exceeded': 'Odeslali jsme příliš mnoho e-mailů. Zkuste to za chvíli, nebo se přihlaste heslem či přes Google.',
  'Unsupported provider: provider is not enabled': 'Přihlášení přes Google zatím není zapnuté.',
}
const tr = (m: string) => MSG[m] || m

export function Login() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function google() {
    setErr('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) setErr(tr(error.message))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    const mail = email.trim()
    let error
    if (mode === 'password') {
      ;({ error } = await supabase.auth.signInWithPassword({ email: mail, password }))
    } else if (mode === 'link') {
      ;({ error } = await supabase.auth.signInWithOtp({ email: mail, options: { emailRedirectTo: window.location.origin, shouldCreateUser: false } }))
      if (!error) setSent('Odkaz je na cestě. Otevřete e-mail na tomto zařízení a klikněte na odkaz.')
    } else {
      ;({ error } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: window.location.origin + '/nastaveni?tab=ucet' }))
      if (!error) setSent('Poslali jsme vám odkaz pro nastavení hesla. Po kliknutí si heslo nastavíte v Nastavení → Účet.')
    }
    setBusy(false)
    if (error) setErr(tr(error.message))
  }

  const inp = 'h-12 px-4 rounded-[14px] border border-line bg-bg outline-none focus:border-navy'
  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative">
      <LoginArt />
      <div className="relative w-full max-w-[400px] bg-white border border-line rounded-[28px] p-7 md:p-[34px] flex flex-col gap-5 shadow-[0_30px_70px_rgba(37,51,113,.18)]">
        <h1 className="m-0 mb-1 relative overflow-hidden rounded-[22px] bg-[#16246F] h-[150px] md:h-[168px] flex flex-col items-center justify-center" aria-label="CRM Martin Tesárek">
          <span className="lg-drift absolute -right-10 -top-14 w-40 h-40 rounded-full border-[22px] border-white/[.06]" aria-hidden="true" />
          <span className="lg-drift d2 absolute -left-12 -bottom-16 w-44 h-44 rounded-full bg-white/[.05]" aria-hidden="true" />
          <span className="relative flex items-start">
            <span className="lg-rise text-[76px] md:text-[88px] font-extrabold tracking-[-3px] text-white leading-[.9]">CRM</span>
            <span className="lg-pop text-[20px] md:text-[24px] font-extrabold text-[#CB992E] leading-none mt-1 ml-1.5">MT</span>
          </span>
          <span className="lg-line relative mt-3 w-[62%] h-[5px] rounded-full bg-[#CB992E]" aria-hidden="true" />
        <span className="lg-shine" aria-hidden="true" />
        </h1>

        <button type="button" onClick={google} className="h-12 rounded-[14px] border border-line bg-white font-bold inline-flex items-center justify-center gap-3 hover:bg-bg">
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          Přihlásit přes Google
        </button>

        <div className="flex items-center gap-3 text-xs text-muted"><span className="flex-1 h-px bg-line" />nebo e-mailem<span className="flex-1 h-px bg-line" /></div>

        {sent ? (
          <div className="p-4 rounded-2xl bg-gold-soft text-sm leading-relaxed">
            <b>Hotovo.</b> {sent}
            <button onClick={() => { setSent(''); setMode('password') }} className="block mt-2 text-navy font-bold text-sm">Zpět na přihlášení</button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              E-mail
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} placeholder="vas@email.cz" />
            </label>
            {mode === 'password' && (
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Heslo
                <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inp} />
              </label>
            )}
            {err && <p className="m-0 text-sm text-[#9A3A14]">{err}</p>}
            <button disabled={busy} className="h-12 rounded-[14px] bg-navy text-white font-bold disabled:opacity-60">
              {busy ? 'Moment…' : mode === 'password' ? 'Přihlásit se' : mode === 'link' ? 'Poslat přihlašovací odkaz' : 'Poslat odkaz pro nastavení hesla'}
            </button>
            <div className="flex flex-wrap justify-between gap-2 text-[13px] font-bold">
              {mode !== 'password' && <button type="button" onClick={() => setMode('password')} className="text-navy">Přihlásit heslem</button>}
              {mode !== 'link' && <button type="button" onClick={() => setMode('link')} className="text-navy">Poslat odkaz e-mailem</button>}
              {mode !== 'reset' && <button type="button" onClick={() => setMode('reset')} className="text-muted">Nemám heslo / zapomněl jsem</button>}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
