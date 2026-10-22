// Doplnění PSČ podle ulice, čísla popisného, obce (případně katastrálního území). Vrací jen návrh, nic neukládá.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

async function rl(uid: string | undefined, bucket: string, max: number, seconds: number): Promise<boolean> {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await admin.rpc('rate_check', { p_uid: uid || 'anon', p_bucket: bucket, p_max: max, p_seconds: seconds })
    return error ? true : data !== false
  } catch { return true }
}

const clean = (x: unknown) => String(x || '').trim().slice(0, 120)
async function search(params: Record<string, string>) {
  const u = new URL('https://nominatim.openstreetmap.org/search')
  for (const [k, v] of Object.entries({ format: 'jsonv2', addressdetails: '1', countrycodes: 'cz', limit: '5', 'accept-language': 'cs', ...params })) u.searchParams.set(k, v)
  const r = await fetch(u, { headers: { 'User-Agent': 'crm-martintesarek/1.0 (reality@martintesarek.cz)' } })
  if (!r.ok) return []
  return await r.json() as { address?: { postcode?: string; house_number?: string } }[]
}
const pc = (s?: string) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 5 ? d.slice(0, 3) + ' ' + d.slice(3) : '' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const b = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(user.id, 'psc-lookup', 60, 3600))) return json({ error: 'Příliš mnoho požadavků.' }, 429)
    const street = clean(b.street), cp = clean(b.cp), city = clean(b.city) || clean(b.cadastre)
    if (!city) return json({ zip: '' })
    let hits: Awaited<ReturnType<typeof search>> = []
    let exact = false
    if (street || cp) {
      hits = await search({ street: `${cp} ${street}`.trim() || cp, city })
      if (!hits.length && street) hits = await search({ street: `${street} ${cp}`.trim(), city })
      exact = hits.some((h) => pc(h.address?.postcode))
    }
    if (!exact) {
      // bez ulice (typicky menší obec) – PSČ obce; u velkých měst s více PSČ to není jisté
      hits = await search({ city })
    }
    const zip = hits.map((h) => pc(h.address?.postcode)).find(Boolean) || ''
    return json({ zip, exact })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
