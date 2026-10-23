// Export inzerátu na Sreality (import.sreality.cz, XML-RPC). Akce:
//  { action: 'ping' }                 – přihlásí se a vrátí makléře + inzeráty na účtu (nic nezapisuje)
//  { action: 'export', deal_id, dry } – z náborového formuláře sestaví inzerát, odešle ho a nahraje vybrané fotky (dry = jen kontrola)
// Secrets: SREALITY_CLIENT_ID, SREALITY_PASSWORD, SREALITY_SOFTWARE_KEY (vkládá Martin sám v Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { XMLParser } from 'npm:fast-xml-parser@4'
import { md5 } from 'npm:js-md5@0.8.3'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const ENDPOINT = 'https://import.sreality.cz/RPC2'

// ---------- XML-RPC ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
type RpcVal = string | number | boolean | Uint8Array | Date | RpcVal[] | { [k: string]: RpcVal }
function enc(v: RpcVal): string {
  if (typeof v === 'string') return `<value><string>${esc(v)}</string></value>`
  if (typeof v === 'boolean') return `<value><boolean>${v ? 1 : 0}</boolean></value>`
  if (typeof v === 'number') return Number.isInteger(v) ? `<value><int>${v}</int></value>` : `<value><double>${v}</double></value>`
  if (v instanceof Uint8Array) { let s = ''; for (let i = 0; i < v.length; i += 0x8000) s += String.fromCharCode(...v.subarray(i, i + 0x8000)); return `<value><base64>${btoa(s)}</base64></value>` }
  if (v instanceof Date) return `<value><dateTime.iso8601>${v.toISOString().slice(0, 10).replace(/-/g, '')}T00:00:00</dateTime.iso8601></value>`
  if (Array.isArray(v)) return `<value><array><data>${v.map(enc).join('')}</data></array></value>`
  return `<value><struct>${Object.entries(v).map(([k, x]) => `<member><name>${esc(k)}</name>${enc(x)}</member>`).join('')}</struct></value>`
}
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: false, isArray: (n) => n === 'member' || n === 'value' })
// deno-lint-ignore no-explicit-any
function dec(v: any): any {
  if (v == null) return null
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return dec(v[0])
  if ('int' in v || 'i4' in v) return parseInt(v.int ?? v.i4, 10)
  if ('double' in v) return parseFloat(v.double)
  if ('boolean' in v) return String(v.boolean).trim() === '1'
  if ('string' in v) return typeof v.string === 'string' ? v.string : ''
  if ('base64' in v) return v.base64
  if ('dateTime.iso8601' in v) return v['dateTime.iso8601']
  if ('array' in v) { const d = v.array?.data; const vals = d && typeof d === 'object' ? (d.value || []) : []; return vals.map(dec) }
  if ('struct' in v) { const o: Record<string, unknown> = {}; for (const m of (typeof v.struct === 'object' ? v.struct.member || [] : [])) o[String(m.name).trim()] = dec(m.value); return o }
  return ''
}
async function rpc(method: string, params: RpcVal[]) {
  const body = `<?xml version="1.0" encoding="UTF-8"?><methodCall><methodName>${method}</methodName><params>${params.map((p) => `<param>${enc(p)}</param>`).join('')}</params></methodCall>`
  const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=UTF-8' }, body })
  const txt = await r.text()
  if (!r.ok) throw new Error(`Sreality HTTP ${r.status}: ${txt.slice(0, 200)}`)
  const x = parser.parse(txt)
  const mr = x.methodResponse
  if (mr?.fault) { const f = dec(mr.fault.value); throw new Error('Sreality fault: ' + JSON.stringify(f)) }
  return dec(mr?.params?.param?.value) as { status: number; statusMessage: string; output: unknown }
}

class Session {
  sid = ''
  constructor(private clientId: number, private pw: string, private key: string) {}
  private bump() { this.sid = this.sid.slice(0, 48) + md5(this.sid + md5(this.pw) + this.key); return this.sid }
  async login() {
    const h = await rpc('getHash', [this.clientId])
    if (h.status !== 200) throw new Error(`getHash: ${h.status} ${h.statusMessage}`)
    const o = Array.isArray(h.output) ? (h.output[0] as { sessionId?: string }) : (h.output as { sessionId?: string })
    this.sid = String(o?.sessionId || '')
    if (!this.sid) throw new Error('Sreality nevrátilo sessionId.')
    const r = await rpc('login', [this.bump()])
    if (r.status !== 200) throw new Error(`Přihlášení se nezdařilo (${r.status}: ${r.statusMessage}). 405 = špatný klíč softwaru, 407 = špatné heslo nebo ID klienta.`)
    return r
  }
  call(method: string, params: RpcVal[]) { return rpc(method, [this.bump(), ...params]) }
  async logout() { try { await this.call('logout', []) } catch { /* nevadí */ } }
}

