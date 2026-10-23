import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, Btn } from './ui'
import type { Contact } from '../lib/types'

type Claims = { name?: string; given_name?: string; family_name?: string; birthdate?: string; gender?: string; addresses?: { type?: string; street?: string; streetnumber?: string; buildingapartment?: string; city?: string; zipcode?: string }[]; idcards?: { type?: string; description?: string; number?: string; valid_to?: string; country?: string }[]; env?: string }
type V = { id: string; status: 'pending' | 'verified' | 'failed'; claims: Claims | null; error: string | null; created_at: string; verified_at: string | null; applied_at: string | null; expires_at: string }

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('bankid-verify', { body })
  if (error) { let msg = error.message; try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ } return { error: msg } as { error: string; link?: string; filled?: string[]; configured?: boolean; sandbox?: boolean } }
  return data as { error?: string; link?: string; filled?: string[]; configured?: boolean; sandbox?: boolean }
}
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('cs-CZ') : '')
const fmtD = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(8, 10).replace(/^0/, '') + '. ' + s.slice(5, 7).replace(/^0/, '') + '. ' + s.slice(0, 4) : s || '')

/** Ověření totožnosti klienta přes Bank iD. Odkaz se klientovi pošle SMS, kterou Martin před odesláním potvrdí. */
export function BankIdCard({ c, onSendLink, onFilled }: { c: Contact; onSendLink: (text: string) => void; onFilled: () => void }) {
  const [list, setList] = useState<V[]>([])
  const [cfg, setCfg] = useState<{ configured?: boolean; sandbox?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  function load() { supabase.from('bankid_verifications').select('id, status, claims, error, created_at, verified_at, applied_at, expires_at').eq('contact_id', c.id).order('created_at', { ascending: false }).limit(5).then(({ data }) => setList((data as V[]) || [])) }
  useEffect(() => { load(); call({ action: 'status' }).then((r) => setCfg(r)) }, [c.id])
  const last = list.find((v) => v.status === 'verified')
  const pending = list.find((v) => v.status === 'pending' && new Date(v.expires_at) > new Date())

  async function send() {
    setBusy(true); setMsg(null)
    const r = await call({ action: 'create', contact_id: c.id })
    setBusy(false)
    if (!r.link) { setMsg(r.error || 'Odkaz se nepodařilo vytvořit.'); return }
    onSendLink(`Dobrý den, pro ověření Vaší totožnosti prosím klepněte na odkaz a přihlaste se do své banky (platí 7 dní): ${r.link}`)
    setTimeout(load, 1500)
  }
  async function fill(id: string) {
    setBusy(true); setMsg(null)
    const r = await call({ action: 'apply', id })
    setBusy(false)
    if (r.error) { setMsg(r.error); return }
    setMsg(r.filled?.length ? 'Doplněno do kontaktu: ' + r.filled.join(', ') + '.' : 'V kontaktu už je vše vyplněné, nic se nezměnilo.')
    load(); onFilled()
  }
  const cl = last?.claims
  const addr = cl?.addresses?.find((a) => /PERMANENT/i.test(a.type || '')) || cl?.addresses?.[0]
  const idc = cl?.idcards?.[0]
  const mismatch = cl?.family_name && c.last_name && cl.family_name.toLowerCase() !== c.last_name.toLowerCase()

  return (
    <Card className="p-4 md:p-5 flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="m-0 text-base font-extrabold">Ověření totožnosti (Bank iD)</h2>
        {last && <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-[#DDF1E7] text-[#1F6B49]">Ověřeno {fmt(last.verified_at)}</span>}
        {!last && pending && <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-gold-soft text-gold-ink">Čeká na klienta</span>}
        <Btn kind="ghost" className="ml-auto" disabled={busy || !c.phone || cfg?.configured === false} onClick={send}>{pending ? 'Poslat odkaz znovu' : 'Poslat ověření SMS'}</Btn>
      </div>
      {cfg?.configured === false && <p className="m-0 text-xs text-muted">Zatím nezapnuto: chybí přístup k Bank iD (viz nastavení serveru).</p>}
      {!c.phone && <p className="m-0 text-xs text-muted">Kontakt nemá telefon.</p>}
      {cfg?.sandbox && cfg.configured && <p className="m-0 text-xs text-[#9A3A14]">Zkušební režim: ověřují se testovací údaje, ne skutečný klient.</p>}
      {cl && (
        <div className="grid md:grid-cols-2 gap-x-4 gap-y-1 text-sm mt-1">
          <span><span className="text-muted">Jméno: </span><b>{cl.name || [cl.given_name, cl.family_name].filter(Boolean).join(' ')}</b></span>
          <span><span className="text-muted">Narození: </span><b>{fmtD(cl.birthdate)}</b></span>
          {addr && <span><span className="text-muted">Adresa: </span><b>{[addr.street, [addr.buildingapartment, addr.streetnumber].filter(Boolean).join('/'), addr.zipcode, addr.city].filter(Boolean).join(' ')}</b></span>}
          {idc && <span><span className="text-muted">Doklad: </span><b>{idc.description || idc.type} {idc.number}{idc.valid_to ? ' (do ' + fmtD(idc.valid_to) + ')' : ''}</b></span>}
        </div>
      )}
      {mismatch && <p className="m-0 text-sm font-bold text-[#8F231C]">Příjmení z banky se liší od příjmení v kontaktu. Zkontrolujte, zda jde o správnou osobu.</p>}
      {last && !last.applied_at && <div><Btn kind="gold" disabled={busy} onClick={() => fill(last.id)}>Doplnit prázdná pole kontaktu</Btn></div>}
      {list.some((v) => v.status === 'failed') && !last && <p className="m-0 text-xs text-muted">Poslední pokus se nepovedl nebo ho klient zrušil.</p>}
      {msg && <p className="m-0 text-sm font-semibold">{msg}</p>}
    </Card>
  )
}
