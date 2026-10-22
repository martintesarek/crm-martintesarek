// Údaje o domě z RUIAN (ČÚZK): počet bytů, podlaží, rok dokončení, konstrukce, výtah, vytápění, přípojky, PSČ.
// Vrací jen návrh, nic neukládá. Zdroj: ags.cuzk.gov.cz (otevřená data).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const BASE = 'https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/'

async function rl(uid: string | undefined, bucket: string, max: number, seconds: number): Promise<boolean> {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await admin.rpc('rate_check', { p_uid: uid || 'anon', p_bucket: bucket, p_max: max, p_seconds: seconds })
    return error ? true : data !== false
  } catch { return true }
}
type Feat = { attributes: Record<string, unknown>; geometry?: { x?: number; y?: number; rings?: number[][][] } }
const qf = async (layer: number, where: string, outFields: string, geo = false, extra: Record<string, string> = {}): Promise<Feat[]> => {
  const u = new URL(BASE + layer + '/query')
  for (const [k, v] of Object.entries({ where, outFields, returnGeometry: geo ? 'true' : 'false', ...(geo ? { outSR: '4326' } : {}), f: 'json', resultRecordCount: '50', ...extra })) u.searchParams.set(k, v)
  const r = await fetch(u)
  if (!r.ok) throw new Error('Registr RUIAN neodpovídá (' + r.status + ').')
  const d = await r.json()
  if (d.error) throw new Error('Registr RUIAN: ' + (d.error.message || 'chyba'))
  return d.features || []
}
const q = async (layer: number, where: string, outFields: string) => (await qf(layer, where, outFields)).map((f) => f.attributes)
const esc = (s: string) => s.replace(/'/g, "''").replace(/[%_]/g, '')

const KONSTR_BYT: Record<number, string> = { 1: 'Cihlová', 10: 'Cihlová', 2: 'Kamenná', 3: 'Smíšená', 7: 'Smíšená', 4: 'Panelová', 41: 'Panelová', 43: 'Panelová', 6: 'Dřevěná', 61: 'Dřevěná', 62: 'Dřevěná', 63: 'Dřevěná', 64: 'Dřevěná', 65: 'Dřevěná', 66: 'Dřevěná' }
const KONSTR_DUM: Record<number, string> = { ...KONSTR_BYT, 6: 'Dřevostavba', 61: 'Dřevostavba', 62: 'Dřevostavba', 63: 'Dřevostavba', 64: 'Dřevostavba', 65: 'Dřevostavba', 66: 'Dřevostavba' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const b = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(user.id, 'ruian-building', 40, 3600))) return json({ error: 'Příliš mnoho požadavků, zkuste to prosím za chvíli.' }, 429)
    const type = b.type === 'dum' ? 'dum' : b.type === 'pozemek' ? 'pozemek' : 'byt'
    const street = String(b.street || '').trim().slice(0, 100), cp = String(b.cp || '').trim().slice(0, 20), city = String(b.city || '').trim().slice(0, 100)
    const cadastre = String(b.cadastre || '').trim().slice(0, 100), parcelTxt = String(b.parcel || '').trim().slice(0, 200)
    const p: Record<string, string | number | boolean | null> = {}
    const notes: string[] = []
    let point: { x: number; y: number } | null = null
    let addrText: string | null = null

    // --- budova podle adresy (jen byt a dům)
    if (type !== 'pozemek' && cp && city) {
      const cpNum = cp.split('/')[0].replace(/\D/g, '')
      if (cpNum) {
        const cityPart = esc(city.replace(/\s+\d+$/, ''))
        const where = street
          ? `adresa like '${esc(street)} ${esc(cp)}%' and adresa like '%${cityPart}%'`
          : `adresa like '%${esc(cp)}, %' and adresa like '%${cityPart}%'`
        const F = 'kod,adresa,psc,stavebniobjekt,cislodomovni,cisloorientacni'
        let adr = await qf(1, where, F, true)
        if (!adr.length && !street) adr = await qf(1, `adresa like '%${cpNum}, %' and adresa like '%${cityPart}%'`, F, true)
        adr = adr.filter((a) => String(a.attributes.cislodomovni) === cpNum)
        const objs = [...new Set(adr.map((a) => a.attributes.stavebniobjekt).filter(Boolean))]
        if (objs.length > 1) return json({ error: 'Pod touto adresou je v registru víc budov. Upřesněte číslo (např. 944/5).' }, 409)
        if (objs.length === 1) {
          const so = (await q(3, 'kod=' + objs[0], 'kod,dokonceni,druhkonstrukcekod,pocetbytu,pocetpodlazi,vybavenivytahemkod,zpusobvytapenikod,pripojenikanalizacekod,pripojenivodovodkod,pripojeniplynkod,zastavenaplocha'))[0]
          const num = (x: unknown) => (typeof x === 'number' && x > 0 ? x : null)
          const psc = String(adr[0]?.attributes.psc || '')
          p.zip = psc.length === 5 ? psc.slice(0, 3) + ' ' + psc.slice(3) : null
          addrText = String(adr[0]?.attributes.adresa || '') || null
          const g = adr[0]?.geometry
          if (g?.x && g?.y) { point = { x: g.x, y: g.y }; p.lng = String(g.x.toFixed(6)); p.lat = String(g.y.toFixed(6)) }
          if (so) {
            p.year = typeof so.dokonceni === 'number' ? new Date(so.dokonceni).getUTCFullYear() : null
            if (type === 'byt') { p.units_total = num(so.pocetbytu); p.floors_total = num(so.pocetpodlazi) } else { p.floors = num(so.pocetpodlazi) }
            p.construction = (type === 'dum' ? KONSTR_DUM : KONSTR_BYT)[Number(so.druhkonstrukcekod)] || null
            if (type === 'byt') p.elevator = so.vybavenivytahemkod === 1 ? true : null
            const h = Number(so.zpusobvytapenikod)
            if (type === 'byt') p.heating = h === 2 || (h >= 21 && h <= 29) ? 'Ústřední dálkové' : h === 11 ? 'Ústřední plynové' : h === 15 ? 'Elektrické' : h === 16 ? 'Tepelné čerpadlo' : null
            else p.heating = h === 11 ? 'Ústřední plynové' : h === 15 ? 'Ústřední elektrické' : h >= 12 && h <= 14 ? 'Ústřední tuhá paliva' : null
            if (type === 'dum') {
              p.water = so.pripojenivodovodkod === 1 ? 'Vodovod' : null
              p.sewer = ({ 1: 'Veřejná kanalizace', 2: 'ČOV pro celý objekt', 3: 'Jímka' } as Record<number, string>)[Number(so.pripojenikanalizacekod)] || null
              p.built_area = num(so.zastavenaplocha)
            }
          }
        } else if (type === 'byt') {
          return json({ error: 'Adresu jsem v registru RUIAN nenašel. Zkontrolujte ulici, číslo popisné a obec.' }, 404)
        }
      }
    }

    // --- parcely (dům a pozemek) podle katastrálního území a čísel parcel z LV
    if (type !== 'byt' && cadastre && parcelTxt) {
      const nums = parcelTxt.split(/[,;]| a /).map((x) => x.replace(/parc(ela|\.)?\s*(č\.)?/i, '').trim()).filter(Boolean).slice(0, 15)
      const kus = await q(7, `nazev='${esc(cadastre)}'`, 'kod,nazev')
      if (kus.length === 1 && nums.length) {
        const list = nums.map((n) => `'${esc(n)}'`).join(',')
        const par = await qf(5, `katastralniuzemi=${kus[0].kod} and cisloparcely in (${list})`, 'cisloparcely,vymeraparcely,druhpozemkukod,zpusobyvyuzitipozemku', true)
        const found = new Set(par.map((f) => String(f.attributes.cisloparcely)))
        const lost = nums.filter((n) => !found.has(n))
        if (lost.length) notes.push('V registru jsem nenašel parcely: ' + lost.join(', ') + '.')
        if (par.length) {
          const sum = (f: (a: Record<string, unknown>) => boolean) => par.filter((x) => f(x.attributes)).reduce((t, x) => t + (Number(x.attributes.vymeraparcely) || 0), 0)
          const total = sum(() => true)
          p.plot_area = total > 0 ? total : null
          p.multi_parcel = par.length > 1 ? true : null
          if (type === 'dum') {
            const built = sum((a) => a.druhpozemkukod === 13), garden = sum((a) => a.druhpozemkukod === 5)
            if (!p.built_area && built > 0) p.built_area = built
            p.garden_area = garden > 0 ? garden : null
          } else {
            const druhy = [...new Set(par.map((x) => Number(x.attributes.druhpozemkukod)))]
            const MAP: Record<number, string> = { 2: 'Pole', 4: 'Sad / vinice', 6: 'Sad / vinice', 5: 'Zahrada', 7: 'Louka', 8: 'Louka', 10: 'Les', 11: 'Rybník' }
            p.subtype = druhy.length === 1 ? MAP[druhy[0]] || null : null
            const NAMES: Record<number, string> = { 2: 'orná půda', 3: 'chmelnice', 4: 'vinice', 5: 'zahrada', 6: 'ovocný sad', 7: 'trvalý travní porost', 8: 'trvalý travní porost', 10: 'lesní pozemek', 11: 'vodní plocha', 13: 'zastavěná plocha a nádvoří', 14: 'ostatní plocha' }
            notes.push('Druh pozemku v katastru: ' + druhy.map((d) => NAMES[d] || 'jiný').join(', ') + '.')
          }
          if (!point) {
            const ring = par[0].geometry?.rings?.[0]?.[0]
            if (ring) { point = { x: ring[0], y: ring[1] }; p.lng = ring[0].toFixed(6); p.lat = ring[1].toFixed(6) }
          }
        }
      } else if (kus.length !== 1) notes.push('Katastrální území „' + cadastre + '“ se mi nepodařilo jednoznačně najít.')
    }

    // --- chráněná území podle polohy
    if (point) {
      const LAYERS: [number, string][] = [[30, 'národní park'], [40, 'chráněná krajinná oblast'], [44, 'národní přírodní rezervace'], [52, 'přírodní rezervace'], [56, 'přírodní památka'], [60, 'Natura 2000 (evropsky významná lokalita)'], [62, 'Natura 2000 (ptačí oblast)']]
      const hits = await Promise.all(LAYERS.map(async ([l, label]) => {
        try {
          const f = await qf(l, '1=1', 'nazev', false, { geometry: `${point!.x},${point!.y}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' })
          return f.map((x) => `${label}: ${x.attributes.nazev}`)
        } catch { return [] as string[] }
      }))
      const prot = hits.flat()
      if (prot.length) notes.push('Leží v chráněném území – ' + prot.join('; ') + '.')
    }

    if (!Object.values(p).some((v) => v != null) && !notes.length) return json({ error: 'V registru RUIAN jsem k tomuto objektu nic nenašel. Zkontrolujte adresu, katastrální území a čísla parcel.' }, 404)
    return json({ proposal: p, notes, address: addrText })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
