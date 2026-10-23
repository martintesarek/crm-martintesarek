// Elektronický podpis smluv (ZS, RS) přímo v CRM.
// Martin (JWT): docs, prepare, pdf, send, list, cancel.  Podepisující (token z SMS): view, otp, sign.
// Podpis = SMS kód + podpis prstem + potvrzení (ID, čas, IP, prohlížeč, otisk dokumentu). Prostý elektronický podpis.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
class Err extends Error { status: number; constructor(m: string, s = 400) { super(m); this.status = s } }

const SITE = 'https://crm.martintesarek.cz'
const BOX_W = 0.28 // šířka podpisového pole jako zlomek šířky stránky (poměr 3 : 1)
const plain = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const normPhone = (s: string) => { let p = String(s || '').replace(/[\s()-]/g, ''); if (/^0?[1-9]\d{8}$/.test(p)) p = '+420' + p.replace(/^0/, ''); if (/^00/.test(p)) p = '+' + p.slice(2); if (/^420\d{9}$/.test(p)) p = '+' + p; return p }
const maskPhone = (p: string) => p.length > 6 ? p.slice(0, 4) + ' ••• •• ' + p.slice(-2) : p

const b64url = (buf: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : new Uint8Array(buf)
  let s = ''; for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const toB64 = (a: Uint8Array) => { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s) }
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const sha256 = async (d: Uint8Array | string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof d === 'string' ? new TextEncoder().encode(d) : d))).map((x) => x.toString(16).padStart(2, '0')).join('')
const randToken = () => b64url(crypto.getRandomValues(new Uint8Array(24)))

async function googleToken(): Promise<string> {
  const raw = Deno.env.get('GOOGLE_SA_KEY')
  if (!raw) throw new Error('Chybí GOOGLE_SA_KEY (klíč servisního účtu).')
  const sa = JSON.parse(raw)
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const pem = String(sa.private_key).replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`))
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claim}.${b64url(sig)}` })
  if (!r.ok) throw new Error('Google token: ' + (await r.text()).slice(0, 200))
  return (await r.json()).access_token
}
type DFile = { id: string; name: string; mimeType: string; modifiedTime?: string; parents?: string[] }
const GDOC = 'application/vnd.google-apps.document'
async function children(token: string, folderId: string): Promise<DFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error('Složka na Disku není servisnímu účtu dostupná (' + r.status + ').')
  return (await r.json()).files || []
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any
async function smsToken() {
  const id = Deno.env.get('GOSMS_CLIENT_ID'), secret = Deno.env.get('GOSMS_CLIENT_SECRET')
  if (!id || !secret) throw new Error('Chybí GOSMS_CLIENT_ID / GOSMS_CLIENT_SECRET.')
  const tr = await fetch('https://app.gosms.cz/oauth/v2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials` })
  if (!tr.ok) throw new Error('GoSMS přihlášení: ' + (await tr.text()).slice(0, 200))
  return (await tr.json()).access_token as string
}
async function sendSms(admin: Admin, accountId: string, phone: string, message: string) {
  const { data: acc } = await admin.from('accounts').select('settings').eq('id', accountId).single()
  const channel = String((acc?.settings as Record<string, { channel?: string }> | null)?.nameday_sms?.channel || '350324')
  const t = await smsToken()
  const r = await fetch('https://app.gosms.cz/api/v1/messages/', { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, recipients: [phone], channel: Number(channel) }) })
  if (!r.ok) throw new Error('GoSMS: ' + (await r.text()).slice(0, 200))
}
async function rl(admin: Admin, uid: string, bucket: string, max: number, seconds: number) {
  const { data, error } = await admin.rpc('rate_check', { p_uid: uid, p_bucket: bucket, p_max: max, p_seconds: seconds })
  if (!error && data === false) throw new Err('Příliš mnoho pokusů, zkuste to prosím za chvíli.', 429)
}

async function loadBytes(admin: Admin, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from('files').download(path)
  if (error || !data) throw new Error('Soubor se nepodařilo načíst.')
  return new Uint8Array(await data.arrayBuffer())
}
async function saveBytes(admin: Admin, path: string, bytes: Uint8Array, type: string) {
  const { error } = await admin.storage.from('files').upload(path, bytes, { contentType: type, upsert: true })
  if (error) throw new Error('Uložení souboru: ' + error.message)
}

