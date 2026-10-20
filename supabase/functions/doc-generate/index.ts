// Dokumenty jedním klepnutím: vysází smlouvu / plnou moc / protokol do hlavičkového papíru,
// uloží .docx do Supabase Storage (bucket files) a jako Google Dokument do složky klienta na Disku.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildDocx } from './docx.ts'
import { BUILDERS, KIND_META, type DocInput, type DocKind } from './content.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// ---------- Google servisní účet → access token (zápis na Disk) ----------
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
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
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

type GFile = { id: string; name: string; mimeType: string; webViewLink?: string }
async function listChildren(token: string, folderId: string): Promise<GFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,webViewLink)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) {
    if (r.status === 404 || r.status === 403) throw new Error('Složka obchodu na Disku není servisnímu účtu dostupná.')
    throw new Error('Drive: ' + (await r.text()).slice(0, 200))
  }
  return (await r.json()).files || []
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
async function uploadToDrive(token: string, parentId: string, name: string, bytes: Uint8Array): Promise<GFile> {
  const boundary = 'crm' + crypto.randomUUID().replace(/-/g, '')
  const meta = JSON.stringify({ name, parents: [parentId], mimeType: 'application/vnd.google-apps.document' })
  const enc = new TextEncoder()
  const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${DOCX}\r\n\r\n`)
  const tail = enc.encode(`\r\n--${boundary}--`)
  const body = new Uint8Array(head.length + bytes.length + tail.length)
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length)
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,webViewLink', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
  if (!r.ok) {
    const t = await r.text()
    if (r.status === 403) throw new Error('Servisní účet nemá právo zapisovat do složky klienta. Ve sdílení složky KLIENTI nastavte účtu crm-disk@… roli „Správce obsahu“.')
    throw new Error('Drive upload: ' + t.slice(0, 300))
  }
  return await r.json()
}

// Hlavičkový papír (docx) se bere z webu CRM: public/templates/hlavickovy-papir.docx
let cachedTemplate: Uint8Array | null = null
async function template(): Promise<Uint8Array> {
  if (cachedTemplate) return cachedTemplate
  const url = Deno.env.get('DOC_TEMPLATE_URL') || 'https://crm.martintesarek.cz/templates/hlavickovy-papir.docx'
  const r = await fetch(url)
  if (!r.ok) throw new Error('Nepodařilo se načíst hlavičkový papír (' + r.status + ').')
  cachedTemplate = new Uint8Array(await r.arrayBuffer())
  return cachedTemplate
}

const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { deal_id, input, save_drive = true } = (await req.json()) as { deal_id: string; input: DocInput; save_drive?: boolean }
    const kind = input?.kind as DocKind
    if (!deal_id || !kind || !BUILDERS[kind]) return json({ error: 'Chybí obchod nebo typ dokumentu.' }, 400)

    const auth = req.headers.get('Authorization') || ''
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: user } = await sb.auth.getUser()
    const { data: deal, error } = await sb.from('deals').select('id, account_id, title, address, drive_folder_url').eq('id', deal_id).single()
    if (error || !deal) return json({ error: 'Obchod nenalezen.' }, 404)

    // 1) sazba
    const spec = BUILDERS[kind](input)
    const bytes = buildDocx(spec, await template())
    const specText = JSON.stringify(spec)
    const missing = Array.from(new Set(Array.from(specText.matchAll(/\[\[(?:DOPLNIT|OVĚŘIT): ([^\]]+)\]\]/g)).map((m) => m[1])))
    const label = sanitize(input.propertyLabel || deal.address || deal.title || 'dokument')
    const baseName = `${KIND_META[kind].title} – ${label}`

    // 2) Supabase Storage (vždy – záloha + stažení)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const docId = crypto.randomUUID()
    const storagePath = `${deal.account_id}/docs/${docId}.docx`
    const up = await admin.storage.from('files').upload(storagePath, bytes, { contentType: DOCX, upsert: false })
    if (up.error) throw new Error('Uložení souboru: ' + up.error.message)

    // 3) Google Disk – složka obchodu → podsložka podle typu (RS, ZS, Plná moc, Předávací protokol)
    let drive: { id?: string; url?: string; folder?: string; error?: string } = {}
    const folderId = String(deal.drive_folder_url || '').match(/folders\/([A-Za-z0-9_-]+)/)?.[1]
    if (save_drive && folderId) {
      try {
        const token = await driveToken()
        const kids = await listChildren(token, folderId)
        const sub = kids.find((f) => f.mimeType === 'application/vnd.google-apps.folder' && KIND_META[kind].folder.test(f.name.trim()))
        const targetId = sub?.id || folderId
        const siblings = sub ? await listChildren(token, sub.id) : kids
        let name = baseName
        let n = 2
        while (siblings.some((f) => f.name === name)) name = `${baseName} v${n++}`
        const g = await uploadToDrive(token, targetId, name, bytes)
        drive = { id: g.id, url: g.webViewLink || `https://docs.google.com/document/d/${g.id}/edit`, folder: sub?.name || 'složka obchodu' }
      } catch (e) { drive = { error: (e as Error).message } }
    } else if (save_drive && !folderId) drive = { error: 'Obchod nemá přiřazenou složku na Disku.' }

    // 4) záznam
    const row = { id: docId, account_id: deal.account_id, deal_id: deal.id, kind, title: KIND_META[kind].title, file_name: baseName + '.docx', storage_path: storagePath, drive_file_id: drive.id || null, drive_url: drive.url || null, drive_folder_name: drive.folder || null, input, missing, created_by: user?.user?.id || null }
    const ins = await admin.from('documents').insert(row)
    if (ins.error) throw new Error('Záznam dokumentu: ' + ins.error.message)
    const signed = await admin.storage.from('files').createSignedUrl(storagePath, 60 * 60 * 24 * 7, { download: baseName + '.docx' })
    await admin.from('activities').insert({ account_id: deal.account_id, deal_id: deal.id, type: 'system', body: `Vytvořen dokument: ${baseName}${drive.url ? ` (Disk: ${drive.folder})` : ''}${missing.length ? ` · k doplnění: ${missing.length}` : ''}` })

    return json({ document: { ...row, download_url: signed.data?.signedUrl || null }, drive_error: drive.error || null })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
