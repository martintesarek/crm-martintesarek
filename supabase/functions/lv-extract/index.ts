// Vyplnění náběrového formuláře z listu vlastnictví (LV) ve složce obchodu na Google Disku.
// Nic nezapisuje – vrací jen návrh údajů; do formuláře je vkládá až Martin zaškrtnutím.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// ---------- Google servisní účet → access token ----------
const b64url = (buf: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : new Uint8Array(buf)
  let s = ''; for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
let cachedToken: { token: string; exp: number } | null = null
async function driveToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token
  const raw = Deno.env.get('GOOGLE_SA_KEY')
  if (!raw) throw new Error('Chybí GOOGLE_SA_KEY (klíč servisního účtu) v Supabase → Edge Functions → Secrets.')
  const sa = JSON.parse(raw)
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const pem = String(sa.private_key).replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`))
  const jwt = `${header}.${claim}.${b64url(sig)}`
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}` })
  if (!r.ok) throw new Error('Google token: ' + (await r.text()).slice(0, 200))
  const d = await r.json()
  cachedToken = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 }
  return d.access_token
}

type DFile = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string; thumbnailLink?: string; path: string }

async function listFolder(token: string, folderId: string, path = '', depth = 0, onlyWanted = false): Promise<DFile[]> {
  const out: DFile[] = []
  const subs: DFile[] = []
  let pageToken = ''
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? '&pageToken=' + pageToken : ''}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) {
      const t = await r.text()
      if (r.status === 404 || r.status === 403) throw new Error('Slo\u017eka na Disku nen\u00ed servisn\u00edmu \u00fa\u010dtu dostupn\u00e1. Zkontrolujte, \u017ee je slo\u017eka KLIENTI nasd\u00edlen\u00e1 \u00fa\u010dtu crm-disk@\u2026 jako \u010cten\u00e1\u0159.')
      throw new Error('Drive: ' + t.slice(0, 200))
    }
    const d = await r.json()
    for (const f of d.files || []) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        if (depth < 2 && (!onlyWanted || catOf(f.name))) subs.push(f)
      } else out.push({ ...f, path })
    }
    pageToken = d.nextPageToken || ''
  } while (pageToken)
  const nested = await Promise.all(subs.map((f) => listFolder(token, f.id, path + f.name + '/', depth + 1, onlyWanted)))
  for (const n of nested) out.push(...n)
  return out
}

const plain = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
// Které složky klienta čteme: LV, Evidenční list, PENB (název složky je vždy stejný)
type Cat = 'lv' | 'ev' | 'penb'
const catOf = (name: string): Cat | null => { const n = plain(name); return /^\s*lv\b/.test(n) ? 'lv' : /evidencni/.test(n) ? 'ev' : /^\s*penb|energeticky stitek|prukaz energeticke/.test(n) ? 'penb' : null }

async function download(token: string, f: DFile, maxBytes = 15_000_000): Promise<{ mime: string; data: Uint8Array } | null> {
  if (f.mimeType.startsWith('application/vnd.google-apps.')) {
    const exportMime = f.mimeType.endsWith('spreadsheet') ? 'text/csv' : 'text/plain'
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=${encodeURIComponent(exportMime)}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return null
    return { mime: exportMime, data: new Uint8Array(await r.arrayBuffer()) }
  }
  if (f.size && Number(f.size) > maxBytes) return null
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  return { mime: f.mimeType, data: new Uint8Array(await r.arrayBuffer()) }
}

const b64 = (a: Uint8Array) => { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s) }

