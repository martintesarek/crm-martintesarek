// Ověření totožnosti klienta přes Bank iD (OpenID Connect). Klient se přihlásí do své banky, CRM dostane ověřené údaje.
// Martin (JWT, admin): create {contact_id} → odkaz pro klienta, apply {id} → doplní prázdná pole kontaktu.
// Klient (token z odkazu, bez přihlášení): view {token}, start {token} → adresa banky. GET (návrat z Bank iD): code + state.
// Secrets (vkládá Martin sám): BANKID_CLIENT_ID, BANKID_CLIENT_SECRET (metoda „Client Secret POST“),
// BANKID_BASE (výchozí zkušební https://oidc.sandbox.bankid.cz; ostrá adresa je v Developer Portal Bank iD).
// Adresa pro přesměrování zaregistrovaná v Developer Portal: https://aowceqpaawxeugalapgx.supabase.co/functions/v1/bankid-verify
import { createClient } from 'npm:@supabase/supabase-js@2'

const APP = 'https://crm.martintesarek.cz'
const cors = { 'Access-Control-Allow-Origin': APP, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const REDIRECT = `${Deno.env.get('SUPABASE_URL')}/functions/v1/bankid-verify`
const BASE = (Deno.env.get('BANKID_BASE') || 'https://oidc.sandbox.bankid.cz').replace(/\/$/, '')
const SCOPE = 'openid profile.name profile.birthdate profile.gender profile.addresses profile.idcards'

class Err extends Error { constructor(m: string, public status = 400) { super(m) } }
const rand = (n: number) => { const b = crypto.getRandomValues(new Uint8Array(n)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
async function rl(key: string, bucket: string, max: number, seconds: number) {
  const { data } = await admin.rpc('rate_check', { p_uid: key, p_bucket: bucket, p_max: max, p_seconds: seconds })
  if (data === false) throw new Err('Příliš mnoho pokusů, zkuste to prosím později.', 429)
}
function jwtPayload(t: string): Record<string, unknown> { try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))) } catch { return {} } }

async function bankFetch(path: string, init?: RequestInit) {
  const r = await fetch(BASE + path, init)
  const t = await r.text()
  let j: Record<string, unknown> = {}; try { j = JSON.parse(t) } catch { /* nic */ }
  if (!r.ok) throw new Error(`Bank iD ${path}: ${r.status} ${(j.error_description || j.error || t).toString().slice(0, 200)}`)
  return j
}

