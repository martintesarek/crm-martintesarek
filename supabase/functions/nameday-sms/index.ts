// Přání k svátku SMS (GoSMS) – náhrada Make scénáře „Svátek klienta -> SMS - denně v 10:17“.
// Spouští pg_cron (8:17 a 9:17 UTC, funkce pošle jen když je v Praze 10 h) nebo ručně z Nastavení (test / spustit teď).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const CRON_KEY = 'nd-7f3c9a1e4b8d2c6f'

export const DEFAULTS = {
  enabled: true,
  channel: '350324',
  vykani: 'Dobrý den {osloveni}, dovolte popřát mi k vašemu dnešnímu svátku všechno nejlepší! 🍾🥂\n\nZdraví vás Martin Tesárek, realitní makléř\nwww.martintesarek.cz',
  tykani: 'Ahoj {osloveni}, rád bych ti popřál k tvému dnešnímu svátku vše nej!!! 🍾🥂\n\nMartin Tesárek',
}
type Cfg = typeof DEFAULTS

const prague = (d = new Date()) => { const p = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false }).formatToParts(d); const g = (t: string) => p.find((x) => x.type === t)?.value || ''; return { hour: Number(g('hour')), mmdd: `${g('month')}-${g('day')}`, year: Number(g('year')) } }
const normPhone = (s: string) => { let p = s.replace(/[\s()-]/g, ''); if (/^0?[1-9]\d{8}$/.test(p)) p = '+420' + p.replace(/^0/, ''); if (/^00/.test(p)) p = '+' + p.slice(2); if (/^420\d{9}$/.test(p)) p = '+' + p; return p }

let tok: { t: string; exp: number } | null = null
async function gosmsToken() {
  if (tok && tok.exp > Date.now() + 30_000) return tok.t
  const id = Deno.env.get('GOSMS_CLIENT_ID'), secret = Deno.env.get('GOSMS_CLIENT_SECRET')
  if (!id || !secret) throw new Error('Chybí GOSMS_CLIENT_ID / GOSMS_CLIENT_SECRET v Supabase → Edge Functions → Secrets.')
  const r = await fetch('https://app.gosms.cz/oauth/v2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials` })
  if (!r.ok) throw new Error('GoSMS přihlášení: ' + (await r.text()).slice(0, 200))
  const d = await r.json()
  tok = { t: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 }
  return tok.t
}
async function sendSms(phone: string, message: string, channel: string): Promise<string> {
  const t = await gosmsToken()
  const r = await fetch('https://app.gosms.cz/api/v1/messages/', { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, recipients: [phone], channel: Number(channel) }) })
  const txt = await r.text()
  if (!r.ok) throw new Error('GoSMS: ' + txt.slice(0, 200))
  try { const d = JSON.parse(txt); return String(d?.data?.sms_id ?? d?.sms_id ?? d?.id ?? d?.messageId ?? '') } catch { return '' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: 'run' | 'test' | 'preview'; test_phone?: string; account_id?: string }
    const fromCron = req.headers.get('x-cron-key') === CRON_KEY
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    let accountFilter: string | null = null
    if (!fromCron) {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
      const { data: u } = await sb.auth.getUser()
      if (!u?.user) return json({ error: 'Nepřihlášen.' }, 401)
      const { data: m } = await sb.from('memberships').select('account_id, role').eq('user_id', u.user.id).limit(1).single()
      if (!m) return json({ error: 'Bez účtu.' }, 403)
      accountFilter = m.account_id
    }
    const now = prague()
    if (fromCron && now.hour !== 10) return json({ skipped: 'mimo 10. hodinu v Praze', hour: now.hour })

    const { data: accounts } = await admin.from('accounts').select('id, settings').in('id', accountFilter ? [accountFilter] : (await admin.from('accounts').select('id')).data?.map((a) => a.id) || [])
    const out: unknown[] = []
    for (const a of accounts || []) {
      const cfg: Cfg = { ...DEFAULTS, ...(((a.settings || {}) as { nameday_sms?: Partial<Cfg> }).nameday_sms || {}) }
      const render = (c: { salutation: string | null; formality: string | null }) => (c.formality === 'tykani' ? cfg.tykani : cfg.vykani).replace(/\{osloveni\}/g, c.salutation || '')

      if (body.action === 'test') {
        if (!body.test_phone) return json({ error: 'Chybí testovací číslo.' }, 400)
        const msg = render({ salutation: 'pane Tesárku', formality: 'vykani' })
        const id = await sendSms(normPhone(body.test_phone), msg, cfg.channel)
        await admin.from('sms_log').insert({ account_id: a.id, kind: 'svatek-test', phone: normPhone(body.test_phone), message: msg, provider_id: id })
        return json({ ok: true, message: msg })
      }

      const { data: contacts } = await admin.from('contacts').select('id, first_name, last_name, phone, salutation, formality').eq('account_id', a.id).eq('name_day', now.mmdd).not('phone', 'is', null)
      const { data: already } = await admin.from('sms_log').select('contact_id').eq('account_id', a.id).eq('kind', 'svatek').eq('year', now.year).eq('status', 'sent')
      const done = new Set((already || []).map((x) => x.contact_id))
      const todo = (contacts || []).filter((c) => c.phone && c.salutation && !done.has(c.id))
      const skippedNoSalutation = (contacts || []).filter((c) => c.phone && !c.salutation).map((c) => `${c.first_name} ${c.last_name}`)

      if (body.action === 'preview') { out.push({ account_id: a.id, enabled: cfg.enabled, today: now.mmdd, would_send: todo.map((c) => ({ name: `${c.first_name} ${c.last_name}`, phone: c.phone, message: render(c) })), skipped_no_salutation: skippedNoSalutation, already_sent: done.size }); continue }
      if (!cfg.enabled && fromCron) { out.push({ account_id: a.id, skipped: 'vypnuto' }); continue }

      const sent: string[] = [], failed: string[] = []
      for (const c of todo) {
        const msg = render(c); const phone = normPhone(c.phone!)
        try {
          const id = await sendSms(phone, msg, cfg.channel)
          await admin.from('sms_log').insert({ account_id: a.id, contact_id: c.id, kind: 'svatek', phone, message: msg, provider_id: id, year: now.year })
          sent.push(`${c.first_name} ${c.last_name}`)
        } catch (e) {
          await admin.from('sms_log').insert({ account_id: a.id, contact_id: c.id, kind: 'svatek', phone, message: msg, status: 'failed', error: (e as Error).message, year: now.year })
          failed.push(`${c.first_name} ${c.last_name}: ${(e as Error).message}`)
        }
      }
      out.push({ account_id: a.id, today: now.mmdd, sent, failed, skipped_no_salutation: skippedNoSalutation })
    }
    return json({ results: out })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
