// Spuštění automatizace z obchodu: pošle údaje o obchodu a kontaktech na webhook v Make,
// zapíše běh do automation_runs a záznam do Aktivity. Adresa webhooku zůstává jen na serveru.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

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
    const auth = req.headers.get('Authorization') || ''
    const url = Deno.env.get('SUPABASE_URL')!
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: { user: u } } = await user.auth.getUser()
    if (!u) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(u.id, 'automation-run', 30, 3600))) return json(TOO_MANY, 429)
    const { automation_id, deal_id } = await req.json()
    if (!automation_id || !deal_id) return json({ error: 'Chybí automatizace nebo obchod.' }, 400)

    // přístup ověří RLS (člen účtu)
    const { data: dealChk } = await user.from('deals').select('id').eq('id', deal_id).maybeSingle()
    const { data: autoChk } = await user.from('automations').select('id').eq('id', automation_id).maybeSingle()
    if (!dealChk || !autoChk) return json({ error: 'Nemáte přístup.' }, 403)

    const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: a } = await sb.from('automations').select('*').eq('id', automation_id).single()
    if (!a?.enabled) return json({ error: 'Automatizace je vypnutá.' }, 400)
    if (a.handler === 'drive-folder') {
      // vlastní funkce v CRM (ne Make): založí složku klienta na Disku
      const r = await fetch(`${url}/functions/v1/drive-folder`, { method: 'POST', headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY')!, 'Content-Type': 'application/json' }, body: JSON.stringify({ deal_id }) })
      const res = await r.json().catch(() => ({}))
      const ok = r.ok && res.ok
      const err = ok ? null : (res.error || `Chyba ${r.status}`)
      await sb.from('automation_runs').insert({ account_id: a.account_id, automation_id: a.id, deal_id, user_id: u.id, status: ok ? 'ok' : 'failed', error: err })
      await sb.from('activities').insert({ account_id: a.account_id, deal_id, type: 'comment', author_id: u.id,
        body: ok ? `⚙️ Založena složka klienta na Disku: ${res.url}${res.failed_templates ? ` (${res.failed_templates} vzorů se nepodařilo zkopírovat)` : ''}` : `⚙️ Složku klienta se nepodařilo založit: ${err}` })
      return ok ? json({ ok: true, url: res.url, failed_templates: res.failed_templates }) : json({ error: err }, 502)
    }
    if (!a.webhook_url) return json({ error: 'Automatizace zatím nemá propojený scénář v Make.' }, 400)
    const { data: d } = await sb.from('deals').select('*, stages(name), deal_contacts(role, contacts(*))').eq('id', deal_id).single()

    const payload = {
      automation: a.title, triggered_by: u.email, triggered_at: new Date().toISOString(),
      deal: {
        id: d.id, title: d.title, stage: d.stages?.name, address: d.address, category: d.category, transaction_type: d.transaction_type,
        listing_price: d.listing_price, top_offer: d.top_offer, drive_folder_url: d.drive_folder_url, crm_url: `https://crm.martintesarek.cz/obchody/${d.id}`,
      },
      contacts: (d.deal_contacts || []).map((x: { role: string; contacts: Record<string, unknown> }) => {
        const c = x.contacts || {}
        return { role: x.role, first_name: c.first_name, last_name: c.last_name, email: c.email, phone: c.phone, salutation: c.salutation, formality: c.formality }
      }),
    }
    let status = 'ok', error: string | null = null
    try {
      const r = await fetch(a.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok) { status = 'failed'; error = `Make odpověděl ${r.status}: ${(await r.text()).slice(0, 150)}` }
    } catch (e) { status = 'failed'; error = String(e) }

    await sb.from('automation_runs').insert({ account_id: d.account_id, automation_id: a.id, deal_id: d.id, user_id: u.id, status, error })
    await sb.from('activities').insert({ account_id: d.account_id, deal_id: d.id, type: 'comment', author_id: u.id,
      body: status === 'ok' ? `⚙️ Automatizace „${a.title}“ spuštěna.` : `⚙️ Automatizace „${a.title}“ se nepovedla: ${error}` })
    return status === 'ok' ? json({ ok: true }) : json({ error }, 502)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