// ---------- číselníky (podle admin.sreality.cz/import-advert-attributes) ----------
const STAV: Record<string, number> = { 'Velmi dobrý': 1, 'Dobrý': 2, 'Špatný': 3, 'Ve výstavbě': 4, 'Projekt': 5, 'Novostavba': 6, 'K demolici': 7, 'Před rekonstrukcí': 8, 'Po rekonstrukci': 9, 'V rekonstrukci': 10 }
const KONSTR: Record<string, number> = { 'Dřevostavba': 1, 'Dřevěná': 1, 'Cihlová': 2, 'Kamenná': 3, 'Montovaná': 4, 'Panelová': 5, 'Skeletová': 6, 'Smíšená': 7, 'Modulární': 8 }
const LOKALITA: Record<string, number> = { 'Centrum obce': 1, 'Klidná část obce': 2, 'Rušná část obce': 3, 'Okraj obce': 4, 'Sídliště': 5, 'Polosamota': 6, 'Samota': 7 }
const PENB: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7 }
const VYHLASKA: Record<string, number> = { 'č. 148/2007 Sb.': 1, 'č. 78/2013 Sb.': 2, 'č. 264/2020 Sb.': 3, 'č. 222/2024 Sb.': 4 }
// Podkategorie (číselník stránka neuvádí): byty ověřené z praxe, domy a pozemky je nutné ověřit na testovacím účtu
const SUB_BYT: Record<string, number> = { '1+kk': 2, '1+1': 3, '2+kk': 4, '2+1': 5, '3+kk': 6, '3+1': 7, '4+kk': 8, '4+1': 9, '5+kk a větší': 10, '5+kk': 10, '5+1': 11, '6 a více': 12, 'Atypický': 16 }
const SUB_DUM: Record<string, number> = { 'Rodinný dům': 37, 'Vila': 39, 'Chata': 33, 'Chalupa': 43, 'Zemědělská usedlost': 44, 'Památka / jiné': 35, 'Na klíč': 40 }
const SUB_POZ: Record<string, number> = { 'Komerční': 18, 'Bydlení': 19, 'Pole': 20, 'Les': 21, 'Louka': 22, 'Zahrada': 23, 'Ostatní': 24, 'Rybník': 46, 'Sad / vinice': 48 }
const FLAT_CLASS: Record<string, number> = { 'Standardní': 4, 'Mezonet': 1, 'Loft': 2, 'Podkrovní': 3 }

// Povinné atributy pro Prodej (podle importní stránky) a jejich české názvy
const REQ_COMMON = ['description', 'advert_function', 'advert_type', 'advert_subtype', 'advert_lifetime', 'advert_price', 'advert_price_currency', 'advert_price_unit', 'locality_city', 'locality_inaccuracy_level']
const REQ: Record<string, string[]> = {
  byt: [...REQ_COMMON, 'building_type', 'building_condition', 'ownership', 'usable_area', 'floor_number', 'balcony', 'loggia', 'terrace', 'cellar', 'parking_lots', 'garage'],
  dum: [...REQ_COMMON, 'building_type', 'building_condition', 'object_type', 'usable_area', 'estate_area', 'advert_room_count', 'cellar', 'basin', 'parking_lots', 'garage'],
  pozemek: [...REQ_COMMON, 'estate_area'],
}
const LABEL: Record<string, string> = { description: 'Popis inzerátu', advert_subtype: 'Dispozice / druh', advert_price: 'Cena', locality_city: 'Obec', building_type: 'Konstrukce budovy', building_condition: 'Stav', ownership: 'Vlastnictví', usable_area: 'Užitná plocha', floor_number: 'Podlaží bytu', object_type: 'Podlažnost domu', estate_area: 'Plocha pozemku', advert_room_count: 'Počet pokojů' }

type V = Record<string, unknown>
const s = (x: unknown) => (x == null ? '' : String(x).trim())
const num = (x: unknown): number | undefined => { const t = s(x).replace(/\s/g, '').replace(',', '.'); if (!t) return undefined; const n = Number(t); return Number.isFinite(n) ? n : undefined }
const int = (x: unknown): number | undefined => { const n = num(x); return n == null ? undefined : Math.round(n) }
const arr = (x: unknown): string[] => (Array.isArray(x) ? (x as string[]) : [])

