// Hlasová poznámka: stáhne nahrávku ze Storage, nechá ji přepsat a zpracovat AI
// a vrátí návrh kroků (komentář, další krok, úkoly). Nic do obchodů nezapisuje –
// to dělá aplikace až po potvrzení uživatelem.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Proposal = {
  transcript: string
  deal_id: string | null
  comment: string
  next_step: { text: string; at: string | null } | null
  tasks: { title: string; due_at: string | null }[]
}

const SCHEMA = {
  type: 'object',
  properties: {
    transcript: { type: 'string', description: 'Doslovný přepis nahrávky v češtině.' },
    deal_id: { type: 'string', nullable: true, description: 'ID obchodu ze seznamu, ke kterému poznámka patří, nebo null.' },
    comment: { type: 'string', description: 'Stručné shrnutí do komentáře obchodu (1–3 věty, věcně, česky).' },
    next_step: {
      type: 'object', nullable: true,
      properties: { text: { type: 'string' }, at: { type: 'string', nullable: true, description: 'ISO 8601 s časovou zónou Europe/Prague, nebo null.' } },
      required: ['text'],
    },
    tasks: {
      type: 'array',
      items: { type: 'object', properties: { title: { type: 'string' }, due_at: { type: 'string', nullable: true } }, required: ['title'] },
    },
  },
  required: ['transcript', 'comment', 'tasks'],
}

function prompt(now: string, deals: string, fixedDeal: string | null) {
  return `Jsi asistent realitního makléře Martina Tesárka. Dostaneš hlasovou poznámku nahranou typicky za jízdy autem.
Aktuální datum a čas: ${now} (Europe/Prague). Relativní termíny („v pondělí“, „zítra ráno“, „za týden“) převeď na konkrétní datum a čas; když čas nezazní, použij 9:00.
${fixedDeal ? `Poznámka patří k obchodu s ID ${fixedDeal}. Do deal_id vrať toto ID.` : `Urči, ke kterému obchodu poznámka patří (podle jména klienta, obce, adresy). Když si nejsi jistý, vrať deal_id null.`}
Seznam otevřených obchodů (ID | název | klienti | adresa):
${deals}

Vrať JSON:
- transcript: přepis nahrávky,
- comment: stručné věcné shrnutí obsahu poznámky (co klient chce, co bylo domluveno, jaká je situace). Nepopisuj, že byl zadán úkol – to systém dělá sám.
- next_step: JEDNA nejbližší akce s termínem, pokud z poznámky plyne (jinak null),
- tasks: DALŠÍ konkrétní úkoly nad rámec next_step (zavolat, poslat, připravit…), s termínem pokud zazněl. Akce uvedená v next_step se v tasks NEOPAKUJE. Když z poznámky plyne jen jedna akce, patří do next_step a tasks je prázdné. Nevymýšlej úkoly, které nezazněly.`
}

const b64 = (audio: Uint8Array) => {
  let s = ''
  for (let i = 0; i < audio.length; i += 0x8000) s += String.fromCharCode(...audio.subarray(i, i + 0x8000))
  return btoa(s)
}
const extOf = (mime: string) => (mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm')

// ---------- Přepis (speech-to-text) ----------
async function transcribeElevenLabs(key: string, audio: Uint8Array, mime: string) {
  const fd = new FormData()
  fd.append('file', new Blob([audio], { type: mime }), `note.${extOf(mime)}`)
  fd.append('model_id', 'scribe_v1')
  fd.append('language_code', 'ces')
  fd.append('tag_audio_events', 'false')
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: fd })
  if (!r.ok) throw new Error('ElevenLabs přepis: ' + (await r.text()).slice(0, 300))
  return (await r.json()).text as string
}
async function transcribeOpenAI(key: string, audio: Uint8Array, mime: string) {
  const fd = new FormData()
  fd.append('file', new Blob([audio], { type: mime }), `note.${extOf(mime)}`)
  fd.append('model', 'gpt-4o-transcribe')
  fd.append('language', 'cs')
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd })
  if (!r.ok) throw new Error('OpenAI přepis: ' + (await r.text()).slice(0, 300))
  return (await r.json()).text as string
}

// ---------- Zpracování textu do kroků ----------
const JSON_HINT = '\nOdpověz pouze JSON objektem s klíči transcript, deal_id, comment, next_step {text, at} nebo null, tasks [{title, due_at}]. Bez dalšího textu.'
const parse = (t: string) => JSON.parse(t.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim())

