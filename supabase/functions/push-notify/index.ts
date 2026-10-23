// Push upozornění do telefonu / počítače. Cron každou minutu (hlavička x-cron-key) hledá nové odpovědi na SMS, změny/chyby
// Hlídače katastru a ráno úkoly s dnešním termínem. S JWT: action 'key' (veřejný klíč pro prohlížeč), 'test' (zkušební upozornění).
// VAPID klíče si funkce vytvoří sama a uloží do tabulky push_config (bez přístupu z aplikace).
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
type Sub = { id: string; user_id: string; account_id: string; endpoint: string; p256dh: string; auth: string; prefs: Record<string, boolean> | null }
type Msg = { title: string; body: string; url: string; tag?: string }

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function keys() {
  const { data } = await admin.from('push_config').select('key, value')
  const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]))
  if (m.vapid_public && m.vapid_private) return { pub: m.vapid_public as string, priv: m.vapid_private as string }
  const k = webpush.generateVAPIDKeys()
  await admin.from('push_config').upsert([{ key: 'vapid_public', value: k.publicKey }, { key: 'vapid_private', value: k.privateKey }])
  return { pub: k.publicKey, priv: k.privateKey }
}

async function send(subs: Sub[], msg: Msg, pref: string | null): Promise<number> {
  const k = await keys()
  webpush.setVapidDetails('mailto:reality@martintesarek.cz', k.pub, k.priv)
  let n = 0
  for (const s of subs) {
    if (pref && s.prefs && s.prefs[pref] === false) continue
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 3600 })
      n++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
    }
  }
  return n
}

const prague = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date()).reduce((a, p) => ({ ...a, [p.type]: p.value }), {} as Record<string, string>)
const dayOf = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(iso))

async function scan() {
  const { data: subsAll } = await admin.from('push_subscriptions').select('id, user_id, account_id, endpoint, p256dh, auth, prefs')
  const subs = (subsAll || []) as Sub[]
  const byAcc = (acc: string) => subs.filter((s) => s.account_id === acc)
  const out = { replies: 0, cadastre: 0, errors: 0, tasks: 0 }
  if (!subs.length) {
    // nikdo se nepřihlásil – jen označit, ať se po zapnutí nesype stará várka
    await admin.from('sms_replies').update({ notified_at: new Date().toISOString() }).is('notified_at', null)
    await admin.from('cadastre_changes').update({ notified_at: new Date().toISOString() }).is('notified_at', null)
    return out
  }

  // 1) odpovědi na SMS
  const { data: reps } = await admin.from('sms_replies').select('id, account_id, contact_id, phone, message, contacts(first_name, last_name)').is('notified_at', null).order('received_at').limit(20)
  for (const r of (reps || []) as unknown as { id: string; account_id: string; contact_id: string | null; phone: string | null; message: string; contacts: { first_name: string | null; last_name: string | null } | null }[]) {
    const who = r.contacts ? `${r.contacts.first_name || ''} ${r.contacts.last_name || ''}`.trim() : r.phone || 'Neznámé číslo'
    out.replies += await send(byAcc(r.account_id), { title: `Odpověď na SMS: ${who}`, body: r.message.slice(0, 140), url: r.contact_id ? `/kontakty/${r.contact_id}` : '/', tag: 'reply-' + r.id }, 'replies')
    await admin.from('sms_replies').update({ notified_at: new Date().toISOString() }).eq('id', r.id)
  }

  // 2) změny v katastru
  const { data: chs } = await admin.from('cadastre_changes').select('id, account_id, cadastre_watch(label)').is('notified_at', null).limit(20)
  for (const c of (chs || []) as unknown as { id: string; account_id: string; cadastre_watch: { label: string } | null }[]) {
    out.cadastre += await send(byAcc(c.account_id), { title: 'Změna v katastru', body: c.cadastre_watch?.label || 'Hlídaná nemovitost', url: '/hlidac', tag: 'cad-' + c.id }, 'cadastre')
    await admin.from('cadastre_changes').update({ notified_at: new Date().toISOString() }).eq('id', c.id)
  }

  // 3) chyby kontroly katastru (každá chyba jen jednou)
  const { data: ws } = await admin.from('cadastre_watch').select('id, account_id, label, error').not('error', 'is', null).eq('active', true).limit(20)
  for (const w of (ws || []) as { id: string; account_id: string; label: string; error: string }[]) {
    const key = `cerr-${w.id}-${w.error.length}-${w.error.slice(0, 40)}`
    const { data: seen } = await admin.from('push_sent').select('key').eq('key', key).maybeSingle()
    if (seen) continue
    await admin.from('push_sent').insert({ key })
    out.errors += await send(byAcc(w.account_id), { title: 'Chyba hlídače katastru', body: `${w.label || 'Nemovitost'}: ${w.error}`.slice(0, 140), url: '/hlidac', tag: 'cerr-' + w.id }, 'cadastre')
  }

  // 4) úkoly s dnešním termínem – jednou denně od 7:00 pražského času
  const p = prague()
  if (Number(p.hour) >= 7) {
    const today = `${p.year}-${p.month}-${p.day}`
    const from = new Date(Date.now() - 36 * 3600e3).toISOString(), to = new Date(Date.now() + 36 * 3600e3).toISOString()
    const { data: tasks } = await admin.from('tasks').select('id, account_id, title, due_at, assignee_id').eq('done', false).gte('due_at', from).lte('due_at', to)
    const due = ((tasks || []) as { id: string; account_id: string; title: string; due_at: string; assignee_id: string | null }[]).filter((t) => dayOf(t.due_at) === today)
    for (const u of [...new Set(subs.map((s) => s.user_id))]) {
      const key = `tasks-${today}-${u}`
      const { data: sent } = await admin.from('push_sent').select('key').eq('key', key).maybeSingle()
      if (sent) continue
      const mine = due.filter((t) => t.assignee_id === u || !t.assignee_id)
      await admin.from('push_sent').insert({ key })
      if (!mine.length) continue
      const body = mine.length === 1 ? mine[0].title : `${mine.length} úkolů: ${mine.slice(0, 3).map((t) => t.title).join(', ')}`
      out.tasks += await send(subs.filter((s) => s.user_id === u), { title: mine.length === 1 ? 'Dnes máš úkol' : 'Dnes máš úkoly', body: body.slice(0, 140), url: '/', tag: 'tasks-' + today }, 'tasks')
    }
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string }
    const cron = req.headers.get('x-cron-key') || ''
    if (cron) {
      const { data: ck } = await admin.rpc('get_cron_key')
      if (typeof ck === 'string' && ck.length > 10 && cron === ck) return json({ ok: true, ...(await scan()) })
      return json({ error: 'Neautorizováno.' }, 401)
    }
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: u } = await sb.auth.getUser()
    if (!u?.user) return json({ error: 'Nepřihlášen.' }, 401)
    if (body.action === 'key') return json({ key: (await keys()).pub })
    if (body.action === 'test') {
      const { data: mine } = await admin.from('push_subscriptions').select('id, user_id, account_id, endpoint, p256dh, auth, prefs').eq('user_id', u.user.id)
      const n = await send((mine || []) as Sub[], { title: 'CRM · Martin Tesárek', body: 'Upozornění fungují. 👍', url: '/', tag: 'test' }, null)
      return json({ ok: true, sent: n })
    }
    return json({ error: 'Neznámá akce.' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
