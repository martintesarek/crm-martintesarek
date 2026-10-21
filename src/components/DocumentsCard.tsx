import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Contact, Deal } from '../lib/types'
import { dateTime } from '../lib/format'
import { Card, Sheet, Btn } from './ui'
import { Icon } from './Icon'
import { KINDS, FIRMS, defaultInput, missingOf, personFrom, type DocInput, type DocKind, type DocRow, type Person } from '../lib/documents'

const inp = 'h-11 px-3 rounded-xl border border-line bg-white outline-none text-[15px] w-full'
const lab = 'flex flex-col gap-1 text-xs font-bold text-muted'

export function DocumentsCard({ deal, reload }: { deal: Deal; reload: () => void }) {
  const [docs, setDocs] = useState<DocRow[]>([])
  const [kind, setKind] = useState<DocKind | null>(null)
  const [agent, setAgent] = useState<Person | undefined>()
  const load = useCallback(async () => {
    const { data } = await supabase.from('documents').select('*').eq('deal_id', deal.id).order('created_at', { ascending: false })
    setDocs((data as DocRow[]) || [])
  }, [deal.id])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    supabase.from('accounts').select('settings').eq('id', deal.account_id).single().then(({ data }) => {
      const s = (data?.settings || {}) as { doc_agent?: Person }
      if (s.doc_agent) setAgent(s.doc_agent)
    })
  }, [deal.account_id])

  async function download(d: DocRow) {
    if (!d.storage_path) return
    const { data } = await supabase.storage.from('files').createSignedUrl(d.storage_path, 3600, { download: d.file_name })
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <Card className="p-4 md:p-6 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-navy-soft text-navy inline-flex items-center justify-center shrink-0"><Icon name="doc" size={18} /></span>
        <div className="flex flex-col mr-auto min-w-0">
          <h2 className="m-0 text-base font-extrabold">Dokumenty</h2>
          <span className="text-xs text-muted">Smlouvy a protokoly z údajů obchodu, v hlavičkovém papíru, uložené na Disk</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {KINDS.map((k) => (
          <button key={k.kind} onClick={() => setKind(k.kind)} className="flex flex-col items-start gap-0.5 p-3 rounded-2xl border border-line bg-white text-left hover:border-navy">
            <b className="text-sm">{k.title}</b>
            <span className="text-[11px] text-muted leading-snug">{k.desc}</span>
          </button>
        ))}
      </div>
      {docs.length > 0 && (
        <div className="flex flex-col pt-2 border-t border-line-soft">
          <span className="text-xs font-bold text-muted pb-1">Vytvořené dokumenty</span>
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-2.5 py-2 border-t border-line-soft text-sm">
              <Icon name="doc" size={16} className="text-muted shrink-0" />
              <span className="flex flex-col min-w-0 mr-auto">
                <span className="truncate font-semibold">{d.file_name.replace(/\.docx$/, '')}</span>
                <span className="text-xs text-muted">{dateTime(d.created_at)}{d.drive_folder_name ? ` · Disk: ${d.drive_folder_name}` : ''}{d.missing?.length ? ` · k doplnění: ${d.missing.length}` : ''}</span>
              </span>
              {d.drive_url && <a href={d.drive_url} target="_blank" rel="noreferrer" className="h-9 px-3 rounded-xl bg-navy text-white text-xs font-bold inline-flex items-center no-underline shrink-0">Otevřít</a>}
              <button onClick={() => download(d)} className="h-9 px-3 rounded-xl border border-line text-xs font-bold shrink-0">Word</button>
            </div>
          ))}
        </div>
      )}
      {kind && <DocForm kind={kind} deal={deal} agent={agent} onClose={() => setKind(null)} onDone={() => { load(); reload() }} />}
    </Card>
  )
}