function buildAdvert(type: 'byt' | 'dum' | 'pozemek', v: V, dealId: string, sellerId?: number) {
  const a: Record<string, RpcVal> = {}
  const set = (k: string, val: RpcVal | undefined) => { if (val !== undefined && val !== '' && !(typeof val === 'number' && Number.isNaN(val))) a[k] = val }
  a.advert_rkid = `crm-${dealId}`
  a.advert_function = 1
  a.advert_type = type === 'byt' ? 1 : type === 'dum' ? 2 : 3
  a.advert_lifetime = 7 // 360 dní (rozhodnutí Martina)
  a.advert_price_currency = 1
  a.advert_price_unit = 1
  const incl = arr(v.price_incl)
  const priceHidden = !!v.price_hide
  set('advert_price', priceHidden ? 1 : num(v.price))
  if (incl.includes('S provizí RK')) a.advert_price_note = 4
  else if (incl.includes('Včetně poplatků')) a.advert_price_note = 2
  const noteParts: string[] = []
  if (incl.includes('Včetně právního servisu')) noteParts.push('včetně právního servisu')
  if (incl.includes('Včetně DPH')) noteParts.push('včetně DPH')
  if (s(v.price_note)) noteParts.push(s(v.price_note))
  if (noteParts.length) { const t = noteParts.join(', '); a.advert_price_text_note = t.charAt(0).toUpperCase() + t.slice(1) }
  if (incl.includes('Cena k jednání')) a.advert_price_negotiation = true
  set('description', s(v.description))
  set('mortgage', !!v.mortgage)
  set('exclusively_at_rk', !!v.exclusive)
  if (sellerId) a.seller_id = sellerId

  // adresa
  const mode = s(v.addr_mode) || 'Přesně'
  a.locality_inaccuracy_level = mode === 'Jen obec' ? 2 : mode === 'Jen ulice' ? 1 : 0
  set('locality_city', s(v.city))
  if (mode !== 'Jen obec') {
    set('locality_street', s(v.street))
    const cp = s(v.cp); const m = cp.match(/^(\d+)\s*\/\s*(\w+)$/)
    if (m) { set('locality_cp', m[1]); set('locality_co', m[2]) } else set('locality_cp', cp)
  }
  const lat = num(v.lat), lng = num(v.lng)
  if (lat && lng && !v.hide_map) { a.locality_latitude = lat; a.locality_longitude = lng }

  // společné
  set('object_age', int(v.year))
  set('energy_efficiency_rating', PENB[s(v.penb_class)])
  set('energy_performance_summary', num(v.penb_value))
  set('energy_performance_certificate', VYHLASKA[s(v.penb_decree)])
  const loc = LOKALITA[s(v.location)]; if (loc) set('object_location', loc)
  if (v.free_from) a.ready_date = new Date(s(v.free_from))

  if (type === 'byt') {
    set('advert_subtype', SUB_BYT[s(v.layout)] ?? (s(v.subtype) === 'Garsoniéra' ? 2 : undefined))
    set('flat_class', FLAT_CLASS[s(v.subtype)])
    set('building_type', KONSTR[s(v.construction)])
    set('building_condition', STAV[s(v.condition)] ?? STAV[s(v.building_condition)])
    set('ownership', s(v.ownership) === 'Družstevní' ? 2 : s(v.ownership) === 'Osobní' ? 1 : undefined)
    set('usable_area', int(v.usable_area))
    set('floor_number', int(v.floor))
    set('floors', int(v.floors_total))
    a.balcony = !!v.balcony; a.loggia = !!v.loggia; a.terrace = !!v.terrace; a.cellar = !!v.cellar; a.garage = !!v.garage
    const pk = s(v.parking_type); a.parking_lots = (!!pk && pk !== 'Bez parkování') || (int(v.parking) || 0) > 0
    set('balcony_area', v.balcony ? int(v.balcony_area) : undefined); set('loggia_area', v.loggia ? int(v.loggia_area) : undefined)
    set('terrace_area', v.terrace ? int(v.terrace_area) : undefined); set('cellar_area', v.cellar ? int(v.cellar_area) : undefined)
    if (v.elevator !== undefined) a.elevator = v.elevator ? 1 : 2
    if (v.barrier_free !== undefined) a.easy_access = v.barrier_free ? 1 : 2
    const fu = s(v.furnished); if (fu) a.furnished = fu === 'Ano' ? 1 : fu === 'Ne' ? 2 : 3
    const cost = [v.fund ? `Fond oprav ${s(v.fund)} Kč` : '', v.service_fee ? `služby ${s(v.service_fee)} Kč` : '', v.energy_fee ? `energie ${s(v.energy_fee)} Kč` : ''].filter(Boolean).join(', ')
    if (cost) a.cost_of_living = cost
  } else if (type === 'dum') {
    set('advert_subtype', SUB_DUM[s(v.subtype)] ?? 37)
    set('building_type', KONSTR[s(v.construction)])
    set('building_condition', STAV[s(v.condition)])
    set('object_type', s(v.floors_type) === 'Přízemní' ? 1 : s(v.floors_type) === 'Patrový' ? 2 : undefined)
    set('object_kind', ({ 'Řadový': 1, 'Rohový': 2, 'V bloku': 3, 'Samostatně stojící': 4 } as Record<string, number>)[s(v.placement)])
    set('usable_area', int(v.usable_area)); set('estate_area', int(v.plot_area)); set('garden_area', int(v.garden_area)); set('building_area', int(v.built_area))
    const lay = s(v.layout); const rc = parseInt(lay, 10)
    set('advert_room_count', lay === 'Atypický' ? 6 : Number.isFinite(rc) ? Math.min(rc, 5) : undefined)
    const eq = arr(v.equipment)
    a.cellar = eq.includes('Sklep') || !!int(v.cellar_area)
    a.basin = eq.includes('Bazén') || !!int(v.pool_area)
    a.garage = (int(v.garages) || 0) > 0 || eq.includes('Garáž')
    a.parking_lots = (int(v.parking) || 0) > 0 || eq.includes('Parkování')
    set('garage_count', int(v.garages)); set('floors', int(v.floors)); set('underground_floors', int(v.floors_under))
    set('terrace_area', int(v.terrace_area)); set('cellar_area', int(v.cellar_area)); set('basin_area', int(v.pool_area))
  } else {
    set('advert_subtype', SUB_POZ[s(v.subtype)] ?? 19)
    set('estate_area', int(v.plot_area))
  }
  return a
}