const SCHEMA = {
  type: 'object',
  properties: {
    cadastre: { type: 'string', nullable: true, description: 'Katastrální území (název)' },
    lv: { type: 'string', nullable: true, description: 'Číslo listu vlastnictví' },
    parcel: { type: 'string', nullable: true, description: 'Parcelní čísla pozemků, oddělená čárkou (např. 1234/5, 1236)' },
    street: { type: 'string', nullable: true, description: 'Ulice (bez čísla)' },
    cp: { type: 'string', nullable: true, description: 'Číslo popisné / orientační (např. 665/9)' },
    city: { type: 'string', nullable: true, description: 'Obec' },
    zip: { type: 'string', nullable: true, description: 'PSČ, jen 5 číslic' },
    unit_no: { type: 'string', nullable: true, description: 'Číslo jednotky (u bytu)' },
    plot_area: { type: 'number', nullable: true, description: 'Celková výměra pozemků v m²' },
    built_area: { type: 'number', nullable: true, description: 'Výměra zastavěné plochy stavby v m²' },
    property_type: { type: 'string', nullable: true, description: 'byt / dům / pozemek / jiné' },
    common_share: { type: 'string', nullable: true, description: 'U bytové jednotky: Podíl na společných částech domu a pozemku jako zlomek přesně z LV (např. 4259/161770); u domu a pozemku null' },
    lien: { type: 'boolean', nullable: true, description: 'true, pokud je na prodávané nemovitosti aktuálně zapsané zástavní právo (hypotéka); jinak false' },
    lien_text: { type: 'string', nullable: true, description: 'Když je na prodávané nemovitosti zapsané zástavní právo: stručný popis česky ve 1–3 větách (druh zástavního práva, ve prospěch koho – název banky nebo věřitele, na základě čeho a kdy zapsáno, případně pro jakou pohledávku nebo částku, pokud je v LV uvedena). Bez rodných čísel a čísel účtů. Když zástavní právo není, null.' },
    owners: { type: 'array', description: 'VŠICHNI vlastníci a spoluvlastníci prodávané nemovitosti (fyzické osoby), každá osoba zvlášť; u SJM oba manželé', items: { type: 'object', properties: { first_name: { type: 'string', nullable: true }, last_name: { type: 'string' }, address: { type: 'string', nullable: true, description: 'Celá adresa bydliště vlastníka přesně tak, jak je v LV opsaná za jeho jménem (např. Čáslavská 1791/1, Vinohrady, 13000 Praha 3)' }, street: { type: 'string', nullable: true, description: 'Ulice nebo část obce BEZ čísla domu (např. Kozí)' }, house_no: { type: 'string', nullable: true, description: 'Číslo popisné / orientační vlastníka (např. 917/3)' }, city: { type: 'string', nullable: true, description: 'Obec bydliště: u Prahy vždy jen Praha (bez čísla obvodu a bez městské části jako Staré Město nebo Holešovice); jinak název obce' }, zip: { type: 'string', nullable: true }, birth_number: { type: 'string', nullable: true, description: 'Rodné číslo vlastníka (fyzické osoby) přesně tak, jak je v LV ve sloupci Identifikátor (RČ/IČO), ve tvaru 123456/7890; když v LV není, null' } }, required: ['last_name'] } },
    notes: { type: 'array', items: { type: 'string' }, description: 'Zástavní práva, věcná břemena a omezení z LV, každé jednou stručnou větou' },
  },
}

const SCHEMA_EV = {
  type: 'object',
  properties: {
    fund: { type: 'number', nullable: true, description: 'Měsíční záloha do fondu oprav v Kč' },
    service_fee: { type: 'number', nullable: true, description: 'Měsíční zálohy na služby (voda, výtah, úklid, osvětlení, správa…) v Kč' },
    energy_fee: { type: 'number', nullable: true, description: 'Měsíční zálohy na energie (topení, teplá voda) v Kč' },
    monthly_total: { type: 'number', nullable: true, description: 'Celkové měsíční platby za byt v Kč' },
    svj: { type: 'string', nullable: true, description: 'Název SVJ nebo bytového družstva' },
    notes: { type: 'array', items: { type: 'string' }, description: 'Další důležité údaje (dluh na fondu, plánované opravy, půjčka SVJ…), každé jednou stručnou větou' },
  },
}
const SCHEMA_PENB = {
  type: 'object',
  properties: {
    penb_class: { type: 'string', nullable: true, description: 'Třída energetické náročnosti budovy, jedno písmeno A až G' },
    penb_value: { type: 'number', nullable: true, description: 'Celková primární energie z neobnovitelných zdrojů v kWh/(m²·rok)' },
    penb_decree: { type: 'string', nullable: true, description: 'Vyhláška, podle které je průkaz zpracován (např. 264/2020 Sb.)' },
  },
}

async function extract(parts: unknown[], schema: unknown): Promise<Record<string, unknown>> {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('Chybí GEMINI_API_KEY.')
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash'}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.1 } }),
  })
  if (!r.ok) throw new Error('Gemini: ' + (await r.text()).slice(0, 300))
  const d = await r.json()
  return JSON.parse(d.candidates?.[0]?.content?.parts?.[0]?.text || '{}')
}