function PersonFields({ p, onChange, onRemove, withMarital = true }: { p: Person; onChange: (p: Person) => void; onRemove?: () => void; withMarital?: boolean }) {
  const f = (k: keyof Person, label: string, placeholder = '') => (
    <label className={lab}>{label}<input value={(p[k] as string) || ''} onChange={(e) => onChange({ ...p, [k]: e.target.value })} placeholder={placeholder} className={inp} /></label>
  )
  return (
    <div className="flex flex-col gap-2 p-3 rounded-2xl border border-line bg-bg">
      <div className="flex items-end gap-2">
        <div className="flex-1">{f('name', 'Jméno a příjmení')}</div>
        {onRemove && <button onClick={onRemove} aria-label="Odebrat" className="w-11 h-11 rounded-xl text-muted inline-flex items-center justify-center"><Icon name="x" size={18} /></button>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {f('rc', 'Rodné číslo', 'doplní se žlutě')}
        {withMarital ? f('marital', 'Rodinný stav', 'např. ženatý / vdaná') : <span />}
      </div>
      {f('address', 'Trvale bytem', 'ulice č., PSČ obec')}
      <div className="grid grid-cols-2 gap-2">{f('email', 'E-mail')}{f('phone', 'Telefon')}</div>
    </div>
  )
}

function ContactPicker({ accountId, onPick }: { accountId: string; onPick: (c: Contact) => void }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Contact[]>([])
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return }
    const t = setTimeout(async () => {
      const s = q.trim().replace(/[%,()]/g, ' ')
      const { data } = await supabase.from('contacts').select('*').eq('account_id', accountId).or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`).limit(6)
      setFound((data as Contact[]) || [])
    }, 250)
    return () => clearTimeout(t)
  }, [q, accountId])
  return (
    <div className="flex flex-col gap-1">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Přidat z kontaktů: jméno, telefon…" className={inp} />
      {found.map((c) => (
        <button key={c.id} onClick={() => { onPick(c); setQ(''); setFound([]) }} className="text-left px-3 py-2 rounded-xl bg-white border border-line text-sm">
          <b>{[c.first_name, c.last_name].filter(Boolean).join(' ')}</b>{c.city ? <span className="text-muted"> · {c.city}</span> : null}
        </button>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-2"><b className="text-xs text-navy uppercase tracking-wide">{title}</b>{children}</div>
}

function DocForm({ kind, deal, agent, onClose, onDone }: { kind: DocKind; deal: Deal; agent?: Person; onClose: () => void; onDone: () => void }) {
  const [i, setI] = useState<DocInput>(() => defaultInput(kind, deal, agent))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ doc: DocRow; driveError: string | null } | null>(null)
  const [saveContacts, setSaveContacts] = useState(true)
  const meta = KINDS.find((k) => k.kind === kind)!
  const set = (patch: Partial<DocInput>) => setI((x) => ({ ...x, ...patch }))
  const setPerson = (list: 'sellers' | 'buyers', idx: number, p: Person) => set({ [list]: i[list].map((x, k) => (k === idx ? p : x)) } as Partial<DocInput>)
  const missing = missingOf(i)
  const needsBuyers = kind === 'rs' || kind === 'pp'
  const firms = FIRMS.filter((f) => kind !== 'zs' || f.zsOk)

  async function generate() {
    setBusy(true); setErr('')
    try {
      const { data, error } = await supabase.functions.invoke('doc-generate', { body: { deal_id: deal.id, input: i } })
      if (error) { let msg = error.message; try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ } throw new Error(msg) }
      if (data?.error) throw new Error(data.error)
      // údaje osob zpět do kontaktů (RČ, rodinný stav, adresa, e-mail, telefon) + napojení zájemců na obchod
      if (saveContacts) {
        const all = [...i.sellers.map((p) => ({ p, role: 'prodávající' })), ...i.buyers.map((p) => ({ p, role: 'kupující' }))]
        for (const { p, role } of all) {
          if (!p.contact_id) continue
          const { data: c } = await supabase.from('contacts').select('custom, phone, email, street, city, zip').eq('id', p.contact_id).single()
          const cur = (c || {}) as { custom?: Record<string, unknown> | null; phone?: string | null; email?: string | null; street?: string | null; city?: string | null }
          const patch: Record<string, unknown> = { birth_number: p.rc || null, custom: { ...(cur.custom || {}), rodinny_stav: p.marital || null, adresa_dokumenty: p.address || null } }
          if (!cur.phone && p.phone) patch.phone = p.phone
          if (!cur.email && p.email) patch.email = p.email
          await supabase.from('contacts').update(patch).eq('id', p.contact_id)
          if (role === 'kupující' && !(deal.deal_contacts || []).some((d) => d.contacts?.id === p.contact_id)) await supabase.from('deal_contacts').upsert({ deal_id: deal.id, contact_id: p.contact_id, account_id: deal.account_id, role })
        }
      }
      if (kind === 'pm' && i.agent?.name) {
        const { data: a } = await supabase.from('accounts').select('settings').eq('id', deal.account_id).single()
        await supabase.from('accounts').update({ settings: { ...((a?.settings as object) || {}), doc_agent: i.agent } }).eq('id', deal.account_id)
      }
      setResult({ doc: data.document, driveError: data.drive_error })
      onDone()
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  const addPerson = (list: 'sellers' | 'buyers', c?: Contact) => set({ [list]: [...i[list], c ? personFrom(c) : { name: '' }] } as Partial<DocInput>)
  const removePerson = (list: 'sellers' | 'buyers', idx: number) => set({ [list]: i[list].filter((_, k) => k !== idx) } as Partial<DocInput>)
  const F = ({ k, label, placeholder }: { k: keyof DocInput; label: string; placeholder?: string }) => (
    <label className={lab}>{label}<input value={(i[k] as string) || ''} onChange={(e) => set({ [k]: e.target.value } as Partial<DocInput>)} placeholder={placeholder} className={inp} /></label>
  )

  if (result) {
    const d = result.doc
    return (
      <Sheet open onClose={onClose} title="Dokument je hotový" footer={<Btn onClick={onClose} className="w-full">Zavřít</Btn>}>
        <div className="flex flex-col gap-3">
          <p className="m-0 p-3 rounded-xl bg-[#E6F4EC] text-sm text-[#2F7A4E] font-semibold">{d.file_name.replace(/\.docx$/, '')}</p>
          {d.drive_url ? (
            <a href={d.drive_url} target="_blank" rel="noreferrer" className="h-12 rounded-2xl bg-navy text-white font-extrabold inline-flex items-center justify-center no-underline">Otevřít na Disku ({d.drive_folder_name})</a>
          ) : (
            <p className="m-0 p-3 rounded-xl bg-[#FDEEE6] text-sm text-[#9A3A14]">Na Disk se dokument neuložil: {result.driveError || 'neznámá chyba'}. Soubor Word je uložený v CRM, stáhnete ho tlačítkem níže.</p>
          )}
          {d.download_url && <a href={d.download_url} className="h-12 rounded-2xl border border-line font-bold inline-flex items-center justify-center no-underline text-ink">Stáhnout Word (.docx)</a>}
          {d.missing?.length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <b>Žlutě označeno k doplnění ({d.missing.length}):</b>
              <ul className="m-0 pl-5">{d.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
          {(kind === 'zs' || kind === 'rs') && <p className="m-0 text-xs text-muted">Před podpisem zkontrolujte označení nemovitosti podle LV, cenu a lhůty.</p>}
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet open onClose={onClose} title={meta.title} footer={
      <div className="flex flex-col gap-2">
        {err && <p className="m-0 p-3 rounded-xl bg-[#FDEEE6] text-sm text-[#9A3A14]">{err}</p>}
        <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={saveContacts} onChange={(e) => setSaveContacts(e.target.checked)} className="w-4 h-4 accent-navy" />Uložit údaje osob zpět do kontaktů</label>
        <Btn kind="gold" onClick={generate} disabled={busy} className="w-full h-12">{busy ? 'Vytvářím…' : `Vytvořit a uložit na Disk${missing.length ? ` · ${missing.length}× k doplnění` : ''}`}</Btn>
      </div>
    }>
      <div className="flex flex-col gap-5">
        <p className="m-0 text-sm text-muted">Údaje jsou předvyplněné z obchodu. Co chybí, zůstane v dokumentu žlutě označené k doplnění.</p>

        <Section title={kind === 'pm' ? 'Zmocnitel (prodávající)' : kind === 'pp' ? 'Strana předávající' : kind === 'zs' ? 'Klient (prodávající)' : 'Prodávající'}>
          {kind === 'pm' ? (
            <>
              {i.sellers.length > 1 && <select value={i.sellers.findIndex((s) => s.contact_id === i.principal?.contact_id && s.name === i.principal?.name)} onChange={(e) => set({ principal: i.sellers[Number(e.target.value)] })} className={inp}>{i.sellers.map((s, k) => <option key={k} value={k}>{s.name}</option>)}</select>}
              <PersonFields p={i.principal || { name: '' }} onChange={(p) => set({ principal: p })} withMarital={false} />
            </>
          ) : (
            <>
              {i.sellers.map((p, k) => <PersonFields key={k} p={p} onChange={(x) => setPerson('sellers', k, x)} onRemove={() => removePerson('sellers', k)} withMarital={kind !== 'pp'} />)}
              <ContactPicker accountId={deal.account_id} onPick={(c) => addPerson('sellers', c)} />
              <button onClick={() => addPerson('sellers')} className="self-start text-sm font-bold text-navy h-9">+ Ručně</button>
            </>
          )}
        </Section>

        {kind === 'pm' && (
          <Section title="Zmocněnec">
            <PersonFields p={i.agent || { name: '' }} onChange={(p) => set({ agent: p })} withMarital={false} />
            <span className="text-xs text-muted">Zmocněnec se zapamatuje pro příští plné moci.</span>
          </Section>
        )}

        {needsBuyers && (
          <Section title={kind === 'pp' ? 'Strana přebírající' : 'Zájemce (kupující)'}>
            {i.buyers.map((p, k) => <PersonFields key={k} p={p} onChange={(x) => setPerson('buyers', k, x)} onRemove={() => removePerson('buyers', k)} withMarital={kind !== 'pp'} />)}
            <ContactPicker accountId={deal.account_id} onPick={(c) => addPerson('buyers', c)} />
            <button onClick={() => addPerson('buyers')} className="self-start text-sm font-bold text-navy h-9">+ Ručně</button>
          </Section>
        )}

        <Section title="Nemovitost">
          <label className={lab}>Označení nemovitosti podle LV
            <textarea value={i.property} onChange={(e) => set({ property: e.target.value })} rows={6} className="px-3 py-2 rounded-xl border border-line bg-white outline-none text-sm w-full leading-relaxed" />
          </label>
          <span className="text-xs text-muted">**text** = tučně, [[DOPLNIT: co]] = žlutě k doplnění.</span>
          {F({ k: 'propertyLabel', label: 'Krátké označení do názvu souboru', placeholder: 'např. Zahradní 994, Valtice' })}
        </Section>

        {kind === 'zs' && (
          <Section title="Podmínky smlouvy">
            <F k="equipment" label="Nemovitost se bude prodávat…" placeholder="bez vybavení / včetně stávajícího vybavení, k němuž náleží zejména …" />
            <div className="grid grid-cols-2 gap-2">{F({ k: 'minPrice', label: 'Minimální kupní cena', placeholder: '5 990 000 Kč' })}{F({ k: 'commission', label: 'Provize (% z kupní ceny)', placeholder: '4 %' })}</div>
            {F({ k: 'duration', label: 'Doba trvání smlouvy', placeholder: 'šesti měsíců' })}
          </Section>
        )}
        {kind === 'rs' && (
          <Section title="Podmínky rezervace">
            <div className="grid grid-cols-2 gap-2">{F({ k: 'price', label: 'Kupní cena', placeholder: '5 990 000 Kč' })}{F({ k: 'fee', label: 'Rezervační poplatek', placeholder: '4 % + DPH' })}</div>
            <div className="grid grid-cols-2 gap-2">{F({ k: 'feeDays', label: 'Splatnost poplatku (dnů)', placeholder: '3' })}{F({ k: 'until', label: 'Rezervace do', placeholder: '30. 11. 2026' })}</div>
            {F({ k: 'sellerPenalty', label: 'Smluvní pokuta prodávajícího', placeholder: 'obvykle ve výši rezervačního poplatku' })}
            {F({ k: 'defects', label: 'Závady na nemovitostech', placeholder: 'žádné' })}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!i.mortgage} onChange={(e) => set({ mortgage: e.target.checked })} className="w-5 h-5 accent-navy" />Zájemce financuje část kupní ceny úvěrem</label>
          </Section>
        )}
        {kind === 'pm' && (
          <Section title="Účet zmocnitele pro kupní cenu">
            <div className="grid grid-cols-2 gap-2">{F({ k: 'bank', label: 'Banka', placeholder: 'Fio banka, a.s.' })}<F k="accountNo" label="Číslo účtu" placeholder="123456789/2010" /></div>
          </Section>
        )}

        <Section title={kind === 'pp' ? 'Místo a datum' : 'Zprostředkovatel, místo a datum'}>
          {kind !== 'pp' && (
            <label className={lab}>Smlouva za firmu
              <select value={i.firm} onChange={(e) => set({ firm: e.target.value as DocInput['firm'] })} className={inp}>{firms.map((f) => <option key={f.key} value={f.key}>{f.name} · {f.note}</option>)}</select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className={lab}>Místo podpisu
              <select value={i.place} onChange={(e) => set({ place: e.target.value })} className={inp}><option>Ve Valticích</option><option>V Praze</option></select>
            </label>
            {F({ k: 'date', label: 'Datum', placeholder: '20. 10. 2026' })}
          </div>
        </Section>

        {missing.length > 0 && (
          <div className="p-3 rounded-xl bg-[#FFF8D6] text-sm">
            <b>Zůstane žlutě k doplnění ({missing.length}):</b> {missing.join(', ')}
          </div>
        )}
      </div>
    </Sheet>
  )
}
