import { spaced } from '../lib/format'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../lib/app'
import { supabase } from '../lib/supabase'
import { Btn, Card, CONTACT_STATUSES } from '../components/ui'
import { Icon } from '../components/Icon'

type F = { first_name: string; last_name: string; salutation: string; status: string; phone: string; email: string; address: string; category: string; transaction_type: string; expected_commission: string; listing_price: string; commission_pct: string; drive_folder_url: string; source: string; title: string; stage_id: string; note: string }

const L = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="flex flex-col gap-1.5 text-xs font-bold text-muted">{label}{children}</label>

export function NewDeal() {
  const { account, stages, fields, session } = useApp()
  const nav = useNavigate()
  const [qp] = useSearchParams()
  const def = stages.find((s) => s.id === qp.get('stage')) || stages.find((s) => s.name === 'Prvotní kontakt') || stages.find((s) => s.kind === 'open')
  const [f, setF] = useState<F>({ first_name: '', last_name: '', salutation: '', status: 'prodávající', phone: '', email: '', address: '', category: '', transaction_type: 'Prodej', expected_commission: '', listing_price: '', commission_pct: '', drive_folder_url: '', source: '', title: '', stage_id: def?.id || '', note: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const opts = (key: string) => fields.find((x) => x.entity === 'deal' && x.key === key)?.options || []
  const autoTitle = [[f.first_name, f.last_name].filter(Boolean).join(' '), f.address.split(',')[0]].filter(Boolean).join(' | ')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!account) return
    const title = f.title.trim() || autoTitle || 'Nový obchod'
    setBusy(true)
    const commission = f.expected_commission.replace(/[^\d.]/g, '')
    const pct = Number(f.commission_pct.replace(',', '.')) || 0
    const { data: deal, error } = await supabase.from('deals').insert({
      account_id: account.id, title, stage_id: f.stage_id || null, address: f.address.trim() || null, category: f.category || null, transaction_type: f.transaction_type || null,
      source: f.source || null, expected_commission: commission ? Number(commission) : null, listing_price: f.listing_price ? Number(f.listing_price) : null, custom: pct > 0 && f.listing_price ? { commission_pct: pct } : {}, drive_folder_url: f.drive_folder_url.trim() || null,
      assignee_id: session?.user.id, position: -Date.now() / 1000,
    }).select().single()
    if (error || !deal) { setBusy(false); alert(error?.message); return }
    if (f.first_name || f.last_name || f.phone || f.email) {
      const { data: c } = await supabase.from('contacts').insert({ country: 'Česká republika', account_id: account.id, first_name: f.first_name.trim() || null, last_name: f.last_name.trim() || null, salutation: f.salutation.trim() || null, status: f.status || null, phone: f.phone.trim() || null, email: f.email.trim() || null, source: f.source || null }).select().single()
      if (c) await supabase.from('deal_contacts').insert({ deal_id: deal.id, contact_id: c.id, account_id: account.id, role: f.status || 'prodávající' })
    }
    if (f.note.trim()) await supabase.from('activities').insert({ account_id: account.id, deal_id: deal.id, type: 'comment', body: f.note.trim(), author_id: session?.user.id })
    nav(`/obchody/${deal.id}`, { replace: true })
  }

  const inp = 'h-12 px-3.5 rounded-[14px] border border-line bg-white outline-none text-[15px] w-full focus:border-navy'
  const sel = (k: keyof F, label: string) => (
    <L label={label}>
      <select value={f[k]} onChange={set(k)} className={inp}><option value="">—</option>{opts(k).map((o) => <option key={o} value={o}>{o}</option>)}</select>
    </L>
  )
  return (
    <div className="px-4 md:px-9 pt-11 md:pt-8 max-w-2xl flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <button onClick={() => nav(-1)} aria-label="Zpět" className="w-11 h-11 rounded-[14px] border border-line bg-white inline-flex items-center justify-center"><Icon name="chevL" /></button>
        <h1 className="m-0 text-2xl font-extrabold tracking-tight">Nový obchod</h1>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Card className="p-4 md:p-6 flex flex-col gap-3">
          <h2 className="m-0 text-base font-extrabold">Klient</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <L label="Jméno"><input autoFocus value={f.first_name} onChange={set('first_name')} className={inp} /></L>
            <L label="Příjmení"><input value={f.last_name} onChange={set('last_name')} className={inp} /></L>
          </div>
          <L label="Oslovení (pane Nováku)"><input value={f.salutation} onChange={set('salutation')} placeholder="pane Nováku / paní Nováková" className={inp} /></L>
          <div className="grid grid-cols-2 gap-2.5">
            <L label="Telefon"><input type="tel" value={f.phone} onChange={set('phone')} className={inp} /></L>
            <L label="E-mail"><input type="email" value={f.email} onChange={set('email')} className={inp} /></L>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <L label="Typ kontaktu"><select value={f.status} onChange={set('status')} className={inp}>{CONTACT_STATUSES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}</select></L>
            {sel('source', 'Zdroj získání kontaktu')}
          </div>
        </Card>

        <Card className="p-4 md:p-6 flex flex-col gap-3">
          <h2 className="m-0 text-base font-extrabold">Nemovitost</h2>
          <L label="Adresa nemovitosti"><input value={f.address} onChange={set('address')} placeholder="Americká 625/21, 120 00 Praha 2" className={inp} /></L>
          <div className="grid grid-cols-2 gap-2.5">
            {sel('category', 'Kategorie')}
            {sel('transaction_type', 'Prodej / Pronájem')}
          </div>
          <L label="Inzerovaná cena (Kč)"><input inputMode="numeric" value={spaced(f.listing_price)} onChange={(e) => { const lp = e.target.value.replace(/[^\d]/g, ''); const pc = Number(f.commission_pct.replace(',', '.')); setF({ ...f, listing_price: lp, ...(pc > 0 && lp ? { expected_commission: String(Math.round((Number(lp) * pc) / 100)) } : {}) }) }} placeholder="8750000" className={inp} /></L>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <L label="Předpokládaná provize (Kč)"><input inputMode="numeric" value={spaced(f.expected_commission)} onChange={(e) => setF({ ...f, expected_commission: e.target.value.replace(/[^\d]/g, ''), commission_pct: '' })} placeholder="400000" className={inp} /></L>
            <L label="Provize (%)"><input inputMode="decimal" value={f.commission_pct} onChange={(e) => { const v = e.target.value.replace(/[^\d.,]/g, ''); const pc = Number(v.replace(',', '.')); setF({ ...f, commission_pct: v, ...(pc > 0 && f.listing_price ? { expected_commission: String(Math.round((Number(f.listing_price) * pc) / 100)) } : {}) }) }} placeholder="4" className={inp} /></L>
          </div>
        </Card>

        <Card className="p-4 md:p-6 flex flex-col gap-3">
          <h2 className="m-0 text-base font-extrabold">Obchod</h2>
          <L label="Název obchodu"><input value={f.title} onChange={set('title')} placeholder={autoTitle || 'např. Novák | RD Valtice'} className={inp} /></L>
          <L label="Fáze">
            <select value={f.stage_id} onChange={set('stage_id')} className={inp}>
              {stages.filter((s) => !s.hidden).map((s) => <option key={s.id} value={s.id}>{s.block} · {s.name}</option>)}
            </select>
          </L>
          <L label="Poznámka (volitelně)"><textarea value={f.note} onChange={set('note')} rows={3} className="p-3.5 rounded-[14px] border border-line outline-none text-[15px]" /></L>
        </Card>
        <Btn type="submit" disabled={busy} className="h-14 text-base">{busy ? 'Ukládám…' : 'Založit obchod'}</Btn>
      </form>
    </div>
  )
}
