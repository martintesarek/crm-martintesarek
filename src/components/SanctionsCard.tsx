import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, Btn } from './ui'
import type { Contact } from '../lib/types'

type Sx = NonNullable<Contact['sanctions']>

type Res = { ok?: boolean; result?: Sx; entries?: number; checked?: number; possible?: number; meta?: { refreshed_at?: string; entries?: number; error?: string }; token?: boolean; error?: string }
async function call(body: Record<string, unknown>): Promise<Res> {
  const { data, error } = await supabase.functions.invoke('sanctions-check', { body })
  if (error) { let msg = error.message; try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ } return { error: msg } }
  return data as Res
}
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('cs-CZ') : '')

/** Kontrola jména kontaktu proti sankčnímu seznamu EU. Výsledek je jen podklad, nic se neodesílá. */
export function SanctionsCard({ c, isAdmin, onChange }: { c: Contact; isAdmin: boolean; onChange: (s: Sx) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ refreshed_at?: string; entries?: number; error?: string } | null>(null)
  const [tokenOk, setTokenOk] = useState<boolean | null>(null)
  useEffect(() => { call({ action: 'status' }).then((r) => { setMeta(r.meta || null); setTokenOk(r.token ?? null) }) }, [])
  const s = c.sanctions
  const hasName = !!c.first_name && !!c.last_name

  async function check() {
    setBusy('check'); setMsg(null)
    const r = await call({ action: 'check', contact_id: c.id })
    if (r.result) onChange(r.result); else setMsg(r.error || 'Kontrola se nepodařila.')
    setBusy(null)
  }
  async function refresh() {
    setBusy('refresh'); setMsg(null)
    const r = await call({ action: 'refresh' })
    if (r.ok) { setMsg(`Seznam obnoven (${r.entries} jmen), zkontrolováno ${r.checked} kontaktů, možných shod ${r.possible}.`); const st = await call({ action: 'status' }); setMeta(st.meta || null) }
    else setMsg(r.error || 'Obnovení se nepodařilo.')
    setBusy(null)
  }

  return (
    <Card className="p-4 md:p-5 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <h2 className="m-0 text-base font-extrabold">Sankční seznam EU</h2>
        {s?.status === 'clear' && <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-[#DDF1E7] text-[#1F6B49]">Bez shody</span>}
        {s?.status === 'possible' && <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-[#FBDAD5] text-[#8F231C]">Možná shoda – zkontrolovat</span>}
        {s?.status === 'skipped' && <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-chip text-muted">Chybí jméno nebo příjmení</span>}
        <Btn kind="ghost" className="ml-auto" onClick={check} disabled={!hasName || !!busy}>{busy === 'check' ? 'Kontroluji…' : 'Zkontrolovat'}</Btn>
      </div>
      {s?.matches?.length ? (
        <div className="flex flex-col gap-1">
          {s.matches.map((m, i) => (
            <div key={i} className="text-sm py-1.5 border-t border-line-soft first:border-0"><b>{m.name}</b><span className="text-muted"> · {m.kind === 'person' ? 'osoba' : m.kind || ''}{m.programme ? ' · ' + m.programme : ''}{m.strong ? ' · shoda jména i data' : ' · shoda jen podle jména'}</span></div>
          ))}
          <p className="m-0 text-xs text-muted">Shoda jména ještě neznamená, že jde o stejnou osobu. Porovnejte datum narození a státní příslušnost přímo v seznamu EU a výsledek ručně posuďte.</p>
        </div>
      ) : null}
      <p className="m-0 text-xs text-muted">
        {s ? `Zkontrolováno ${fmt(s.checked_at)}. ` : ''}
        {meta?.refreshed_at ? `Seznam EU ze dne ${fmt(meta.refreshed_at)} (${meta.entries} jmen).` : tokenOk === false ? 'Seznam zatím není napojen: chybí přístupový token EU v nastavení serveru.' : 'Seznam zatím nebyl stažen.'}
      </p>
      {meta?.error && <p className="m-0 text-xs text-[#9A3A14]">Poslední obnovení selhalo: {meta.error}</p>}
      {isAdmin && <div><Btn kind="ghost" onClick={refresh} disabled={!!busy}>{busy === 'refresh' ? 'Stahuji seznam…' : 'Obnovit seznam EU a zkontrolovat všechny kontakty'}</Btn></div>}
      {msg && <p className="m-0 text-sm font-semibold">{msg}</p>}
    </Card>
  )
}
