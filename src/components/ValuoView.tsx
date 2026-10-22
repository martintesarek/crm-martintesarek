export type ValuoResult = { avg: number | null; min: number | null; max: number | null; perM2: number | null; at?: string; index?: { p: string; v: number }[]; yoy?: number | null }

export const kcz = (n: number | null | undefined) => (n ? Math.round(n).toLocaleString('cs-CZ').replace(/ /g, ' ') + ' Kč' : '—')
export const mil = (n: number | null | undefined) => (n ? (n / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) + ' mil. Kč' : '—')
export const dcz = (s?: string) => (s ? new Date(s).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '')

/** Graf vývoje hodnoty nemovitosti (čtvrtletní řada z Valuo). Čistě SVG, bez knihoven. */
export function ValuoChart({ index, now }: { index: { p: string; v: number }[]; now?: number | null }) {
  if (!index || index.length < 3) return null
  const W = 640, H = 220, L = 8, R = 8, T = 18, B = 26
  const vals = index.map((x) => x.v).concat(now ? [now] : [])
  const lo = Math.min(...vals) * 0.94, hi = Math.max(...vals) * 1.04
  const x = (i: number) => L + (i / (index.length - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const line = index.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(index.length - 1).toFixed(1)},${H - B} L${x(0).toFixed(1)},${H - B} Z`
  const last = index[index.length - 1]
  const years: { i: number; y: string }[] = []
  index.forEach((p, i) => { const yr = p.p.slice(0, 4); if (!years.length || years[years.length - 1].y !== yr) years.push({ i, y: yr }) })
  const grid = [0, 0.5, 1].map((t) => lo + (hi - lo) * t)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Vývoj hodnoty nemovitosti od ${index[0].p.slice(0, 4)} do ${last.p.slice(0, 4)}, poslední hodnota ${kcz(last.v)}`} style={{ display: 'block' }}>
      {grid.map((g, i) => <g key={i}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="#E3E6F0" strokeWidth="1" /><text x={W - R} y={y(g) - 4} textAnchor="end" fontSize="11" fill="#8A90B0">{(g / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil.</text></g>)}
      <path d={area} fill="#253371" opacity=".08" />
      <path d={line} fill="none" stroke="#253371" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {years.map((yr) => <text key={yr.y} x={Math.min(Math.max(x(yr.i), 14), W - 14)} y={H - 6} textAnchor="middle" fontSize="11" fill="#8A90B0">{yr.y}</text>)}
      <circle cx={x(index.length - 1)} cy={y(last.v)} r="6" fill="#CB992E" stroke="#fff" strokeWidth="2.5" />
    </svg>
  )
}
