// Vytvoření složky klienta na Google Disku (náhrada scénáře z Make „Založení nového klienta na GDrive“):
// složka „Příjmení Jméno“ ve složce roku v KLIENTI, podsložky podle kategorie nemovitosti,
// zkopírované vzory dokumentů, odkaz se uloží do obchodu. Vyžaduje roli „Správce obsahu“ pro servisní účet.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const KLIENTI_ID = '1rf595E3Cjva-5KA9X74fkZshVj1aYgZU'
type Tpl = { folders: string[][]; copies: { file: string; name: string; to: string[] }[] }
const STRUCT: Record<string, Tpl> = {"Byty":{"folders":[["Bezdlužnost (SVJ, BD)"],["Cenové mapy"],["Dispoziční plán"],["Dispoziční plán","Dispoziční plán - původní"],["Dispoziční plán","Dispoziční plán pro inzerci HOTOVO"],["Evidenční list"],["Fotky"],["Fotky","Zákres do fotografie - k editaci"],["Fotky","Zákres do fotografie - HOTOVO"],["Fotky","Původní fotky"],["Fotky","Profi fotky"],["Fotky","Fotky s logem MT"],["Grafika pro sociální sítě"],["Hluková mapa"],["KS, AÚ, Návrh na vklad"],["LV"],["Nabývací titul"],["Nájemní smlouva"],["PENB"],["Povodňová mapa"],["Plná moc"],["Prohlášení vlastníka budovy"],["Projektová dokumentace"],["Projektová dokumentace","Kolaudační souhlas"],["Projektová dokumentace","Stavební povolení s doložkou právní moci"],["Projektová dokumentace","Dokumentace skutečného provedení (Pasport)"],["Předávací protokol"],["RS"],["RS","Podepsaná RS"],["Soupis movitého majetku"],["Text inzerce"],["Video"],["Vizualizace"],["Vyčíslení dluhu"],["Zástavní právo"],["ZS"],["AML"],["AML","OP"],["AML","AML dotazník"],["AML","Čestné prohlášení"],["AML","PEP"],["Smlouva o spolupráci"],["Elekřina, voda, plyn"]],"copies":[{"file":"1JAtYqD9-9NvZ6O6eD7PdLLqygjY-0Dv8Z8MKjzbcxec","name":"Plná moc prodávající OV","to":["Plná moc"]},{"file":"1j5TQheSTJhqAxP-UU90wzREvFmAY0F1bSBuUl-cpYQk","name":"Předávací protokol","to":["Předávací protokol"]},{"file":"1LzJw2UMMUnswmdrsL1scTYPWxjdsGpH4uYLG4cjeswE","name":"Rezervační smlouva","to":["RS"]},{"file":"10CDfNtJUxoSBT8Nclw9po_RFXiAKtvKX4saz57nc-Zg","name":"Zprostředkovatelská smlouva {klient}","to":["ZS"]},{"file":"1Yqn1VccdJmU5Q76ckwFcdCpg65aso_aMGKXiXwfU1S4","name":"","to":["AML","AML dotazník"]},{"file":"13UbLMDi5HFedTxCpDqRReHwTR3qebW6cCAsU9PgVJBk","name":"","to":["AML","AML dotazník"]},{"file":"18xhAG8kOK5MJc96vjeG_Vh-_JMxYeDnZq-5pVTGDeb4","name":"","to":["Smlouva o spolupráci"]}]},"Domy":{"folders":[["Cenové mapy"],["Dispoziční plán"],["Dispoziční plán","Dispoziční plán - původní"],["Dispoziční plán","Dispoziční plán pro inzerci HOTOVO"],["Fotky"],["Fotky","Zákres do fotografie - k editaci"],["Fotky","Zákres do fotografie - HOTOVO"],["Fotky","Původní fotky"],["Fotky","Profi fotky"],["Fotky","Fotky s logem MT"],["Grafika pro sociální sítě"],["Hluková mapa"],["KS, AÚ, Návrh na vklad"],["LV"],["Nabývací titul"],["PENB"],["Povodňová mapa"],["Plná moc"],["Projektová dokumentace"],["Projektová dokumentace","Kolaudační souhlas"],["Projektová dokumentace","Stavební povolení s doložkou právní moci"],["Projektová dokumentace","Dokumentace skutečného provedení (Pasport)"],["Předávací protokol"],["RS"],["RS","Podepsaná RS"],["Soupis movitého majetku"],["Text inzerce"],["Územní plán a regulativy obce"],["Video"],["Vizualizace"],["Vyčíslení dluhu"],["Zástavní právo"],["ZS"],["AML"],["AML","OP"],["AML","AML dotazník"],["AML","Čestné prohlášení"],["AML","PEP"],["Smlouva o spolupráci"],["Elekřina, voda, plyn"]],"copies":[{"file":"1JAtYqD9-9NvZ6O6eD7PdLLqygjY-0Dv8Z8MKjzbcxec","name":"Plná moc prodávající OV","to":["Plná moc"]},{"file":"1j5TQheSTJhqAxP-UU90wzREvFmAY0F1bSBuUl-cpYQk","name":"Předávací protokol","to":["Předávací protokol"]},{"file":"1LzJw2UMMUnswmdrsL1scTYPWxjdsGpH4uYLG4cjeswE","name":"Rezervační smlouva","to":["RS"]},{"file":"10CDfNtJUxoSBT8Nclw9po_RFXiAKtvKX4saz57nc-Zg","name":"Zprostředkovatelská smlouva {klient}","to":["ZS"]},{"file":"1Yqn1VccdJmU5Q76ckwFcdCpg65aso_aMGKXiXwfU1S4","name":"","to":["AML","AML dotazník"]},{"file":"13UbLMDi5HFedTxCpDqRReHwTR3qebW6cCAsU9PgVJBk","name":"","to":["AML","AML dotazník"]},{"file":"18xhAG8kOK5MJc96vjeG_Vh-_JMxYeDnZq-5pVTGDeb4","name":"","to":["Smlouva o spolupráci"]}]},"Pozemky":{"folders":[["Cenové mapy"],["Fotky"],["Fotky","Zákres do fotografie - k editaci"],["Fotky","Zákres do fotografie - HOTOVO"],["Fotky","Původní fotky"],["Fotky","Profi fotky"],["Fotky","Fotky s logem MT"],["Grafika pro sociální sítě"],["Hluková mapa"],["KS, AÚ, Návrh na vklad"],["LV"],["Předběžná informace stavebního úřadu"],["Nabývací titul"],["Povodňová mapa"],["Plná moc"],["Předávací protokol"],["RS"],["RS","Podepsaná RS"],["Text inzerce"],["Územní plán a regulativy obce"],["Video"],["Vizualizace/Zákres pozemku"],["Vyčíslení dluhu"],["Zástavní právo"],["ZS"],["AML"],["AML","OP"],["AML","AML dotazník"],["AML","Čestné prohlášení"],["AML","PEP"],["Smlouva o spolupráci"],["Elekřina, voda, plyn"]],"copies":[{"file":"1KSg4rTLda4S6aUYNJyZrL9V_87avZiC8","name":"","to":["Předběžná informace stavebního úřadu"]},{"file":"1JAtYqD9-9NvZ6O6eD7PdLLqygjY-0Dv8Z8MKjzbcxec","name":"Plná moc prodávající OV","to":["Plná moc"]},{"file":"1j5TQheSTJhqAxP-UU90wzREvFmAY0F1bSBuUl-cpYQk","name":"Předávací protokol","to":["Předávací protokol"]},{"file":"1LzJw2UMMUnswmdrsL1scTYPWxjdsGpH4uYLG4cjeswE","name":"Rezervační smlouva","to":["RS"]},{"file":"10CDfNtJUxoSBT8Nclw9po_RFXiAKtvKX4saz57nc-Zg","name":"Zprostředkovatelská smlouva {klient}","to":["ZS"]},{"file":"1Yqn1VccdJmU5Q76ckwFcdCpg65aso_aMGKXiXwfU1S4","name":"","to":["AML","AML dotazník"]},{"file":"13UbLMDi5HFedTxCpDqRReHwTR3qebW6cCAsU9PgVJBk","name":"","to":["AML","AML dotazník"]},{"file":"18xhAG8kOK5MJc96vjeG_Vh-_JMxYeDnZq-5pVTGDeb4","name":"","to":["Smlouva o spolupráci"]}]},"Komerční nemovitosti":{"folders":[],"copies":[]},"Ostatní":{"folders":[],"copies":[]}}

