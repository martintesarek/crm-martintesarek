// Orientační ocenění nemovitosti přes Valuo (https://v2p.api.valuo.cz/market-value) z údajů náborového formuláře.
// Nic neukládá – jen vrací odhad. Potřebuje secret VALUO_API_KEY (vkládá Martin sám).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

async function rl(uid: string | undefined, bucket: string, max: number, seconds: number): Promise<boolean> {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await admin.rpc('rate_check', { p_uid: uid || 'anon', p_bucket: bucket, p_max: max, p_seconds: seconds })
    return error ? true : data !== false
  } catch { return true }
}

type V = Record<string, unknown>
const num = (x: unknown): number | null => {
  if (x === undefined || x === null || x === '') return null
  const n = Number(String(x).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const pos = (x: unknown): number | null => { const n = num(x); return n !== null && n > 0 ? n : null }

const RATING: Record<string, string> = {
  'Novostavba': 'new', 'Ve výstavbě': 'new', 'Projekt': 'new',
  'Po rekonstrukci': 'very_good', 'Velmi dobrý': 'very_good', 'Dobrý': 'good',
  'Před rekonstrukcí': 'nothing_much', 'V rekonstrukci': 'nothing_much',
  'Špatný': 'bad', 'K demolici': 'bad',
}
const CONSTR: Record<string, string> = { 'Cihlová': 'brick', 'Panelová': 'panel', 'Dřevěná': 'wood', 'Dřevostavba': 'wood', 'Kamenná': 'stone', 'Montovaná': 'montage', 'Smíšená': 'mixed' }
const LOCAL = ['1+kk', '1+1', '2+kk', '2+1', '3+kk', '3+1', '4+kk', '4+1']
const HOUSE_TYPE: Record<string, string> = { 'Rodinný dům': 'family_house', 'Vila': 'villa', 'Chalupa': 'cottage', 'Chata': 'hut' }
const LAND: Record<string, string> = { 'Bydlení': 'building', 'Komerční': 'building', 'Pole': 'field', 'Zahrada': 'garden', 'Sad / vinice': 'garden', 'Louka': 'meadow', 'Les': 'forest' }

function buildBody(type: string, v: V): { body?: Record<string, unknown>; error?: string } {
  const lat = num(v.lat), lng = num(v.lng)
  const hasCoords = lat !== null && lng !== null
  const address = [[v.street, v.cp].filter(Boolean).join(' '), [v.zip, v.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  if (!hasCoords && !address) return { error: 'Chybí adresa nebo poloha nemovitosti. Doplňte obec a ulici (nebo načtěte údaje z registru).' }
  const body: Record<string, unknown> = {
    place: hasCoords ? `${lat}, ${lng}` : address, kind: 'sale',
    property_type: type === 'byt' ? 'flat' : type === 'dum' ? 'house' : 'land',
    price_index: true, price_index_period: 'quarter',
  }
  if (hasCoords) { body.lat = lat; body.lon = lng }
  const rating = RATING[String(v.condition || '')] || 'good'
  const constr = CONSTR[String(v.construction || '')]
  const penb = /^[A-G]$/.test(String(v.penb_class || '')) ? String(v.penb_class) : null
  if (type === 'pozemek') {
    const a = pos(v.plot_area); if (!a) return { error: 'Doplňte celkovou plochu pozemku.' }
    body.lot_area = a; body.land_type = LAND[String(v.subtype || '')] || 'building'; body.ownership = 'private'
  } else if (type === 'dum') {
    const a = pos(v.usable_area); if (!a) return { error: 'Doplňte užitnou plochu domu.' }
    body.floor_area = a; body.ownership = 'private'; body.rating = rating
    const ht = HOUSE_TYPE[String(v.subtype || '')]; if (ht) body.house_type = ht
    if (constr) body.construction = constr
    const o: [string, number | null][] = [['built_up_area', pos(v.built_area)], ['garden_area', pos(v.garden_area)], ['rooms', pos(v.rooms)], ['bathrooms', pos(v.bathrooms)], ['total_floors', pos(v.floors)], ['garages', pos(v.garages)], ['parking_spaces', pos(v.parking)]]
    for (const [k, x] of o) if (x !== null) body[k] = x
    if (penb) body.energy_performance = penb
  } else {
    const a = pos(v.usable_area) ?? pos(v.floor_area); if (!a) return { error: 'Doplňte užitnou plochu bytu.' }
    body.floor_area = a; body.rating = rating
    body.ownership = v.ownership === 'Družstevní' ? 'cooperative' : 'private'
    const lay = String(v.layout || ''); body.local_type = LOCAL.includes(lay) ? lay : 'jine'
    const fl = num(v.floor); if (fl !== null) body.floor = fl
    if (constr) body.construction = constr
    const tf = pos(v.floors_total); if (tf !== null) body.total_floors = tf
    if (typeof v.elevator === 'boolean') body.elevator = v.elevator
    const o: [string, number | null][] = [['balcony_area', v.balcony ? pos(v.balcony_area) : null], ['loggia_area', v.loggia ? pos(v.loggia_area) : null], ['terrace_area', v.terrace ? pos(v.terrace_area) : null], ['cellar_area', v.cellar ? pos(v.cellar_area) : null]]
    for (const [k, x] of o) if (x !== null) body[k] = x
    if (penb) body.energy_performance = penb
  }
  return { body }
}

const hasPrice = (j: { result?: Record<string, unknown> } | null) => !!j?.result && [j.result.avg_price, j.result.min_price, j.result.max_price, j.result.avg_price_m2].some((x) => Number(x) > 0)
function extractIndex(result: Record<string, unknown>): { p: string; v: number }[] {
  const raw = [result.price_index, result.index, result.history].find((c) => Array.isArray(c)) as unknown[] | undefined
  if (!raw) return []
  const out: { p: string; v: number }[] = []
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const p = String(o.period ?? o.quarter ?? o.date ?? o.label ?? '')
    const v = Number(o.avg_price_m2 ?? o.avg_m2 ?? o.price_m2 ?? o.m2 ?? o.avg_price ?? o.avg ?? o.price)
    if (p && Number.isFinite(v) && v > 0) out.push({ p, v: Math.round(v) })
  }
  return out
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { type, values, deal_id } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(user.id, 'valuo-estimate', 30, 3600))) return json({ error: 'Příliš mnoho ocenění za hodinu, zkuste to prosím za chvíli.' }, 429)
    const { data: deal } = await sb.from('deals').select('id').eq('id', deal_id).single()
    if (!deal) return json({ error: 'Obchod nenalezen nebo k němu nemáte přístup.' }, 403)
    if (!['byt', 'dum', 'pozemek'].includes(String(type))) return json({ error: 'Neznámý typ nemovitosti.' }, 400)
    const key = (Deno.env.get('VALUO_API_KEY') || '').trim().replace(/^bearer\s+/i, '').replace(/^["']|["']$/g, '').trim()
    if (!key) return json({ error: 'Chybí klíč VALUO_API_KEY. Vložte ho prosím v Supabase → Edge Functions → Secrets.' }, 500)
    const { body, error } = buildBody(String(type), (values || {}) as V)
    if (error || !body) return json({ error }, 400)

    let last: { success?: boolean; errors?: unknown; result?: Record<string, unknown> } | null = null
    let lastErr = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await fetch('https://v2p.api.valuo.cz/market-value', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) })
        last = await r.json().catch(() => null)
        if (r.ok && last?.success && hasPrice(last)) break
        lastErr = `Valuo (${r.status}): ${JSON.stringify(last?.errors ?? last).slice(0, 300)}`
        if (r.status < 500) break
      } catch (e) { lastErr = 'Valuo je nedostupné: ' + (e as Error).message }
      if (attempt < 3) await wait(700 * attempt)
    }
    if (!last?.success || !hasPrice(last)) return json({ error: lastErr || 'Valuo pro tuto nemovitost nevrátilo odhad.' }, 502)
    const r = last.result!
    const n = (x: unknown) => (Number(x) > 0 ? Math.round(Number(x)) : null)
    const index = extractIndex(r)
    let yoy: number | null = null
    if (index.length >= 5) { const a = index[index.length - 1].v, b = index[index.length - 5].v; yoy = Math.round(((a - b) / b) * 1000) / 10 }
    return json({ avg: n(r.avg_price), min: n(r.min_price), max: n(r.max_price), perM2: n(r.avg_price_m2), at: new Date().toISOString(), index, yoy, keys: Object.keys(r), idxShape: JSON.stringify((r.price_index ?? r.index ?? r.history ?? null))?.slice(0, 200) })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
