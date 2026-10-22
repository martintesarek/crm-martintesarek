import { useEffect, useId, useRef, useState } from 'react'

export type ValuoResult = { avg: number | null; min: number | null; max: number | null; perM2: number | null; at?: string; index?: { p: string; v: number }[]; yoy?: number | null; type?: 'byt' | 'dum' | 'pozemek' }

export const kcz = (n: number | null | undefined) => (n ? Math.round(n).toLocaleString('cs-CZ').replace(/ /g, ' ') + ' Kč' : '—')
export const mil = (n: number | null | undefined) => (n ? (n / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) + ' mil. Kč' : '—')
export const dcz = (s?: string) => (s ? new Date(s).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '')

const DUR = 2.4
const G = '#00D37F', G_DARK = '#0A7A4B', G_SOFT = '#EAF8F1', G_BAND = '#BFF0DA', INK = '#0E2A22', MUTED = '#5C7169'

/** Graf vývoje ceny: průměr (zelená čára) a pásmo minimální až nejvyšší možné ceny (poměr podle dnešního rozpětí). */
export function ValuoChart({ r }: { r: ValuoResult }) {
  const uid = useId().replace(/:/g, '')
  const ref = useRef<SVGSVGElement>(null)
  const [go, setGo] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setGo(true); return }
    const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { setGo(true); io.disconnect() } }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const idx = r.index || []
  if (idx.length < 3 || !r.avg) return null
  const series = [...idx.map((p) => ({ p: p.p, v: p.v })), { p: r.at || idx[idx.length - 1].p, v: r.avg }]
  const hi = r.max && r.avg ? r.max / r.avg : 1
  const W = 640, H = 240, L = 8, R = 62, T = 14, B = 26
  const mn = Math.min(...series.map((s) => s.v)) * 0.95, mx = Math.max(...series.map((s) => s.v * hi)) * 1.03
  const n = series.length
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - mn) / (mx - mn)) * (H - T - B)
  const up = series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.v * hi).toFixed(1)}`).join(' ')
  const dn = series.slice().reverse().map((s, k) => `L${x(n - 1 - k).toFixed(1)},${y(s.v).toFixed(1)}`).join(' ')
  const line = series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.v).toFixed(1)}`).join(' ')
  const years: { i: number; y: string }[] = []
  series.forEach((s, i) => { const yr = s.p.slice(0, 4); if (!years.length || years[years.length - 1].y !== yr) years.push({ i, y: yr }) })
  const e = n - 1
  const m = (v: number) => (v / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Vývoj ceny od roku ${series[0].p.slice(0, 4)}: průměrná cena ${mil(r.avg)}, nejvyšší možná cena ${mil(r.max)}`} style={{ display: 'block' }}>
      <style>{`@keyframes vr${uid}{from{width:0}to{width:${W}px}}@keyframes vp${uid}{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:scale(1)}}.vc${uid}{width:0;animation:vr${uid} ${DUR}s linear forwards;animation-play-state:${go ? 'running' : 'paused'}}.vq${uid}{opacity:0;transform-box:fill-box;transform-origin:center;animation:vp${uid} .45s ease-out forwards;animation-play-state:${go ? 'running' : 'paused'}}@media (prefers-reduced-motion:reduce){.vc${uid}{animation:none;width:${W}px}.vq${uid}{animation:none;opacity:1}}`}</style>
      <clipPath id={`cl${uid}`}><rect className={`vc${uid}`} x="0" y="0" height={H} /></clipPath>
      {[0.25, 0.5, 0.75].map((t) => <line key={t} x1={L} x2={W - R} y1={T + t * (H - T - B)} y2={T + t * (H - T - B)} stroke="#E3E8E6" />)}
      <g clipPath={`url(#cl${uid})`}>
      <path d={`${up} ${dn} Z`} fill={G_BAND} opacity=".85" />
      <path d={line} fill="none" stroke={G} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />
      </g>
      {years.map((yr, k) => <text key={yr.y} x={Math.min(Math.max(x(yr.i) + (k === 0 ? 10 : 0), 16), W - R)} y={H - 7} textAnchor="middle" fontSize="11" fill="#7E948B">{yr.y}</text>)}
      {years.filter((yr) => yr.i < e - 1).map((yr) => { const v = series[yr.i].v; const cx = x(yr.i); return (
        <g key={'pt' + yr.y} className={`vq${uid}`} style={{ animationDelay: `${(DUR * (cx - L) / (W - L - R)).toFixed(2)}s` }}><circle cx={cx} cy={y(v)} r="3.8" fill="#fff" stroke={G} strokeWidth="2.2" />
          <text x={Math.max(cx, 14)} y={y(v) + 16} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={G_DARK}>{m(v)}</text></g>) })}
      <g className={`vq${uid}`} style={{ animationDelay: `${DUR - 0.1}s` }}>
      <circle cx={x(e)} cy={y(r.avg * hi)} r="4.5" fill={G_DARK} stroke="#fff" strokeWidth="2" /><text x={x(e) + 9} y={y(r.avg * hi) - 3} fontSize="12" fill={INK}>{m(r.max || r.avg * hi)}</text>
      <circle cx={x(e)} cy={y(r.avg)} r="5" fill={G} stroke="#fff" strokeWidth="2" /><text x={x(e) + 9} y={y(r.avg) + 4} fontSize="12" fontWeight="700" fill={INK}>{m(r.avg)}</text>
      </g>
          </svg>
  )
}

