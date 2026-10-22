// Hlídač katastru – kontrola změn hlídaných nemovitostí přes REST API KN (ČÚZK). Náhrada Make scénáře.
// Spouští pg_cron (10:00 a 16:00 pražského času) nebo ručně z CRM (action: check | lookup).
// Potřebuje secret CUZK_API_KEY (Supabase → Edge Functions → Secrets), který vkládá Martin sám.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const API = 'https://api-kn.cuzk.gov.cz/api/v1/'

async function api(path: string): Promise<{ status: number; body: any }> {
  const key = Deno.env.get('CUZK_API_KEY')
  if (!key) throw new Error('Chybí CUZK_API_KEY (klíč k API katastru) v Supabase → Edge Functions → Secrets.')
  // API povoluje jen jedno souběžné volání; při 429 chvíli počkáme a zkusíme znovu
  let r = await fetch(API + path, { headers: { ApiKey: key, Accept: 'application/json' }, signal: AbortSignal.timeout(50_000) })
  for (let i = 0; i < 4 && r.status === 429; i++) { await r.body?.cancel(); await new Promise((res) => setTimeout(res, 1500 * (i + 1))); r = await fetch(API + path, { headers: { ApiKey: key, Accept: 'application/json' }, signal: AbortSignal.timeout(50_000) }) }
  const t = await r.text()
  let body: any = null
  try { body = JSON.parse(t) } catch { body = { zpravy: [{ text: t.slice(0, 200) }] } }
  return { status: r.status, body }
}

type Watch = { frequency?: string; id: string; account_id: string; kind: string; number: string; unit_no: string | null; code: number | null; last_state: string | null; label: string }

const enc = encodeURIComponent
function pathFor(w: Watch): string | null {
  if (!w.code) return null
  const num = String(w.number).trim()
  if (w.kind === 'parcela') {
    const [main, sub] = num.split('/').map((x) => x.trim())
    return `Parcely/Vyhledani?KodKatastralnihoUzemi=${w.code}&TypParcely=PKN&DruhCislovaniParcely=2&KmenoveCisloParcely=${enc(main)}${sub ? '&PoddeleniCislaParcely=' + enc(sub) : ''}`
  }
  const unit = String(w.unit_no || '').trim()
  return `${unit ? 'Jednotky' : 'Stavby'}/Vyhledani?KodCastiObce=${w.code}&TypStavby=${w.kind === 'č.ev.' ? 2 : 1}&CisloDomovni=${enc(num)}${unit ? '&CisloJednotky=' + enc(unit) : ''}`
}

const prague = () => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', hour12: false, weekday: 'short', day: 'numeric' }).formatToParts(new Date())
  const g = (t: string) => p.find((x) => x.type === t)?.value || ''
  return { hour: Number(g('hour')) % 24, weekday: g('weekday'), day: Number(g('day')) }
}
/** Je nemovitost podle své frekvence na řadě? (cron běží v 10:00 a 16:00 pražského času) */
const due = (f: string | undefined, t: { hour: number; weekday: string; day: number }) => {
  if (f === 'daily') return t.hour === 10
  if (f === 'weekly') return t.hour === 10 && t.weekday === 'Mon'
  if (f === 'monthly') return t.hour === 10 && t.day === 1
  return true
}

function plomby(item: any): string {
  const arr = Array.isArray(item?.rizeniPlomby) ? item.rizeniPlomby : []
  if (!arr.length) return 'žádné'
  return arr.map((p: any) => `${p.typRizeni}-${p.poradoveCislo}/${p.rok} (pracoviště ${p.kodPracoviste})`).join(', ')
}

/** Zjistí aktuální stav nemovitosti v katastru jako jednu větu (stejný tvar jako dřív v Make). */
async function currentState(w: Watch): Promise<{ state: string | null; error: string | null }> {
  const path = pathFor(w)
  if (!path) return { state: null, error: 'Chybí kód části obce / katastrálního území – upravte hlídanou nemovitost.' }
  const { status, body } = await api(path)
  const msgs = Array.isArray(body?.zpravy) ? body.zpravy.map((z: any) => z.text).filter(Boolean).join('; ') : ''
  if (status !== 200) return { state: null, error: `Chyba API ${status}: ${msgs || JSON.stringify(body).slice(0, 200)}` }
  const item = Array.isArray(body?.data) ? body.data[0] : null
  if (!item) return { state: null, error: 'Nenalezeno v katastru – zkontrolujte obec, část obce a čísla. ' + msgs }
  let s = `LV ${item.lv?.cislo} (k.ú. ${item.lv?.katastralniUzemi?.nazev}) | plomby: ${plomby(item)}`
  if (w.kind === 'parcela') s += ` | výměra: ${item.vymera} m²`
  else if (!String(w.unit_no || '').trim()) s += ` | jednotek v domě: ${Array.isArray(item.jednotky) ? item.jednotky.length : 0}`
  return { state: s, error: null }
}

