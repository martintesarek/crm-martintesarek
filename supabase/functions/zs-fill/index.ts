// Vyplnění zprostředkovatelské smlouvy (ZS) přímo v existujícím Google Dokumentu ve složce klienta „ZS“.
// Údaje bere z CRM (obchod, kontakty) a z listu vlastnictví (LV) ve složce klienta. Nic nevymýšlí:
// co chybí, zapíše žlutě jako [[DOPLNIT: …]]. Servisní účet crm-disk@ musí mít na složce roli „Správce obsahu“.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const b64url = (buf: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : new Uint8Array(buf)
  let s = ''; for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function googleToken(): Promise<string> {
  const raw = Deno.env.get('GOOGLE_SA_KEY')
  if (!raw) throw new Error('Chybí GOOGLE_SA_KEY (klíč servisního účtu).')
  const sa = JSON.parse(raw)
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const pem = String(sa.private_key).replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`))
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claim}.${b64url(sig)}` })
  if (!r.ok) throw new Error('Google token: ' + (await r.text()).slice(0, 200))
  return (await r.json()).access_token
}

const plain = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
type DFile = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string }

async function children(token: string, folderId: string): Promise<DFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error('Složka na Disku není servisnímu účtu dostupná (' + r.status + ').')
  return (await r.json()).files || []
}
const isFolder = (f: DFile) => f.mimeType === 'application/vnd.google-apps.folder'
const newest = (a: DFile, b: DFile) => String(b.modifiedTime).localeCompare(String(a.modifiedTime))

const b64 = (a: Uint8Array) => { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s) }

const LV_SCHEMA = {
  type: 'object',
  properties: {
    property_type: { type: 'string', nullable: true, description: 'byt / dům / pozemek / jiné' },
    unit_no: { type: 'string', nullable: true, description: 'Číslo jednotky (u bytu), např. 944/27' },
    building_cp: { type: 'string', nullable: true, description: 'Číslo popisné budovy, ve které je jednotka / stojí dům (např. 944)' },
    street: { type: 'string', nullable: true, description: 'Ulice (bez čísla), jen pokud je v LV uvedena' },
    city: { type: 'string', nullable: true, description: 'Obec nebo město (u Prahy jen Praha)' },
    cadastre: { type: 'string', nullable: true, description: 'Katastrální území' },
    lv: { type: 'string', nullable: true, description: 'Číslo listu vlastnictví' },
    parcels: { type: 'string', nullable: true, description: 'Parcelní čísla pozemků dotčených nemovitostí, např. 1472 a 1473' },
    common_share: { type: 'string', nullable: true, description: 'U bytu: podíl na společných částech domu a pozemku jako zlomek přesně z LV (4259/161770); jinak null' },
    south_moravia: { type: 'boolean', nullable: true, description: 'true, pokud nemovitost leží v Jihomoravském kraji (okresy Břeclav, Hodonín, Brno-město, Brno-venkov, Vyškov, Blansko, Znojmo)' },
    owners: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, share: { type: 'string', nullable: true, description: 'Spoluvlastnický podíl jako zlomek (1/2); když je ve sloupci podíl prázdno, vrať 1/1; u SJM vrať SJM' } }, required: ['name'] } },
  },
}

async function gemini(parts: unknown[]): Promise<Record<string, any>> {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('Chybí GEMINI_API_KEY.')
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash'}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: LV_SCHEMA, temperature: 0.1 } }),
  })
  if (!r.ok) throw new Error('Gemini: ' + (await r.text()).slice(0, 300))
  const d = await r.json()
  return JSON.parse(d.candidates?.[0]?.content?.parts?.[0]?.text || '{}')
}

async function rl(uid: string | undefined, bucket: string, max: number, seconds: number): Promise<boolean> {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await admin.rpc('rate_check', { p_uid: uid || 'anon', p_bucket: bucket, p_max: max, p_seconds: seconds })
    return error ? true : data !== false
  } catch { return true }
}

