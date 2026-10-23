// Vyhledání bytového družstva / SVJ v registru ARES podle názvu nebo IČO.
// Vrací jen návrh (IČO, název, sídlo, odkazy na rejstřík a Sbírku listin). Nic neukládá.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const ARES = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty'

async function rl(uid: string | undefined, bucket: string, max: number, seconds: number): Promise<boolean> {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await admin.rpc('rate_check', { p_uid: uid || 'anon', p_bucket: bucket, p_max: max, p_seconds: seconds })
    return error ? true : data !== false
  } catch { return true }
}

type Sub = { ico?: string; obchodniJmeno?: string; sidlo?: { textovaAdresa?: string }; pravniForma?: string; datumVzniku?: string; datumZaniku?: string }
const FORMY: Record<string, string> = { '205': 'Družstvo', '145': 'Společenství vlastníků jednotek', '706': 'Spolek', '101': 'Fyzická osoba' }
const map = (s: Sub) => {
  const ico = String(s.ico || '')
  return {
    ico, name: s.obchodniJmeno || '', address: s.sidlo?.textovaAdresa || '', form: FORMY[String(s.pravniForma)] || null,
    founded: s.datumVzniku || null, ended: s.datumZaniku || null,
    links: {
      rejstrik: `https://or.justice.cz/ias/ui/rejstrik-$firma?ico=${ico}`,
      sbirka: `https://or.justice.cz/ias/ui/rejstrik-$firma?ico=${ico}`,
      ares: `https://ares.gov.cz/ekonomicke-subjekty?ico=${ico}`,
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const b = await req.json()
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: uerr } = await admin.auth.getUser(jwt)
    if (!user) return json({ error: 'Nepřihlášen.' + (uerr ? ' (' + uerr.message + ')' : jwt ? '' : ' (chybí přihlašovací údaj)') }, 401)
    if (!(await rl(user.id, 'svj-lookup', 60, 3600))) return json({ error: 'Příliš mnoho požadavků, zkuste to prosím za chvíli.' }, 429)
    const name = String(b.name || '').trim().slice(0, 150)
    if (name.length < 3) return json({ error: 'Napište název družstva nebo SVJ (aspoň 3 znaky) nebo IČO.' }, 400)
    const icoOnly = name.replace(/\s/g, '')
    let subs: Sub[] = []
    if (/^\d{6,8}$/.test(icoOnly)) {
      const r = await fetch(`${ARES}/${icoOnly.padStart(8, '0')}`, { headers: { Accept: 'application/json' } })
      if (r.ok) subs = [await r.json()]
      else if (r.status !== 404) return json({ error: 'Registr ARES neodpovídá (' + r.status + '). Zkuste to za chvíli.' }, 502)
    } else {
      const r = await fetch(`${ARES}/vyhledat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ obchodniJmeno: name, start: 0, pocet: 10 }) })
      if (!r.ok) return json({ error: 'Registr ARES neodpovídá (' + r.status + '). Zkuste to za chvíli.' }, 502)
      subs = ((await r.json()).ekonomickeSubjekty || []) as Sub[]
    }
    const candidates = subs.filter((s) => s.ico).map(map)
    // družstva a SVJ nahoru
    candidates.sort((a, c) => Number(!!c.form) - Number(!!a.form))
    return json({ candidates })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
