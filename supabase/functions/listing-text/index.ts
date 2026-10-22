// Návrh nadpisu a popisu inzerátu z údajů náběrového formuláře. Nic neukládá – jen vrací text.
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

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Nadpis inzerátu, nejvýše 80 znaků' },
    description: { type: 'string', description: 'Popis inzerátu v odstavcích oddělených prázdným řádkem' },
  },
  required: ['title', 'description'],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { type, facts, addr_mode, deal_id } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(user.id, 'listing-text', 40, 3600))) return json({ error: 'Příliš mnoho požadavků, zkuste to prosím za chvíli.' }, 429)
    const { data: deal } = await sb.from('deals').select('id').eq('id', deal_id).single()
    if (!deal) return json({ error: 'Obchod nenalezen nebo k němu nemáte přístup.' }, 403)
    const text = String(facts || '').slice(0, 12000)
    if (text.length < 30) return json({ error: 'Ve formuláři je zatím málo údajů. Nejdřív vyplňte nebo načtěte z Disku základní údaje.' }, 400)
    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return json({ error: 'Chybí GEMINI_API_KEY.' }, 500)
    const typeName = ({ byt: 'byt', dum: 'dům', pozemek: 'pozemek' } as Record<string, string>)[String(type)] || 'nemovitost'
    const prompt = `Jsi zkušený realitní makléř a copywriter. Napiš nadpis a popis inzerátu na prodej nemovitosti (${typeName}) pro portály Sreality, Reality iDNES a Bazoš, česky.

Pravidla:
- Použij POUZE údaje z níže uvedených dat. Nic si nevymýšlej, nepřidávej vlastnosti, které tam nejsou, a nehádej.
- Nadpis: věcný, konkrétní, do 80 znaků (typ nemovitosti, dispozice nebo plocha, lokalita, případně jedna silná přednost). Bez vykřičníků, bez velkých písmen celých slov, bez emoji.
- Popis: 900 až 1500 znaků, 3 až 5 krátkých odstavců oddělených prázdným řádkem: 1) co se prodává a kde, 2) dispozice, plochy a stav, 3) vybavení, technika, energie, 4) okolí a doprava, 5) jedna klidná věta závěrem (např. nabídka prohlídky). Bez odrážek, bez emoji, bez frází jako „unikátní příležitost“ a bez superlativů, které nejsou podložené.
- Nepiš cenu, nepiš jména vlastníků, nepiš čísla LV, parcel ani zástavní práva. Pokud je uvedeno, že nemovitost lze financovat hypotečním úvěrem, můžeš to zmínit jednou větou.
- Adresa v inzerátu: režim zobrazení je „${addr_mode || 'Přesně'}“. Při „Jen obec“ nepiš ulici a číslo, při „Jen ulice“ nepiš číslo popisné. Při „Přesně“ ulici zmínit můžeš.
- Údaje o poplatcích (fond oprav, služby) uveď jen pokud jsou v datech, a stručně.

DATA Z NÁBĚROVÉHO FORMULÁŘE:
${text}`
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash'}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.5 } }),
    })
    if (!r.ok) return json({ error: 'Gemini: ' + (await r.text()).slice(0, 300) }, 502)
    const d = await r.json()
    const out = JSON.parse(d.candidates?.[0]?.content?.parts?.[0]?.text || '{}')
    const title = String(out.title || '').trim().slice(0, 120)
    const description = String(out.description || '').trim().slice(0, 4000)
    if (!title || !description) return json({ error: 'Text se nepodařilo vytvořit, zkuste to prosím znovu.' }, 502)
    return json({ title, description })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