/** Celá karta odhadu v barvách Valuo – stejná v CRM i v klientském portálu. */
const OF: Record<string, string> = { byt: 'vašeho bytu', dum: 'vašeho domu', pozemek: 'vašeho pozemku' }
export function typeFromText(c?: string | null): 'byt' | 'dum' | 'pozemek' | undefined {
  const t = (c || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/byt/.test(t)) return 'byt'
  if (/pozem/.test(t)) return 'pozemek'
  if (/dum|dom|vila|chata|chalup|rodinn/.test(t)) return 'dum'
  return undefined
}

export function ValuoCardView({ r, kind, title = 'Odhad tržní ceny podle cenové mapy Valuo.cz' }: { r: ValuoResult; kind?: string | null; title?: string }) {
  const of = OF[r.type || typeFromText(kind) || ''] || 'vaší nemovitosti'
  const tile = 'rounded-2xl px-3.5 py-3 flex flex-col gap-0.5'
  return (
    <div className="flex flex-col gap-3.5" style={{ color: INK }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <img src="/valuo-logo.png" alt="Valuo" width="94" height="30" className="h-[30px] w-auto" />
        {r.at && <span className="ml-auto text-[13px]" style={{ color: MUTED }}>Aktualizováno {dcz(r.at)}</span>}
      </div>
      <h3 className="m-0 text-lg md:text-xl font-extrabold leading-snug">{title.split('Valuo.cz').flatMap((t, i, a) => i < a.length - 1 ? [t, <a key={i} href="https://www.valuo.cz" target="_blank" rel="noopener noreferrer" className="underline decoration-[#00D37F] underline-offset-2">Valuo<span className="-ml-[0.14em] -mr-[0.1em]">.</span>cz</a>] : [t])}</h3>
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <div className={tile} style={{ background: G, color: '#06281B' }}><span className="text-xs font-bold">Průměrná cena</span><b className="text-[22px] tracking-tight leading-tight">{mil(r.avg)}</b>{r.perM2 ? <span className="text-[11.5px]">{kcz(r.perM2)} / m²</span> : null}</div>
        <div className={tile} style={{ background: G_SOFT }}><span className="text-xs font-bold" style={{ color: G_DARK }}>Nejvyšší možná cena</span><b className="text-lg tracking-tight">{mil(r.max)}</b></div>
      </div>
      {r.yoy != null && (
        <div className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ border: '1px solid #CDEFE0' }}>
          <span className="w-[30px] h-[30px] rounded-full inline-flex items-center justify-center shrink-0" style={{ background: G }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06281B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8M14 7h7v7" /></svg>
          </span>
          <span className="text-sm">Nárůst za poslední rok</span>
          <b className="ml-auto text-xl" style={{ color: r.yoy >= 0 ? G_DARK : '#9A3A14' }}>{r.yoy > 0 ? '+ ' : r.yoy < 0 ? '− ' : ''}{String(Math.abs(r.yoy)).replace('.', ',')} %</b>
        </div>
      )}
      {r.index && r.index.length > 2 && (
        <div className="flex flex-col gap-1.5">
          <b className="text-sm">Vývoj ceny {of} od roku {r.index[0].p.slice(0, 4)}</b>
          <ValuoChart r={r} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: MUTED }}>
            <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-[3px] rounded" style={{ background: G }} />Průměrná cena</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm" style={{ background: G_BAND }} />Pásmo od průměrné po nejvyšší možnou cenu</span>
          </div>
        </div>
      )}
      <p className="m-0 text-xs" style={{ color: MUTED }}>Orientační odhad podle cenové mapy Valuo.cz. Aktuální hodnoty jsou přesně z Valuo, horní hranice v minulých letech je dopočtená podle dnešního poměru.</p>
    </div>
  )
}

