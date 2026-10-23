// Ruční odeslání SMS klientovi z CRM (odpověď na jeho SMS). Text i podpis potvrzuje Martin v aplikaci před odesláním.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const normPhone = (s: string) => { let p = s.replace(/[\s()-]/g, ''); if (/^0?[1-9]\d{8}$/.test(p)) p = '+420' + p.replace(/^0/, ''); if (/^00/.test(p)) p = '+' + p.slice(2); if (/^420\d{9}$/.test(p)) p = '+' + p; return p }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: u } = await sb.auth.getUser()
    if (!u?.user) return json({ error: 'Nepřihlášen.' }, 401)
    const { data: m } = await sb.from('memberships').select('account_id, role').eq('user_id', u.user.id).limit(1).single()
    if (!m || !['owner', 'admin'].includes(String(m.role))) return json({ error: 'Odesílat SMS může jen administrátor.' }, 403)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: ok } = await admin.rpc('rate_check', { p_uid: u.user.id, p_bucket: 'sms-send', p_max: 30, p_seconds: 3600 })
    if (ok === false) return json({ error: 'Příliš mnoho SMS za hodinu, zkuste to prosím za chvíli.' }, 429)

    const b = await req.json().catch(() => ({})) as { contact_id?: string; message?: string }
    const message = String(b.message || '').trim()
    if (!b.contact_id || !message) return json({ error: 'Chybí kontakt nebo text.' }, 400)
    if (message.length > 600) return json({ error: 'Text je příliš dlouhý.' }, 400)
    const { data: c } = await sb.from('contacts').select('id, account_id, phone').eq('id', b.contact_id).single()
    if (!c?.phone) return json({ error: 'Kontakt nemá telefon.' }, 400)
    const phone = normPhone(c.phone)

    const { data: acc } = await admin.from('accounts').select('settings').eq('id', c.account_id).single()
    const channel = String((acc?.settings as Record<string, { channel?: string }> | null)?.nameday_sms?.channel || '350324')
    const id = Deno.env.get('GOSMS_CLIENT_ID'), secret = Deno.env.get('GOSMS_CLIENT_SECRET')
    if (!id || !secret) throw new Error('Chybí GOSMS_CLIENT_ID / GOSMS_CLIENT_SECRET.')
    const tr = await fetch('https://app.gosms.cz/oauth/v2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials` })
    if (!tr.ok) throw new Error('GoSMS přihlášení: ' + (await tr.text()).slice(0, 200))
    const t = (await tr.json()).access_token
    const r = await fetch('https://app.gosms.cz/api/v1/messages/', { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, recipients: [phone], channel: Number(channel) }) })
    const txt = await r.text()
    const year = new Date().getFullYear()
    if (!r.ok) {
      await admin.from('sms_log').insert({ account_id: c.account_id, contact_id: c.id, kind: 'odpoved', phone, message, status: 'failed', error: txt.slice(0, 300), year })
      return json({ error: 'GoSMS: ' + txt.slice(0, 200) }, 502)
    }
    let pid = ''; try { const d = JSON.parse(txt); pid = String(d?.data?.sms_id ?? d?.sms_id ?? d?.id ?? '') } catch { /* nic */ }
    await admin.from('sms_log').insert({ account_id: c.account_id, contact_id: c.id, kind: 'odpoved', phone, message, provider_id: pid, year })
    return json({ ok: true })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