// Písmo s češtinou (Noto Sans); když se nepodaří stáhnout, použije se Helvetica bez háčků.
let fontCache: { reg: Uint8Array; bold: Uint8Array } | null = null
async function fonts(pdf: PDFDocument) {
  try {
    if (!fontCache) {
      const base = 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSans/hinted/ttf/'
      const [a, b] = await Promise.all([fetch(base + 'NotoSans-Regular.ttf'), fetch(base + 'NotoSans-Bold.ttf')])
      if (!a.ok || !b.ok) throw new Error('font')
      fontCache = { reg: new Uint8Array(await a.arrayBuffer()), bold: new Uint8Array(await b.arrayBuffer()) }
    }
    pdf.registerFontkit(fontkit)
    return { reg: await pdf.embedFont(fontCache.reg, { subset: true }), bold: await pdf.embedFont(fontCache.bold, { subset: true }), t: (s: string) => s }
  } catch {
    return { reg: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold), t: strip }
  }
}
const pragueTime = (d: Date) => d.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

type Place = { page: number; x: number; y: number }
type SignerRow = { id: string; name: string; phone: string; token: string; placements: Place[]; status: string; otp_hash: string | null; otp_sent_at: string | null; otp_attempts: number; signed_at: string | null; ip: string | null; ua: string | null }
type ReqRow = { id: string; account_id: string; deal_id: string | null; title: string; folder_id: string | null; doc_path: string; doc_sha256: string; work_path: string | null; work_ver: number; signed_path: string | null; status: string; created_at: string }

async function stamp(pdfBytes: Uint8Array, sigPng: Uint8Array, places: Place[], name: string, when: Date) {
  const pdf = await PDFDocument.load(pdfBytes)
  const f = await fonts(pdf)
  const img = await pdf.embedPng(sigPng)
  const pages = pdf.getPages()
  for (const p of places) {
    const pg = pages[p.page]; if (!pg) continue
    const { width: W, height: H } = pg.getSize()
    const bw = W * BOX_W, bh = bw / 3
    const bx = Math.min(Math.max(p.x * W, 0), W - bw)
    const by = H - Math.min(Math.max(p.y * H, 0), H - bh) - bh
    const sc = Math.min(bw / img.width, (bh * 0.8) / img.height)
    const iw = img.width * sc, ih = img.height * sc
    pg.drawImage(img, { x: bx + (bw - iw) / 2, y: by + bh * 0.2 + (bh * 0.8 - ih) / 2, width: iw, height: ih })
    pg.drawText(f.t(`Elektronicky podepsáno: ${name}, ${pragueTime(when)}`), { x: bx, y: by + 1, size: 5.5, font: f.reg, color: rgb(0.35, 0.35, 0.35), maxWidth: bw * 1.6 })
  }
  return await pdf.save()
}

async function certificate(pdfBytes: Uint8Array, r: ReqRow, signers: SignerRow[]) {
  const pdf = await PDFDocument.load(pdfBytes)
  const f = await fonts(pdf)
  const navy = rgb(0.145, 0.2, 0.443)
  let page = pdf.addPage([595.28, 841.89])
  const M = 50, W = 595.28 - 2 * M
  let y = 841.89 - 60
  const line = (txt: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = o.size ?? 9.5, font = o.bold ? f.bold : f.reg
    const words = f.t(txt).split(/\s+/); let cur = ''
    const out: string[] = []
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (font.widthOfTextAtSize(t, size) > W && cur) { out.push(cur); cur = w } else cur = t }
    if (cur) out.push(cur)
    for (const l of out) { if (y < 60) { page = pdf.addPage([595.28, 841.89]); y = 841.89 - 60 } page.drawText(l, { x: M, y, size, font, color: o.color ?? rgb(0.1, 0.1, 0.1) }); y -= size * 1.5 }
    y -= o.gap ?? 0
  }
  line('POTVRZENÍ O ELEKTRONICKÉM PODPISU', { size: 16, bold: true, color: navy, gap: 8 })
  line(`Dokument: ${r.title}`, { bold: true })
  line(`Číslo žádosti: ${r.id}`)
  line(`Otisk (SHA-256) původního dokumentu: ${r.doc_sha256}`, { gap: 10 })
  line('Podepsáno prostřednictvím CRM Martin Tesárek (crm.martintesarek.cz). Podepisující si dokument zobrazil, ověřil se jednorázovým kódem zaslaným SMS na své telefonní číslo, potvrdil souhlas s podpisem v elektronické podobě a podepsal se prstem na displeji. Jde o prostý elektronický podpis.', { gap: 10 })
  signers.forEach((s, i) => {
    line(`${i + 1}. ${s.name}`, { bold: true, color: navy })
    line(`Telefon: ${maskPhone(s.phone)}`)
    line(`Podepsáno: ${s.signed_at ? pragueTime(new Date(s.signed_at)) : '—'}`)
    line(`IP adresa: ${s.ip || '—'}`)
    line(`Zařízení: ${(s.ua || '—').slice(0, 160)}`)
    line('Ověření: SMS kód + podpis na displeji', { gap: 8 })
  })
  line(`Potvrzení vytvořeno: ${pragueTime(new Date())}`, { size: 8.5, color: rgb(0.4, 0.4, 0.4) })
  return await pdf.save()
}

