import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ValuoCardView, type ValuoResult } from '../components/ValuoView'
import { ICONS, PORTAL_STEPS } from '../lib/portalSteps'

type PortalData = {
  title: string
  category: string | null
  address: string | null
  cover_url: string | null
  step: number
  finished: boolean
  eta: string | null
  note: string | null
  links: { label: string; url: string }[]
  stats: { views?: number; inquiries?: number; showings?: number }
  client: string | null
  broker: { broker_name?: string; broker_title?: string; broker_phone?: string; broker_email?: string; website?: string }
  estimate: { low: number | null; high: number | null; date: string | null } | null
  valuo: ValuoResult | null
  listing: number | null
  offer: { amount: number; date: string | null } | null
  selling_since: string | null
  selling_until: string | null
  events: { at: string; title: string; note: string | null }[]
}

const kc = (v: number) => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(v) + ' Kč'
const num = (v: number) => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Math.round(v))
const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '')
const dayWord = (n: number) => n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní'

function Svg({ path, size = 24, color = 'currentColor', w = 1.8 }: { path: string; size?: number; color?: string; w?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
}

export function Portal() {
  const { token } = useParams()
  const [data, setData] = useState<PortalData | null | undefined>(undefined)
  const [sel, setSel] = useState<number | null>(null)
  const [svOk, setSvOk] = useState(true)

  useEffect(() => {
    document.title = 'Přehled prodeje · Martin Tesárek'
    supabase.rpc('portal_get', { p_token: token || '' }).then(({ data, error }) => setData(error ? null : (data as PortalData | null)))
  }, [token])

  if (data === undefined) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-[3px] border-line border-t-navy rounded-full animate-spin" /></div>
  if (data === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm bg-white border border-line rounded-3xl p-7 flex flex-col gap-3">
          <img src="/logo.webp" alt="Martin Tesárek – profesionální realitní makléř" className="w-56" />
          <h1 className="m-0 text-xl font-extrabold">Odkaz už neplatí</h1>
          <p className="m-0 text-sm text-muted">Tento přehled prodeje není dostupný. Ozvěte se prosím svému makléři, pošle vám nový odkaz.</p>
          <a href="tel:+420776252777" className="h-11 rounded-[14px] bg-navy text-white font-bold inline-flex items-center justify-center no-underline">Zavolat 776 252 777</a>
        </div>
      </div>
    )
  }

  const b = data.broker || {}
  const phone = (b.broker_phone || '+420 776 252 777').replace(/\s/g, '')
  const cur = data.finished ? PORTAL_STEPS.length : Math.min(Math.max(data.step, 1), PORTAL_STEPS.length) - 1
  const curStep = PORTAL_STEPS[Math.min(cur, PORTAL_STEPS.length - 1)]
  const open = sel ?? Math.min(cur, PORTAL_STEPS.length - 1)
  const openStep = PORTAL_STEPS[open]
  // Orientační data dalších kroků: od dneška podle toho, kde v prodeji právě jsme
  const stepDates: string[] = []
  let dd = Date.now()
  PORTAL_STEPS.forEach((st, i) => {
    if (i > cur && !data.finished) { dd += st.gap * 86400000; stepDates[i] = new Date(dd).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }) } else stepDates[i] = ''
  })
  const partyDate = data.finished ? '' : stepDates[PORTAL_STEPS.length - 1]
  const nextStep = !data.finished ? PORTAL_STEPS[cur + 1] : undefined
  const prevStep = cur > 0 ? PORTAL_STEPS[Math.min(cur, PORTAL_STEPS.length) - 1] : undefined
  const sellDays = data.selling_since ? Math.max(0, Math.floor(((data.selling_until ? +new Date(data.selling_until) : Date.now()) - +new Date(data.selling_since)) / 86400000)) : null
  const showStats = !!(data.stats?.views || data.stats?.inquiries || data.stats?.showings || data.offer)
  const sub = [data.category, data.address].filter(Boolean).join(' · ')
  const upcoming = data.events.filter((e) => new Date(e.at).getTime() > Date.now()).sort((a, c) => +new Date(a.at) - +new Date(c.at))[0]

  // Cenová osa: odhad (rozsah), inzerovaná cena, nejvyšší nabídka
  const vo = data.valuo?.avg ? data.valuo : null
  const pts = [data.estimate?.low, data.estimate?.high, vo?.avg, vo?.max, data.listing, data.offer?.amount].filter((x): x is number => typeof x === 'number' && x > 0)
  const lo = pts.length ? Math.min(...pts) * 0.97 : 0
  const hi = pts.length ? Math.max(...pts) * 1.03 : 1
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  const tiles = [data.estimate, vo, data.listing, data.offer].filter((x) => x != null).length

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="bg-white border-b border-line">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-3.5 md:py-4 flex flex-wrap items-center gap-3 md:gap-4">
          <img src="/logo.webp" alt="Martin Tesárek – profesionální realitní makléř" className="w-[190px] md:w-[230px] mr-auto" />
          {data.client && <span className="hidden md:inline text-sm text-muted">Přehled prodeje pro <b className="text-ink">{data.client}</b></span>}
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 md:px-6 pt-5 md:pt-7 pb-14 flex flex-col gap-4 md:gap-5">
        {data.finished && <h1 className="m-0 text-[24px] md:text-[30px] font-extrabold tracking-tight leading-tight">Hotovo. Vaše nemovitost je prodaná 🎉</h1>}

        <section aria-label="Nemovitost a ceny" className="bg-white border border-line rounded-[24px] overflow-hidden flex flex-col md:flex-row">
          {(data.cover_url || (svOk && token)) && <img src={data.cover_url || `https://aowceqpaawxeugalapgx.supabase.co/functions/v1/portal-streetview?t=${encodeURIComponent(token || '')}`} alt={data.title} onError={() => { if (!data.cover_url) setSvOk(false) }} className="w-full md:w-[42%] h-[220px] md:h-auto md:min-h-[300px] md:max-h-[440px] object-cover" />}
          <div className="flex-1 p-5 md:p-7 flex flex-col gap-4 md:gap-5">
            <div className="flex flex-col gap-0.5">
              {sub && <span className="text-[12px] font-extrabold tracking-[.08em] uppercase text-muted">{sub}</span>}
              <h1 className="m-0 text-[26px] md:text-[32px] font-extrabold tracking-tight leading-tight">{data.title}</h1>
              {sellDays != null && !data.finished && <span className="mt-2 self-start inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-gold-soft text-gold-ink text-[13px] font-bold"><span className="w-2 h-2 rounded-full bg-gold" />V prodeji {sellDays} {dayWord(sellDays)}</span>}
            </div>
            {tiles > 0 && (
              <div className={`grid gap-2.5 ${tiles >= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {data.estimate && (
                  <div className="flex flex-col gap-1 p-3.5 rounded-2xl border border-line">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-muted"><span className="w-2.5 h-2.5 rounded-[3px] bg-[#C3C7DA]" />Tržní odhad podle Martina Tesárka</span>
                    <b className="text-lg tracking-tight">
                      {data.estimate.low && data.estimate.high ? `${num(data.estimate.low)} – ${num(data.estimate.high)} Kč` : kc((data.estimate.low || data.estimate.high)!)}
                    </b>
                    {data.estimate.date && <span className="text-[11px] text-muted">{d(data.estimate.date)}</span>}
                  </div>
                )}
                {vo && (
                  <div className="flex flex-col gap-1 p-3.5 rounded-2xl" style={{ background: '#EAF8F1' }}>
                    <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: '#0A7A4B' }}><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: '#00D37F' }} />Tržní odhad podle Valuo.cz</span>
                    <b className="text-lg tracking-tight" style={{ color: '#0E2A22' }}>{vo.max && vo.avg ? `${num(vo.avg)} – ${num(vo.max)} Kč` : kc(vo.avg!)}</b>
                    {vo.at && <span className="text-[11px]" style={{ color: '#5C7169' }}>{d(vo.at)}</span>}
                  </div>
                )}
                {data.listing != null && (
                  <div className="flex flex-col gap-1 p-3.5 rounded-2xl bg-navy text-white">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-[#D3D7EE]"><span className="w-2.5 h-2.5 rounded-full bg-white" />Inzerovaná cena</span>
                    <b className="text-lg tracking-tight">{kc(data.listing)}</b>
                  </div>
                )}
                {data.offer && (
                  <div className="flex flex-col gap-1 p-3.5 rounded-2xl bg-gold-soft">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-gold-ink"><span className="w-2.5 h-2.5 rounded-full bg-gold" />Nejvyšší nabídka</span>
                    <b className="text-lg tracking-tight">{kc(data.offer.amount)}</b>
                    {data.offer.date && <span className="text-[11px] text-gold-ink">{d(data.offer.date)}</span>}
                  </div>
                )}
              </div>
            )}
            {pts.length >= 2 && (
              <div aria-hidden="true" className="relative h-[34px] mx-1">
                <span className="absolute left-0 right-0 top-2.5 h-1.5 rounded bg-line-soft" />
                {vo?.avg && vo?.max && <span className="absolute top-2.5 h-1.5 rounded" style={{ background: '#8FE3BC', left: pos(vo.avg), width: `calc(${pos(vo.max)} - ${pos(vo.avg)})` }} />}
                {data.estimate?.low && data.estimate?.high && (
                  <span className="absolute top-2.5 h-1.5 rounded bg-[#C3C7DA]" style={{ left: pos(data.estimate.low), width: `calc(${pos(data.estimate.high)} - ${pos(data.estimate.low)})` }} />
                )}
                {data.offer && <span className="absolute top-1.5 w-3.5 h-3.5 -ml-[7px] rounded-full bg-gold border-2 border-white" style={{ left: pos(data.offer.amount) }} />}
                {data.listing != null && <span className="absolute top-1.5 w-3.5 h-3.5 -ml-[7px] rounded-full bg-navy border-2 border-white" style={{ left: pos(data.listing) }} />}
                <span className="absolute left-0 bottom-0 text-[10px] text-muted">{num(lo)} Kč</span>
                <span className="absolute right-0 bottom-0 text-[10px] text-muted">{num(hi)} Kč</span>
              </div>
            )}
          </div>
        </section>

        {data.valuo && data.valuo.avg ? (
          <section aria-label="Odhad tržní ceny" className="bg-white border border-line rounded-[24px] p-4 md:p-7">
            <ValuoCardView r={data.valuo} kind={data.category} />
          </section>
        ) : null}

        {showStats && (
          <section aria-labelledby="h-vys" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 id="h-vys" className="m-0 mr-auto text-xl md:text-[22px] font-extrabold">Výsledky inzerce</h2>
              {data.selling_since && <span className="text-[13px] text-muted">od {d(data.selling_since)}</span>}
            </div>
            <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
              {data.stats?.views ? <div className="bg-white border border-line rounded-[22px] p-4 md:p-5 flex flex-col gap-1.5"><span className="text-[11px] font-extrabold tracking-[.08em] uppercase text-muted">Zobrazení inzerátu</span><b className="text-[30px] md:text-[36px] tracking-tight leading-none">{data.stats.views.toLocaleString('cs-CZ')}</b></div> : null}
              {data.stats?.inquiries ? <div className="bg-white border border-line rounded-[22px] p-4 md:p-5 flex flex-col gap-1.5"><span className="text-[11px] font-extrabold tracking-[.08em] uppercase text-muted">Dotazy zájemců</span><b className="text-[30px] md:text-[36px] tracking-tight leading-none">{data.stats.inquiries}</b></div> : null}
              {data.stats?.showings || upcoming ? <div className="bg-white border border-line rounded-[22px] p-4 md:p-5 flex flex-col gap-1.5"><span className="text-[11px] font-extrabold tracking-[.08em] uppercase text-muted">Prohlídky</span><b className="text-[30px] md:text-[36px] tracking-tight leading-none">{data.stats?.showings || 0}</b>{upcoming && <span className="text-[12px] text-muted">další: <b className="text-ink">{new Date(upcoming.at).toLocaleString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</b></span>}</div> : null}
              {data.offer ? <div className="rounded-[22px] p-4 md:p-5 flex flex-col gap-1.5 bg-gold-soft border border-[#F0E2BC]"><span className="text-[11px] font-extrabold tracking-[.08em] uppercase text-gold-ink">Nejvyšší nabídka</span><b className="text-[22px] md:text-[26px] tracking-tight leading-tight">{kc(data.offer.amount)}</b>{data.listing ? <span className="text-[12px] text-gold-ink">{data.offer.amount < data.listing ? `o ${num(data.listing - data.offer.amount)} Kč pod inzerovanou cenou` : data.offer.amount > data.listing ? `o ${num(data.offer.amount - data.listing)} Kč nad inzerovanou cenou` : 'na úrovni inzerované ceny'}</span> : null}</div> : null}
            </div>
          </section>
        )}

        {!data.finished && (
          <section aria-labelledby="h-ted" className="bg-white border border-line rounded-[24px] p-4 md:p-7 flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id="h-ted" className="m-0 mr-auto text-xl md:text-[22px] font-extrabold">Kde v prodeji jsme</h2>
              <span className="text-[13px] text-muted">Krok {cur + 1} z {PORTAL_STEPS.length}</span>
              {partyDate && <span className="text-[13px] font-extrabold text-gold-ink">Oslava a předání orientačně {partyDate}</span>}
            </div>
            <div aria-hidden="true" className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${PORTAL_STEPS.length}, minmax(0, 1fr))` }}>
              {PORTAL_STEPS.map((_, i) => <span key={i} className="h-[7px] rounded" style={{ background: i < cur ? '#282F69' : i === cur ? '#CB992E' : '#E6E8F0' }} />)}
            </div>
            <div className="grid gap-3 md:gap-4 md:grid-cols-[1fr_1.5fr_1fr]">
              {prevStep && <div className="hidden md:flex flex-col gap-1.5 rounded-[20px] bg-bg p-4 opacity-85"><span className="text-[11px] font-extrabold tracking-[.08em] uppercase text-muted">Hotovo · krok {cur}</span><b className="text-base">{prevStep.name}</b></div>}
              <div className="flex flex-col gap-2.5 rounded-[20px] p-4 md:p-5 bg-white" style={{ border: '2px solid #CB992E', boxShadow: '0 0 0 6px #CB992E22' }}>
                <span className="text-[11px] font-extrabold tracking-[.08em] uppercase text-[#A97B1A]">Teď probíhá · krok {cur + 1}</span>
                <b className="text-lg">{curStep.name}</b>
                {curStep.me && <span className="text-sm text-[#3A4066] leading-relaxed"><b>Co dělám já:</b> {curStep.me}</span>}
                {curStep.you && <span className="text-sm text-[#3A4066] leading-relaxed"><b>Co děláte vy:</b> {curStep.you}</span>}
                {(upcoming || data.note) && <span className="mt-1 flex items-center gap-2 px-3 py-2 rounded-[12px] bg-gold-soft text-sm"><Svg path="M3 5h18v16H3zM3 10h18M8 3v4M16 3v4" size={18} color="#8A6512" w={2} />{upcoming ? <span>{upcoming.title} <b>{new Date(upcoming.at).toLocaleString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</b></span> : <span>{data.note}</span>}</span>}
              </div>
              {nextStep && <div className="flex flex-col gap-1.5 rounded-[20px] bg-bg p-4"><span className="text-[11px] font-extrabold tracking-[.08em] uppercase text-muted">Další · krok {cur + 2}{stepDates[cur + 1] ? ` · orientačně ${stepDates[cur + 1]}` : ''}</span><b className="text-base">{nextStep.name}</b>{nextStep.me && <span className="text-[13px] text-[#4A5078] leading-snug">{nextStep.me}</span>}</div>}
            </div>
          </section>
        )}

        <section aria-labelledby="h-cesta" className="bg-white border border-line rounded-[24px] p-4 md:p-7 flex flex-col gap-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="h-cesta" className="m-0 mr-auto text-xl md:text-[22px] font-extrabold">Časová osa prodeje nemovitosti</h2>
            {partyDate && <span className="text-[13px] font-extrabold text-gold-ink px-3.5 py-2 rounded-full bg-gold-soft">Oslava a předání orientačně {partyDate}</span>}
            <span className="basis-full text-[13px] text-muted">Data dalších kroků se počítají od dneška podle toho, kde v prodeji právě jsme. Klikněte na krok a uvidíte, co se v něm děje.</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-y-6 md:gap-y-7">
            {PORTAL_STEPS.map((s, i) => {
              const done = i < cur, now = i === cur, isOpen = i === open, party = s.icon === 'party'
              const nxt = PORTAL_STEPS[i + 1]
              const rowEnd = i % 7 === 6
              const ic = party ? '#FFFFFF' : done ? '#E9C877' : now ? '#CB992E' : isOpen ? '#282F69' : '#A2A7C2'
              return (
                <div key={i} className="relative flex flex-col items-center gap-2 md:gap-2.5 px-1 md:px-1.5 text-center">
                  <span className={`hidden md:block h-[22px] text-[11px] font-extrabold tracking-[.06em] text-navy uppercase ${s.group ? '' : 'invisible'}`}>{s.group || '.'}</span>
                  {nxt && !rowEnd && (
                    <span aria-hidden="true" className="hidden md:block absolute top-[66px] left-[calc(50%+46px)] right-[calc(-50%+46px)] h-0.5" style={{ background: done ? '#282F69' : '#C3C7DA' }}>
                    </span>
                  )}
                  <button type="button" onClick={() => setSel(i)} aria-pressed={isOpen} aria-label={`Krok ${i + 1}: ${s.name}`}
                    className="relative w-16 h-16 md:w-[84px] md:h-[84px] rounded-full flex items-center justify-center p-0 cursor-pointer"
                    style={party || done
                      ? { background: '#282F69', border: 0, outline: isOpen ? '3px solid #CB992E66' : undefined, outlineOffset: 3 }
                      : now
                        ? { background: '#fff', border: '3px solid #CB992E', boxShadow: '0 0 0 6px #CB992E33' }
                        : { background: '#fff', border: `2px solid ${isOpen ? '#282F69' : '#D6D9E6'}`, outline: isOpen ? '3px solid #CB992E66' : undefined, outlineOffset: 3 }}>
                    <span className="md:hidden"><Svg path={ICONS[s.icon]} size={26} color={ic} w={1.6} /></span>
                    <span className="hidden md:inline"><Svg path={ICONS[s.icon]} size={34} color={ic} w={1.6} /></span>
                    {done && (
                      <span className="absolute right-0 bottom-0 w-[22px] h-[22px] rounded-full bg-[#2F7A4E] border-2 border-white flex items-center justify-center">
                        <Svg path="M5 12l5 5 9-10" size={11} color="#fff" w={4} />
                      </span>
                    )}
                  </button>
                  <span className={`text-xs md:text-[13px] leading-snug max-w-[150px] ${now ? 'font-extrabold text-ink' : done ? 'font-semibold text-[#3A4066]' : party ? 'font-extrabold text-navy' : 'font-medium text-muted'}`}>{s.name}</span>
                  {now && !data.finished ? <span className="text-xs font-extrabold text-[#A97B1A]">právě teď</span> : stepDates[i] ? <span className="text-xs font-extrabold text-[#A97B1A]">{stepDates[i]}</span> : null}
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-3 md:gap-4 items-start p-4 md:px-5 rounded-[18px] bg-bg">
            <span className="shrink-0 px-2.5 py-1.5 rounded-[10px] bg-navy text-white text-[13px] font-extrabold">Krok {open + 1}</span>
            <span className="flex-[1_1_260px] flex flex-col gap-1.5">
              <b className="text-base">{openStep.name}</b>
              <span className="text-sm text-[#3A4066] leading-relaxed"><b>Co dělám já:</b> {openStep.me}</span>
              {openStep.you && <span className="text-sm text-[#3A4066] leading-relaxed"><b>Co děláte vy:</b> {openStep.you}</span>}
            </span>
          </div>
          <p className="m-0 text-xs text-muted">Uvedené termíny jsou orientační a mohou se lišit v závislosti na konkrétních okolnostech a dalších faktorech procesu prodeje.</p>
        </section>

        <div className="grid gap-4 md:gap-5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
          {data.events.length > 0 && (
            <section aria-labelledby="h-proh" className="bg-white border border-line rounded-[24px] px-5 md:px-6 py-5 flex flex-col">
              <h2 id="h-proh" className="m-0 mb-2 text-[17px] font-extrabold">Prohlídky a události</h2>
              {data.events.map((e, i) => {
                const future = new Date(e.at).getTime() > Date.now()
                const dt = new Date(e.at)
                return (
                  <div key={i} className="flex gap-3.5 py-3 border-t border-line-soft">
                    <span className={`w-14 shrink-0 text-center py-1.5 rounded-xl text-xs font-extrabold leading-tight ${future ? 'bg-gold-soft text-gold-ink' : 'bg-chip text-ink'}`}>
                      {dt.toLocaleDateString('cs-CZ', { weekday: 'short' })}<br />{dt.getDate()}. {dt.getMonth() + 1}.
                    </span>
                    <span className="flex flex-col gap-0.5 text-sm">
                      <b>{e.title}{dt.getHours() || dt.getMinutes() ? ' · ' + dt.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : ''}</b>
                      {e.note && <span className="text-[13px] text-muted">{e.note}</span>}
                    </span>
                  </div>
                )
              })}
            </section>
          )}
          {data.links.length > 0 && (
            <section aria-labelledby="h-inz" className="bg-white border border-line rounded-[24px] px-5 md:px-6 py-5 flex flex-col gap-2">
              <h2 id="h-inz" className="m-0 mb-1.5 text-[17px] font-extrabold">Kde je nemovitost inzerovaná</h2>
              {data.links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex items-center min-h-[46px] px-3.5 rounded-[14px] bg-bg text-sm font-bold no-underline text-ink">
                  <span className="mr-auto">{l.label}</span><Svg path="M7 17L17 7M9 7h8v8" size={16} color="#282F69" w={2.2} />
                </a>
              ))}
            </section>
          )}
          <section className="bg-navy text-white rounded-[24px] px-5 md:px-6 py-5 flex flex-col gap-3.5">
            <div className="flex items-center gap-3">
              <img src="/martin.jpg" alt="Martin Tesárek" onError={(e) => { const i = e.currentTarget; if (!i.dataset.fb) { i.dataset.fb = '1'; i.src = '/icons/icon-192.png'; i.className = 'w-14 h-14 rounded-full object-cover' } }} className="w-16 h-16 rounded-full object-cover border-2 border-white/80" />
              <span className="flex flex-col"><b className="text-[17px]">{b.broker_name || 'Martin Tesárek'}</b><span className="text-[13px] text-[#D3D7EE]">{b.broker_title || 'váš realitní makléř'}</span></span>
            </div>
            <span className="text-sm text-[#D3D7EE] leading-relaxed">Máte otázku k prodeji? Zavolejte nebo napište, ozvu se ještě ten den.</span>
            <div className="mt-auto grid grid-cols-2 gap-2">
              <a href={`tel:${phone}`} className="h-12 rounded-[14px] bg-gold text-ink text-[15px] font-extrabold no-underline flex items-center justify-center">Zavolat</a>
              <a href={`mailto:${b.broker_email || 'reality@martintesarek.cz'}?subject=${encodeURIComponent(data.title)}`} className="h-12 rounded-[14px] bg-white/10 text-white text-[15px] font-bold no-underline flex items-center justify-center">Napsat</a>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
