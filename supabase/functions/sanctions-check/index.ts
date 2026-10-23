// Kontrola jmen kontaktů proti sankčnímu seznamu EU (Financial Sanctions Files, XML).
// Akce: refresh (cron klíč nebo admin; stáhne seznam a přezkouší kontakty), check {contact_id}, status.
// Výsledek je jen podklad pro makléře („možná shoda – zkontrolovat“), nic se klientovi neoznačuje ani neodesílá.
// Secret: EU_SANCTIONS_TOKEN (vkládá Martin sám).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const toks = (s: string) => [...new Set(norm(s).split(' ').filter((t) => t.length > 1))]
const dec = (t: string) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))

type Row = { entity_id: string; name: string; name_norm: string; tokens: string[]; kind: string | null; programme: string | null; births: string[] }

function parse(xml: string): Row[] {
  const out = new Map<string, Row>()
  for (const m of xml.matchAll(/<sanctionEntity\b[\s\S]*?<\/sanctionEntity>/g)) {
    const e = m[0]
    const id = /logicalId="(\d+)"/.exec(e)?.[1] || /euReferenceNumber="([^"]+)"/.exec(e)?.[1]
    if (!id) continue
    const kind = /<subjectType[^>]*\bcode="([^"]+)"/.exec(e)?.[1] || null
    const programme = /<regulation[^>]*\bprogramme="([^"]+)"/.exec(e)?.[1] || null
    const births = [...new Set([...e.matchAll(/<birthdate[^>]*\b(?:birthdate|year)="(\d{4})/g)].map((b) => b[1]))]
    for (const a of e.matchAll(/<nameAlias\b[^>]*>/g)) {
      const whole = /wholeName="([^"]*)"/.exec(a[0])?.[1]
      if (!whole) continue
      const name = dec(whole).trim()
      const n = norm(name)
      if (!n) continue
      out.set(id + '|' + n, { entity_id: id, name, name_norm: n, tokens: toks(name), kind, programme, births })
    }
  }
  return [...out.values()]
}

async function refresh(): Promise<{ entries: number }> {
  const token = Deno.env.get('EU_SANCTIONS_TOKEN')
  if (!token) throw new Error('Chybí secret EU_SANCTIONS_TOKEN (Supabase → Edge Functions → Secrets).')
  const r = await fetch(`https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=${encodeURIComponent(token)}`, { headers: { 'User-Agent': 'CRM Martin Tesarek' } })
  if (!r.ok) throw new Error('Server EU odpověděl ' + r.status + (r.status === 403 || r.status === 401 ? ' – zkontrolujte token.' : '.'))
  const rows = parse(await r.text())
  if (rows.length < 1000) throw new Error('Seznam EU vypadá neúplně (' + rows.length + ' jmen), původní data ponechána.')
  // nejdřív nahrát, pak smazat staré (kdyby spadlo uprostřed, kontrola dál funguje)
  const stamp = new Date().toISOString()
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await admin.from('sanctions_entries').upsert(rows.slice(i, i + 1000).map((x) => ({ ...x, updated_at: stamp })), { onConflict: 'entity_id,name_norm' })
    if (error) throw new Error('Uložení seznamu: ' + error.message)
  }
  await admin.from('sanctions_entries').delete().lt('updated_at', stamp)
  await admin.from('sanctions_meta').upsert({ id: 1, refreshed_at: stamp, entries: rows.length, error: null })
  return { entries: rows.length }
}

type Contact = { id: string; first_name: string | null; last_name: string | null; birth_date: string | null }
type Match = { name: string; kind: string | null; programme: string | null; strong: boolean }