// ---------- fotky ----------
const b64url = (buf: ArrayBuffer | string) => {
  const bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : new Uint8Array(buf)
  let t = ''; for (const b of bytes) t += String.fromCharCode(b)
  return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function driveToken(): Promise<string> {
  const raw = Deno.env.get('GOOGLE_SA_KEY'); if (!raw) throw new Error('Chybí GOOGLE_SA_KEY.')
  const sa = JSON.parse(raw); const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const pem = String(sa.private_key).replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`))
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claim}.${b64url(sig)}` })
  if (!r.ok) throw new Error('Google token: ' + (await r.text()).slice(0, 200))
  return (await r.json()).access_token
}
async function driveImage(token: string, id: string): Promise<Uint8Array | null> {
  const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=thumbnailLink,size&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!meta.ok) return null
  const m = await meta.json()
  if (m.thumbnailLink) {
    const r = await fetch(String(m.thumbnailLink).replace(/=s\d+$/, '=s2048'), { headers: { Authorization: `Bearer ${token}` } })
    if (r.ok) return new Uint8Array(await r.arrayBuffer())
  }
  if (Number(m.size || 0) < 8 * 1048576) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
    if (r.ok) return new Uint8Array(await r.arrayBuffer())
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { action, deal_id, dry } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return json({ error: 'Nepřihlášen.' }, 401)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    try {
      const { data: ok } = await admin.rpc('rate_check', { p_uid: user.id, p_bucket: 'sreality-export', p_max: 30, p_seconds: 3600 })
      if (ok === false) return json({ error: 'Příliš mnoho požadavků, zkuste to prosím za chvíli.' }, 429)
    } catch { /* limit je jen pojistka */ }

    const cid = Deno.env.get('SREALITY_CLIENT_ID'), pw = Deno.env.get('SREALITY_PASSWORD'), key = Deno.env.get('SREALITY_SOFTWARE_KEY')
    const miss = [!cid && 'SREALITY_CLIENT_ID', !pw && 'SREALITY_PASSWORD', !key && 'SREALITY_SOFTWARE_KEY'].filter(Boolean)
    if (miss.length) return json({ error: `Chybí přihlašovací údaje Sreality (Supabase → Edge Functions → Secrets): ${miss.join(', ')}.` }, 400)

    // ---- ověření spojení ----
    if (action === 'ping') {
      const ses = new Session(Number(cid), pw!, key!)
      await ses.login()
      const sellers = await ses.call('listSeller', [])
      const adverts = await ses.call('listAdvert', [])
      await ses.logout()
      return json({ ok: true, sellers: sellers.output, adverts: adverts.output, sellers_status: sellers.status, adverts_status: adverts.status })
    }

    // ---- export inzerátu ----
    if (action !== 'export') return json({ error: 'Neznámá akce.' }, 400)
    const { data: deal, error } = await sb.from('deals').select('id, account_id, listing_price, address, intake').eq('id', deal_id).single()
    if (error || !deal) return json({ error: 'Obchod nenalezen nebo k němu nemáte přístup.' }, 403)
    const intake = (deal.intake || {}) as { type?: 'byt' | 'dum' | 'pozemek'; values?: V }
    const type = intake.type
    if (!type) return json({ error: 'U obchodu zatím není vyplněný náborový formulář.' }, 400)
    const v: V = { ...(intake.values || {}) }
    if (!s(v.price) && deal.listing_price) v.price = deal.listing_price

    const ses = new Session(Number(cid), pw!, key!)
    await ses.login()
    try {
      const sellers = await ses.call('listSeller', [])
      const list = (Array.isArray(sellers.output) ? sellers.output : []) as { seller_id: number; client_name: string }[]
      if (!list.length) { await ses.logout(); return json({ error: 'Na účtu Sreality není založený žádný makléř. Založte makléře (Martin Tesárek) v administraci Sreality a zkuste to znovu.', needs_seller: true }, 400) }
      const sellerId = list[0].seller_id

      const advert = buildAdvert(type, v, deal_id, sellerId)
      const missing = REQ[type].filter((k) => advert[k] === undefined).map((k) => LABEL[k] || k)
      const sel = arr(v.photos)
      if (missing.length) { await ses.logout(); return json({ ok: false, missing, error: 'Chybí povinné údaje pro Sreality: ' + missing.join(', ') }, 200) }
      if (dry) { await ses.logout(); return json({ ok: true, dry: true, advert, photos: sel.length, seller: list[0] }) }

      const add = await ses.call('addAdvert', [advert])
      if (add.status >= 300 && add.status !== 202 && add.status !== 203 && add.status !== 204 && add.status !== 205) { await ses.logout(); return json({ ok: false, status: add.status, error: `Sreality odmítlo inzerát (${add.status}): ${add.statusMessage}`, advert }, 200) }
      const advertId = (Array.isArray(add.output) ? (add.output[0] as { advert_id: number }) : (add.output as { advert_id: number }))?.advert_id

      // fotky: stáhnout (paralelně), nahrát po jedné (každé volání mění session)
      const token = sel.some((x) => !x.startsWith('up:')) ? await driveToken() : ''
      const imgs: (Uint8Array | null)[] = new Array(sel.length).fill(null)
      let next = 0
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (next < sel.length) {
          const i = next++; const id = sel[i]
          try {
            if (id.startsWith('up:')) { const { data } = await admin.storage.from('files').download(id.slice(3)); if (data) imgs[i] = new Uint8Array(await data.arrayBuffer()) }
            else imgs[i] = await driveImage(token, id)
          } catch { /* fotka se přeskočí */ }
        }
      }))
      const photoRes: { n: number; status: number; msg: string }[] = []
      for (let i = 0; i < sel.length; i++) {
        const img = imgs[i]
        if (!img) { photoRes.push({ n: i + 1, status: 0, msg: 'fotku se nepodařilo načíst' }); continue }
        const data: Record<string, RpcVal> = { data: img, main: i === 0 ? 1 : 0, photo_rkid: sel[i].slice(0, 60) }
        if (i > 0) data.order = i
        const r = await ses.call('addPhoto', [advertId, `crm-${deal_id}`, data])
        photoRes.push({ n: i + 1, status: r.status, msg: r.statusMessage })
      }
      const okPhotos = photoRes.filter((p) => p.status === 200 || p.status === 451).length
      const list2 = await ses.call('listAdvert', [])
      const mine = ((Array.isArray(list2.output) ? list2.output : []) as { advert_id: number; advert_url?: string; published?: number }[]).find((x) => x.advert_id === advertId)
      await ses.logout()

      const nv = { ...(intake.values || {}), sreality: { advert_id: advertId, url: mine?.advert_url || null, at: new Date().toISOString(), photos: okPhotos } }
      await sb.from('deals').update({ intake: { ...intake, values: nv } }).eq('id', deal_id)
      return json({ ok: true, advert_id: advertId, status: add.status, status_message: add.statusMessage, url: mine?.advert_url || null, published: mine?.published ?? null, photos_sent: okPhotos, photos_total: sel.length, photo_problems: photoRes.filter((p) => p.status !== 200 && p.status !== 451), video: s(v.video_url) ? 'Video se na Sreality zatím neposílá (jen odkaz v CRM).' : null })
    } catch (e) { await ses.logout(); throw e }
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
