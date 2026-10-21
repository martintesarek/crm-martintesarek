// Živý hlasový asistent: vydá krátkodobý (ephemeral) token pro Gemini Live API,
// aby se prohlížeč mohl připojit přímo, bez odhalení GEMINI_API_KEY.
// Vyžaduje přihlášeného uživatele (JWT v hlavičce Authorization).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

export const LIVE_MODEL = 'gemini-3.8-live'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization') || ''
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return json({ error: 'Nepřihlášen.' }, 401)

    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return json({ error: 'Chybí GEMINI_API_KEY.' }, 500)

    const now = Date.now()
    const body = {
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
    }
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await r.json()
    if (!r.ok || !data?.name) return json({ error: 'Gemini: ' + (data?.error?.message || JSON.stringify(data)) }, 502)
    return json({ token: data.name, expireTime: data.expireTime, model: LIVE_MODEL })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