async function structureAnthropic(key: string, sys: string, transcript: string) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-5-5', max_tokens: 1500, system: sys + JSON_HINT, messages: [{ role: 'user', content: `Přepis nahrávky:\n${transcript}` }] }),
  })
  if (!r.ok) throw new Error('Claude: ' + (await r.text()).slice(0, 300))
  return parse((await r.json()).content[0].text)
}
async function structureOpenAI(key: string, sys: string, transcript: string) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4.1-mini', temperature: 0.2, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sys + JSON_HINT }, { role: 'user', content: `Přepis nahrávky:\n${transcript}` }] }),
  })
  if (!r.ok) throw new Error('OpenAI: ' + (await r.text()).slice(0, 300))
  return parse((await r.json()).choices[0].message.content)
}
async function gemini(key: string, parts: unknown[]) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash'}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 } }),
  })
  if (!r.ok) throw new Error('Gemini: ' + (await r.text()).slice(0, 300))
  return parse((await r.json()).candidates?.[0]?.content?.parts?.[0]?.text || '{}')
}

async function runAI(audio: Uint8Array, mime: string, sys: string): Promise<Proposal> {
  const env = (k: string) => Deno.env.get(k)
  const [eleven, openai, anthropic, gem] = [env('ELEVENLABS_API_KEY'), env('OPENAI_API_KEY'), env('ANTHROPIC_API_KEY'), env('GEMINI_API_KEY')]
  if (!anthropic && !openai && !gem) throw new Error('Chybí klíč pro AI zpracování (ANTHROPIC_API_KEY, OPENAI_API_KEY nebo GEMINI_API_KEY v Supabase → Edge Functions → Secrets).')
  // 1) přepis
  let transcript: string | null = null
  if (eleven) transcript = await transcribeElevenLabs(eleven, audio, mime)
  else if (openai) transcript = await transcribeOpenAI(openai, audio, mime)
  // 2) zpracování
  if (transcript == null && !gem) throw new Error('Pro přepis řeči chybí ELEVENLABS_API_KEY, OPENAI_API_KEY nebo GEMINI_API_KEY.')
  if (transcript == null) return await gemini(gem!, [{ text: sys }, { inline_data: { mime_type: mime, data: b64(audio) } }]) // Gemini zvládne audio rovnou
  const out = anthropic ? await structureAnthropic(anthropic, sys, transcript)
    : openai ? await structureOpenAI(openai, sys, transcript)
    : await gemini(gem!, [{ text: sys + `\n\nPřepis nahrávky:\n${transcript}` }])
  return { ...out, transcript }
}

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
    const { path, deal_id, voice_note_id } = await req.json()
    const url = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('Authorization') || ''
    // Klient s právy přihlášeného uživatele – RLS ohlídá přístup k účtu a obchodům.
    const sb = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })

    const accountId = String(path || '').split('/')[0]
    const { data: member } = await sb.from('memberships').select('account_id').eq('account_id', accountId).limit(1)
    if (!member?.length) return json({ error: 'Nemáte přístup k tomuto účtu.' }, 403)

    const { data: { user: vu } } = await sb.auth.getUser()
    if (!vu) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(vu.id, 'voice-note', 60, 3600))) return json(TOO_MANY, 429)
    const { data: file, error: dlErr } = await sb.storage.from('voice').download(path)
    if (dlErr || !file) return json({ error: 'Nahrávku se nepodařilo načíst.' }, 400)
    const audio = new Uint8Array(await file.arrayBuffer())
    const mime = (file.type || 'audio/webm').split(';')[0]

    const { data: deals } = await sb.from('deals')
      .select('id, title, address, stages!inner(kind), deal_contacts(contacts(first_name, last_name))')
      .eq('account_id', accountId).eq('stages.kind', 'open').limit(300)
    const list = (deals || []).map((d: any) =>
      `${d.id} | ${d.title} | ${(d.deal_contacts || []).map((x: any) => [x.contacts?.first_name, x.contacts?.last_name].filter(Boolean).join(' ')).join(', ')} | ${d.address || ''}`).join('\n')

    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Prague' }).replace(' ', 'T')
    const text = prompt(now + ' ' + new Date().toLocaleDateString('cs-CZ', { weekday: 'long', timeZone: 'Europe/Prague' }), list, deal_id || null)

    const result = await runAI(audio, mime, text)

    if (deal_id) result.deal_id = deal_id
    if (result.deal_id && !(deals || []).some((d: any) => d.id === result.deal_id) && !deal_id) result.deal_id = null
    result.tasks = result.tasks || []
    // Pojistka proti duplicitě: úkol shodný s dalším krokem vyhoď
    const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    if (result.next_step?.text) {
      const ns = norm(result.next_step.text)
      result.tasks = result.tasks.filter((t: { title: string }) => { const tt = norm(t.title); return tt !== ns && !tt.includes(ns) && !ns.includes(tt) })
    }

    if (voice_note_id) await sb.from('voice_notes').update({ transcript: result.transcript, result, status: 'processed', deal_id: result.deal_id }).eq('id', voice_note_id)
    return json(result)
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