async function uploadToDrive(bytes: Uint8Array, folderId: string, name: string): Promise<string | null> {
  try {
    const token = await googleToken()
    const boundary = 'b' + crypto.randomUUID().replace(/-/g, '')
    const meta = JSON.stringify({ name, parents: [folderId], mimeType: 'application/pdf' })
    const enc = new TextEncoder()
    const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`)
    const tail = enc.encode(`\r\n--${boundary}--`)
    const body = new Uint8Array(head.length + bytes.length + tail.length)
    body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length)
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
    if (!r.ok) return null
    return (await r.json()).webViewLink || null
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const b = await req.json().catch(() => ({})) as Record<string, any>
    const action = String(b.action || '')
    const admin: Admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // ---------- Podepisující (bez přihlášení, ověřeno tokenem z SMS) ----------
    if (['view', 'otp', 'sign'].includes(action)) {
      const token = String(b.token || '')
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new Err('Neplatný odkaz.', 404)
      await rl(admin, token, 'sign-' + action, action === 'view' ? 120 : 12, 3600)
      const { data: s } = await admin.from('sign_signers').select('*').eq('token', token).maybeSingle()
      if (!s) throw new Err('Odkaz není platný nebo už vypršel.', 404)
      const { data: r } = await admin.from('sign_requests').select('*').eq('id', s.request_id).single()
      if (!r || r.status === 'cancelled' || r.status === 'draft') throw new Err('Tento dokument už není k podpisu.', 410)
      const signer = s as SignerRow, request = r as ReqRow

      if (action === 'view') {
        const path = request.status === 'completed' && request.signed_path ? request.signed_path : (request.work_path || request.doc_path)
        const { data: acc } = await admin.from('accounts').select('settings').eq('id', request.account_id).single()
        const broker = (acc?.settings as Record<string, any> | null)?.broker_name || 'Martin Tesárek'
        return json({ title: request.title, broker, signer: { name: signer.name, status: signer.status, placements: signer.placements, phone: maskPhone(signer.phone) }, completed: request.status === 'completed', pdf: toB64(await loadBytes(admin, path)) })
      }
      if (signer.status === 'signed') throw new Err('Tento dokument jste už podepsal(a).')

      if (action === 'otp') {
        if (signer.otp_sent_at && Date.now() - new Date(signer.otp_sent_at).getTime() < 30000) throw new Err('Kód byl právě odeslán, počkejte prosím půl minuty.', 429)
        const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000))
        await admin.from('sign_signers').update({ otp_hash: await sha256(code + token), otp_sent_at: new Date().toISOString(), otp_attempts: 0 }).eq('id', signer.id)
        await sendSms(admin, request.account_id, normPhone(signer.phone), `Kód pro podpis dokumentu: ${code}. Platí 10 minut, nikomu ho nesdělujte.`)
        return json({ ok: true, phone: maskPhone(signer.phone) })
      }

      // sign
      if (b.consent !== true) throw new Err('Je potřeba potvrdit souhlas s podpisem.')
      if (!signer.otp_hash || !signer.otp_sent_at) throw new Err('Nejdřív si nechte poslat SMS kód.')
      if (Date.now() - new Date(signer.otp_sent_at).getTime() > 10 * 60000) throw new Err('Kód vypršel, nechte si poslat nový.')
      if (signer.otp_attempts >= 5) throw new Err('Příliš mnoho nesprávných pokusů, nechte si poslat nový kód.', 429)
      if ((await sha256(String(b.code || '').trim() + token)) !== signer.otp_hash) {
        await admin.from('sign_signers').update({ otp_attempts: signer.otp_attempts + 1 }).eq('id', signer.id)
        throw new Err('Kód nesouhlasí.')
      }
      const m = String(b.signature || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)
      if (!m || m[1].length > 600000) throw new Err('Podpis chybí nebo je příliš velký.')
      const sigPng = fromB64(m[1])
      const when = new Date()
      const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '').split(',')[0].trim() || null
      const ua = (req.headers.get('user-agent') || '').slice(0, 300) || null

      // razítkování s ochranou proti souběžnému podpisu více lidí
      let cur = request
      for (let i = 0; i < 4; i++) {
        const base = await loadBytes(admin, cur.work_path || cur.doc_path)
        const out = await stamp(base, sigPng, signer.placements, signer.name, when)
        const wp = `${request.account_id}/sign/${request.id}/work-${cur.work_ver + 1}.pdf`
        await saveBytes(admin, wp, out, 'application/pdf')
        const { data: up } = await admin.from('sign_requests').update({ work_path: wp, work_ver: cur.work_ver + 1 }).eq('id', request.id).eq('work_ver', cur.work_ver).select('*')
        if (up && up.length) { cur = up[0] as ReqRow; break }
        const { data: fresh } = await admin.from('sign_requests').select('*').eq('id', request.id).single()
        cur = fresh as ReqRow
        if (i === 3) throw new Err('Podpis se nepodařilo uložit, zkuste to prosím znovu.', 409)
      }
      const sigPath = `${request.account_id}/sign/${request.id}/sig-${signer.id}.png`
      await saveBytes(admin, sigPath, sigPng, 'image/png')
      await admin.from('sign_signers').update({ status: 'signed', signed_at: when.toISOString(), ip, ua, signature_path: sigPath, otp_hash: null }).eq('id', signer.id)

      const { data: all } = await admin.from('sign_signers').select('*').eq('request_id', request.id).order('created_at')
      const rows = (all || []) as SignerRow[]
      let completed = false, driveUrl: string | null = null
      if (rows.every((x) => x.status === 'signed')) {
        const final = await certificate(await loadBytes(admin, cur.work_path!), request, rows)
        const sp = `${request.account_id}/sign/${request.id}/podepsano.pdf`
        await saveBytes(admin, sp, final, 'application/pdf')
        if (request.folder_id) driveUrl = await uploadToDrive(final, request.folder_id, `${request.title} – podepsáno.pdf`)
        await admin.from('sign_requests').update({ status: 'completed', completed_at: new Date().toISOString(), signed_path: sp, drive_url: driveUrl }).eq('id', request.id)
        completed = true
      }
      return json({ ok: true, completed })
    }

    // ---------- Martin (přihlášený) ----------
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: u } = await sb.auth.getUser()
    if (!u?.user) throw new Err('Nepřihlášen.', 401)
    const { data: m } = await sb.from('memberships').select('account_id, role').eq('user_id', u.user.id).limit(1).single()
    if (!m || !['owner', 'admin'].includes(String(m.role))) throw new Err('Podpisy může spouštět jen administrátor.', 403)
    const accountId = String(m.account_id)
    const ownReq = async (id: string) => {
      const { data } = await admin.from('sign_requests').select('*').eq('id', id).eq('account_id', accountId).maybeSingle()
      if (!data) throw new Err('Žádost o podpis nenalezena.', 404)
      return data as ReqRow
    }

    if (action === 'docs') {
      const { data: deal } = await sb.from('deals').select('id, drive_folder_url').eq('id', b.deal_id).single()
      const fid = String(deal?.drive_folder_url || '').match(/folders\/([A-Za-z0-9_-]+)/)?.[1]
      if (!fid) throw new Err('U obchodu není propojená složka klienta na Disku.')
      const token = await googleToken()
      const top = await children(token, fid)
      const out: { id: string; name: string; kind: string; modified?: string }[] = []
      for (const kind of ['ZS', 'RS']) {
        const folder = top.find((f) => f.mimeType === 'application/vnd.google-apps.folder' && new RegExp('^\\s*' + kind.toLowerCase() + '\\b').test(plain(f.name)))
        if (!folder) continue
        for (const f of await children(token, folder.id)) if (f.mimeType === GDOC || f.mimeType === 'application/pdf') out.push({ id: f.id, name: f.name, kind, modified: f.modifiedTime })
      }
      out.sort((a, c) => String(c.modified).localeCompare(String(a.modified)))
      return json({ files: out })
    }

    if (action === 'prepare') {
      const { data: deal } = await sb.from('deals').select('id').eq('id', b.deal_id).single()
      if (!deal) throw new Err('Obchod nenalezen.', 404)
      await rl(admin, u.user.id, 'sign-prepare', 40, 3600)
      const token = await googleToken()
      const fileId = String(b.file_id || '')
      const mr = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,parents&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
      if (!mr.ok) throw new Err('Soubor na Disku se nepodařilo najít.')
      const meta = await mr.json() as DFile
      const url = meta.mimeType === GDOC
        ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application%2Fpdf`
        : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
      if (meta.mimeType !== GDOC && meta.mimeType !== 'application/pdf') throw new Err('K podpisu jde použít jen Google Dokument nebo PDF.')
      const dr = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!dr.ok) throw new Err('Dokument se nepodařilo stáhnout z Disku (' + dr.status + ').')
      const bytes = new Uint8Array(await dr.arrayBuffer())
      if (bytes.length > 15e6) throw new Err('Dokument je příliš velký.')
      const pdf = await PDFDocument.load(bytes)
      const id = crypto.randomUUID()
      const path = `${accountId}/sign/${id}/original.pdf`
      await saveBytes(admin, path, bytes, 'application/pdf')
      const title = meta.name.replace(/\.pdf$/i, '')
      const { error } = await admin.from('sign_requests').insert({ id, account_id: accountId, deal_id: b.deal_id, title, source_file_id: fileId, folder_id: meta.parents?.[0] || null, doc_path: path, doc_sha256: await sha256(bytes), page_count: pdf.getPageCount(), created_by: u.user.id })
      if (error) throw new Error(error.message)
      return json({ request_id: id, title, page_count: pdf.getPageCount(), pdf: toB64(bytes) })
    }

    if (action === 'pdf') {
      const r = await ownReq(String(b.request_id))
      const path = r.status === 'completed' && r.signed_path ? r.signed_path : (r.work_path || r.doc_path)
      return json({ title: r.title, completed: r.status === 'completed', pdf: toB64(await loadBytes(admin, path)) })
    }

    if (action === 'send') {
      const r = await ownReq(String(b.request_id))
      if (r.status !== 'draft') throw new Err('Tahle žádost už byla odeslána.')
      const sms = String(b.sms_text || '').trim()
      if (!sms.includes('{odkaz}') || sms.length > 300) throw new Err('Text SMS musí obsahovat {odkaz} a být kratší než 300 znaků.')
      const list = (Array.isArray(b.signers) ? b.signers : []) as { name: string; phone: string; placements: Place[] }[]
      if (!list.length || list.length > 6) throw new Err('Přidejte aspoň jednoho podepisujícího.')
      await rl(admin, u.user.id, 'sign-send', 20, 3600)
      const rows = list.map((s) => {
        const phone = normPhone(s.phone)
        if (!s.name?.trim()) throw new Err('Chybí jméno podepisujícího.')
        if (!/^\+\d{9,14}$/.test(phone)) throw new Err(`Neplatný telefon u: ${s.name}.`)
        const pl = (s.placements || []).filter((p) => Number.isInteger(p.page) && p.page >= 0 && p.page < (r as any).page_count && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)
        if (!pl.length) throw new Err(`U ${s.name} není umístěný žádný podpis.`)
        return { request_id: r.id, name: s.name.trim(), phone, token: randToken(), placements: pl }
      })
      await admin.from('sign_signers').delete().eq('request_id', r.id)
      const { error } = await admin.from('sign_signers').insert(rows)
      if (error) throw new Error(error.message)
      await admin.from('sign_requests').update({ status: 'sent', sms_text: sms }).eq('id', r.id)
      const failed: string[] = []
      for (const s of rows) {
        try { await sendSms(admin, accountId, s.phone, sms.replace('{odkaz}', `${SITE}/podpis/${s.token}`)) } catch { failed.push(s.name) }
      }
      return json({ ok: true, failed })
    }

    if (action === 'list') {
      const { data } = await admin.from('sign_requests').select('id, title, status, created_at, completed_at, drive_url, sign_signers(id, name, status, signed_at)').eq('account_id', accountId).eq('deal_id', b.deal_id).neq('status', 'draft').order('created_at', { ascending: false })
      return json({ requests: data || [] })
    }

    if (action === 'cancel') {
      const r = await ownReq(String(b.request_id))
      if (r.status === 'completed') throw new Err('Podepsaný dokument už nejde zrušit.')
      await admin.from('sign_requests').update({ status: 'cancelled' }).eq('id', r.id)
      return json({ ok: true })
    }

    throw new Err('Neznámá akce.')
  } catch (e) {
    const status = e instanceof Err ? e.status : 500
    return json({ error: (e as Error).message }, status)
  }
})
