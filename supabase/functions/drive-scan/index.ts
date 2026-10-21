// Načtení složky obchodu z Google Disku (servisní účet) a návrh údajů pomocí AI.
// action = 'scan'  → seznam souborů + návrh údajů (nic nezapisuje, jen uloží výsledek skenu k obchodu)
// action = 'cover' → stáhne vybranou fotku z Disku a uloží ji jako náhled obchodu
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

const isImg = (f: DFile) => f.mimeType.startsWith('image/')
const kindOf = (f: DFile): string => {
  const n = (f.path + f.name).toLowerCase()
  if (isImg(f)) return 'foto'
  if (/\blv\b|list[_ -]?vlastn|vypis|výpis|katastr/.test(n)) return 'lv'
  if (/zprost|rezerva|kupn|smlouv|plná moc|plna moc|dodatek|předáv|predav/.test(n)) return 'smlouva'
  if (/penb|energet/.test(n)) return 'penb'
  if (/půdorys|pudorys|dispozi|plán|plan/.test(n)) return 'pudorys'
  if (/odhad|nacen|cena|nabídk|nabidk/.test(n)) return 'cena'
  return 'ostatni'
}

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
    address: { type: 'string', nullable: true, description: 'Adresa nemovitosti (ulice č.p., obec, PSČ)' },
    category: { type: 'string', nullable: true, description: 'byt / rodinný dům / pozemek / chata / komerční / jiné' },
    cadastre: { type: 'string', nullable: true, description: 'Katastrální území, číslo LV, parcelní čísla' },
    owners: { type: 'array', items: { type: 'object', properties: { first_name: { type: 'string' }, last_name: { type: 'string' }, phone: { type: 'string', nullable: true }, email: { type: 'string', nullable: true }, street: { type: 'string', nullable: true }, city: { type: 'string', nullable: true }, zip: { type: 'string', nullable: true } }, required: ['last_name'] } },
    listing_price: { type: 'number', nullable: true, description: 'Kupní / inzerovaná cena v Kč' },
    expected_commission: { type: 'number', nullable: true, description: 'Provize v Kč (když je v % z ceny, přepočti)' },
    estimate_low: { type: 'number', nullable: true }, estimate_high: { type: 'number', nullable: true },
    contract_date: { type: 'string', nullable: true, description: 'Datum podpisu zprostředkovatelské smlouvy (YYYY-MM-DD)' },
    exclusivity_until: { type: 'string', nullable: true, description: 'Do kdy platí výhradní zastoupení (YYYY-MM-DD)' },
    summary: { type: 'string', description: '2–4 věty: co je ve složce důležité (stav dokumentů, co chybí, zvláštnosti)' },
  },
  required: ['owners', 'summary'],
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
    const { action = 'scan', deal_id, file_id } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: { user: su } } = await sb.auth.getUser()
    if (!su) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(su.id, 'drive-scan', 90, 3600))) return json(TOO_MANY, 429)
    const { data: deal, error } = await sb.from('deals').select('id, account_id, title, drive_folder_url, deal_contacts(contacts(first_name,last_name))').eq('id', deal_id).single()
    if (error || !deal) return json({ error: 'Obchod nenalezen nebo k němu nemáte přístup.' }, 403)
    const m = String(deal.drive_folder_url || '').match(/folders\/([A-Za-z0-9_-]+)/)
    if (!m) return json({ error: 'Obchod nemá přiřazenou složku na Disku. Vložte odkaz na složku do pole „Složka na Disku“.' }, 400)
    const token = await driveToken()

    if (action === 'cover') {
      const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${file_id}?fields=id,name,mimeType,size&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
      if (!meta.ok) return json({ error: 'Soubor nenalezen.' }, 404)
      const f = { ...(await meta.json()), path: '' } as DFile
      const img = await download(token, f, 25_000_000)
      if (!img) return json({ error: 'Fotku se nepodařilo stáhnout (příliš velká?).' }, 400)
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${deal.account_id}/${deal.id}/${Date.now()}.${ext}`
      const up = await admin.storage.from('covers').upload(path, img.data, { contentType: img.mime })
      if (up.error) return json({ error: up.error.message }, 500)
      const url = admin.storage.from('covers').getPublicUrl(path).data.publicUrl
      await sb.from('deals').update({ cover_url: url }).eq('id', deal.id)
      return json({ cover_url: url })
    }

    // ---- scan ----
    const files = await listFolder(token, m[1])
    const grouped = files.map((f) => ({ id: f.id, name: f.name, path: f.path, mime: f.mimeType, kind: kindOf(f), size: Number(f.size || 0), modified: f.modifiedTime, link: f.webViewLink, thumb: f.thumbnailLink }))
    const photos = grouped.filter((f) => f.kind === 'foto').sort((a, b) => a.name.localeCompare(b.name, 'cs', { numeric: true }))

    // Dokumenty k vytěžení: podle priority (LV, zprostředkovatelská, kupní, rezervační, odhad…), max 6 a 30 MB
    const prio = (f: DFile): number => {
      const n = (f.path + f.name).toLowerCase()
      if (!(f.mimeType === 'application/pdf' || f.mimeType.startsWith('application/vnd.google-apps.document') || f.mimeType === 'text/plain')) return 0
      if (/předáv|predav|změna zákazn|zmena zakazn|zmena zákazn|nájemn|najemn|plná moc|plna moc|aml|záznamový|pozp|kvitance|předpis|zálohy|vyúčtov/.test(n)) return 0
      if (kindOf(f) === 'lv') return 10
      if (/zprost/.test(n)) return 9
      if (/kupn/.test(n)) return 8
      if (/rezerva/.test(n)) return 7
      if (/odhad|nacen/.test(n)) return 6
      if (/smlouv/.test(n)) return 4
      if (/cena|nabídk|nabidk/.test(n)) return 3
      return 0
    }
    const seen = new Set<string>()
    const docs = files.map((f) => ({ f, p: prio(f) })).filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p || (a.f.mimeType === 'application/pdf' ? -1 : 1))
      .filter(({ f }) => { const k = f.name.replace(/\.(pdf|docx?)$/i, '').toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
      .map((x) => x.f).slice(0, 6)
    let budget = 30_000_000
    const parts: unknown[] = [{ text: `Jsi asistent realitního makléře. Ze souborů ve složce obchodu „${deal.title}“ vytěž údaje o nemovitosti a vlastnících (prodávajících). Do owners uveď VŠECHNY vlastníky a spoluvlastníky ze všech listů vlastnictví, každou osobu jako samostatnou položku. Když je nemovitost ve společném jmění manželů (SJM), uveď OBA manžele zvlášť. Tituly do jména nedávej. Kontakty (telefon, e-mail, adresa bydliště) doplň ze smluv, když tam jsou; zip je jen 5 číslic nebo null. Ceny uváděj v Kč jako čísla. Rodná čísla ani čísla dokladů NEUVÁDĚJ. Když údaj v dokumentech není, vrať null. Názvy souborů: ${docs.map((d) => d.name).join(', ') || '(žádné dokumenty k vytěžení)'}` }]
    let used = 0; const usedNames: string[] = []
    for (const d of docs) {
      if (Number(d.size || 0) > budget) continue
      const c = await download(token, d)
      if (!c) continue
      budget -= c.data.length; used++; usedNames.push(d.name)
      if (c.mime.startsWith('text/')) parts.push({ text: `\n\n=== ${d.name} ===\n` + new TextDecoder().decode(c.data).slice(0, 60_000) })
      else parts.push({ text: `\n\n=== ${d.name} ===` }, { inline_data: { mime_type: c.mime, data: b64(c.data) } })
    }
    let proposal: Record<string, unknown> = { owners: [], summary: used ? '' : 'Ve složce nejsou dokumenty, ze kterých by šlo vytěžit údaje (list vlastnictví, smlouvy).' }
    if (used) proposal = await extract(parts)

    const existing = new Set(((deal as any).deal_contacts || []).map((x: any) => `${x.contacts?.first_name || ''} ${x.contacts?.last_name || ''}`.trim().toLowerCase()))
    const clean = (v: unknown, re: RegExp, max = 80) => { const t = String(v ?? '').trim(); return t && re.test(t) && t.length <= max ? t : null }
    const owners = ((proposal.owners as any[]) || []).filter((o) => o && o.last_name).map((o) => ({
      first_name: clean(o.first_name, /^[\p{L}\s.'-]+$/u, 60), last_name: String(o.last_name).trim().slice(0, 60),
      phone: clean(o.phone, /^[+\d\s]{9,20}$/), email: clean(o.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/),
      street: clean(o.street, /./), city: clean(o.city, /^[\p{L}\d\s.,'-]+$/u), zip: clean(String(o.zip ?? '').replace(/\s/g, ''), /^\d{5}$/),
      exists: existing.has(`${o.first_name || ''} ${o.last_name || ''}`.trim().toLowerCase()),
    }))

    const result = {
      scanned_at: new Date().toISOString(),
      files: grouped, photos: photos.slice(0, 12), docs_used: usedNames,
      proposal: { ...proposal, owners },
      counts: { total: grouped.length, photos: photos.length, docs: grouped.filter((f) => f.kind !== 'foto').length },
    }
    await sb.from('deals').update({ drive_scan: result, drive_scanned_at: result.scanned_at }).eq('id', deal.id)
    return json(result)
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