async function checkOne(c: Contact, listAt: string | null) {
  const full = [c.first_name, c.last_name].filter(Boolean).join(' ')
  const mine = toks(full)
  let status: 'clear' | 'possible' | 'skipped' = 'clear'
  const matches: Match[] = []
  if (mine.length >= 2 && c.last_name) {
    const last = toks(c.last_name)
    const { data } = await admin.from('sanctions_entries').select('name, kind, programme, tokens, births').overlaps('tokens', last).limit(3000)
    const year = c.birth_date ? c.birth_date.slice(0, 4) : null
    for (const e of (data || []) as { name: string; kind: string | null; programme: string | null; tokens: string[]; births: string[] }[]) {
      const set = new Set(e.tokens)
      if (!mine.every((t) => set.has(t))) continue // všechna jména klienta musí být v záznamu
      const sameLen = e.tokens.length === mine.length
      const birthOk = !!year && e.births.includes(year)
      // rok narození, který nesedí, shodu oslabí, ale nevyřadí (seznam nemá data u všech)
      const strong = sameLen && (birthOk || e.births.length === 0)
      matches.push({ name: e.name, kind: e.kind, programme: e.programme, strong })
    }
    if (matches.length) status = 'possible'
  } else status = 'skipped'
  const result = { status, checked_at: new Date().toISOString(), list_at: listAt, matches: matches.slice(0, 10) }
  await admin.from('contacts').update({ sanctions: result }).eq('id', c.id)
  return result
}

async function checkAll(limit = 300) {
  const { data: meta } = await admin.from('sanctions_meta').select('refreshed_at').eq('id', 1).maybeSingle()
  const { data } = await admin.from('contacts').select('id, first_name, last_name, birth_date').order('sanctions->>checked_at', { ascending: true, nullsFirst: true }).limit(limit)
  let possible = 0
  for (const c of (data || []) as Contact[]) if ((await checkOne(c, meta?.refreshed_at || null)).status === 'possible') possible++
  return { checked: (data || []).length, possible }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; contact_id?: string }
    const cron = req.headers.get('x-cron-key') || ''
    let allowed = false
    if (cron) {
      const { data: ck } = await admin.rpc('get_cron_key')
      if (typeof ck === 'string' && ck.length > 10 && cron === ck) allowed = true
      else return json({ error: 'Neautorizováno.' }, 401)
    }
    let isAdmin = allowed
    let sb: ReturnType<typeof createClient> | null = null
    if (!allowed) {
      sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
      const { data: u } = await sb.auth.getUser()
      if (!u?.user) return json({ error: 'Nepřihlášen.' }, 401)
      const { data: m } = await sb.from('memberships').select('role').eq('user_id', u.user.id).limit(1).single()
      isAdmin = !!m && ['owner', 'admin'].includes(String(m.role))
      const { data: ok } = await admin.rpc('rate_check', { p_uid: u.user.id, p_bucket: 'sanctions', p_max: 120, p_seconds: 3600 })
      if (ok === false) return json({ error: 'Příliš mnoho kontrol za hodinu.' }, 429)
    }
    if (body.action === 'status') {
      const { data: meta } = await admin.from('sanctions_meta').select('*').eq('id', 1).maybeSingle()
      return json({ ok: true, meta, token: !!Deno.env.get('EU_SANCTIONS_TOKEN') })
    }
    if (body.action === 'refresh') {
      if (!isAdmin) return json({ error: 'Jen administrátor.' }, 403)
      try {
        const r = await refresh()
        return json({ ok: true, ...r, ...(await checkAll()) })
      } catch (e) {
        await admin.from('sanctions_meta').upsert({ id: 1, error: (e as Error).message }, { onConflict: 'id' })
        return json({ error: (e as Error).message }, 502)
      }
    }
    if (body.action === 'check') {
      if (!body.contact_id) return json({ error: 'Chybí kontakt.' }, 400)
      // kontakt načteme přes uživatelův klient, aby šlo jen o kontakty jeho účtu (RLS)
      const reader = sb || admin
      const { data: c } = await reader.from('contacts').select('id, first_name, last_name, birth_date').eq('id', body.contact_id).single()
      if (!c) return json({ error: 'Kontakt nenalezen.' }, 404)
      const { data: meta } = await admin.from('sanctions_meta').select('refreshed_at, entries').eq('id', 1).maybeSingle()
      if (!meta?.entries) return json({ error: 'Sankční seznam ještě nebyl stažen. Nejdřív ho obnovte.' }, 409)
      return json({ ok: true, result: await checkOne(c as Contact, meta.refreshed_at) })
    }
    return json({ error: 'Neznámá akce.' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
