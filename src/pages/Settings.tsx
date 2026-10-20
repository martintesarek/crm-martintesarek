import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../lib/app'
import { supabase } from '../lib/supabase'
import type { FieldDef, Stage } from '../lib/types'
import { BLOCKS } from '../lib/format'
import { Btn, Card, Toggle } from '../components/ui'
import { Icon } from '../components/Icon'

const TABS = [['ucet', 'Můj účet'], ['fields', 'Vlastní pole'], ['stages', 'Fáze obchodu'], ['team', 'Tým']] as const

export function Settings() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<(typeof TABS)[number][0]>(params.get('tab') === 'ucet' ? 'ucet' : 'fields')
  const { role } = useApp()
  const admin = role === 'owner' || role === 'admin'
  return (
    <div className="px-4 md:px-9 pt-11 md:pt-8 max-w-[1000px] flex flex-col gap-4">
      <h1 className="m-0 text-[26px] md:text-[30px] font-extrabold tracking-tight">Nastavení</h1>
      <div role="tablist" className="flex gap-1 p-1 bg-[#ECEEF5] rounded-[14px] self-start overflow-x-auto max-w-full">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`h-9 px-3.5 rounded-[10px] text-sm whitespace-nowrap ${tab === k ? 'bg-white font-bold shadow-sm' : 'text-muted font-semibold'}`}>{l}</button>
        ))}
      </div>
      {!admin && tab !== 'ucet' && <p className="m-0 text-sm text-muted">Nastavení může měnit jen vlastník nebo administrátor účtu.</p>}
      {tab === 'ucet' && <AccountTab />}
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
  useEffect(() => setList(fields.filter((f) => f.entity === 'deal')), [fields])

  async function flip(f: FieldDef, k: 'show_card' | 'show_list' | 'show_mobile', v: boolean) {
    setList(list.map((x) => (x.id === f.id ? { ...x, [k]: v } : x)))
    await supabase.from('field_defs').update({ [k]: v }).eq('id', f.id)
    reloadMeta()
  }
  async function add() {
    if (!newLabel.trim() || !account) return
    const key = 'c_' + newLabel.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').slice(0, 40)
    const { error } = await supabase.from('field_defs').insert({ account_id: account.id, entity: 'deal', key, label: newLabel.trim(), type: newType, position: list.length })
    if (error) alert(error.message); else { setNewLabel(''); reloadMeta() }
  }
  async function remove(f: FieldDef) {
    if (!confirm(`Smazat pole „${f.label}“? Hodnoty u obchodů zůstanou uložené, jen se přestanou zobrazovat.`)) return
    await supabase.from('field_defs').delete().eq('id', f.id); reloadMeta()
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">Vyber, která pole se zobrazí na kartě v nástěnce, v řádku seznamu a na mobilu. V detailu obchodu jsou vždy všechna.</p>
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
    if (pw.length < 8) { setErr('Heslo musí mít aspoň 8 znaků.'); return }
    if (pw !== pw2) { setErr('Hesla se neshodují.'); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setErr(error.message); else { setMsg('Heslo je nastavené. Příště se můžete přihlásit e-mailem a heslem.'); setPw(''); setPw2('') }
  }
  const inp = 'h-11 px-3 rounded-xl border border-line outline-none text-[15px] w-full'
  return (
    <Card className="p-4 md:p-6 flex flex-col gap-3 max-w-md">
      <b className="text-base">Přihlašovací heslo</b>
      <p className="m-0 text-sm text-muted">Přihlášen jako <b className="text-ink">{session?.user.email}</b>. Nastavte si heslo, ať se nemusíte přihlašovat přes e-mailový odkaz.</p>
      <form onSubmit={save} className="flex flex-col gap-2.5">
        <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Nové heslo (min. 8 znaků)" aria-label="Nové heslo" className={inp} />
        <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Heslo znovu" aria-label="Heslo znovu" className={inp} />
        {err && <p className="m-0 text-sm text-[#9A3A14]">{err}</p>}
        {msg && <p className="m-0 text-sm text-[#2F7A4E] font-semibold">{msg}</p>}
        <Btn type="submit" className="self-start">Uložit heslo</Btn>
      </form>
    </Card>
  )
}