const Y = { backgroundColor: { color: { rgbColor: { red: 1, green: 1, blue: 0 } } } }
const fmtKc = (n: number) => Math.round(n).toLocaleString('cs-CZ').replace(/ /g, ' ')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { deal_id, commission } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(user.id, 'zs-fill', 20, 3600))) return json({ error: 'Příliš mnoho požadavků, zkuste to prosím za chvíli.' }, 429)
    const { data: deal, error } = await sb.from('deals').select('id, title, drive_folder_url, listing_price, category, intake').eq('id', deal_id).single()
    if (error || !deal) return json({ error: 'Obchod nenalezen nebo k němu nemáte přístup.' }, 403)
    const m = String(deal.drive_folder_url || '').match(/folders\/([A-Za-z0-9_-]+)/)
    if (!m) return json({ error: 'Obchod nemá přiřazenou složku na Disku. Vložte odkaz na složku klienta v detailu obchodu.' }, 400)
    const pct = Number(String(commission ?? 4).replace(',', '.'))
    if (!isFinite(pct) || pct <= 0 || pct > 20) return json({ error: 'Provize musí být číslo v procentech (např. 4).' }, 400)
    const pctTxt = String(pct).replace('.', ',')

    const token = await googleToken()
    const top = await children(token, m[1])
    const zsFolder = top.find((f) => isFolder(f) && /^\s*zs\b/.test(plain(f.name)))
    if (!zsFolder) return json({ error: 'Ve složce klienta nemám podsložku „ZS“.' }, 404)
    const docs = (await children(token, zsFolder.id)).filter((f) => f.mimeType === 'application/vnd.google-apps.document' && /zprostredkovatel/.test(plain(f.name))).sort(newest)
    if (!docs.length) return json({ error: 'Ve složce „ZS“ nemám žádnou zprostředkovatelskou smlouvu (Google Dokument).' }, 404)
    const doc = docs[0]

    // ---- LV ----
    const lvFolder = top.find((f) => isFolder(f) && /^\s*lv\b/.test(plain(f.name)))
    const lvFiles = lvFolder ? (await children(token, lvFolder.id)).filter((f) => f.mimeType === 'application/pdf' || f.mimeType.startsWith('image/')).sort(newest) : []
    let lv: Record<string, any> = {}
    let lvName: string | null = null
    if (lvFiles.length) {
      const f = lvFiles[0]
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) {
        const data = new Uint8Array(await r.arrayBuffer())
        lvName = f.name
        lv = await gemini([{ text: `Jsi asistent realitního makléře. Z listu vlastnictví (LV) k obchodu „${deal.title}“ vytěž údaje o PRODÁVANÉ nemovitosti. Podíl na společných částech domu a pozemku opiš jako zlomek přesně z LV. U vlastníků uveď jméno a spoluvlastnický podíl (sloupec Podíl; když je prázdný, je to 1/1). Co v dokumentu není, vrať null.` }, { inline_data: { mime_type: f.mimeType, data: b64(data) } }])
      }
    }
    const missing: string[] = []

    // ---- Stažení dokumentu (struktura) ----
    const getDoc = async () => {
      const r = await fetch(`https://docs.googleapis.com/v1/documents/${doc.id}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) throw new Error('Dokument se nepodařilo otevřít (' + r.status + '): ' + (await r.text()).slice(0, 160))
      return await r.json()
    }
    const batch = async (requests: unknown[], rev?: string) => {
      if (!requests.length) return
      const r = await fetch(`https://docs.googleapis.com/v1/documents/${doc.id}:batchUpdate`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests, ...(rev ? { writeControl: { requiredRevisionId: rev } } : {}) }) })
      if (!r.ok) {
        const t = await r.text()
        if (r.status === 403 || r.status === 404) throw new Error('Servisní účet crm-disk@… nemůže dokument upravovat. Nastavte mu na složce KLIENTI roli „Správce obsahu“.')
        throw new Error('Úprava dokumentu: ' + t.slice(0, 200))
      }
    }
    const text = (d: any) => (d.tabs?.[0]?.documentTab?.body?.content || d.body?.content || []) as any[]
    const paragraphs = (d: any) => text(d).filter((e) => e.paragraph).map((e) => ({ start: e.startIndex as number, end: e.endIndex as number, txt: (e.paragraph.elements || []).map((x: any) => x.textRun?.content || '').join('') as string }))

    // ---- 1) náhrady textu (nezávislé na pozicích) ----
    const D = (what: string) => `[[DOPLNIT: ${what}]]`
    const rep = (from: string, to: string) => ({ replaceAllText: { containsText: { text: from, matchCase: true }, replaceText: to } })
    const reqs: unknown[] = []
    reqs.push(rep('bez vybavení/včetně stávajícího vybavení', 'včetně stávajícího vybavení'))
    const kitchen = (deal.intake as any)?.values?.kitchen === true
    reqs.push(rep('zejména ………….', 'zejména ' + (kitchen ? 'kuchyňská linka, ' : '') + D('další vybavení') + '.'))
    reqs.push(rep('minimálně ..................', 'minimálně ' + (deal.listing_price ? fmtKc(Number(deal.listing_price)) : D('minimální kupní cena'))))
    reqs.push(rep('provizi ve výši 4 - 6 %', `provizi ve výši ${pctTxt} %`))
    reqs.push(rep('smluvní pokutu ve výši 4 - 6 %', 'smluvní pokutu ve výši 4 %'))
    await batch(reqs)

    // ---- 2) vložení nemovitosti, místa a data (podle pozic) ----
    let d = await getDoc()
    let ps = paragraphs(d)
    const ins: { at: number; text: string }[] = []
    const plainDoc = ps.map((p) => p.txt).join('')
    {
      const i = ps.findIndex((p) => /Klient prohlašuje, že je vlastníkem:/.test(p.txt))
      if (i >= 0 && ps[i + 1] && ps[i + 1].txt.trim() === '') {
        const share = (lv.owners || []).length ? (lv.owners as any[]).map((o) => (lv.owners.length > 1 ? `${o.name}: ` : '') + (o.share || D('spoluvlastnický podíl'))).join('; ') : D('spoluvlastnický podíl')
        const parc = lv.parcels ? `na pozemcích parc. č. ${lv.parcels}` : D('parcely')
        const ku = lv.cadastre ? `v katastrálním území ${lv.cadastre}` : D('katastrální území')
        const adr = [lv.street, lv.building_cp].filter(Boolean).join(' ')
        let desc: string
        if (String(lv.property_type || '').toLowerCase() === 'byt') {
          desc = `bytová jednotka č. ${lv.unit_no || D('číslo jednotky')} v budově č. p. ${lv.building_cp || D('číslo popisné')}${adr ? ', ' + adr : ''}${lv.city ? ', ' + lv.city : ''}, ${parc}, ${ku}, včetně podílu o velikosti ${lv.common_share || D('podíl na společných částech')} na společných částech budovy a pozemku; spoluvlastnický podíl Klienta: ${share}`
        } else {
          desc = `${lv.property_type && lv.property_type !== 'jiné' ? lv.property_type : D('druh nemovitosti')}${adr ? ' ' + adr : ''}${lv.city ? ', ' + lv.city : ''}, ${parc}, ${ku}; spoluvlastnický podíl Klienta: ${share}`
        }
        if (!lv.cadastre) missing.push('údaje z listu vlastnictví (LV ve složce klienta jsem nenašel nebo nešel přečíst)')
        ins.push({ at: ps[i].end, text: desc }) // vloží se na začátek následujícího (prázdného) odstavce
      }
    }
    const ri = ps.findIndex((p) => p.txt.trim() === 'rodinný stav:')
    if (ri >= 0) ins.push({ at: ps[ri].end - 1, text: D('rodinný stav') })
    const place = lv.south_moravia === true ? 'Ve Valticích' : 'V Praze'
    const today = new Date().toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', year: 'numeric' }).replace(/\s/g, ' ')
    if (!/(V Praze|Ve Valticích) dne/.test(plainDoc)) {
      const iAtt = ps.findIndex((p) => /Příloha 3:/.test(p.txt))
      const sig = ps.findIndex((p, k) => k > Math.max(iAtt, 0) && /^\s*…{5,}/.test(p.txt))
      if (sig >= 0) ins.push({ at: ps[sig].start, text: `${place} dne ${today.replace(/ /g, ' ')}\n` })
    }
    const rev = d.revisionId as string
    const r2: unknown[] = []
    for (const x of ins.sort((a, b) => b.at - a.at)) r2.push({ insertText: { location: { index: x.at }, text: x.text } })
    await batch(r2, rev)

    // ---- 3) žluté zvýraznění všech [[DOPLNIT: …]] ----
    d = await getDoc()
    const yel: unknown[] = []
    const todo: string[] = []
    for (const e of text(d)) {
      for (const el of e.paragraph?.elements || []) {
        const t: string = el.textRun?.content || ''
        for (const mm of t.matchAll(/\[\[(?:DOPLNIT|OVĚŘIT)[^\]]*\]\]/g)) {
          yel.push({ updateTextStyle: { range: { startIndex: el.startIndex + (mm.index as number), endIndex: el.startIndex + (mm.index as number) + mm[0].length }, textStyle: Y, fields: 'backgroundColor' } })
          todo.push(mm[0].replace(/^\[\[[^:]*:\s*/, '').replace(/\]\]$/, ''))
        }
      }
    }
    await batch(yel, d.revisionId)

    const check = await getDoc()
    const full = paragraphs(check).map((p) => p.txt).join('')
    const left = [...(full.match(/…{3,}|\.{6,}/g) || [])].length
    return json({
      ok: true, link: doc.webViewLink || `https://docs.google.com/document/d/${doc.id}/edit`, doc_name: doc.name, lv_file: lvName, place, date: today,
      commission: pct, listing_price: deal.listing_price || null, to_fill: [...new Set(todo)], missing, dotted_left: left,
    })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
