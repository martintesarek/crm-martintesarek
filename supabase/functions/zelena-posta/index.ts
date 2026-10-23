// Odeslání dopisu přes Zelenou poštu přímo z CRM (API gateway.zelenaposta.cz, stejný postup jako scénáře v Make).
// Martin (JWT, admin): docs {deal_id}, send {deal_id, file_id, recipient{name,street,city,zip}, contact_id?}, list {deal_id|contact_id}, check.
// Secrets (vkládá Martin sám): ZELENAPOSTA_USER, ZELENAPOSTA_PASS; volitelně ZELENAPOSTA_PRODUCT (výchozí dopis z Make).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
class Err extends Error { status: number; constructor(m: string, s = 400) { super(m); this.status = s } }

const API = 'https://gateway.zelenaposta.cz/api/2/sent'
const DEFAULT_PRODUCT = 'KWCZ_CZ_Z2TRA4SFBDOOC5'
const GDOC = 'application/vnd.google-apps.document'
const FOLDER = 'application/vnd.google-apps.folder'

const b64url = (buf: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : new Uint8Array(buf)
  let s = ''; for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const toB64 = (a: Uint8Array) => { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s) }

async function googleToken(): Promise<string> {
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
type DFile = { id: string; name: string; mimeType: string; modifiedTime?: string }
async function children(token: string, folderId: string): Promise<DFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error('Složka na Disku není servisnímu účtu dostupná (' + r.status + ').')
  return (await r.json()).files || []
}

