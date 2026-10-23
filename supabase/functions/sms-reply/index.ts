// Příjem odpovědí klientů na SMS z GoSMS (webhook „Odpovědi“). verify_jwt=false – ověřuje se heslo z HTTP Basic (secret GOSMS_WEBHOOK_KEY).
// V GoSMS Samoobsluze → API → Webhooky → Odpovědi: https://gosms:HESLO@aowceqpaawxeugalapgx.supabase.co/functions/v1/sms-reply
import { createClient } from 'npm:@supabase/supabase-js@2'

const ok = (b: unknown = { ok: true }, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const digits = (s: string | null | undefined) => String(s || '').replace(/\D/g, '').slice(-9)
const safeEq = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0 }

type Rep = { id?: number | string; message?: string; sourceNumber?: string; received?: string }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'POST' }, 405)
  const key = Deno.env.get('GOSMS_WEBHOOK_KEY') || ''
  const auth = req.headers.get('authorization') || ''
  let pass = ''
  if (auth.toLowerCase().startsWith('basic ')) { try { pass = atob(auth.slice(6)).split(':').slice(1).join(':') } catch { /* nic */ } }
  if (key.length < 12 || !safeEq(pass, key)) return ok({ error: 'Neautorizováno.' }, 401)

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const raw = await req.json().catch(() => null)
    const items = (Array.isArray(raw) ? raw : raw ? [raw] : []) as { event?: string; reply?: { recipients?: Record<string, Rep[]> } }[]
    const { data: accs } = await admin.from('accounts').select('id')
    const { data: contacts } = await admin.from('contacts').select('id, account_id, phone').not('phone', 'is', null)
    let saved = 0
    for (const it of items) {
      if (it.event && it.event !== 'reply') continue
      for (const [phone, reps] of Object.entries(it.reply?.recipients || {})) for (const r of reps || []) {
        const d = digits(phone)
        // nejdřív podle poslední odeslané SMS na toto číslo, pak podle telefonu v kontaktech
        const { data: logs } = await admin.from('sms_log').select('id, account_id, contact_id, phone').not('contact_id', 'is', null).order('sent_at', { ascending: false }).limit(300)
        const log = (logs || []).find((l) => digits(l.phone) === d)
        const ct = log ? null : (contacts || []).find((c) => digits(c.phone) === d)
        const account_id = log?.account_id || ct?.account_id || (accs && accs.length === 1 ? accs[0].id : null)
        if (!account_id) continue
        const row = { account_id, contact_id: log?.contact_id || ct?.id || null, sms_log_id: log?.id || null, phone, message: String(r.message || '').slice(0, 2000), received_at: r.received || new Date().toISOString(), provider_id: r.id != null ? String(r.id) : null }
        const { error } = row.provider_id ? await admin.from('sms_replies').upsert(row, { onConflict: 'provider_id', ignoreDuplicates: true }) : await admin.from('sms_replies').insert(row)
        if (!error) saved++
      }
    }
    return ok({ ok: true, saved })
  } catch (e) {
    return ok({ error: (e as Error).message }, 500)
  }
})
