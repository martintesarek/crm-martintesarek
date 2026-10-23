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

// Přihlášení ověříme přímo dotazem na Supabase Auth (nezávisle na verzi knihovny).
async function authUser(hdr: string): Promise<{ id?: string; err?: string }> {
  if (!/^Bearer\s+\S+/i.test(hdr)) return { err: 'chybí přihlašovací údaj' }
  const key = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, { headers: { Authorization: hdr, apikey: key } })
  if (!r.ok) {
    const t = await r.text()
    return { err: /session_not_found/.test(t) ? 'platnost přihlášení vypršela – odhlaste se a přihlaste znovu' : 'ověření ' + r.status }
  }
  const u = await r.json()
  return u?.id ? { id: u.id } : { err: 'bez uživatele' }
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


// Sbírka listin na justice.cz: najde subjektId podle IČO a vypíše účetní závěrky (odkazy na PDF).
const J = 'https://or.justice.cz'
const UA = { 'User-Agent': 'Mozilla/5.0 (CRM Martin Tesarek)', 'Accept-Language': 'cs' }
const dec = (t: string) => t.replace(/&amp;/g, '&').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
const strip = (t: string) => dec(t.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
async function getPage(u: string): Promise<{ html: string; url: string }> {
  const r = await fetch(u, { redirect: 'follow', headers: UA })
  if (!r.ok) throw new Error('Server justice.cz odpověděl ' + r.status + '.')
  return { html: await r.text(), url: r.url }
}
async function documents(ico: string) {
  const s1 = await getPage(`${J}/ias/ui/rejstrik-$firma?ico=${ico}`)
  let sid = /subjektId=(\d+)/.exec(s1.html)?.[1] || /subjektId=(\d+)/.exec(s1.url)?.[1]
  if (!sid) throw new Error('Na justice.cz jsem k tomuto IČO nenašel záznam v rejstříku. Zkuste odkaz otevřít ručně.')
  const s2 = await getPage(`${J}/ias/ui/vypis-sl-firma?subjektId=${sid}`)
  const rows = [...s2.html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0])
  const out: { label: string; year: string | null; url: string | null; detail: string | null; received: string | null }[] = []
  for (const row of rows) {
    const text = strip(row)
    if (!/(účetní závěrka|výroční zpráva|zpráva o hospodaření|vyúčtování)/i.test(text)) continue
    const href = [...row.matchAll(/href="([^"]+)"/gi)].map((m) => dec(m[1]))
    const abs = (h: string) => (h.startsWith('http') ? h : h.startsWith('/') ? J + h : J + '/ias/ui/' + h.replace(/^\.\//, ''))
    const pdf = href.find((h) => /download|content/i.test(h))
    const det = href.find((h) => /listina=|detail/i.test(h))
    const year = /\b(20\d{2})\b/.exec(text.replace(/\d{1,2}\.\s?\d{1,2}\.\s?20\d{2}/g, ''))?.[1] || null
    const rec = /(\d{1,2}\.\s?\d{1,2}\.\s?20\d{2})/.exec(text)?.[1] || null
    out.push({ label: text.slice(0, 160), year, url: pdf ? abs(pdf) : null, detail: det ? abs(det) : null, received: rec })
  }
  return { subjektId: sid, page: s2.url, docs: out.slice(0, 20), rowsSeen: rows.length, sample: out.length ? undefined : strip(s2.html).slice(0, 600) }
}

// Přečtení poslední účetní závěrky (rozvaha, výsledovka, příloha) přes Gemini – jen návrh čísel.
const SCHEMA_FIN = {
  type: 'object',
  properties: {
    year: { type: 'number', nullable: true, description: 'Rok, za který je závěrka (konec účetního období)' },
    fund_repairs: { type: 'number', nullable: true, description: 'Stav fondu oprav (dlouhodobé zálohy na opravy / fond oprav) na konci období v Kč' },
    cash: { type: 'number', nullable: true, description: 'Peníze na účtech a v hotovosti celkem na konci období v Kč' },
    loans: { type: 'number', nullable: true, description: 'Úvěry, půjčky a dlouhodobé bankovní závazky na konci období v Kč; 0, pokud je v závěrce jasně uvedeno, že žádné nejsou' },
    payables: { type: 'number', nullable: true, description: 'Krátkodobé závazky celkem (dodavatelé, ostatní) na konci období v Kč' },
    receivables_owners: { type: 'number', nullable: true, description: 'Pohledávky za vlastníky jednotek (neuhrazené zálohy) na konci období v Kč' },
    result: { type: 'number', nullable: true, description: 'Výsledek hospodaření za období v Kč (ztráta záporně)' },
    notes: { type: 'array', items: { type: 'string' }, description: 'Další důležité údaje z přílohy (půjčka, spor, plánované opravy, dluh), každé jednou stručnou větou česky; max. 5' },
  },
}
const b64 = (a: Uint8Array) => { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s) }
async function financials(ico: string) {
  const d = await documents(ico)
  const withUrl = d.docs.filter((x) => (x.url || x.detail) && x.year)
  if (!withUrl.length) throw new Error('Nemám k dispozici odkazy na PDF závěrek.')
  const year = withUrl.map((x) => x.year!).sort().pop()!
  const picked = withUrl.filter((x) => x.year === year).slice(0, 4)
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('Chybí GEMINI_API_KEY.')
  const parts: unknown[] = [{ text: `Jsi asistent realitního makléře. Z účetní závěrky společenství vlastníků jednotek nebo bytového družstva (rozvaha, výkaz zisku a ztráty, příloha) za rok ${year} vytěž údaje o hospodaření ke konci účetního období. Částky v celých Kč. Co v dokumentech není, vrať null. Nic nevymýšlej.` }]
  let ok = 0
  const seen: string[] = []
  const absu = (h: string) => (h.startsWith('http') ? h : h.startsWith('/') ? J + h : J + '/ias/ui/' + h.replace(/^\.\//, ''))
  const tryPdf = async (u: string): Promise<Uint8Array | null> => {
    const r = await fetch(u, { redirect: 'follow', headers: UA })
    if (!r.ok) return null
    const buf = new Uint8Array(await r.arrayBuffer())
    if (buf.length > 8_000_000) return null
    const ct = (r.headers.get('content-type') || '').toLowerCase()
    return ct.includes('pdf') || (buf[0] === 0x25 && buf[1] === 0x50) ? buf : null
  }
  for (const x of picked) {
    let buf: Uint8Array | null = null
    if (x.url) buf = await tryPdf(x.url)
    if (!buf && x.detail) {
      // stránka listiny: najít odkaz na samotný soubor
      const page = await getPage(x.detail)
      const hrefs = [...new Set([...page.html.matchAll(/href="([^"]+)"/gi)].map((m) => dec(m[1])))].filter((h) => !/^(#|mailto:|javascript:)/i.test(h)).map(absu)
      const cand = hrefs.filter((h) => /download|content|\.pdf|dokument|soubor|priloha/i.test(h) && h !== x.detail)
      seen.push(...hrefs.slice(0, 6).map((h) => h.replace(J, '')))
      for (const u of cand.slice(0, 6)) { buf = await tryPdf(u); if (buf) break }
    }
    if (!buf) continue
    parts.push({ text: '\n=== ' + x.label.slice(0, 80) + ' ===' }, { inline_data: { mime_type: 'application/pdf', data: b64(buf) } })
    ok++
  }
  if (!ok) throw new Error('PDF závěrek se mi z justice.cz nepodařilo stáhnout. Odkazy na stránce listiny: ' + (seen.slice(0, 8).join(' | ') || 'žádné') + '.')
  const gr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash'}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA_FIN, temperature: 0.1 } }),
  })
  if (!gr.ok) {
    const t = await gr.text()
    throw new Error(gr.status === 402 || /prepay|credit/i.test(t) ? 'Došel kredit u Gemini – dobijte ho v Google AI Studio.' : 'Gemini: ' + t.slice(0, 200))
  }
  const g = JSON.parse((await gr.json()).candidates?.[0]?.content?.parts?.[0]?.text || '{}')
  const n = (v: unknown) => { const x = Number(v); return v != null && isFinite(x) ? Math.round(x) : null }
  return { year, files: ok, fin: { fund_repairs: n(g.fund_repairs), cash: n(g.cash), loans: n(g.loans), payables: n(g.payables), receivables_owners: n(g.receivables_owners), result: n(g.result), notes: (Array.isArray(g.notes) ? g.notes : []).map((x: unknown) => String(x).slice(0, 200)).slice(0, 5) } }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const b = await req.json()
    const au = await authUser(req.headers.get('Authorization') || '')
    if (!au.id) return json({ error: 'Nepřihlášen. (' + au.err + ')' }, 401)
    if (!(await rl(au.id, 'svj-lookup', 60, 3600))) return json({ error: 'Příliš mnoho požadavků, zkuste to prosím za chvíli.' }, 429)
    if (b.action === 'documents') {
      const ico = String(b.ico || '').replace(/\D/g, '')
      if (ico.length < 6 || ico.length > 8) return json({ error: 'Chybí IČO.' }, 400)
      try { return json(await documents(ico.padStart(8, '0'))) } catch (e) { return json({ error: String((e as Error).message || e) }, 502) }
    }
    if (b.action === 'financials') {
      const ico = String(b.ico || '').replace(/\D/g, '')
      if (ico.length < 6 || ico.length > 8) return json({ error: 'Chybí IČO.' }, 400)
      if (!(await rl(au.id, 'svj-fin', 20, 3600))) return json({ error: 'Příliš mnoho požadavků, zkuste to prosím za chvíli.' }, 429)
      try { return json(await financials(ico.padStart(8, '0'))) } catch (e) { return json({ error: String((e as Error).message || e) }, 502) }
    }
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