// Omezení počtu volání (rate limit) na uživatele. Když databázová funkce není k dispozici, volání projde.
async function rl(uid: string | undefined, bucket: string, max: number, seconds: number): Promise<boolean> {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await admin.rpc('rate_check', { p_uid: uid || 'anon', p_bucket: bucket, p_max: max, p_seconds: seconds })
    return error ? true : data !== false
  } catch { return true }
}
const TOO_MANY = { error: 'Příliš mnoho požadavků, zkuste to prosím za chvíli.' }


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { deal_id } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: { user: su } } = await sb.auth.getUser()
    if (!su) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(su.id, 'lv-extract', 60, 3600))) return json(TOO_MANY, 429)
    const { data: deal, error } = await sb.from('deals').select('id, title, drive_folder_url, account_id, deal_contacts(contact_id, contacts(first_name, last_name))').eq('id', deal_id).single()
    if (error || !deal) return json({ error: 'Obchod nenalezen nebo k němu nemáte přístup.' }, 403)
    const m = String(deal.drive_folder_url || '').match(/folders\/([A-Za-z0-9_-]+)/)
    if (!m) return json({ error: 'Obchod nemá přiřazenou složku na Disku. Vložte odkaz na složku v detailu obchodu.' }, 400)
    const token = await driveToken()
    const all = await listFolder(token, m[1], '', 0, true)
    const pick = (cat: Cat, n: number) => all.filter((f) => catOf(f.path.split('/')[0]) === cat && !f.mimeType.startsWith('video/'))
      .sort((a, b) => (a.mimeType === 'application/pdf' ? 0 : 1) - (b.mimeType === 'application/pdf' ? 0 : 1) || String(b.modifiedTime).localeCompare(String(a.modifiedTime))).slice(0, n)
    const found: Record<Cat, DFile[]> = { lv: pick('lv', 3), ev: pick('ev', 2), penb: pick('penb', 2) }
    if (!found.lv.length && !found.ev.length && !found.penb.length) return json({ error: 'Ve složce klienta jsem nenašel žádnou ze složek „LV“, „Evidenční list“ ani „PENB“ (nebo jsou prázdné).' }, 404)
    const prompts: Record<Cat, string> = {
      lv: `Jsi asistent realitního makléře. Z listu vlastnictví (LV) k obchodu „${deal.title}“ vytěž údaje o PRODÁVANÉ nemovitosti: katastrální území, číslo LV, parcelní čísla, adresu (ulice, číslo popisné, obec, PSČ), u bytu číslo jednotky a podíl na společných částech domu a pozemku (zlomek), výměru pozemků a zastavěnou plochu. Když je v LV víc nemovitostí, vyber tu, která odpovídá názvu obchodu; parcelní čísla a výměry sečti jen pro ni. Do owners uveď všechny vlastníky a spoluvlastníky (fyzické osoby, u SJM oba manžele zvlášť) se jménem, příjmením a adresou bydliště, bez titulů, s rodným číslem (birth_number). Rodné číslo je ve sloupci „Identifikátor“ (v záhlaví „RČ/IČO“) ve tvaru 123456/7890 nebo 123456/789; opiš ho přesně k vlastníkovi, který je ve stejném řádku tabulky. Pozor: v textové vrstvě PDF může číslo stát těsně PŘED jménem dalšího vlastníka nebo za ním – přiřaď ho podle řádků tabulky a podle pořadí vlastníků, ne podle pořadí slov v textu. Stejná rodná čísla jsou i v části „Nabývací tituly“ (Pro: jméno, číslo) – použij je ke kontrole přiřazení. U fyzických osob rodné číslo VŽDY vyplň, pokud je v dokumentu uvedeno. Právnické osoby (IČO, 8 číslic) neuváděj do owners, ale do notes. Do notes napiš zástavní práva, věcná břemena a jiná omezení. Čísla občanských průkazů a jiných dokladů neuváděj. Co v dokumentu není, vrať null.`,
      ev: `Jsi asistent realitního makléře. Z evidenčního listu (předpis měsíčních plateb) bytu k obchodu „${deal.title}“ vytěž měsíční zálohy do fondu oprav, na služby a na energie, celkovou měsíční platbu a název SVJ nebo družstva. Částky jsou měsíční v Kč; když je uvedena jen roční nebo na jiný údaj, vrať null. Jména vlastníků, čísla účtů ani variabilní symboly NEUVÁDĚJ. Co v dokumentu není, vrať null.`,
      penb: `Jsi asistent realitního makléře. Z průkazu energetické náročnosti budovy (PENB) k obchodu „${deal.title}“ vytěž třídu energetické náročnosti (A až G), ukazatel celkové primární energie z neobnovitelných zdrojů v kWh/(m²·rok) a vyhlášku, podle které je průkaz zpracován. Co v dokumentu není, vrať null.`,
    }
    const schemas: Record<Cat, unknown> = { lv: SCHEMA, ev: SCHEMA_EV, penb: SCHEMA_PENB }
    let budget = 25_000_000
    // každá složka se čte zvlášť a souběžně
    const run = async (cat: Cat): Promise<{ cat: Cat; names: string[]; data: Record<string, any> } | null> => {
      const files = found[cat]; if (!files.length) return null
      const parts: unknown[] = [{ text: prompts[cat] + ' Názvy souborů: ' + files.map((d) => d.name).join(', ') }]
      const names: string[] = []
      const dl = await Promise.all(files.map(async (d) => (Number(d.size || 0) > budget ? null : { d, c: await download(token, d) })))
      for (const x of dl) {
        if (!x || !x.c) continue
        budget -= x.c.data.length; names.push(x.d.name)
        if (x.c.mime.startsWith('text/')) parts.push({ text: `\n\n=== ${x.d.name} ===\n` + new TextDecoder().decode(x.c.data).slice(0, 60_000) })
        else parts.push({ text: `\n\n=== ${x.d.name} ===` }, { inline_data: { mime_type: x.c.mime, data: b64(x.c.data) } })
      }
      if (!names.length) return null
      return { cat, names, data: (await extract(parts, schemas[cat])) as Record<string, any> }
    }
    const settled = await Promise.allSettled((['lv', 'ev', 'penb'] as Cat[]).map(run))
    const res = settled.map((r) => (r.status === 'fulfilled' ? r.value : null))
    const errs = settled.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason?.message || (r as PromiseRejectedResult).reason))
    if (!res.some(Boolean)) return json({ error: errs[0] || 'Dokumenty se nepodařilo stáhnout nebo přečíst (příliš velký soubor?).' }, 400)
    const d: Record<Cat, Record<string, any>> = { lv: res[0]?.data || {}, ev: res[1]?.data || {}, penb: res[2]?.data || {} }
    const str = (v: unknown, max = 120) => { const t = String(v ?? '').trim(); return t && t.toLowerCase() !== 'null' ? t.slice(0, max) : null }
    const num = (v: unknown) => { const n = Number(v); return isFinite(n) && n > 0 ? Math.round(n) : null }
    const p = d.lv
    const zip = String(p.zip ?? '').replace(/\s/g, '')
    const sh = String(p.common_share ?? '').match(/(\d+)\s*\/\s*\d+/)
    // 4259/161770 = 42,59 m² → 43 m² (číslo ÷ 100). Když tak vyjde nesmysl (526/10250 → 5 m²), je číslo v desetinách m² (÷ 10 → 53 m²); jinak nic.
    const shN = sh ? Number(sh[1]) : 0
    const usable = shN && String(p.unit_no ?? '').trim() ? [shN / 100, shN / 10].map(Math.round).find((x) => x >= 15 && x <= 400) ?? null : null
    const cls = String(d.penb.penb_class ?? '').trim().toUpperCase().charAt(0)
    const dec = String(d.penb.penb_decree ?? '').match(/(\d{1,3})\s*\/\s*(\d{4})/)
    const decree = dec ? `č. ${dec[1]}/${dec[2]} Sb.` : null
    const notes = [...(Array.isArray(p.notes) ? p.notes : []), ...(Array.isArray(d.ev.notes) ? d.ev.notes : [])].map((x: unknown) => str(x, 200)).filter(Boolean).slice(0, 10)
    // vlastníci: poznat, kdo už je v obchodě a kdo už je v kontaktech
    const parseBN = (raw: unknown): { bn: string; date: string; gender: string } | null => {
      const d = String(raw ?? '').replace(/\D/g, ''); if (d.length !== 9 && d.length !== 10) return null
      const yy = +d.slice(0, 2); let mm = +d.slice(2, 4); const dd = +d.slice(4, 6)
      if (d.length === 10 && +d % 11 !== 0 && !(+d.slice(0, 9) % 11 === 10 && d[9] === '0')) return null
      if (d.length === 9 && yy > 53) return null
      const year = d.length === 9 ? 1900 + yy : yy >= 54 ? 1900 + yy : 2000 + yy
      const woman = (mm >= 51 && mm <= 62) || mm >= 71
      if (mm > 70) mm -= 70; else if (mm > 50) mm -= 50; else if (mm > 20) mm -= 20
      const t = new Date(Date.UTC(year, mm - 1, dd)); if (t.getUTCFullYear() !== year || t.getUTCMonth() !== mm - 1 || t.getUTCDate() !== dd) return null
      return { bn: d.slice(0, 6) + '/' + d.slice(6), date: `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`, gender: woman ? 'žena' : 'muž' }
    }
    const clean = (v: unknown, re: RegExp, max = 80) => { const t = String(v ?? '').trim(); return t && re.test(t) && t.length <= max ? t : null }
    const key = (f: unknown, l: unknown) => plain(`${f || ''} ${l || ''}`).replace(/\s+/g, ' ').trim()
    const inDeal = new Set(((deal as any).deal_contacts || []).map((x: any) => key(x.contacts?.first_name, x.contacts?.last_name)))
    const rawOwners = (Array.isArray(p.owners) ? p.owners : []).filter((o: any) => o && o.last_name).slice(0, 10)
    const owners = await Promise.all(rawOwners.map(async (o: any) => {
      const first = clean(o.first_name, /^[\p{L}\s.'-]+$/u, 60); const last = String(o.last_name).trim().slice(0, 60)
      const k = key(first, last)
      let contact_id: string | null = null
      {
        const { data: cs } = await sb.from('contacts').select('id, first_name, last_name').eq('account_id', (deal as any).account_id).ilike('last_name', `%${last.slice(0, 4)}%`).limit(50)
        contact_id = (cs || []).find((c: any) => key(c.first_name, c.last_name) === k)?.id || null
      }
      // rodné číslo: ověřit tvar a kontrolní součet, z něj odvodit datum narození a pohlaví
      const bn = parseBN(o.birth_number)
      let st = clean(o.street, /./); let hn = clean(o.house_no, /^\d[\w/ ]*$/, 20)
      { const m = st && /^(.*?)\s+(\d+[a-zA-Z]?(?:\s*\/\s*\d+[a-zA-Z]?)?)$/.exec(st); if (m) { st = m[1].trim(); if (!hn) hn = m[2].replace(/\s+/g, '') } }
      // doplnění z celé adresy opsané z LV, když model některou část nevrátil (např. „Čáslavská 1791/1, Vinohrady, 13000 Praha 3“)
      const addr = String(o.address ?? '').trim()
      if (addr) {
        const parts = addr.split(',').map((x) => x.trim()).filter(Boolean)
        const m1 = /^(.*?)\s+(\d+[a-zA-Z]?(?:\s*\/\s*\d+[a-zA-Z]?)?)$/.exec(parts[0] || '')
        if (m1) { if (!hn) hn = m1[2].replace(/\s+/g, ''); if (!st) st = m1[1].trim() }
        else if (!hn && /^\d/.test(parts[0] || '')) hn = parts[0].replace(/\s+/g, '')
        const last = parts[parts.length - 1] || ''
        const m2 = /^(\d{3}\s?\d{2})\s+(.+)$/.exec(last)
        if (m2) { if (!o.zip) o.zip = m2[1]; if (!o.city) o.city = m2[2] }
      }
      const zp = String(o.zip ?? '').replace(/\s/g, '')
      let ct = clean(o.city, /^[\p{L}\d\s.,'-]+$/u); if (ct && /^praha\b/i.test(ct)) ct = 'Praha'
      return { first_name: first, last_name: last, birth_number: bn?.bn || null, birth_date: bn?.date || null, gender: bn?.gender || null, street: st, house_no: hn, city: ct, zip: /^\d{5}$/.test(zp) ? zp : null, in_deal: inDeal.has(k), contact_id }
    }))
    return json({
      owners,
      files: { lv: res[0]?.names || [], ev: res[1]?.names || [], penb: res[2]?.names || [] },
      missing: (['lv', 'ev', 'penb'] as Cat[]).filter((c, i) => !res[i]),
      warnings: errs,
      proposal: {
        cadastre: str(p.cadastre), lv: str(p.lv, 20), parcel: str(p.parcel, 200), street: str(p.street), cp: str(p.cp, 20), city: str(p.city), zip: /^\d{5}$/.test(zip) ? zip : null,
        unit_no: str(p.unit_no, 20), plot_area: num(p.plot_area), built_area: num(p.built_area), usable_area: num(usable), property_type: str(p.property_type, 20), lien: p.lien === true ? true : null, lien_text: p.lien === true ? str(p.lien_text, 700) : null,
        lv_link: found.lv.find((f) => f.name === res[0]?.names?.[0])?.webViewLink || null,
        fund: num(d.ev.fund), service_fee: num(d.ev.service_fee), energy_fee: num(d.ev.energy_fee), monthly_total: num(d.ev.monthly_total), svj: str(d.ev.svj),
        penb_class: /^[A-G]$/.test(cls) ? cls : null, penb_value: num(d.penb.penb_value), penb_decree: decree,
        notes,
      },
    })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
