import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../lib/app'
import { supabase } from '../lib/supabase'
import type { FieldDef, Stage } from '../lib/types'
import { BLOCKS } from '../lib/format'
import { setCachedMapsKey } from '../lib/streetview'
import { Btn, Card, Toggle } from '../components/ui'
import { Icon } from '../components/Icon'
import { MfaCard } from '../components/Mfa'

const TABS = [['ucet', 'Můj účet'], ['automatizace', 'Automatizace'], ['fields', 'Vlastní pole'], ['stages', 'Fáze obchodu'], ['team', 'Tým']] as const

export function Settings() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<(typeof TABS)[number][0]>((['ucet', 'automatizace'].includes(params.get('tab') || '') ? (params.get('tab') as 'ucet' | 'automatizace') : 'fields'))
  const { role } = useApp()
  const admin = role === 'owner' || role === 'admin'
  return (
    <div className="px-4 md:px-9 pt-11 md:pt-8 max-w-[1000px] min-[1500px]:max-w-[1280px] flex flex-col gap-4">
      <h1 className="m-0 text-[26px] md:text-[30px] font-extrabold tracking-tight">Nastavení</h1>
      <Link to="/hlidac" className="self-start inline-flex items-center gap-2 h-10 px-4 rounded-[14px] bg-white border border-line text-sm font-bold text-navy no-underline md:hidden"><Icon name="pin" size={18} />Hlídač katastru</Link>
      <div role="tablist" className="flex gap-1 p-1 bg-[#ECEEF5] rounded-[14px] self-start overflow-x-auto max-w-full">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`h-9 px-3.5 rounded-[10px] text-sm whitespace-nowrap ${tab === k ? 'bg-white font-bold shadow-sm' : 'text-muted font-semibold'}`}>{l}</button>
        ))}
      </div>
      {!admin && tab !== 'ucet' && <p className="m-0 text-sm text-muted">Nastavení může měnit jen vlastník nebo administrátor účtu.</p>}
      {tab === 'ucet' && <AccountTab />}
      {tab === 'automatizace' && <AutomationTab admin={admin} />}
      {tab === 'fields' && <FieldsTab admin={admin} />}
      {tab === 'stages' && <StagesTab admin={admin} />}
      {tab === 'team' && <TeamTab admin={admin} />}
    </div>
  )
}