async function callback(url: URL): Promise<Response> {
  const state = url.searchParams.get('state') || ''
  const { data: v } = await admin.from('bankid_verifications').select('*').eq('state', state).maybeSingle()
  const back = (q: string) => Response.redirect(`${APP}/overeni/${v?.token || 'x'}?${q}`, 302)
  if (!v || v.status !== 'pending' || new Date(v.expires_at) < new Date()) return back('chyba=platnost')
  if (url.searchParams.get('error')) {
    await admin.from('bankid_verifications').update({ status: 'failed', error: String(url.searchParams.get('error_description') || url.searchParams.get('error')).slice(0, 300) }).eq('id', v.id)
    return back('chyba=zruseno')
  }
  try {
    const id = Deno.env.get('BANKID_CLIENT_ID'), secret = Deno.env.get('BANKID_CLIENT_SECRET')
    if (!id || !secret) throw new Error('Chybí BANKID_CLIENT_ID / BANKID_CLIENT_SECRET.')
    const tok = await bankFetch('/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: REDIRECT, client_id: id, client_secret: secret }) })
    const idt = jwtPayload(String(tok.id_token || ''))
    if (idt.nonce !== v.nonce) throw new Error('Neshoduje se nonce.')
    const auth = { Authorization: `Bearer ${tok.access_token}` }
    const info = await bankFetch('/userinfo', { headers: auth })
    let prof: Record<string, unknown> = {}
    try { prof = await bankFetch('/profile', { headers: auth }) } catch { /* profil je doplněk */ }
    const claims = { ...prof, ...info, sub: info.sub || idt.sub, env: BASE.includes('sandbox') ? 'sandbox' : 'production' }
    await admin.from('bankid_verifications').update({ status: 'verified', claims, verified_at: new Date().toISOString(), error: null }).eq('id', v.id)
    return back('hotovo=1')
  } catch (e) {
    await admin.from('bankid_verifications').update({ status: 'failed', error: (e as Error).message.slice(0, 300) }).eq('id', v.id)
    return back('chyba=overeni')
  }
}

type Addr = { type?: string; street?: string; streetnumber?: string; buildingapartment?: string; city?: string; zipcode?: string; country?: string }
function apply(claims: Record<string, unknown>, c: Record<string, unknown>) {
  const patch: Record<string, unknown> = {}
  const empty = (k: string) => c[k] === null || c[k] === undefined || String(c[k]).trim() === ''
  if (empty('birth_date') && typeof claims.birthdate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(claims.birthdate)) patch.birth_date = claims.birthdate
  if (empty('gender') && (claims.gender === 'male' || claims.gender === 'female')) patch.gender = claims.gender === 'male' ? 'muž' : 'žena'
  const addrs = Array.isArray(claims.addresses) ? (claims.addresses as Addr[]) : []
  const a = addrs.find((x) => /PERMANENT/i.test(x.type || '')) || addrs[0]
  if (a && empty('street') && empty('city')) {
    if (a.street) patch.street = a.street
    const no = [a.buildingapartment, a.streetnumber].filter(Boolean).join('/')
    if (no) patch.house_no = no
    if (a.city) patch.city = a.city
    if (a.zipcode) patch.zip = String(a.zipcode).replace(/\s/g, '')
  }
  return patch
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    if (req.method === 'GET') return await callback(new URL(req.url))
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(b.action || '')

    // ---------- Klient (bez přihlášení, jen s tokenem z odkazu) ----------
    if (action === 'view' || action === 'start') {
      const token = String(b.token || '')
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new Err('Neplatný odkaz.', 404)
      await rl(token, 'bankid-' + action, action === 'view' ? 60 : 10, 3600)
      const { data: v } = await admin.from('bankid_verifications').select('id, status, state, nonce, expires_at, contact_id, account_id').eq('token', token).maybeSingle()
      if (!v) throw new Err('Odkaz není platný.', 404)
      const expired = new Date(v.expires_at) < new Date()
      if (action === 'view') {
        const { data: c } = await admin.from('contacts').select('first_name').eq('id', v.contact_id).maybeSingle()
        return json({ status: expired && v.status === 'pending' ? 'expired' : v.status, first_name: c?.first_name || null, broker: 'Martin Tesárek' })
      }
      if (expired || v.status !== 'pending') throw new Err('Odkaz už není platný, požádejte prosím o nový.', 410)
      const id = Deno.env.get('BANKID_CLIENT_ID')
      if (!id || !Deno.env.get('BANKID_CLIENT_SECRET')) throw new Err('Ověření přes banku zatím není zapnuto.', 503)
      const q = new URLSearchParams({ response_type: 'code', client_id: id, redirect_uri: REDIRECT, scope: SCOPE, state: v.state, nonce: v.nonce })
      return json({ url: `${BASE}/auth?${q}` })
    }

    // ---------- Martin (přihlášen, administrátor) ----------
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: u } = await sb.auth.getUser()
    if (!u?.user) throw new Err('Nepřihlášen.', 401)
    const { data: m } = await sb.from('memberships').select('role').eq('user_id', u.user.id).limit(1).single()
    if (!m || !['owner', 'admin'].includes(String(m.role))) throw new Err('Jen administrátor.', 403)
    await rl(u.user.id, 'bankid-admin', 60, 3600)

    if (action === 'status') return json({ ok: true, configured: !!Deno.env.get('BANKID_CLIENT_ID') && !!Deno.env.get('BANKID_CLIENT_SECRET'), sandbox: BASE.includes('sandbox') })
    if (action === 'create') {
      const { data: c } = await sb.from('contacts').select('id, account_id').eq('id', String(b.contact_id || '')).single()
      if (!c) throw new Err('Kontakt nenalezen.', 404)
      const token = rand(24)
      const { error } = await admin.from('bankid_verifications').insert({ account_id: c.account_id, contact_id: c.id, token, state: rand(24), nonce: rand(16), requested_by: u.user.id })
      if (error) throw new Error(error.message)
      return json({ ok: true, link: `${APP}/overeni/${token}` })
    }
    if (action === 'apply') {
      const { data: v } = await sb.from('bankid_verifications').select('id, contact_id, claims, status').eq('id', String(b.id || '')).single()
      if (!v || v.status !== 'verified' || !v.claims) throw new Err('Ověření není dokončeno.', 400)
      const { data: c } = await sb.from('contacts').select('*').eq('id', v.contact_id).single()
      if (!c) throw new Err('Kontakt nenalezen.', 404)
      const patch = apply(v.claims as Record<string, unknown>, c as Record<string, unknown>)
      if (Object.keys(patch).length) {
        const { error } = await sb.from('contacts').update(patch).eq('id', c.id)
        if (error) throw new Error(error.message)
      }
      await admin.from('bankid_verifications').update({ applied_at: new Date().toISOString() }).eq('id', v.id)
      return json({ ok: true, filled: Object.keys(patch) })
    }
    throw new Err('Neznámá akce.', 400)
  } catch (e) {
    return json({ error: (e as Error).message }, e instanceof Err ? e.status : 500)
  }
})