// číselníky se drží v paměti instance (jsou velké a mění se zřídka)
const cache: Record<string, any[]> = {}
async function list(name: string): Promise<any[]> {
  if (cache[name]) return cache[name]
  const { status, body } = await api('CiselnikyUzemnichJednotek/' + name)
  if (status !== 200) throw new Error(`Číselník ${name}: chyba API ${status}`)
  const arr = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []
  cache[name] = arr
  return arr
}
const plain = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; cron?: boolean; watch_id?: string; kind?: string; municipality?: string; part?: string }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const sent = req.headers.get('x-cron-key') || ''
    let fromCron = false
    if (sent) { const { data: ck } = await admin.rpc('get_cron_key'); fromCron = typeof ck === 'string' && ck.length > 10 && sent === ck }
    let accountId: string | null = null
    if (!fromCron) {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
      const { data: u } = await sb.auth.getUser()
      if (!u?.user) return json({ error: 'Nepřihlášen.' }, 401)
      const { data: m } = await sb.from('memberships').select('account_id').eq('user_id', u.user.id).limit(1).single()
      if (!m) return json({ error: 'Bez účtu.' }, 403)
      accountId = m.account_id
      try { const { data: ok } = await admin.rpc('rate_check', { p_uid: u.user.id, p_bucket: 'cadastre', p_max: 60, p_seconds: 3600 }); if (ok === false) return json({ error: 'Příliš mnoho požadavků, zkuste to prosím za chvíli.' }, 429) } catch { /* bez omezení */ }
    }

    // ---- vyhledání kódu části obce / katastrálního území podle názvu ----
    if (body.action === 'lookup') {
      const mun = plain(body.municipality || ''); const part = plain(body.part || '')
      if (!mun) return json({ error: 'Zadejte obec.' }, 400)
      if (body.kind === 'parcela') {
        const ku = await list('KatastralniUzemi')
        const found = ku.filter((k: any) => plain(k.nazev).startsWith(mun)).slice(0, 15).map((k: any) => ({ code: k.kod, name: k.nazev }))
        return json({ candidates: found })
      }
      const [obce, casti] = await Promise.all([list('Obce'), list('CastiObci')])
      const ob = obce.filter((o: any) => plain(o.nazev) === mun)
      const obKods = new Set((ob.length ? ob : obce.filter((o: any) => plain(o.nazev).startsWith(mun))).map((o: any) => o.kod))
      let found = casti.filter((c: any) => obKods.has(c.kodObce))
      if (part) { const f = found.filter((c: any) => plain(c.nazev) === part); found = f.length ? f : found.filter((c: any) => plain(c.nazev).includes(part)) }
      else { const same = found.filter((c: any) => plain(c.nazev) === mun); if (same.length) found = same }
      return json({ candidates: found.slice(0, 20).map((c: any) => ({ code: c.kod, name: c.nazev })) })
    }

    // ---- kontrola změn ----
    if (body.action === 'check') {
      const t = prague()
      if (fromCron && t.hour !== 10 && t.hour !== 16) return json({ skipped: 'mimo 10. a 16. hodinu v Praze', hour: t.hour })
      let q = admin.from('cadastre_watch').select('id, account_id, label, kind, number, unit_no, code, last_state, frequency').eq('active', true)
      if (accountId) q = q.eq('account_id', accountId)
      if (body.watch_id) q = q.eq('id', body.watch_id)
      const { data: watches, error } = await q
      if (error) return json({ error: error.message }, 500)
      const result = { checked: 0, changed: 0, baseline: 0, errors: 0 }
      const rows = ((watches || []) as Watch[]).filter((w) => !fromCron || due(w.frequency, t))
      for (const w of rows) {
        const now = new Date().toISOString()
        let cs: { state: string | null; error: string | null }
        try { cs = await currentState(w) } catch (e) { cs = { state: null, error: String((e as Error).message || e) } }
        result.checked++
        const log = async (res: string, message: string | null) => {
          await admin.from('cadastre_checks').insert({ account_id: w.account_id, watch_id: w.id, at: now, result: res, message })
          // držet jen posledních 30 kontrol u každé nemovitosti
          const { data: old } = await admin.from('cadastre_checks').select('id').eq('watch_id', w.id).order('at', { ascending: false }).range(30, 200)
          if (old?.length) await admin.from('cadastre_checks').delete().in('id', old.map((o: { id: string }) => o.id))
        }
        if (cs.error || !cs.state) { result.errors++; await admin.from('cadastre_watch').update({ last_checked: now, error: cs.error }).eq('id', w.id); await log('error', cs.error); continue }
        const upd: Record<string, unknown> = { last_checked: now, error: null, last_state: cs.state }
        let res = 'ok'
        if (!w.last_state) { result.baseline++; upd.last_change_at = null; res = 'baseline' }
        else if (w.last_state !== cs.state) {
          result.changed++; upd.last_change_at = now; res = 'change'
          await admin.from('cadastre_changes').insert({ account_id: w.account_id, watch_id: w.id, old_state: w.last_state, new_state: cs.state })
        }
        await admin.from('cadastre_watch').update(upd).eq('id', w.id)
        await log(res, res === 'change' ? 'Změna v katastru' : null)
      }
      return json({ ok: true, ...result })
    }
    return json({ error: 'Neznámá akce.' }, 400)
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