function FieldsTab({ admin }: { admin: boolean }) {
  const { fields, account, reloadMeta } = useApp()
  const [list, setList] = useState<FieldDef[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState('text')
  const [entity, setEntity] = useState<'deal' | 'contact'>('deal')
  useEffect(() => setList(fields.filter((f) => f.entity === entity)), [fields, entity])

  async function flip(f: FieldDef, k: 'show_card' | 'show_list' | 'show_mobile', v: boolean) {
    setList(list.map((x) => (x.id === f.id ? { ...x, [k]: v } : x)))
    await supabase.from('field_defs').update({ [k]: v }).eq('id', f.id)
    reloadMeta()
  }
  async function add() {
    if (!newLabel.trim() || !account) return
    const key = 'c_' + newLabel.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').slice(0, 40)
    const { error } = await supabase.from('field_defs').insert({ account_id: account.id, entity, key, label: newLabel.trim(), type: newType, position: list.length })
    if (error) alert(error.message); else { setNewLabel(''); reloadMeta() }
  }
  async function remove(f: FieldDef) {
    if (!confirm(`Smazat pole „${f.label}“? Hodnoty u obchodů zůstanou uložené, jen se přestanou zobrazovat.`)) return
    await supabase.from('field_defs').delete().eq('id', f.id); reloadMeta()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 p-1 bg-[#ECEEF5] rounded-[12px] self-start">
        {(['deal', 'contact'] as const).map((e) => <button key={e} onClick={() => setEntity(e)} className={`h-8 px-3 rounded-[9px] text-sm ${entity === e ? 'bg-white font-bold shadow-sm' : 'text-muted font-semibold'}`}>{e === 'deal' ? 'Obchody' : 'Kontakty'}</button>)}
      </div>
      <p className="m-0 text-sm text-muted">{entity === 'deal' ? 'Vyber, která pole se zobrazí na kartě v nástěnce, v řádku seznamu a na mobilu. V detailu obchodu jsou vždy všechna.' : 'Vlastní pole kontaktu se zobrazují v detailu kontaktu; v seznamu je zapneš tlačítkem Sloupce.'}</p>
      <Card className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[minmax(180px,1fr)_100px_70px_70px_70px_40px] gap-3 items-center px-5 py-3 text-xs font-bold text-muted border-b border-line-soft">
            <span>Pole</span><span>Typ</span><span className="text-center">Karta</span><span className="text-center">Seznam</span><span className="text-center">Mobil</span><span />
          </div>
          {list.map((f) => (
            <div key={f.id} className="grid grid-cols-[minmax(180px,1fr)_100px_70px_70px_70px_40px] gap-3 items-center px-5 py-2 min-h-[52px] border-b border-line-soft">
              <span className="text-sm font-bold">{f.label}</span>
              <span className="justify-self-start text-xs font-bold px-2 py-1 rounded-lg bg-chip text-[#3A4066]">{typeLabel(f.type)}</span>
              {(['show_card', 'show_list', 'show_mobile'] as const).map((k) => (
                <span key={k} className="justify-self-center"><Toggle on={f[k]} onChange={(v) => admin && flip(f, k, v)} label={`${f.label}: ${k}`} /></span>
              ))}
              {!f.is_core && admin ? <button aria-label="Smazat pole" onClick={() => remove(f)} className="w-8 h-8 rounded-lg text-muted inline-flex items-center justify-center"><Icon name="trash" size={16} /></button> : <span />}
            </div>
          ))}
          {admin && (
            <div className="flex flex-wrap gap-2 p-4">
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Název nového pole" aria-label="Název nového pole" className="h-11 px-3 rounded-xl border border-line outline-none text-sm flex-1 min-w-[180px]" />
              <select value={newType} onChange={(e) => setNewType(e.target.value)} aria-label="Typ pole" className="h-11 px-3 rounded-xl border border-line text-sm">
                {['text', 'number', 'money', 'date', 'url', 'phone', 'email'].map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
              </select>
              <Btn onClick={add} icon="plus">Přidat pole</Btn>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

const typeLabel = (t: string) => ({ text: 'Text', number: 'Číslo', money: 'Měna', date: 'Datum', select: 'Výběr', url: 'Odkaz', phone: 'Telefon', email: 'E-mail', image: 'Obrázek', contact: 'Kontakt', system: 'Systém' }[t] || t)

function StagesTab({ admin }: { admin: boolean }) {
  const { stages, account, reloadMeta } = useApp()
  const [list, setList] = useState<Stage[]>([])
  useEffect(() => setList(stages), [stages])
  async function upd(s: Stage, patch: Partial<Stage>) {
    setList(list.map((x) => (x.id === s.id ? { ...x, ...patch } : x)))
    await supabase.from('stages').update(patch).eq('id', s.id)
  }
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const a = list[i], b = list[j]
    const next = [...list]; next[i] = b; next[j] = a; setList(next)
    await Promise.all([supabase.from('stages').update({ position: j }).eq('id', a.id), supabase.from('stages').update({ position: i }).eq('id', b.id)])
  }
  async function add() {
    if (!account) return
    await supabase.from('stages').insert({ account_id: account.id, name: 'Nová fáze', position: list.length, block: 'Akvizice' })
    reloadMeta()
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">Název, barva, blok a pořadí fází. Skrytá fáze se nezobrazuje v seznamu ani při výběru.</p>
      <Card className="overflow-x-auto">
        <div className="min-w-[640px]">
          {list.map((s, i) => (
            <div key={s.id} className="grid grid-cols-[64px_44px_minmax(180px,1fr)_150px_70px] gap-3 items-center px-4 py-2 border-b border-line-soft">
              <span className="flex">
                <button disabled={!admin} aria-label="Posunout nahoru" onClick={() => move(i, -1)} className="w-8 h-8 rounded-lg text-muted inline-flex items-center justify-center"><Icon name="chevD" size={16} className="rotate-180" /></button>
                <button disabled={!admin} aria-label="Posunout dolů" onClick={() => move(i, 1)} className="w-8 h-8 rounded-lg text-muted inline-flex items-center justify-center"><Icon name="chevD" size={16} /></button>
              </span>
              <input type="color" aria-label="Barva" disabled={!admin} value={s.color} onChange={(e) => upd(s, { color: e.target.value })} className="w-10 h-10 rounded-lg border border-line p-0.5 bg-white" />
              <input aria-label="Název fáze" disabled={!admin} defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && upd(s, { name: e.target.value })} className="h-10 px-3 rounded-xl border border-line outline-none text-sm font-bold" />
              <select aria-label="Blok" disabled={!admin} value={s.block} onChange={(e) => upd(s, { block: e.target.value })} className="h-10 px-2 rounded-xl border border-line text-sm">
                {BLOCKS.map((b) => <option key={b}>{b}</option>)}
              </select>
              <span className="flex items-center gap-1.5 text-xs font-bold text-muted"><Toggle on={!s.hidden} onChange={(v) => admin && upd(s, { hidden: !v })} label={`Zobrazit ${s.name}`} /></span>
            </div>
          ))}
        </div>
      </Card>
      {admin && <Btn kind="ghost" onClick={add} icon="plus" className="self-start">Přidat fázi</Btn>}
    </div>
  )
}

function TeamTab({ admin }: { admin: boolean }) {
  const { members, account } = useApp()
  const [invites, setInvites] = useState<{ id: string; email: string; role: string }[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const load = () => account && supabase.from('invites').select('id, email, role').eq('account_id', account.id).then(({ data }) => setInvites(data || []))
  useEffect(() => { load() }, [account]) // eslint-disable-line
  async function invite() {
    if (!email.trim() || !account) return
    const { error } = await supabase.from('invites').insert({ account_id: account.id, email: email.trim().toLowerCase(), role })
    if (error) alert(error.message); else { setEmail(''); load() }
  }
  const memberEmails = new Set(members.map((m) => m.profiles?.email?.toLowerCase()))
  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 px-4 py-3 border-b border-line-soft">
            <span className="flex flex-col mr-auto"><b className="text-sm">{m.profiles?.full_name || m.profiles?.email}</b><span className="text-xs text-muted">{m.profiles?.email}</span></span>
            <span className="text-xs font-bold px-2 py-1 rounded-lg bg-chip">{roleLabel(m.role)}</span>
          </div>
        ))}
        {invites.filter((i) => !memberEmails.has(i.email.toLowerCase())).map((i) => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-3 border-b border-line-soft">
            <span className="flex flex-col mr-auto"><b className="text-sm">{i.email}</b><span className="text-xs text-muted">Pozvaný – zatím se nepřihlásil</span></span>
            <span className="text-xs font-bold px-2 py-1 rounded-lg bg-gold-soft text-gold-ink">{roleLabel(i.role)}</span>
          </div>
        ))}
      </Card>
      {admin && (
        <Card className="p-4 flex flex-col gap-2">
          <b className="text-sm">Pozvat člena týmu</b>
          <p className="m-0 text-xs text-muted">Po pozvání se přihlásí na crm.martintesarek.cz svým e-mailem a přístup dostane automaticky.</p>
          <div className="flex flex-wrap gap-2">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.cz" aria-label="E-mail" className="h-11 px-3 rounded-xl border border-line outline-none text-sm flex-1 min-w-[200px]" />
            <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" className="h-11 px-3 rounded-xl border border-line text-sm">
              <option value="member">Člen</option><option value="admin">Administrátor</option>
            </select>
            <Btn onClick={invite}>Pozvat</Btn>
          </div>
        </Card>
      )}
    </div>
  )
}

const roleLabel = (r: string) => ({ owner: 'Vlastník', admin: 'Administrátor', member: 'Člen' }[r] || r)

function AccountTab() {
  const { session } = useApp()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg(''); setErr('')
    if (pw.length < 12 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) { setErr('Heslo musí mít aspoň 12 znaků a obsahovat písmena i číslice.'); return }
    if (pw !== pw2) { setErr('Hesla se neshodují.'); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setErr(error.message); else { setMsg('Heslo je nastavené. Příště se můžete přihlásit e-mailem a heslem.'); setPw(''); setPw2('') }
  }
  const inp = 'h-11 px-3 rounded-xl border border-line outline-none text-[15px] w-full'
  return (
    <div className="flex flex-col gap-4">
    <Card className="p-4 md:p-6 flex flex-col gap-3 max-w-md">
      <b className="text-base">Přihlašovací heslo</b>
      <p className="m-0 text-sm text-muted">Přihlášen jako <b className="text-ink">{session?.user.email}</b>. Nastavte si heslo, ať se nemusíte přihlašovat přes e-mailový odkaz.</p>
      <form onSubmit={save} className="flex flex-col gap-2.5">
        <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Nové heslo (min. 12 znaků, písmena a čísla)" aria-label="Nové heslo" className={inp} />
        <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Heslo znovu" aria-label="Heslo znovu" className={inp} />
        {err && <p className="m-0 text-sm text-[#9A3A14]">{err}</p>}
        {msg && <p className="m-0 text-sm text-[#2F7A4E] font-semibold">{msg}</p>}
        <Btn type="submit" className="self-start">Uložit heslo</Btn>
      </form>
    </Card>
    <MfaCard />
    </div>
  )
}

// ---------------- Automatizace ----------------
type SmsCfg = { enabled: boolean; channel: string; vykani: string; tykani: string }
type SmsKind = 'svatek' | 'narozeniny'
const SMS_META: Record<SmsKind, { key: string; title: string; desc: string; defaults: SmsCfg }> = {
  svatek: { key: 'nameday_sms', title: 'Přání k svátku SMS', desc: 'Každý den v 10:17 klientům, kteří mají dnes svátek (podle jména), mají telefon a vyplněné oslovení. Každému jednou za rok.',
    defaults: { enabled: true, channel: '350324', vykani: 'Dobrý den {osloveni}, dovolte popřát mi k vašemu dnešnímu svátku všechno nejlepší! 🍾🥂\n\nZdraví vás Martin Tesárek, realitní makléř\nwww.martintesarek.cz', tykani: 'Ahoj {osloveni}, rád bych ti popřál k tvému dnešnímu svátku vše nej!!! 🍾🥂\n\nMartin Tesárek' } },
  narozeniny: { key: 'birthday_sms', title: 'Přání k narozeninám SMS', desc: 'Každý den v 10:17 klientům, kteří mají dnes narozeniny (podle data narození), mají telefon a vyplněné oslovení. Každému jednou za rok.',
    defaults: { enabled: true, channel: '350324', vykani: 'Dobrý den {osloveni}, dovolte popřát mi k vašim dnešním narozeninám všechno nejlepší! 🍾🥂\n\nZdraví vás Martin Tesárek, realitní makléř\nwww.martintesarek.cz', tykani: 'Ahoj {osloveni}, rád bych ti popřál k tvým dnešním narozeninám vše nejlepší!!! 🍾🥂\n\nMartin Tesárek' } },
}
type Preview = { kind: SmsKind; would_send: { name: string; phone: string; message: string }[]; skipped_no_salutation: string[]; already_sent: number; today: string }
type LogRow = { id: string; phone: string; message: string; status: string; error: string | null; sent_at: string; kind: string; contacts: { first_name: string | null; last_name: string | null } | null }

function AutomationTab({ admin }: { admin: boolean }) {
  const { account } = useApp()
  const [log, setLog] = useState<LogRow[]>([])
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const reloadLog = () => { if (account) supabase.from('sms_log').select('id, phone, message, status, error, sent_at, kind, contacts(first_name, last_name)').eq('account_id', account.id).order('sent_at', { ascending: false }).limit(20).then(({ data }) => setLog((data as never) || [])) }
  useEffect(() => {
    if (!account) return
    supabase.from('accounts').select('settings').eq('id', account.id).single().then(({ data }) => setSettings((data?.settings as Record<string, unknown>) || {}))
    reloadLog()
  }, [account]) // eslint-disable-line
  if (!settings) return null
  return (
    <div className="flex flex-col gap-4">
      <AutomationsAdmin admin={admin} />
      <MapsKeyCard admin={admin} initial={String((settings as { maps_key?: string }).maps_key || '')} />
      {(['svatek', 'narozeniny'] as SmsKind[]).map((k) => <SmsCard key={k} kind={k} admin={admin} initial={{ ...SMS_META[k].defaults, ...((settings[SMS_META[k].key] as Partial<SmsCfg>) || {}) }} onSent={reloadLog} />)}
      {log.length > 0 && (
        <Card className="p-4 md:p-6 flex flex-col">
          <h2 className="m-0 mb-2 text-base font-extrabold">Poslední odeslané SMS</h2>
          {log.map((l) => (
            <div key={l.id} className="flex flex-col py-2 border-t border-line-soft text-sm">
              <span><b>{l.contacts ? [l.contacts.first_name, l.contacts.last_name].filter(Boolean).join(' ') : l.kind}</b> · {l.phone} · {new Date(l.sent_at).toLocaleString('cs-CZ')} {l.status === 'failed' && <span className="text-[#9A3A14]">· chyba: {l.error}</span>}</span>
              <span className="text-xs text-muted whitespace-pre-line">{l.message}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

function SmsCard({ kind, admin, initial, onSent }: { kind: SmsKind; admin: boolean; initial: SmsCfg; onSent: () => void }) {
  const { account } = useApp()
  const meta = SMS_META[kind]
  const [cfg, setCfg] = useState<SmsCfg>(initial)
  const [saved, setSaved] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [busy, setBusy] = useState('')
  const set = (patch: Partial<SmsCfg>) => { setCfg({ ...cfg, ...patch }); setSaved(false) }
  async function save() {
    if (!account) return
    const { data } = await supabase.from('accounts').select('settings').eq('id', account.id).single()
    const { error } = await supabase.from('accounts').update({ settings: { ...((data?.settings as object) || {}), [meta.key]: cfg } }).eq('id', account.id)
    if (error) setErr(error.message); else { setSaved(true); setMsg('Uloženo.') }
  }
  async function call(body: Record<string, unknown>) {
    setErr(''); setMsg('')
    const { data, error } = await supabase.functions.invoke('nameday-sms', { body: { kind, ...body } })
    if (error) { let m = error.message; try { m = (await (error as { context?: Response }).context?.json())?.error || m } catch { /* */ } throw new Error(m) }
    if (data?.error) throw new Error(data.error)
    return data
  }
  const inp = 'px-3 py-2 rounded-xl border border-line bg-white outline-none text-sm w-full leading-relaxed'
  return (
    <Card className="p-4 md:p-6 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-col mr-auto"><h2 className="m-0 text-base font-extrabold">{meta.title}</h2><span className="text-xs text-muted">{meta.desc}</span></div>
        <Toggle on={cfg.enabled} onChange={(v) => admin && set({ enabled: v })} label="Zapnuto" />
      </div>
      <label className="flex flex-col gap-1 text-xs font-bold text-muted">Text při vykání · {'{osloveni}'} = oslovení z kontaktu
        <textarea value={cfg.vykani} onChange={(e) => set({ vykani: e.target.value })} rows={4} disabled={!admin} className={inp} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-muted">Text při tykání
        <textarea value={cfg.tykani} onChange={(e) => set({ tykani: e.target.value })} rows={3} disabled={!admin} className={inp} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-muted md:w-60">GoSMS kanál
        <input value={cfg.channel} onChange={(e) => set({ channel: e.target.value })} disabled={!admin} className={inp} />
      </label>
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <Btn onClick={save} disabled={saved || !admin}>Uložit</Btn>
        <Btn kind="ghost" disabled={busy !== ''} onClick={async () => { setBusy('p'); try { const d = await call({ action: 'preview' }); setPreview(d.results?.[0] || null) } catch (e) { setErr((e as Error).message) } setBusy('') }}>{busy === 'p' ? 'Načítám…' : 'Komu by dnes přišlo'}</Btn>
        <div className="flex gap-2 md:ml-auto">
          <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+420 776 252 777" className="h-11 px-3 rounded-xl border border-line bg-white outline-none text-sm w-44" />
          <Btn kind="ghost" disabled={busy !== '' || !testPhone || !admin} onClick={async () => { setBusy('t'); try { const d = await call({ action: 'test', test_phone: testPhone }); setMsg('Testovací SMS odeslána:\n' + d.message); onSent() } catch (e) { setErr((e as Error).message) } setBusy('') }}>{busy === 't' ? 'Posílám…' : 'Poslat test'}</Btn>
        </div>
      </div>
      {msg && <p className="m-0 p-3 rounded-xl bg-[#E6F4EC] text-sm text-[#2F7A4E] whitespace-pre-line">{msg}</p>}
      {err && <p className="m-0 p-3 rounded-xl bg-[#FDEEE6] text-sm text-[#9A3A14]">{err}</p>}
      {preview && (
        <div className="flex flex-col gap-2 p-3 rounded-xl bg-bg text-sm">
          <b>Dnes ({preview.today.split('-').reverse().map(Number).join('. ')}.)</b>
          {preview.would_send.length === 0 && <span className="text-muted">Nikdo k odeslání{preview.already_sent ? ` (už odesláno: ${preview.already_sent})` : ''}.</span>}
          {preview.would_send.map((w) => <div key={w.phone} className="p-2 rounded-lg bg-white border border-line"><b>{w.name}</b> · {w.phone}<div className="text-xs text-muted whitespace-pre-line mt-1">{w.message}</div></div>)}
          {preview.skipped_no_salutation.length > 0 && <span className="text-[#9A3A14]">Bez oslovení (nepošle se): {preview.skipped_no_salutation.join(', ')}</span>}
          {preview.would_send.length > 0 && admin && <Btn kind="gold" disabled={busy !== ''} onClick={async () => { setBusy('r'); try { const d = await call({ action: 'run' }); const r = d.results?.[0]; setMsg(`Odesláno: ${(r?.sent || []).join(', ') || 'nikomu'}${r?.failed?.length ? '\nChyby: ' + r.failed.join('; ') : ''}`); setPreview(null); onSent() } catch (e) { setErr((e as Error).message) } setBusy('') }}>{busy === 'r' ? 'Posílám…' : 'Odeslat teď'}</Btn>}
        </div>
      )}
    </Card>
  )
}

// Tlačítkové automatizace v obchodu: název, popis, adresa webhooku v Make, potvrzení, fáze.
type AutoRow = { id: string; title: string; description: string | null; icon: string | null; webhook_url: string | null; external: boolean; confirm_text: string | null; stage_ids: string[]; enabled: boolean; position: number }
function AutomationsAdmin({ admin }: { admin: boolean }) {
  const { account, stages } = useApp()
  const [rows, setRows] = useState<AutoRow[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const load = () => { if (account) supabase.from('automations').select('*').eq('account_id', account.id).order('position').then(({ data }) => setRows((data as AutoRow[]) || [])) }
  useEffect(load, [account]) // eslint-disable-line
  async function upd(id: string, patch: Partial<AutoRow>) { setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x))); await supabase.from('automations').update(patch).eq('id', id) }
  async function add() { if (!account) return; const { data } = await supabase.from('automations').insert({ account_id: account.id, title: 'Nová automatizace', position: rows.length }).select().single(); load(); if (data) setOpen(data.id) }
  async function remove(id: string) { if (confirm('Smazat tuto automatizaci?')) { await supabase.from('automations').delete().eq('id', id); load() } }
  const inp = 'h-10 px-3 rounded-xl border border-line bg-white outline-none text-sm w-full'
  return (
    <Card className="p-4 md:p-6 flex flex-col gap-2">
      <h2 className="m-0 text-base font-extrabold">Automatizace v obchodu ⚙️</h2>
      <p className="m-0 text-sm text-muted">Tlačítka, která se ukážou v detailu obchodu a spustí scénář v Make. Adresu (webhook) vložíte ze scénáře v Make.</p>
      {rows.map((r) => (
        <div key={r.id} className="border-t border-line-soft pt-2">
          <button onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full flex items-center gap-2 text-left">
            <span className="text-xl">{r.icon || '⚙️'}</span><b className="mr-auto text-[15px]">{r.title}</b>
            <span className="text-xs text-muted">{!r.webhook_url ? 'nepropojeno' : r.enabled ? 'zapnuto' : 'vypnuto'}</span>
          </button>
          {open === r.id && admin && (
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex gap-2"><input className={inp + ' !w-16 text-center'} defaultValue={r.icon || ''} onBlur={(e) => upd(r.id, { icon: e.target.value })} /><input className={inp} defaultValue={r.title} onBlur={(e) => upd(r.id, { title: e.target.value })} /></div>
              <input className={inp} placeholder="Krátký popis" defaultValue={r.description || ''} onBlur={(e) => upd(r.id, { description: e.target.value })} />
              <input className={inp} placeholder="Adresa webhooku z Make (https://hook.eu1.make.com/…)" defaultValue={r.webhook_url || ''} onBlur={(e) => upd(r.id, { webhook_url: e.target.value.trim() || null })} />
              <textarea className="p-3 rounded-xl border border-line text-sm outline-none" rows={2} placeholder="Text potvrzení, např. „Odešle e-mail klientům o spuštění inzerce.“" defaultValue={r.confirm_text || ''} onBlur={(e) => upd(r.id, { confirm_text: e.target.value })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.external} onChange={(e) => upd(r.id, { external: e.target.checked })} />Jde ke klientovi (upozorní při opakovaném spuštění)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.enabled} onChange={(e) => upd(r.id, { enabled: e.target.checked })} />Zapnuto</label>
              <div className="text-xs font-bold text-muted">Zobrazit jen ve fázích (nic = všude)</div>
              <div className="flex flex-wrap gap-1.5">
                {stages.filter((s) => !s.hidden).map((s) => { const on = r.stage_ids?.includes(s.id); return <button key={s.id} onClick={() => upd(r.id, { stage_ids: on ? r.stage_ids.filter((x) => x !== s.id) : [...(r.stage_ids || []), s.id] })} className={`h-8 px-3 rounded-full text-xs font-bold border ${on ? 'bg-navy text-white border-navy' : 'bg-white border-line text-muted'}`}>{s.name}</button> })}
              </div>
              <button onClick={() => remove(r.id)} className="self-start text-sm font-bold text-[#A12E2A]">Smazat</button>
            </div>
          )}
        </div>
      ))}
      {admin && <Btn kind="ghost" onClick={add} className="self-start">+ Přidat automatizaci</Btn>}
    </Card>
  )
}

function MapsKeyCard({ admin, initial }: { admin: boolean; initial: string }) {
  const { account } = useApp()
  const [val, setVal] = useState(initial)
  const [msg, setMsg] = useState('')
  async function save() {
    if (!account) return
    const { data } = await supabase.from('accounts').select('settings').eq('id', account.id).single()
    const { error } = await supabase.from('accounts').update({ settings: { ...((data?.settings as object) || {}), maps_key: val.trim() } }).eq('id', account.id)
    if (!error) setCachedMapsKey(account.id, val.trim())
    setMsg(error ? 'Nepodařilo se uložit.' : 'Uloženo.')
  }
  return (
    <Card className="p-4 md:p-6 flex flex-col gap-2">
      <h2 className="m-0 text-base font-extrabold">Google Mapy a Street View 📍</h2>
      <p className="m-0 text-sm text-muted">Klíč „Maps Embed API“ z Google Cloud (omezený na crm.martintesarek.cz). Bez něj se v obchodu ukáže jen základní mapa.</p>
      <div className="flex gap-2">
        <input value={val} onChange={(e) => { setVal(e.target.value); setMsg('') }} disabled={!admin} placeholder="AIza…" className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-line bg-white text-sm" />
        <button onClick={save} disabled={!admin} className="h-11 px-4 rounded-xl bg-navy text-white text-sm font-bold disabled:opacity-50">Uložit</button>
      </div>
      {msg && <span className="text-sm text-muted">{msg}</span>}
    </Card>
  )
}
