// Stažení listu vlastnictví z katastru přes WSDP 3.1 (ČÚZK, placená služba).
// Secrets: WSDP_USER, WSDP_PASSWORD (vkládá Martin sám). trial:true = bezplatné prostředí „na zkoušku“ (účet WSTEST).
// Akce: find (najde ID listu vlastnictví, nic neúčtuje) | lv (vygeneruje PDF, uloží do Storage a vrátí odkaz; vyžaduje confirm:true).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const PROD = 'https://katastr.cuzk.gov.cz/ws/wsdp/3.1/'
const TRIAL = 'https://wsdptrial.cuzk.gov.cz/trial/ws/wsdp/3.1/'
const NS = { vyhledat: 'urn:cz:gov:cuzk:iskn:types:wsdp:vyhledat:3.1', sestavy: 'urn:cz:gov:cuzk:iskn:types:wsdp:sestavy:3.1' }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const tag = (xml: string, name: string) => xml.match(new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`))?.[1]
const messages = (xml: string) => [...xml.matchAll(/<(?:[\w-]+:)?zprava\s+kod="(\d+)"\s+uroven="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?zprava>/g)].map((m) => ({ kod: Number(m[1]), uroven: m[2], text: m[3].trim() }))

async function call(trial: boolean, svc: 'vyhledat' | 'sestavy', op: string, reqEl: string, inner: string): Promise<string> {
  const user = trial ? 'WSTEST' : Deno.env.get('WSDP_USER')
  const pass = trial ? 'WSHESLO' : Deno.env.get('WSDP_PASSWORD')
  if (!user || !pass) throw new Error('Chybí WSDP_USER / WSDP_PASSWORD v Supabase → Edge Functions → Secrets.')
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
  const env = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="${NS[svc]}"><soapenv:Header><wsse:Security soapenv:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"><wsse:UsernameToken><wsse:Username>${esc(user)}</wsse:Username><wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${esc(pass)}</wsse:Password><wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce}</wsse:Nonce><wsu:Created>${new Date().toISOString()}</wsu:Created></wsse:UsernameToken></wsse:Security></soapenv:Header><soapenv:Body><urn:${reqEl}>${inner}</urn:${reqEl}></soapenv:Body></soapenv:Envelope>`
  const r = await fetch((trial ? TRIAL : PROD) + svc, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `urn:cz:gov:cuzk:iskn:services:wsdp:${svc}:${op}` }, body: env, signal: AbortSignal.timeout(50_000) })
  const t = await r.text()
  if (/<(?:[\w-]+:)?Fault/.test(t)) {
    const fs = tag(t, 'faultstring') || t.slice(0, 200)
    throw new Error(/Failed to assert identity/.test(fs) ? 'Katastr odmítl přihlášení (špatné jméno/heslo nebo nepovolená IP adresa serveru): ' + fs : 'Katastr: ' + fs)
  }
  if (!r.ok && !t.includes('<')) throw new Error(`Katastr: HTTP ${r.status} ${t.slice(0, 150)}`)
  if (r.status === 403) throw new Error('Katastr: HTTP 403 – přístup z této IP adresy není povolen.')
  return t
}
const fail = (xml: string) => { const bad = messages(xml).filter((m) => m.uroven === 'CHYBA'); if (bad.length) throw new Error('Katastr: ' + bad.map((m) => `${m.text} (${m.kod})`).join('; ')) }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: u } = await sb.auth.getUser()
    if (!u?.user) return json({ error: 'Nepřihlášen.' }, 401)
    const b = await req.json().catch(() => ({})) as { action?: string; trial?: boolean; confirm?: boolean; deal_id?: string; lvId?: string; castObceKod?: number | string; kind?: string; cisloDomovni?: string; cisloJednotky?: string }
    const trial = !!b.trial
    if (b.action !== 'find' && b.action !== 'lv') return json({ error: 'Neznámá akce.' }, 400)

    // 1) ID listu vlastnictví (podle ID rovnou, nebo podle části obce + čísla popisného [+ jednotky])
    let lvId = String(b.lvId || '').replace(/\D/g, '')
    let what = ''
    if (!lvId) {
      if (!b.castObceKod || !b.cisloDomovni) return json({ error: 'Chybí kód části obce a číslo domovní.' }, 400)
      const typ = b.kind === 'č.ev.' ? 2 : 1
      const search = `<urn:castObceKod>${Number(b.castObceKod)}</urn:castObceKod><urn:typStavbyKod>${typ}</urn:typStavbyKod><urn:cisloDomovni>${esc(String(b.cisloDomovni))}</urn:cisloDomovni>`
      if (b.cisloJednotky) {
        const x = await call(trial, 'vyhledat', 'najdiJednotku', 'NajdiJednotkuRequest', search + `<urn:cisloJednotky>${esc(String(b.cisloJednotky))}</urn:cisloJednotky>`)
        fail(x); lvId = tag(x, 'lvId') || ''; what = 'jednotka ' + (b.cisloJednotky)
      } else {
        const x = await call(trial, 'vyhledat', 'najdiStavbu', 'NajdiStavbuRequest', search)
        fail(x); lvId = tag(x, 'lvId') || ''; what = 'stavba'
      }
      if (!lvId) return json({ error: 'Nemovitost jsem v katastru nenašel nebo nemá list vlastnictví. Zkontrolujte kód části obce a číslo.' }, 404)
    }
    if (b.action === 'find') return json({ lvId, what })
    if (!b.confirm) return json({ error: 'Stažení se účtuje – nejdřív ho potvrďte.', lvId }, 400)

    // 2) vygenerování sestavy a počkání na hotovo
    const g = await call(trial, 'sestavy', 'generujLV', 'GenerujLVRequest', `<urn:lvId>${lvId}</urn:lvId><urn:format>pdf</urn:format>`)
    fail(g)
    const repId = tag(g, 'id')
    if (!repId) throw new Error('Katastr nevrátil číslo sestavy: ' + g.slice(0, 300))
    let rep = ''
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const s = await call(trial, 'sestavy', 'seznamSestav', 'SeznamSestavRequest', `<urn:idSestavy>${repId}</urn:idSestavy>`)
      const st = tag(s, 'stav') || ''
      if (/chyba|zrušen/.test(st)) throw new Error('Sestava se nevytvořila: ' + st)
      if (st === 'zpracován' || st === 'zaúčtován') { rep = s; break }
    }
    if (!rep) throw new Error(`Sestava ${repId} se ještě vytváří. Zkuste to za chvíli znovu.`)
    const v = await call(trial, 'sestavy', 'vratSestavu', 'VratSestavuRequest', `<urn:idSestavy>${repId}</urn:idSestavy>`)
    fail(v)
    const b64 = (tag(v, 'souborSestavy') || '').replace(/\s/g, '')
    if (!b64) throw new Error('Katastr nevrátil soubor (možná MTOM příloha). Odpověď: ' + v.slice(0, 300))
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const price = tag(v, 'cena'); const pages = tag(v, 'pocetStran')
    call(trial, 'sestavy', 'smazSestavu', 'SmazSestavuRequest', `<urn:idSestavy>${repId}</urn:idSestavy>`).catch(() => {})

    // 3) uložení do Storage (u obchodu) a odkaz
    let path = `lv-test/LV-${lvId}-${new Date().toISOString().slice(0, 10)}.pdf`
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    if (b.deal_id) {
      const { data: d } = await sb.from('deals').select('account_id').eq('id', b.deal_id).single()
      if (!d) return json({ error: 'Obchod nenalezen.' }, 404)
      path = `${d.account_id}/lv/${b.deal_id}/LV-${lvId}-${new Date().toISOString().slice(0, 10)}.pdf`
    }
    const up = await admin.storage.from('files').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
    if (up.error) throw new Error('Uložení PDF: ' + up.error.message)
    const { data: sg } = await admin.storage.from('files').createSignedUrl(path, 3600)
    return json({ ok: true, lvId, path, url: sg?.signedUrl, price: price ? Number(price) : null, pages: pages ? Number(pages) : null, trial })
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500) }
})