// ---------- Google servisní účet → access token (zápis na Disk) ----------
const b64url = (buf: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : new Uint8Array(buf)
  let s = ''; for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
let cachedToken: { token: string; exp: number } | null = null
async function driveToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token
  const raw = Deno.env.get('GOOGLE_SA_KEY')
  if (!raw) throw new Error('Chybí GOOGLE_SA_KEY (klíč servisního účtu) v Supabase → Edge Functions → Secrets.')
  const sa = JSON.parse(raw)
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const pem = String(sa.private_key).replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`))
  const jwt = `${header}.${claim}.${b64url(sig)}`
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}` })
  if (!r.ok) throw new Error('Google token: ' + (await r.text()).slice(0, 200))
  const d = await r.json()
  cachedToken = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 }
  return d.access_token
}


const H = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })
async function gfetch(t: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { ...H(t), ...(init.headers || {}) } })
  if (!r.ok) {
    const txt = await r.text()
    if (r.status === 403) throw new Error('Servisní účet nemá právo zapisovat do složky KLIENTI. Ve sdílení nastavte účtu crm-disk@imposing-volt-421216.iam.gserviceaccount.com roli „Správce obsahu“.')
    throw new Error(`Drive ${r.status}: ${txt.slice(0, 200)}`)
  }
  return r.json()
}
const Q = '&supportsAllDrives=true&includeItemsFromAllDrives=true'
async function findChild(t: string, parent: string, name: string): Promise<string | null> {
  const q = encodeURIComponent(`'${parent}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)
  const d = await gfetch(t, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)${Q}`)
  return d.files?.[0]?.id || null
}
async function mkFolder(t: string, parent: string, name: string): Promise<string> {
  const d = await gfetch(t, `https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true`, { method: 'POST', body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) })
  return d.id
}
function categoryKey(c: string | null): string {
  const s = (c || '').toLowerCase()
  if (s.startsWith('byt')) return 'Byty'
  if (s.startsWith('dom')) return 'Domy'
  if (s.startsWith('pozem')) return 'Pozemky'
  if (s.startsWith('komer')) return 'Komerční nemovitosti'
  return 'Ostatní'
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
    const auth = req.headers.get('Authorization') || ''
    const url = Deno.env.get('SUPABASE_URL')!
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: { user: u } } = await user.auth.getUser()
    if (!u) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(u.id, 'drive-folder', 15, 3600))) return json(TOO_MANY, 429)
    const { deal_id } = await req.json()
    const { data: d } = await user.from('deals').select('id, title, category, drive_folder_url, deal_contacts(role, contacts(first_name, last_name))').eq('id', deal_id).maybeSingle()
    if (!d) return json({ error: 'Obchod nenalezen.' }, 404)
    if (d.drive_folder_url) return json({ error: 'Obchod už má složku na Disku (' + d.drive_folder_url + ').' }, 400)

    const dcs = (d.deal_contacts || []) as unknown as { role: string; contacts: { first_name: string | null; last_name: string | null } | null }[]
    const main = dcs.find((x) => /prod/i.test(x.role) && x.contacts) || dcs.find((x) => x.contacts)
    const klient = main?.contacts ? [main.contacts.last_name, main.contacts.first_name].filter(Boolean).join(' ') : ''
    if (!klient) return json({ error: 'Obchod nemá kontakt s příjmením. Nejdřív přidejte klienta.' }, 400)

    const t = await driveToken()
    const year = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', year: 'numeric' }).format(new Date()).replace(/\D/g, '')
    const yearId = await findChild(t, KLIENTI_ID, year)
    if (!yearId) return json({ error: `Ve složce KLIENTI není složka „${year}“. Založte ji a spusťte znovu.` }, 400)
    if (await findChild(t, yearId, klient)) return json({ error: `Složka „${klient}“ už ve složce ${year} existuje.` }, 400)

    const rootId = await mkFolder(t, yearId, klient)
    const tpl = STRUCT[categoryKey(d.category)]
    const ids = new Map<string, string>([['', rootId]])
    const key = (p: string[]) => p.join('\u0000')
    ids.set('', rootId)
    // podsložky po úrovních (souběžně v rámci jedné úrovně)
    const byDepth = new Map<number, string[][]>()
    for (const p of tpl.folders) byDepth.set(p.length, [...(byDepth.get(p.length) || []), p])
    for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
      await Promise.all(byDepth.get(depth)!.map(async (p) => {
        const parent = ids.get(key(p.slice(0, -1)))!
        ids.set(key(p), await mkFolder(t, parent, p[p.length - 1]))
      }))
    }
    // vzory dokumentů
    let failed = 0
    await Promise.all(tpl.copies.map(async (c) => {
      try {
        const parent = ids.get(key(c.to))!
        let name = c.name.replace('{klient}', klient)
        if (!name) name = (await gfetch(t, `https://www.googleapis.com/drive/v3/files/${c.file}?fields=name&supportsAllDrives=true`)).name
        await gfetch(t, `https://www.googleapis.com/drive/v3/files/${c.file}/copy?supportsAllDrives=true&fields=id`, { method: 'POST', body: JSON.stringify({ name, parents: [parent] }) })
      } catch { failed++ }
    }))

    const link = `https://drive.google.com/drive/folders/${rootId}`
    const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await sb.from('deals').update({ drive_folder_url: link }).eq('id', d.id)
    return json({ ok: true, url: link, folder: klient, year, failed_templates: failed, folders: tpl.folders.length })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