/** Zelený řádek s údaji z Valuo v kartě Ceny u obchodu. */
export function ValuoPriceRow({ r }: { r: ValuoResult }) {
  if (!r.avg) return null
  return (
    <div className="col-span-2 md:col-span-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-3.5 py-3" style={{ background: G_SOFT, border: `1.5px solid ${G}`, color: INK }}>
      <img src="/valuo-logo.png" alt="Valuo" width="63" height="20" className="h-5 w-auto" />
      <span className="flex flex-col"><span className="text-xs font-bold" style={{ color: G_DARK }}>Průměrná cena</span><b className="text-[17px] tracking-tight">{kcz(r.avg)}</b></span>
      {r.max ? <span className="flex flex-col"><span className="text-xs font-bold" style={{ color: G_DARK }}>Nejvyšší možná cena</span><b className="text-[17px] tracking-tight">{kcz(r.max)}</b></span> : null}
      {r.perM2 ? <span className="flex flex-col"><span className="text-xs font-bold" style={{ color: G_DARK }}>Cena za m²</span><b className="text-[17px] tracking-tight">{kcz(r.perM2)}</b></span> : null}
      {r.yoy != null ? <span className="flex flex-col"><span className="text-xs font-bold" style={{ color: G_DARK }}>Za poslední rok</span><b className="text-[17px] tracking-tight">{r.yoy > 0 ? '+ ' : r.yoy < 0 ? '− ' : ''}{String(Math.abs(r.yoy)).replace('.', ',')} %</b></span> : null}
      {r.at ? <span className="ml-auto text-xs" style={{ color: MUTED }}>Odhad Valuo · {dcz(r.at)}</span> : null}
    </div>
  )
}

type Req = { k: string; l: string }
const REQ: Record<string, Req[]> = {
  byt: [{ k: 'usable_area', l: 'Užitná plocha bytu' }, { k: 'condition', l: 'Stav bytu' }, { k: 'layout', l: 'Dispozice' }, { k: 'ownership', l: 'Vlastnictví (osobní / družstevní)' }, { k: 'floor', l: 'Podlaží bytu' }, { k: 'floors_total', l: 'Pater domu celkem' }, { k: 'construction', l: 'Konstrukce budovy' }],
  dum: [{ k: 'usable_area', l: 'Užitná plocha domu' }, { k: 'condition', l: 'Stav objektu' }, { k: 'subtype', l: 'Druh domu' }, { k: 'construction', l: 'Konstrukce budovy' }, { k: 'floors', l: 'Počet nadzemních pater' }, { k: 'built_area', l: 'Zastavěná plocha' }],
  pozemek: [{ k: 'plot_area', l: 'Celková plocha pozemku' }, { k: 'subtype', l: 'Druh pozemku' }],
}
/** Co ještě chybí ve formuláři, než se smí poslat ocenění do Valuo (prázdná data se neposílají). */
export function valuoMissing(type: string | undefined, v: Record<string, unknown>): { k: string; l: string }[] {
  if (!type || !REQ[type]) return [{ k: '', l: 'Typ nemovitosti (byt / dům / pozemek)' }]
  const empty = (x: unknown) => x === undefined || x === null || x === '' || (Array.isArray(x) && !x.length)
  const out: { k: string; l: string }[] = []
  if (empty(v.city)) out.push({ k: 'city', l: 'Obec' })
  if (type !== 'pozemek') { if (empty(v.street)) out.push({ k: 'street', l: 'Ulice' }); if (empty(v.cp)) out.push({ k: 'cp', l: 'Číslo popisné' }) }
  else if (empty(v.street) && empty(v.cp) && empty(v.cadastre)) out.push({ k: 'cadastre', l: 'Katastrální území' })
  for (const r of REQ[type]) if (empty(v[r.k])) out.push(r)
  return out
}
