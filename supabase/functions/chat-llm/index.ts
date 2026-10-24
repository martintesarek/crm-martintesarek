// Textový AI chat v CRM: průchozí volání Gemini (klíč zůstává na serveru).
// Nástroje (čtení dat CRM) se spouštějí v prohlížeči pod přihlášením uživatele, tady je jen jazykový model.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function rl(uid: string, bucket: string, max: number, seconds: number): Promise<boolean> {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await admin.rpc('rate_check', { p_uid: uid, p_bucket: bucket, p_max: max, p_seconds: seconds })
    return error ? true : data !== false
  } catch { return true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization') || ''
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(user.id, 'chat-llm', 300, 3600))) return json({ error: 'Příliš mnoho požadavků, zkuste to prosím za chvíli.' }, 429)
    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return json({ error: 'Chybí GEMINI_API_KEY.' }, 500)
    const { contents, system, tools } = await req.json()
    if (!Array.isArray(contents) || contents.length === 0 || contents.length > 60) return json({ error: 'Neplatný požadavek.' }, 400)
    const body: Record<string, unknown> = { contents, generationConfig: { temperature: 0.3 } }
    if (typeof system === 'string') body.systemInstruction = { parts: [{ text: system.slice(0, 8000) }] }
    if (Array.isArray(tools) && tools.length) body.tools = [{ functionDeclarations: tools }]
    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash'
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await r.json()
    if (!r.ok) return json({ error: 'Gemini: ' + (data?.error?.message || r.status) }, 502)
    return json({ content: data?.candidates?.[0]?.content || null, finish: data?.candidates?.[0]?.finishReason || null })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
