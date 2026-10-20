import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app'
import { supabase } from '../lib/supabase'
import { Btn, Card } from '../components/ui'
import { Icon } from '../components/Icon'

export function NewDeal() {
  const { account, stages, session } = useApp()
  const nav = useNavigate()
  const def = stages.find((s) => s.name === 'Prvotní kontakt') || stages.find((s) => s.kind === 'open')
  const [f, setF] = useState({ title: '', stage_id: def?.id || '', first_name: '', last_name: '', phone: '', email: '', address: '', note: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!account) return
    const title = f.title.trim() || [f.first_name, f.last_name].filter(Boolean).join(' ') || 'Nový obchod'
    setBusy(true)
    const { data: deal, error } = await supabase.from('deals').insert({
      account_id: account.id, title, stage_id: f.stage_id || null, address: f.address || null, assignee_id: session?.user.id, position: -Date.now() / 1000,
    }).select().single()
    if (error || !deal) { setBusy(false); alert(error?.message); return }
    if (f.first_name || f.last_name || f.phone || f.email) {
      const { data: c } = await supabase.from('contacts').insert({ account_id: account.id, first_name: f.first_name || null, last_name: f.last_name || null, phone: f.phone || null, email: f.email || null }).select().single()
      if (c) await supabase.from('deal_contacts').insert({ deal_id: deal.id, contact_id: c.id, account_id: account.id, role: 'prodávající' })
    }
    if (f.note.trim()) await supabase.from('activities').insert({ account_id: account.id, deal_id: deal.id, type: 'comment', body: f.note.trim(), author_id: session?.user.id })
    nav(`/obchody/${deal.id}`, { replace: true })
  }

  const inp = 'h-12 px-3.5 rounded-[14px] border border-line bg-white outline-none text-[15px] w-full focus:border-navy'
  return (
    <div className="px-4 md:px-9 pt-11 md:pt-8 max-w-2xl flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <button onClick={() => nav(-1)} aria-label="Zpět" className="w-11 h-11 rounded-[14px] border border-line bg-white inline-flex items-center justify-center"><Icon name="chevL" /></button>
        <h1 className="m-0 text-2xl font-extrabold tracking-tight">Nový obchod</h1>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Card className="p-4 md:p-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-bold text-muted">Název obchodu
            <input autoFocus value={f.title} onChange={set('title')} placeholder="např. Novák | RD Valtice" className={inp} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-bold text-muted">Fáze
            <select value={f.stage_id} onChange={set('stage_id')} className={inp}>
              {stages.filter((s) => !s.hidden).map((s) => <option key={s.id} value={s.id}>{s.block} · {s.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-bold text-muted">Adresa nemovitosti
            <input value={f.address} onChange={set('address')} className={inp} />
          </label>
        </Card>
        <Card className="p-4 md:p-6 flex flex-col gap-3">
          <h2 className="m-0 text-base font-extrabold">Klient</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <input aria-label="Jméno" placeholder="Jméno" value={f.first_name} onChange={set('first_name')} className={inp} />
            <input aria-label="Příjmení" placeholder="Příjmení" value={f.last_name} onChange={set('last_name')} className={inp} />
          </div>
          <input aria-label="Telefon" type="tel" placeholder="Telefon" value={f.phone} onChange={set('phone')} className={inp} />
          <input aria-label="E-mail" type="email" placeholder="E-mail" value={f.email} onChange={set('email')} className={inp} />
          <textarea aria-label="Poznámka" placeholder="Poznámka (volitelně)" value={f.note} onChange={set('note')} rows={3} className="p-3.5 rounded-[14px] border border-line outline-none text-[15px]" />
        </Card>
        <Btn type="submit" disabled={busy} className="h-14 text-base">{busy ? 'Ukládám…' : 'Založit obchod'}</Btn>
      </form>
    </div>
  )
}
