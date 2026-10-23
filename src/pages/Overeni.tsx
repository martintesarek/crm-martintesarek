import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type View = { status: 'pending' | 'verified' | 'failed' | 'expired'; first_name: string | null; broker: string }

/** Veřejná stránka pro klienta: vysvětlí ověření a pošle ho do jeho banky (Bank iD). */
export function Overeni() {
  const { token } = useParams()
  const [q] = useSearchParams()
  const [v, setV] = useState<View | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    supabase.functions.invoke('bankid-verify', { body: { action: 'view', token } }).then(async ({ data, error }) => {
      if (error) { setErr((await (error as { context?: Response }).context?.json?.().catch(() => null))?.error || 'Odkaz není platný.'); return }
      setV(data as View)
    })
  }, [token])
  async function go() {
    setBusy(true); setErr('')
    const { data, error } = await supabase.functions.invoke('bankid-verify', { body: { action: 'start', token } })
    if (error || !(data as { url?: string })?.url) { setErr((await (error as { context?: Response } | null)?.context?.json?.().catch(() => null))?.error || 'Ověření se nepodařilo spustit.'); setBusy(false); return }
    window.location.href = (data as { url: string }).url
  }
  const done = q.get('hotovo') === '1' || v?.status === 'verified'
  const bad = q.get('chyba')
  return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center p-5">
      <div className="w-full max-w-[420px] bg-white border border-line rounded-[28px] p-7 flex flex-col gap-4 shadow-[0_30px_70px_rgba(37,51,113,.18)]">
        <div className="rounded-[18px] bg-navy text-white text-center py-5"><b className="text-[22px] tracking-tight">Martin Tesárek</b><div className="text-xs opacity-80">profesionální realitní makléř</div></div>
        {err ? <p className="m-0 text-[15px] text-[#B42318]">{err}</p>
          : !v ? <p className="m-0 text-muted">Načítám…</p>
          : done ? <><h1 className="m-0 text-xl font-extrabold">Děkuji, ověření je hotové</h1><p className="m-0 text-[15px]">Vaše totožnost byla ověřena. Teď už nemusíte dělat nic dalšího.</p></>
          : v.status === 'expired' ? <p className="m-0 text-[15px]">Platnost odkazu vypršela. Napište mi prosím a pošlu Vám nový.</p>
          : <>
              <h1 className="m-0 text-xl font-extrabold">{v.first_name ? `Dobrý den, ${v.first_name}` : 'Dobrý den'}</h1>
              <p className="m-0 text-[15px]">Pro ověření totožnosti se přihlásíte ke své bance (Bank iD). Je to bezpečné a bez kopírování dokladů. Banka mi předá jen jméno, datum narození, adresu a údaje o dokladu, a to jen po Vašem souhlasu. Přihlašovací údaje k bance nevidím.</p>
              {bad && <p className="m-0 text-sm text-[#B42318]">{bad === 'zruseno' ? 'Ověření bylo zrušeno. Můžete to zkusit znovu.' : 'Ověření se nepodařilo. Zkuste to prosím znovu.'}</p>}
              <button onClick={go} disabled={busy} className="h-14 rounded-2xl bg-navy text-white text-lg font-extrabold disabled:opacity-50">{busy ? 'Přesměrovávám…' : 'Ověřit přes banku'}</button>
            </>}
      </div>
    </div>
  )
}