function zpAuth() {
  const u = Deno.env.get('ZELENAPOSTA_USER'), p = Deno.env.get('ZELENAPOSTA_PASS')
  if (!u || !p) throw new Err('Chybí přístup k Zelené poště. Vložte secrets ZELENAPOSTA_USER a ZELENAPOSTA_PASS (Supabase → Edge Functions → Secrets).', 409)
  return 'Basic ' + btoa(unescape(encodeURIComponent(u + ':' + p)))
}
async function rl(admin: any, uid: string, bucket: string, max: number, seconds: number) {
  const { data, error } = await admin.rpc('rate_check', { p_uid: uid, p_bucket: bucket, p_max: max, p_seconds: seconds })
  if (!error && data === false) throw new Err('Příliš mnoho pokusů, zkuste to prosím za chvíli.', 429)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const b = await req.json().catch(() => ({})) as Record<string, any>
    const action = String(b.action || '')
    const admin: any = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: u } = await sb.auth.getUser()
    if (!u?.user) throw new Err('Nepřihlášen.', 401)
    const { data: m } = await sb.from('memberships').select('account_id, role').eq('user_id', u.user.id).limit(1).single()
    if (!m || !['owner', 'admin'].includes(String(m.role))) throw new Err('Dopisy může odesílat jen administrátor.', 403)
    const accountId = String(m.account_id)

    if (action === 'check') {
      const r = await fetch(`${API}/getMailings?distributedSince=${new Date().toISOString().slice(0, 10)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: zpAuth() }, body: '{}' })
      return json({ ok: r.ok, status: r.status, product: Deno.env.get('ZELENAPOSTA_PRODUCT') || DEFAULT_PRODUCT })
    }

    if (action === 'docs') {
      const { data: deal } = await sb.from('deals').select('id, drive_folder_url').eq('id', b.deal_id).single()
      const fid = String(deal?.drive_folder_url || '').match(/folders\/([A-Za-z0-9_-]+)/)?.[1]
      if (!fid) throw new Err('U obchodu není propojená složka klienta na Disku.')
      const token = await googleToken()
      const top = await children(token, fid)
      const out: { id: string; name: string; kind: string; modified?: string }[] = []
      const take = (list: DFile[], kind: string) => { for (const f of list) if (f.mimeType === GDOC || f.mimeType === 'application/pdf') out.push({ id: f.id, name: f.name, kind, modified: f.modifiedTime }) }
      take(top, 'Složka klienta')
      for (const folder of top.filter((f) => f.mimeType === FOLDER).slice(0, 25)) take(await children(token, folder.id), folder.name.trim())
      out.sort((a, c) => String(c.modified).localeCompare(String(a.modified)))
      return json({ files: out.slice(0, 150) })
    }

    if (action === 'list') {
      let q = admin.from('zp_mailings').select('id, title, recipient, price, status, error, created_at, deal_id, contact_id').eq('account_id', accountId).order('created_at', { ascending: false }).limit(50)
      if (b.deal_id) q = q.eq('deal_id', b.deal_id)
      else if (b.contact_id) q = q.eq('contact_id', b.contact_id)
      const { data } = await q
      return json({ mailings: data || [] })
    }

    if (action === 'send') {
      const rc = b.recipient || {}
      const recipient = { name: String(rc.name || '').trim(), street: String(rc.street || '').trim(), city: String(rc.city || '').trim(), zip: String(rc.zip || '').replace(/\s/g, ''), country: 'cz' }
      if (!recipient.name || !recipient.street || !recipient.city || !/^\d{5}$/.test(recipient.zip)) throw new Err('Doplňte celou adresu příjemce (jméno, ulice, město, PSČ o 5 číslicích).')
      const { data: deal } = await sb.from('deals').select('id').eq('id', b.deal_id).single()
      if (!deal) throw new Err('Obchod nenalezen.', 404)
      const contactId = b.contact_id ? String(b.contact_id) : null
      if (contactId) { const { data: c } = await sb.from('contacts').select('id').eq('id', contactId).maybeSingle(); if (!c) throw new Err('Kontakt nenalezen.', 404) }
      await rl(admin, u.user.id, 'zp-send', 20, 3600)
      const fileId = String(b.file_id || '')
      // ochrana proti dvojímu odeslání téhož dopisu stejnému příjemci
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { data: dup } = await admin.from('zp_mailings').select('id, recipient, file_name').eq('account_id', accountId).eq('deal_id', b.deal_id).eq('status', 'sent').gte('created_at', since)
      if ((dup || []).some((x: any) => x.recipient?.name === recipient.name && x.recipient?.street === recipient.street && x.file_name === String(b.file_name || ''))) throw new Err('Stejný dopis stejnému příjemci jste před chvílí odeslal. Pro jistotu ho znovu neposílám.', 409)

      const token = await googleToken()
      const mr = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
      if (!mr.ok) throw new Err('Soubor na Disku se nepodařilo najít.')
      const meta = await mr.json() as DFile
      if (meta.mimeType !== GDOC && meta.mimeType !== 'application/pdf') throw new Err('K odeslání jde použít jen Google Dokument nebo PDF.')
      const url = meta.mimeType === GDOC
        ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application%2Fpdf`
        : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
      const dr = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!dr.ok) throw new Err('Dokument se nepodařilo stáhnout z Disku (' + dr.status + ').')
      const bytes = new Uint8Array(await dr.arrayBuffer())
      if (bytes.length > 15e6) throw new Err('Dokument je příliš velký.')

      const product = Deno.env.get('ZELENAPOSTA_PRODUCT') || DEFAULT_PRODUCT
      const title = meta.name.replace(/\.pdf$/i, '')
      const body = { title: recipient.name, mailings: [{ product, documents: [{ file: toB64(bytes) }], recipient }] }
      const zr = await fetch(`${API}/sendMailings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: zpAuth() }, body: JSON.stringify(body) })
      const text = await zr.text()
      let resp: any = null; try { resp = JSON.parse(text) } catch { /* */ }
      const ok = zr.ok && !(resp && resp.error)
      const price = resp && Number.isFinite(Number(resp.totalPrice)) ? Number(resp.totalPrice) : null
      const errMsg = ok ? null : String(resp?.message || resp?.error || text).slice(0, 300)
      const { data: row } = await admin.from('zp_mailings').insert({ account_id: accountId, deal_id: b.deal_id, contact_id: contactId, title, file_name: String(b.file_name || meta.name), recipient, product, price, status: ok ? 'sent' : 'failed', error: errMsg, response: resp, created_by: u.user.id }).select('id').single()
      if (!ok) throw new Err('Zelená pošta dopis nepřijala: ' + errMsg, 502)
      await admin.from('activities').insert({ account_id: accountId, deal_id: b.deal_id, type: 'system', body: `⚙️ Dopis „${title}“ odeslán Zelenou poštou: ${recipient.name}, ${recipient.street}, ${recipient.zip} ${recipient.city}`, author_id: u.user.id }).then(() => {}, () => {})
      return json({ ok: true, id: row?.id, price })
    }

    throw new Err('Neznámá akce.')
  } catch (e) {
    const err = e as Err
    return json({ error: err.message }, err.status || 500)
  }
})
