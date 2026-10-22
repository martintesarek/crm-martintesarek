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
const q = async (layer: number, where: string, outFields: string) => {
  const u = new URL(BASE + layer + '/query')
  for (const [k, v] of Object.entries({ where, outFields, returnGeometry: 'false', f: 'json', resultRecordCount: '50' })) u.searchParams.set(k, v)
  const r = await fetch(u)
  if (!r.ok) throw new Error('Registr RUIAN neodpovídá (' + r.status + ').')
  const d = await r.json()
  if (d.error) throw new Error('Registr RUIAN: ' + (d.error.message || 'chyba'))
  return (d.features || []).map((f: { attributes: Record<string, unknown> }) => f.attributes)
}
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
    const type = String(b.type) === 'dum' ? 'dum' : 'byt'
    const street = String(b.street || '').trim().slice(0, 100), cp = String(b.cp || '').trim().slice(0, 20), city = String(b.city || '').trim().slice(0, 100)
    if (!cp || !city) return json({ error: 'Vyplňte nejdřív obec a číslo popisné.' }, 400)
    const cpNum = cp.split('/')[0].replace(/\D/g, '')
    if (!cpNum) return json({ error: 'Číslo popisné nevypadá správně.' }, 400)
    const cityPart = esc(city.replace(/\s+\d+$/, ''))
    const where = street
      ? `adresa like '${esc(street)} ${esc(cp)}%' and adresa like '%${cityPart}%'`
      : `adresa like '%${esc(cp)}, %' and adresa like '%${cityPart}%'`
    let adr = await q(1, where, 'kod,adresa,psc,stavebniobjekt,cislodomovni,cisloorientacni')
    if (!adr.length && !street) adr = await q(1, `adresa like '%${cpNum}, %' and adresa like '%${cityPart}%'`, 'kod,adresa,psc,stavebniobjekt,cislodomovni,cisloorientacni')
    adr = adr.filter((a: Record<string, unknown>) => String(a.cislodomovni) === cpNum)
    const objs = [...new Set(adr.map((a: Record<string, unknown>) => a.stavebniobjekt).filter(Boolean))]
    if (!objs.length) return json({ error: 'Adresu jsem v registru RUIAN nenašel. Zkontrolujte ulici, číslo popisné a obec.' }, 404)
    if (objs.length > 1) return json({ error: 'Pod touto adresou je v registru víc budov. Upřesněte číslo (např. 944/5).' }, 409)
    const so = (await q(3, 'kod=' + objs[0], 'kod,dokonceni,druhkonstrukcekod,pocetbytu,pocetpodlazi,vybavenivytahemkod,zpusobvytapenikod,pripojenikanalizacekod,pripojenivodovodkod,pripojeniplynkod,zastavenaplocha'))[0]
    if (!so) return json({ error: 'Budova v registru nenalezena.' }, 404)
    const num = (x: unknown) => (typeof x === 'number' && x > 0 ? x : null)
    const p: Record<string, string | number | boolean | null> = {}
    const psc = String(adr[0]?.psc || '')
    p.zip = psc.length === 5 ? psc.slice(0, 3) + ' ' + psc.slice(3) : null
    p.year = typeof so.dokonceni === 'number' ? new Date(so.dokonceni).getUTCFullYear() : null
    if (type === 'byt') { p.units_total = num(so.pocetbytu); p.floors_total = num(so.pocetpodlazi) } else { p.floors = num(so.pocetpodlazi) }
    p.construction = (type === 'dum' ? KONSTR_DUM : KONSTR_BYT)[Number(so.druhkonstrukcekod)] || null
    if (type === 'byt') p.elevator = so.vybavenivytahemkod === 1 ? true : null
    const h = Number(so.zpusobvytapenikod)
    if (type === 'byt') p.heating = h === 2 || (h >= 21 && h <= 29) ? 'Ústřední dálkové' : h === 11 ? 'Ústřední plynové' : h === 15 ? 'Elektrické' : h === 16 ? 'Tepelné čerpadlo' : null
    else { p.heating = h === 11 ? 'Ústřední plynové' : h === 15 ? 'Ústřední elektrické' : h >= 12 && h <= 14 ? 'Ústřední tuhá paliva' : null }
    if (type === 'dum') {
      p.water = so.pripojenivodovodkod === 1 ? 'Vodovod' : null
      p.sewer = ({ 1: 'Veřejná kanalizace', 2: 'ČOV pro celý objekt', 3: 'Jímka' } as Record<number, string>)[Number(so.pripojenikanalizacekod)] || null
      p.built_area = num(so.zastavenaplocha)
    }
    return json({ proposal: p, address: adr[0]?.adresa || null })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
