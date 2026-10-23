// Stažení listu vlastnictví z katastru přes WSDP 3.1 (ČÚZK). Secrets: WSDP_USER, WSDP_PASSWORD (vkládá Martin sám).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: u } = await sb.auth.getUser()
    if (!u?.user) return json({ error: 'Nepřihlášen.' }, 401)
    const body = await req.json().catch(() => ({})) as { action?: string; url?: string }
    if (body.action === 'wsdl') {
      const urls = [body.url || 'https://katastr.cuzk.cz/dokumentace/ws31/wsdp/sestavy_v31.wsdl', 'https://katastr.cuzk.gov.cz/dokumentace/ws31/wsdp/sestavy_v31.wsdl']
      const out: unknown[] = []
      for (const url of urls) {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(20_000) })
          const t = await r.text()
          out.push({ url, status: r.status, length: t.length, address: [...t.matchAll(/location="([^"]+)"/g)].map((m) => m[1]), operations: [...t.matchAll(/<(?:wsdl:)?operation name="([^"]+)"/g)].map((m) => m[1]), head: t.slice(0, 300) })
          if (r.ok) break
        } catch (e) { out.push({ url, error: String((e as Error).message) }) }
      }
      return json({ out })
    }
    return json({ error: 'Neznámá akce.' }, 400)
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500) }
})
