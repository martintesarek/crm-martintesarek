// Zuzanka na OpenAI: vydá krátkodobý klientský klíč pro Realtime API (WebRTC),
// aby se prohlížeč připojil přímo a OPENAI_API_KEY zůstal na serveru.
// Vyžaduje přihlášeného uživatele. Tělo požadavku: { session: {...} } – nastavení relace
// (instrukce, hlas, nástroje) posílá aplikace; model se vynutí zde.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MODEL = 'gpt-realtime-2'

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
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(user.id, 'openai-token', 40, 3600))) return json(TOO_MANY, 429)

    const key = Deno.env.get('OPENAI_API_KEY')
    if (!key) return json({ error: 'Chybí OPENAI_API_KEY v Supabase → Edge Functions → Secrets.' }, 500)

    const body = await req.json().catch(() => ({}))
    const session = { ...(body?.session || {}), type: 'realtime', model: MODEL }
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: 600 }, session }),
    })
    const data = await r.json()
    if (!r.ok || !data?.value) return json({ error: 'OpenAI: ' + (data?.error?.message || JSON.stringify(data)) }, 502)
    return json({ token: data.value, expires_at: data.expires_at, model: MODEL })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
