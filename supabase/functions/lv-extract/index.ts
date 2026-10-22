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

async function listFolder(token: string, folderId: string, path = '', depth = 0): Promise<DFile[]> {
  const out: DFile[] = []
  let pageToken = ''
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? '&pageToken=' + pageToken : ''}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) {
      const t = await r.text()
      if (r.status === 404 || r.status === 403) throw new Error('Složka na Disku není servisnímu účtu dostupná. Zkontrolujte, že je složka KLIENTI nasdílená účtu crm-disk@… jako Čtenář.')
      throw new Error('Drive: ' + t.slice(0, 200))
    }
    const d = await r.json()
    for (const f of d.files || []) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        if (depth < 2) out.push(...(await listFolder(token, f.id, path + f.name + '/', depth + 1)))
      } else out.push({ ...f, path })
    }
    pageToken = d.nextPageToken || ''
  } while (pageToken)
  return out
}

const isLv = (f: DFile) => !f.mimeType.startsWith('image/') && /\blv\b|list[_ -]?vlastn|vypis|výpis|katastr/.test((f.path + f.name).toLowerCase())

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
    notes: { type: 'array', items: { type: 'string' }, description: 'Zástavní práva, věcná břemena a omezení z LV, každé jednou stručnou větou' },
  },
}

async function extract(parts: unknown[]): Promise<Record<string, unknown>> {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('Chybí GEMINI_API_KEY.')
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash'}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.1 } }),
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
    const { data: deal, error } = await sb.from('deals').select('id, title, drive_folder_url').eq('id', deal_id).single()
    if (error || !deal) return json({ error: 'Obchod nenalezen nebo k němu nemáte přístup.' }, 403)
    const m = String(deal.drive_folder_url || '').match(/folders\/([A-Za-z0-9_-]+)/)
    if (!m) return json({ error: 'Obchod nemá přiřazenou složku na Disku. Vložte odkaz na složku v detailu obchodu.' }, 400)
    const token = await driveToken()
    const files = await listFolder(token, m[1])
    const lvs = files.filter(isLv).sort((a, b) => (a.mimeType === 'application/pdf' ? 0 : 1) - (b.mimeType === 'application/pdf' ? 0 : 1) || String(b.modifiedTime).localeCompare(String(a.modifiedTime))).slice(0, 3)
    if (!lvs.length) return json({ error: 'Ve složce jsem nenašel list vlastnictví (soubor s „LV“ nebo „list vlastnictví“ v názvu).' }, 404)
    const parts: unknown[] = [{ text: `Jsi asistent realitního makléře. Z listu vlastnictví (LV) k obchodu „${deal.title}“ vytěž údaje o PRODÁVANÉ nemovitosti: katastrální území, číslo LV, parcelní čísla, adresu (ulice, číslo popisné, obec, PSČ), u bytu číslo jednotky, výměru pozemků a zastavěnou plochu. Když je v LV víc nemovitostí, vyber tu, která odpovídá názvu obchodu; parcelní čísla a výměry sečti jen pro ni. Do notes napiš zástavní práva, věcná břemena a jiná omezení. Rodná čísla, čísla dokladů ani jména vlastníků NEUVÁDĚJ. Co v dokumentu není, vrať null. Názvy souborů: ${lvs.map((d) => d.name).join(', ')}` }]
    let used = 0; const usedNames: string[] = []; let budget = 20_000_000
    for (const d of lvs) {
      if (Number(d.size || 0) > budget) continue
      const c = await download(token, d)
      if (!c) continue
      budget -= c.data.length; used++; usedNames.push(d.name)
      if (c.mime.startsWith('text/')) parts.push({ text: `\n\n=== ${d.name} ===\n` + new TextDecoder().decode(c.data).slice(0, 60_000) })
      else parts.push({ text: `\n\n=== ${d.name} ===` }, { inline_data: { mime_type: c.mime, data: b64(c.data) } })
    }
    if (!used) return json({ error: 'List vlastnictví se nepodařilo stáhnout (příliš velký soubor?).' }, 400)
    const p = await extract(parts) as Record<string, any>
    const str = (v: unknown, max = 120) => { const t = String(v ?? '').trim(); return t && t.toLowerCase() !== 'null' ? t.slice(0, max) : null }
    const num = (v: unknown) => { const n = Number(v); return isFinite(n) && n > 0 ? Math.round(n) : null }
    const zip = String(p.zip ?? '').replace(/\s/g, '')
    return json({
      files: usedNames,
      proposal: {
        cadastre: str(p.cadastre), lv: str(p.lv, 20), parcel: str(p.parcel, 200), street: str(p.street), cp: str(p.cp, 20), city: str(p.city), zip: /^\d{5}$/.test(zip) ? zip : null,
        unit_no: str(p.unit_no, 20), plot_area: num(p.plot_area), built_area: num(p.built_area), property_type: str(p.property_type, 20),
        notes: Array.isArray(p.notes) ? p.notes.map((x: unknown) => str(x, 200)).filter(Boolean).slice(0, 8) : [],
      },
    })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
