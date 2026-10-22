import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icon'
import { Spinner, Toggle } from '../components/ui'
import { FORMS, TYPES, missing, progress, suggestTitle, typeFromCategory, type IField, type IType, type IValues } from '../lib/intake'

type DealRow = { id: string; title: string; category: string | null; address: string | null; listing_price: number | null; intake: { type?: IType; values?: IValues } | null }

const INPUT = 'w-full h-12 px-3.5 rounded-[14px] border border-line bg-white text-[15px] font-semibold text-ink min-w-0'
const LABEL = 'flex flex-col gap-1.5 text-xs font-bold text-muted'

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={`h-11 px-4 rounded-full text-[13.5px] font-bold ${on ? 'bg-navy text-white' : 'bg-white text-navy border border-line'}`}>{children}</button>
}

// Pole definuji na úrovni modulu (jinak by při psaní ztrácela fokus)
function Field({ f, v, set }: { f: IField; v: IValues; set: (k: string, val: IValues[string]) => void }) {
  const val = v[f.k]
  switch (f.t) {
    case 'text':
      return (
        <label className={LABEL}>{f.l}
          <input className={INPUT} value={String(val ?? '')} placeholder={f.ph} onChange={(e) => set(f.k, e.target.value)} />
          {f.hint && <span className="text-[11.5px] font-medium">{f.hint}</span>}
        </label>
      )
    case 'num':
      return (
        <label className={LABEL}>{f.l}
          <div className="relative">
            <input className={`${INPUT} ${f.unit ? 'pr-16' : ''} ${f.big ? '!h-[60px] !text-2xl !font-extrabold !border-[1.5px] !border-gold !bg-[#FFF9EC] !rounded-2xl' : ''}`} inputMode="decimal" value={String(val ?? '')}
              onChange={(e) => set(f.k, e.target.value.replace(/[^\d.,\s]/g, ''))} />
            {f.unit && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted">{f.unit}</span>}
          </div>
        </label>
      )
    case 'date':
      return <label className={LABEL}>{f.l}<input type="date" className={INPUT} value={String(val ?? '')} onChange={(e) => set(f.k, e.target.value)} /></label>
    case 'sel':
      return (
        <label className={LABEL}>{f.l}
          <select className={INPUT} value={String(val ?? '')} onChange={(e) => set(f.k, e.target.value)}>
            <option value="">—</option>{f.o.map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
      )
    case 'seg':
      return (
        <div className="flex flex-col gap-2"><div className="text-xs font-bold text-muted">{f.l}</div>
          <div className="flex bg-[#EEF0F7] rounded-[14px] p-1 gap-1">
            {f.o.map((o) => <button key={o} type="button" aria-pressed={val === o} onClick={() => set(f.k, val === o ? undefined : o)}
              className={`flex-1 h-11 rounded-[11px] text-[13px] ${val === o ? 'bg-navy text-white font-extrabold' : 'text-muted font-bold'}`}>{o}</button>)}
          </div>
        </div>
      )
    case 'chips': {
      const arr = Array.isArray(val) ? val : []
      return (
        <div className="flex flex-col gap-2"><div className="text-xs font-bold text-muted">{f.l}{f.multi && <span className="font-medium"> · více možností</span>}</div>
          <div className="flex flex-wrap gap-2">
            {f.o.map((o) => f.multi
              ? <Chip key={o} on={arr.includes(o)} onClick={() => set(f.k, arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])}>{o}</Chip>
              : <Chip key={o} on={val === o} onClick={() => set(f.k, val === o ? undefined : o)}>{o}</Chip>)}
          </div>
        </div>
      )
    }
    case 'tog':
      return <div className="flex items-center gap-3 min-h-[44px]"><span className="flex-1 text-sm font-semibold">{f.l}</span><Toggle on={!!val} onChange={(x) => set(f.k, x)} label={f.l} /></div>
    case 'step': {
      const n = Number(val ?? 0)
      return (
        <div className="flex items-center gap-3 min-h-[48px]"><span className="flex-1 text-sm font-semibold">{f.l}</span>
          <button type="button" aria-label="Méně" onClick={() => set(f.k, Math.max(0, n - 1))} className="w-11 h-11 rounded-xl border border-line bg-white text-xl font-bold text-navy">−</button>
          <b className="w-6 text-center text-[17px]">{n}</b>
          <button type="button" aria-label="Více" onClick={() => set(f.k, n + 1)} className="w-11 h-11 rounded-xl border border-line bg-white text-xl font-bold text-navy">+</button>
        </div>
      )
    }
  }
}

function Fields({ list, v, set }: { list: IField[]; v: IValues; set: (k: string, val: IValues[string]) => void }) {
  const out: React.ReactNode[] = []
  for (let i = 0; i < list.length; i++) {
    const f = list[i]
    if ('half' in f && f.half && list[i + 1] && 'half' in list[i + 1] && (list[i + 1] as { half?: boolean }).half) {
      out.push(<div key={f.k} className="grid grid-cols-2 gap-2.5"><Field f={f} v={v} set={set} /><Field f={list[i + 1]} v={v} set={set} /></div>); i++
    } else out.push(<Field key={f.k} f={f} v={v} set={set} />)
  }
  return <>{out}</>
}

export function Intake() {
  const { id } = useParams()
  const nav = useNavigate()
  const [deal, setDeal] = useState<DealRow | null>(null)
  const [type, setType] = useState<IType | null>(null)
  const [v, setV] = useState<IValues>({})
  const [step, setStep] = useState(0)
  const [saved, setSaved] = useState(true)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef<{ type: IType | null; v: IValues }>({ type: null, v: {} })

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('deals').select('id,title,category,address,listing_price,intake').eq('id', id).single()
      const d = data as DealRow | null
      setDeal(d)
      const t = d?.intake?.type || typeFromCategory(d?.category)
      setType(t || null); setV(d?.intake?.values || {})
      latest.current = { type: t || null, v: d?.intake?.values || {} }
    })()
  }, [id])

  const flush = useCallback(async () => {
    const { type: t, v: vals } = latest.current
    if (!deal || !t) return
    const patch: Record<string, unknown> = { intake: { type: t, values: vals } }
    const price = Number(String(vals.price ?? '').replace(/\s/g, '').replace(',', '.'))
    if (price > 0 && price !== deal.listing_price) patch.listing_price = price
    if (!deal.address && vals.city) patch.address = [[vals.street, vals.cp].filter(Boolean).join(' '), vals.city].filter(Boolean).join(', ')
    if (!deal.category) patch.category = TYPES.find((x) => x.key === t)?.label
    const { error } = await supabase.from('deals').update(patch).eq('id', deal.id)
    if (error) alert('Uložení se nepovedlo: ' + error.message)
    else { setSaved(true); setDeal((d) => (d ? { ...d, listing_price: (patch.listing_price as number) ?? d.listing_price, address: (patch.address as string) ?? d.address, category: (patch.category as string) ?? d.category } : d)) }
  }, [deal])

  const queue = () => { setSaved(false); window.clearTimeout(timer.current); timer.current = window.setTimeout(flush, 700) }
  useEffect(() => () => { window.clearTimeout(timer.current) }, [])
  const set = (k: string, val: IValues[string]) => { const nv = { ...latest.current.v, [k]: val }; latest.current.v = nv; setV(nv); queue() }
  const pick = (t: IType) => { setType(t); latest.current.type = t; setStep(0); queue() }
  const goto = async (n: number) => { window.clearTimeout(timer.current); await flush(); setStep(n); window.scrollTo({ top: 0 }) }

  if (!deal) return <Spinner />

  // 1) výběr typu
  if (!type) {
    return (
      <div className="px-4 md:px-9 pt-11 md:pt-7 pb-8 max-w-[640px] flex flex-col gap-5">
        <div className="flex items-center gap-2.5"><Link to={`/obchody/${deal.id}`} aria-label="Zpět" className="w-11 h-11 rounded-[14px] border border-line bg-white inline-flex items-center justify-center text-ink"><Icon name="chevL" /></Link></div>
        <div><h1 className="m-0 text-[26px] font-extrabold tracking-tight">Náběr nemovitosti</h1><p className="m-0 mt-1 text-sm text-muted">{deal.title}</p></div>
        <div className="text-sm font-bold text-muted">Co se nabízí?</div>
        <div className="grid gap-3">
          {TYPES.map((t) => (
            <button key={t.key} onClick={() => pick(t.key)} className="flex items-center gap-4 min-h-[84px] px-5 rounded-[22px] bg-white border border-line text-left">
              <span className="w-12 h-12 rounded-2xl bg-navy text-white inline-flex items-center justify-center"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg></span>
              <b className="text-xl font-extrabold">{t.label}</b>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const steps = FORMS[type]
  const typeLabel = TYPES.find((x) => x.key === type)!.label
  const summary = step >= steps.length
  const prog = progress(type, v)
  const miss = missing(type, v)
  const total = steps.length + 1
  const title = String(v.title || '') || suggestTitle(type, v)

  return (
    <div className="max-w-[640px] pb-36 md:pb-8">
      <div className="px-5 pt-12 pb-5 bg-navy text-white flex flex-col gap-4 md:rounded-b-[22px]">
        <div className="flex items-center gap-3">
          <button aria-label="Zpět" onClick={() => (step > 0 ? goto(step - 1) : (flush(), nav(`/obchody/${deal.id}`)))} className="w-11 h-11 rounded-[14px] bg-white/15 inline-flex items-center justify-center"><Icon name="chevL" /></button>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold opacity-75 truncate">Náběr · {typeLabel} · Prodej</div>
            <div className="text-xl font-extrabold tracking-tight">{summary ? 'Souhrn a export' : steps[step].title}</div>
          </div>
          <span className="text-[13px] font-extrabold text-gold">{step + 1} / {total}</span>
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0,1fr))` }}>
          {Array.from({ length: total }).map((_, i) => <button key={i} aria-label={`Krok ${i + 1}`} onClick={() => goto(i)} className="h-2 rounded-full" style={{ background: i === step ? '#CB992E' : i < step ? '#fff' : 'rgba(255,255,255,.25)' }} />)}
        </div>
        {summary && <div className="flex flex-col gap-1"><div className="text-[22px] font-extrabold leading-tight tracking-tight">{title}</div>{v.price ? <div className="text-sm font-bold text-gold">{String(v.price)} Kč</div> : null}</div>}
      </div>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {!summary && steps[step].s.map((sec) => (
          <section key={sec.title} className="bg-white border border-line rounded-[22px] p-[18px] flex flex-col gap-4">
            <h2 className="m-0 text-[15px] font-extrabold text-navy">{sec.title}</h2>
            <Fields list={sec.f.map((f) => (f.k === 'title' && f.t === 'text' ? { ...f, ph: suggestTitle(type, v) } : f))} v={v} set={set} />
          </section>
        ))}

        {summary && (
          <>
            <section className="bg-white border border-line rounded-[22px] p-[18px] flex flex-col gap-3">
              <div className="text-base font-extrabold">{miss.length ? `Chybí ${miss.length} ${miss.length === 1 ? 'povinný údaj' : miss.length < 5 ? 'povinné údaje' : 'povinných údajů'} pro inzerci` : 'Hotovo – vše potřebné pro inzerci je vyplněno'}</div>
              {steps.map((st, i) => (
                <button key={st.title} onClick={() => goto(i)} className="flex items-center gap-3 min-h-[52px] border-t border-line-soft text-left">
                  <span className={`w-[26px] h-[26px] rounded-full inline-flex items-center justify-center text-white text-sm font-extrabold ${prog[i].done >= prog[i].total ? 'bg-[#2E9E6B]' : 'bg-gold'}`}>{prog[i].done >= prog[i].total ? <Icon name="check" size={14} /> : '!'}</span>
                  <span className="flex-1 text-sm font-bold">{st.title}</span>
                  <span className="text-xs font-semibold text-muted">{prog[i].done} / {prog[i].total}</span>
                </button>
              ))}
            </section>
            {miss.length > 0 && (
              <section className="bg-[#FFF9EC] border border-[#F0DFB5] rounded-[22px] p-[18px] flex flex-col gap-2">
                <div className="text-sm font-extrabold text-[#7A5A12]">Ještě doplnit</div>
                {miss.map((m) => {
                  const si = steps.findIndex((st) => st.s.some((s) => s.f.some((f) => f.k === m.k)))
                  return <button key={m.k} onClick={() => goto(Math.max(0, si))} className="min-h-12 px-3.5 rounded-[14px] border border-[#F0DFB5] bg-white flex items-center gap-2.5 text-left text-[13.5px] font-bold"><span className="flex-1">{m.l}</span><Icon name="chevD" size={16} className="-rotate-90 text-[#A97B1A]" /></button>
                })}
              </section>
            )}
            <section className="bg-white border border-line rounded-[22px] p-[18px] flex flex-col gap-2">
              <div className="text-sm font-extrabold text-navy">Export inzerátu</div>
              <p className="m-0 text-[13px] text-muted leading-relaxed">Údaje jsou uložené tak, aby šly poslat na Sreality, Reality iDNES a Bazoš. Samotný export připravujeme – platnost inzerátu se bude vždy nastavovat na 360 dnů.</p>
            </section>
          </>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 z-50 md:static md:z-auto md:mt-4 bg-white border-t border-line px-4 pt-3 pb-6 md:max-w-[640px] flex flex-col gap-2">
        <div className={`flex items-center justify-center gap-1.5 text-xs font-semibold ${saved ? 'text-[#2E9E6B]' : 'text-muted'}`}>{saved ? <><Icon name="check" size={14} />Průběžně uloženo k obchodu</> : 'Ukládám…'}</div>
        <div className="flex gap-2.5">
          {step > 0 && <button onClick={() => goto(step - 1)} className="flex-1 h-[54px] rounded-2xl border border-line bg-white text-navy text-[15px] font-extrabold">Zpět</button>}
          {!summary
            ? <button onClick={() => goto(step + 1)} className="flex-[2] h-[54px] rounded-2xl bg-navy text-white text-[15px] font-extrabold">{step === steps.length - 1 ? 'Souhrn →' : 'Pokračovat →'}</button>
            : <button onClick={async () => { await flush(); nav(`/obchody/${deal.id}`) }} className="flex-[2] h-[54px] rounded-2xl bg-navy text-white text-[15px] font-extrabold">Uložit náběr k obchodu</button>}
        </div>
      </div>
    </div>
  )
}
