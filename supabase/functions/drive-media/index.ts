// Fotky a videa ke inzerátu: načte obrázky ze složky klienta „FOTKY – PROFI FOTKY“ a videa ze složky s videem.
// Nic nezapisuje ani nekopíruje – vrací seznam s náhledy, výběr dělá Martin v náborovém formuláři.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const b64url = (buf: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : new Uint8Array(buf)
  let s = ''; for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function driveToken(): Promise<string> {
  const raw = Deno.env.get('GOOGLE_SA_KEY')
  if (!raw) throw new Error('Chybí GOOGLE_SA_KEY (klíč servisního účtu).')
  const sa = JSON.parse(raw)
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const pem = String(sa.private_key).replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`))
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claim}.${b64url(sig)}` })
  if (!r.ok) throw new Error('Google token: ' + (await r.text()).slice(0, 200))
  return (await r.json()).access_token
}
async function rl(uid: string, bucket: string, max: number, seconds: number): Promise<boolean> {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await admin.rpc('rate_check', { p_uid: uid, p_bucket: bucket, p_max: max, p_seconds: seconds })
    return error ? true : data !== false
  } catch { return true }
}

const plain = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
type DFile = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string; thumbnailLink?: string }
const isFolder = (f: DFile) => f.mimeType === 'application/vnd.google-apps.folder'

async function children(token: string, folderId: string): Promise<DFile[]> {
  const out: DFile[] = []
  let page = ''
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? '&pageToken=' + page : ''}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) throw new Error('Složka na Disku není servisnímu účtu dostupná (' + r.status + ').')
    const d = await r.json()
    out.push(...(d.files || []))
    page = d.nextPageToken || ''
  } while (page)
  return out
}
// obrázky ve složce a v jejích podsložkách (do hloubky 2)
async function collect(token: string, folderId: string, depth: number, pick: (f: DFile) => boolean): Promise<DFile[]> {
  const items = await children(token, folderId)
  const out = items.filter((f) => !isFolder(f) && pick(f))
  if (depth > 0) for (const s of items.filter(isFolder)) out.push(...await collect(token, s.id, depth - 1, pick))
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { deal_id } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(user.id, 'drive-media', 40, 3600))) return json({ error: 'Příliš mnoho požadavků, zkuste to prosím za chvíli.' }, 429)
    const { data: deal, error } = await sb.from('deals').select('id, drive_folder_url').eq('id', deal_id).single()
    if (error || !deal) return json({ error: 'Obchod nenalezen nebo k němu nemáte přístup.' }, 403)
    const m = String(deal.drive_folder_url || '').match(/folders\/([A-Za-z0-9_-]+)/)
    if (!m) return json({ error: 'Obchod nemá přiřazenou složku na Disku. Vložte odkaz na složku klienta v detailu obchodu.' }, 400)

    const token = await driveToken()
    const top = await children(token, m[1])
    const folders = top.filter(isFolder)
    const photoFolders = folders.filter((f) => { const n = plain(f.name); return n.includes('fotk') && (n.includes('profi') || !folders.some((x) => plain(x.name).includes('fotk') && plain(x.name).includes('profi'))) })
    const videoFolders = folders.filter((f) => plain(f.name).includes('video'))
    const isImg = (f: DFile) => f.mimeType.startsWith('image/') && !/heic|heif/.test(f.mimeType)
    const isVid = (f: DFile) => f.mimeType.startsWith('video/')
    const photosRaw: DFile[] = []
    for (const f of photoFolders) photosRaw.push(...await collect(token, f.id, 1, isImg))
    const videosRaw: DFile[] = []
    for (const f of videoFolders) videosRaw.push(...await collect(token, f.id, 1, isVid))
    // videa mohou být i ve složce s fotkami
    for (const f of photoFolders) videosRaw.push(...await collect(token, f.id, 1, isVid))

    photosRaw.sort((a, b) => a.name.localeCompare(b.name, 'cs', { numeric: true }))
    const list = photosRaw.slice(0, 80)
    const thumbs: Record<string, string> = {}
    let next = 0
    const worker = async () => {
      while (next < list.length) {
        const f = list[next++]
        if (!f.thumbnailLink) continue
        try {
          const r = await fetch(f.thumbnailLink.replace(/=s\d+$/, '=s360'), { headers: { Authorization: `Bearer ${token}` } })
          if (!r.ok) continue
          const buf = new Uint8Array(await r.arrayBuffer())
          let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
          thumbs[f.id] = `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${btoa(s)}`
        } catch { /* náhled se jen nezobrazí */ }
      }
    }
    await Promise.all(Array.from({ length: 8 }, worker))

    return json({
      ok: true,
      folders: { photos: photoFolders.map((f) => f.name), videos: videoFolders.map((f) => f.name) },
      photos: list.map((f) => ({ id: f.id, name: f.name, thumb: thumbs[f.id] || null })),
      photos_total: photosRaw.length,
      videos: videosRaw.map((f) => ({ id: f.id, name: f.name, size: f.size ? Number(f.size) : null, link: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view` })),
    })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
