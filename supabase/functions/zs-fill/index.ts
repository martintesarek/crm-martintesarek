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
    lv_ok: { type: 'boolean', nullable: true, description: 'true, pokud je dokument opravdu list vlastnictví' },
    land_parcels: { type: 'array', description: 'U domu a pozemků: každý pozemek patřící vlastníkovi zvlášť', items: { type: 'object', properties: { number: { type: 'string', description: 'Parcelní číslo' }, building_cp: { type: 'string', nullable: true, description: 'Číslo popisné budovy stojící na tomto pozemku, pokud nějaká je' } }, required: ['number'] } },
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
    const { deal_id, commission, company } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return json({ error: 'Nepřihlášen.' }, 401)
    if (!(await rl(user.id, 'zs-fill', 20, 3600))) return json({ error: 'Příliš mnoho požadavků, zkuste to prosím za chvíli.' }, 429)
    const { data: deal, error } = await sb.from('deals').select('id, title, drive_folder_url, listing_price, category, intake, deal_contacts(role, position, contacts(id, first_name, last_name, phone, email, street, house_no, city, zip, birth_number))').eq('id', deal_id).single()
    if (error || !deal) return json({ error: 'Obchod nenalezen nebo k němu nemáte přístup.' }, 403)
    const m = String(deal.drive_folder_url || '').match(/folders\/([A-Za-z0-9_-]+)/)
    if (!m) return json({ error: 'Obchod nemá přiřazenou složku na Disku. Vložte odkaz na složku klienta v detailu obchodu.' }, 400)
    const pct = Number(String(commission ?? 4).replace(',', '.'))
    if (!isFinite(pct) || pct <= 0 || pct > 20) return json({ error: 'Provize musí být číslo v procentech (např. 4).' }, 400)
    const pctTxt = String(pct).replace('.', ',')
    const comp = ['re', 'reality', 'prm'].includes(company) ? company : 're'

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
    let lvBytes: Uint8Array | null = null
    let lvMime = ''
    for (const f of lvFiles.slice(0, 3)) {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) continue
      const data = new Uint8Array(await r.arrayBuffer())
      const x = await gemini([{ text: `Jsi asistent realitního makléře. Z listu vlastnictví (LV) k obchodu „${deal.title}“ vytěž údaje o PRODÁVANÉ nemovitosti. Podíl na společných částech domu a pozemku opiš jako zlomek přesně z LV. U vlastníků uveď jméno a spoluvlastnický podíl (sloupec Podíl; když je prázdný, je to 1/1). U domu a pozemků uveď každý pozemek zvlášť. Co v dokumentu není, vrať null.` }, { inline_data: { mime_type: f.mimeType, data: b64(data) } }])
      if (x.cadastre || x.lv) { lv = x; lvName = f.name; lvBytes = data; lvMime = f.mimeType; break }
    }
    const missing: string[] = []
    if (!lvName) missing.push('List vlastnictví ve složce „LV“ jsem nenašel nebo ho nešlo přečíst, proto nejsou vyplněné údaje o nemovitosti.')

    // ---- kontakty (prodávající) ----
    const dc = ((deal as any).deal_contacts || []).filter((x: any) => x.contacts).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    const sel = dc.filter((x: any) => /prodav|seller/.test(plain(String(x.role || ''))))
    const people: any[] = []
    for (const x of (sel.length ? sel : dc)) {
      const c = x.contacts
      let rc = String(c.birth_number || '')
      if (rc.startsWith('enc:')) { const { data } = await sb.rpc('reveal_birth_number', { p_contact: c.id }); rc = typeof data === 'string' ? data : '' }
      people.push({ name: [c.first_name, c.last_name].filter(Boolean).join(' '), rc, address: [[c.street, c.house_no].filter(Boolean).join(' '), [c.zip, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', '), email: c.email || '', phone: c.phone || '' })
    }

    // ---- dokument ----
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
    type Par = { start: number; end: number; txt: string; els: { s: number; len: number }[] }
    const text = (d: any) => (d.tabs?.[0]?.documentTab?.body?.content || d.body?.content || []) as any[]
    const paragraphs = (d: any): Par[] => text(d).filter((e) => e.paragraph).map((e) => {
      const els = (e.paragraph.elements || []).map((x: any) => ({ s: x.startIndex as number, len: x.textRun ? String(x.textRun.content).length : 0, t: x.textRun ? String(x.textRun.content) : '' }))
      return { start: e.startIndex as number, end: e.endIndex as number, txt: els.map((x: any) => x.t).join(''), els }
    })
    const idxOf = (p: Par, off: number) => { let acc = 0; for (const e of p.els) { if (off <= acc + e.len && e.len) return e.s + (off - acc); acc += e.len } return p.end - 1 }

    // 1) jednoduché náhrady textu
    const D = (what: string) => `[[DOPLNIT: ${what}]]`
    const rep = (from: string, to: string) => ({ replaceAllText: { containsText: { text: from, matchCase: true }, replaceText: to } })
    // Osobní vlastnictví (vše kromě družstevního bytu): z Čl. I odst. 3 vypustit převod družstevního podílu (pravidlo Martina, 23. 10. 2026)
    const coop = /družstev|druzstev/i.test(String((deal.intake as any)?.values?.ownership || '') + ' ' + String(deal.category || ''))
    await batch([
      ...(coop ? [] : [
        rep(', či smlouvu o převodu družstevního podílu –', ' –'),
        rep(' či smlouvu o převodu družstevního podílu –', ' –'),
        rep(', či smlouvu o převodu družstevního podílu', ''),
      ]),
      rep('bez vybavení/včetně stávajícího vybavení', 'včetně stávajícího vybavení'),
      rep('minimálně ..................', 'minimálně ' + (deal.listing_price ? fmtKc(Number(deal.listing_price)) : D('minimální kupní cena'))),
      rep('provizi ve výši 4 - 6 %', `provizi ve výši ${pctTxt} %`),
      rep('smluvní pokutu ve výši 4 - 6 %', 'smluvní pokutu ve výši 4 %'),
    ])

    // 2) úpravy podle pozic (jedna dávka, od konce dokumentu)
    let d = await getDoc()
    const ps = paragraphs(d)
    type Op = { a: number; b: number; text: string }
    const ops: Op[] = []
    const plainDoc = ps.map((p) => p.txt).join('')
    const lastEl = (p: Par) => p.end - 1

    // A) výběr firmy zprostředkovatele (ve vzoru jsou tři varianty oddělené „nebo“)
    const cRe: [string, RegExp][] = [['re', /^MARTIN TESAREK REAL ESTATE/], ['reality', /^MARTIN TESÁREK REALITY/], ['prm', /^PROFESIONÁLNÍ REALITNÍ MAKLÉŘ/]]
    const blocks = cRe.map(([k, re]) => { const zw = (t: string) => t.replace(/[\u200a\u200b]/g, '').trim(); const s = ps.findIndex((p) => re.test(zw(p.txt))); const e = s < 0 ? -1 : ps.findIndex((p, i) => i > s && /dále též jen „Zprostředkovatel“/.test(p.txt)); return { k, s, e } })
    if (blocks.every((b) => b.s >= 0 && b.e > b.s)) {
      const keep = blocks.find((b) => b.k === comp)!
      const first = Math.min(...blocks.map((b) => b.s)); const last = Math.max(...blocks.map((b) => b.e))
      if (ps[keep.s].start > ps[first].start) ops.push({ a: ps[first].start, b: ps[keep.s].start, text: '' })
      if (ps[last].end > ps[keep.e].end) ops.push({ a: ps[keep.e].end, b: ps[last].end, text: '' })
    }

    // B) údaje klienta (prázdné řádky v záhlaví smlouvy)
    const iNameLine = ps.findIndex((p) => p.txt.trim() === 'jméno, příjmení:')
    const iDale = ps.findIndex((p, i) => i > Math.max(iNameLine, 0) && /^dále též \(v případě více osob/.test(p.txt))
    if (iNameLine >= 0 && iDale > iNameLine) {
      const val = (p: Par, v: string) => ops.push({ a: lastEl(p), b: lastEl(p), text: (p.txt.replace(/\n$/, '').endsWith(' ') ? '' : ' ') + v })
      const line = (label: string, p?: any) => {
        switch (label) {
          case 'jméno, příjmení:': return p?.name || D('jméno a příjmení')
          case 'RČ:': return p?.rc || D('rodné číslo')
          case 'rodinný stav:': return D('rodinný stav')
          case 'trvale bytem:': return p?.address || D('adresa trvalého bydliště')
          case 'e-mail:': return p?.email || D('e-mail')
          default: return p?.phone || D('telefon')
        }
      }
      for (let i = iNameLine; i < iDale; i++) {
        const t = ps[i].txt.trim()
        if (['jméno, příjmení:', 'RČ:', 'rodinný stav:', 'trvale bytem:', 'e-mail:', 'tel.:'].includes(t)) val(ps[i], line(t, people[0]))
      }
      if (people.length > 1 && ps[iNameLine].txt.trim() === 'jméno, příjmení:') {
        const extra = people.slice(1).map((p) => ['a', ...['jméno, příjmení:', 'RČ:', 'rodinný stav:', 'trvale bytem:', 'e-mail:', 'tel.:'].map((l) => `${l} ${line(l, p)}`)].join('\n') + '\n').join('')
        ops.push({ a: ps[iDale].start, b: ps[iDale].start, text: extra })
      }
      if (!people.length) missing.push('V obchodě nejsou žádní prodávající, proto jsou údaje klienta žlutě k doplnění.')
    }

    // C) nemovitost
    const ku = lv.cadastre ? String(lv.cadastre) : D('katastrální území')
    const own = (lv.owners || []) as any[]
    const shareTxt = own.length > 1 || (own[0] && own[0].share && !/^1\s*\/\s*1$|^SJM$/i.test(own[0].share)) ? own.map((o) => (own.length > 1 ? `${o.name}: ` : '') + (o.share || D('spoluvlastnický podíl'))).join('; ') : ''
    const lvNo = lv.lv || D('číslo LV')
    const iOwn = ps.findIndex((p) => /Klient prohlašuje, že je vlastníkem:/.test(p.txt))
    const iVar = ps.findIndex((p, i) => i > iOwn && /^VARIANTA BYT/.test(p.txt.trim()))
    const iNem = ps.findIndex((p, i) => i > iOwn && /^\(dále jen „Nemovitost“/.test(p.txt.trim()))
    const kind = String(lv.property_type || '').toLowerCase()
    if (iOwn >= 0 && iVar > iOwn && iNem > iVar) {
      let t = ''
      if (kind === 'byt') {
        t = `- bytové jednotky č. ${lv.unit_no || D('číslo jednotky')} nacházející se v budově č. p. ${lv.building_cp || D('číslo popisné')}, byt. dům, v obci ${lv.city || D('obec')}, katastrální území ${ku}, postavené na pozemku parc. č. ${lv.parcels || D('parcela')} včetně souvisejících podílů na společných částech (podíl ${lv.common_share || D('podíl na společných částech')})${shareTxt ? ', spoluvlastnický podíl Klienta: ' + shareTxt : ''}, jak je zapsáno na listu vlastnictví číslo ${lvNo}, který je přílohou této Smlouvy.\n`
      } else if ((kind === 'dům' || kind === 'pozemek') && (lv.land_parcels || []).length) {
        t = (lv.land_parcels as any[]).map((x, i, a) => `- pozemku parc. č. ${x.number}${x.building_cp ? ', na němž je umístěna budova č. p. ' + x.building_cp : ''}${i < a.length - 1 ? ',' : ','}\n`).join('') + `vše v katastrálním území ${ku}, obec ${lv.city || D('obec')}${shareTxt ? ', spoluvlastnický podíl Klienta: ' + shareTxt : ''}, jak je zapsáno na listu vlastnictví číslo ${lvNo}, který je přílohou této Smlouvy.\n`
      } else if (lvName) missing.push('Druh nemovitosti z LV se nepodařilo určit (byt / dům / pozemek). Variantu nemovitosti ve smlouvě vyberte ručně.')
      if (t) ops.push({ a: ps[iVar].start, b: ps[iNem].start, text: t })
    } else if (iOwn >= 0 && ps[iOwn + 1] && ps[iOwn + 1].txt.trim() === '' && lvName && kind === 'byt') {
      ops.push({ a: ps[iOwn].end, b: ps[iOwn].end, text: `bytová jednotka č. ${lv.unit_no || D('číslo jednotky')} v budově č. p. ${lv.building_cp || D('číslo popisné')}${lv.city ? ', ' + lv.city : ''}, na pozemcích parc. č. ${lv.parcels || D('parcely')}, v katastrálním území ${ku}, včetně podílu o velikosti ${lv.common_share || D('podíl na společných částech')} na společných částech budovy a pozemku; spoluvlastnický podíl Klienta: ${shareTxt || '1/1'}` })
    }

    // D) vybavení („zejména ………….“)
    const kitchen = (deal.intake as any)?.values?.kitchen === true
    for (const p of ps) {
      const mm = /zejména\s+(…+\.?|\.{4,})\s*$/.exec(p.txt)
      if (mm) { const off = (mm.index as number) + mm[0].indexOf(mm[1]); ops.push({ a: idxOf(p, off), b: idxOf(p, off + mm[1].length), text: (kitchen ? 'kuchyňská linka, ' : '') + D('další vybavení') + '.' }) }
    }

    // E) místo a datum nad podpisy
    const place = lv.south_moravia === true ? 'Ve Valticích' : 'V Praze'
    const today = new Date().toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', year: 'numeric' }).replace(/\s/g, ' ')
    if (!/(V Praze|Ve Valticích) dne/.test(plainDoc)) {
      const iAtt = ps.findIndex((p) => /Příloha 3:/.test(p.txt))
      const sig = ps.findIndex((p, k) => k > Math.max(iAtt, 0) && /^\s*…{5,}/.test(p.txt))
      if (sig >= 0) ops.push({ a: ps[sig].start, b: ps[sig].start, text: `${place} dne ${today}\n` })
    }

    const rev = d.revisionId as string
    const r2: unknown[] = []
    for (const o of ops.sort((x, y) => y.a - x.a || y.b - x.b)) {
      if (o.b > o.a) r2.push({ deleteContentRange: { range: { startIndex: o.a, endIndex: o.b } } })
      if (o.text) r2.push({ insertText: { location: { index: o.a }, text: o.text } })
    }
    await batch(r2, rev)

    // 2b) PEP a čestné prohlášení: jedna dvojice stran pro každého vlastníka (kopie první dvojice na konec smlouvy)
    const need = Math.max(people.length, 1)
    const PK = ['namedStyleType', 'alignment', 'lineSpacing', 'direction', 'spacingMode', 'spaceAbove', 'spaceBelow', 'indentFirstLine', 'indentStart', 'indentEnd', 'keepLinesTogether', 'keepWithNext', 'avoidWidowAndOrphan']
    const TK = ['bold', 'italic', 'underline', 'strikethrough', 'smallCaps', 'fontSize', 'weightedFontFamily', 'foregroundColor', 'backgroundColor', 'baselineOffset']
    const pick = (o: any, keys: string[]) => { const r: any = {}; for (const k of keys) if (o && o[k] !== undefined) r[k] = o[k]; return r }
    for (let guard = 0; guard < 8; guard++) {
      d = await getDoc()
      const raw = text(d).filter((e) => e.paragraph)
      const tx = (e: any) => (e.paragraph.elements || []).map((x: any) => x.textRun?.content || '').join('')
      const titles = raw.filter((e) => /^PROHLÁŠENÍ PEP/.test(tx(e).trim()))
      if (titles.length === 0 || titles.length >= need) break
      const a = titles[0].startIndex as number
      const b = titles[1] ? (titles[1].startIndex as number) : (raw[raw.length - 1].endIndex as number)
      const blk = raw.filter((e) => e.startIndex >= a && e.endIndex <= b)
      const X = (raw[raw.length - 1].endIndex as number) - 1
      const bodyTxt = blk.map(tx).join('')
      const reqs2: unknown[] = [{ insertText: { location: { index: X }, text: '\n' + bodyTxt.slice(0, -1) } }]
      let off = X + 1
      const pStyles: unknown[] = []; const tStyles: unknown[] = []
      const bulletRuns: { a: number; b: number }[] = []
      blk.forEach((e, k) => {
        const len = tx(e).length
        const ps0 = off
        if (e.paragraph.bullet) { const last = bulletRuns[bulletRuns.length - 1]; if (last && last.b === ps0) last.b = ps0 + len; else bulletRuns.push({ a: ps0, b: ps0 + len }) }
        const pst = pick(e.paragraph.paragraphStyle, PK)
        pStyles.push({ updateParagraphStyle: { range: { startIndex: ps0, endIndex: ps0 + len }, paragraphStyle: pst, fields: PK.join(',') } })
        let o2 = ps0
        for (const el of e.paragraph.elements || []) {
          const l2 = String(el.textRun?.content || '').length
          if (l2) tStyles.push({ updateTextStyle: { range: { startIndex: o2, endIndex: o2 + l2 }, textStyle: pick(el.textRun.textStyle, TK), fields: TK.join(',') } })
          o2 += l2
        }
        if (k === 0) pStyles.push({ updateParagraphStyle: { range: { startIndex: ps0, endIndex: ps0 + len }, paragraphStyle: { pageBreakBefore: true }, fields: 'pageBreakBefore' } })
        off += len
      })
      for (const br of bulletRuns) reqs2.push({ createParagraphBullets: { range: { startIndex: br.a, endIndex: br.b }, bulletPreset: 'BULLET_CHECKBOX' } })
      await batch([...reqs2, ...pStyles, ...tStyles], d.revisionId)
    }
    d = await getDoc()
    if (paragraphs(d).filter((p) => /^PROHLÁŠENÍ PEP/.test(p.txt.trim())).length < need) missing.push('Prohlášení PEP a čestné prohlášení se nepodařilo okopírovat pro všechny vlastníky. Doplňte je ručně.')

    // 2c) jméno, RČ a adresa do všech prohlášení (po dvojicích PEP + čestné prohlášení)
    d = await getDoc()
    {
      const q = paragraphs(d)
      const pep0 = q.findIndex((p) => /^PROHLÁŠENÍ PEP/.test(p.txt.trim()))
      if (pep0 >= 0) {
        const o3: Op[] = []; let n = 0
        for (let i = pep0; i < q.length; i++) {
          const t = q[i].txt.trim()
          if (t === 'Jméno, příjmení:') n++
          const pr = people[Math.floor((Math.max(n, 1) - 1) / 2)]
          const v = t === 'Jméno, příjmení:' ? (pr?.name || D('jméno a příjmení')) : t === 'RČ:' ? (pr?.rc || D('rodné číslo')) : t === 'Trvale bytem:' ? (pr?.address || D('adresa trvalého bydliště')) : null
          if (v) o3.push({ a: q[i].end - 1, b: q[i].end - 1, text: (q[i].txt.replace(/\n$/, '').endsWith(' ') ? '' : ' ') + v })
        }
        await batch(o3.sort((x, y) => y.a - x.a).map((o) => ({ insertText: { location: { index: o.a }, text: o.text } })), d.revisionId)
      }
    }

    // 3) žluté zvýraznění [[DOPLNIT: …]] a formát řádků klienta
    d = await getDoc()
    const ps3 = paragraphs(d)
    const yel: unknown[] = []
    const todo: string[] = []
    const st = (a: number, b: number, ts: unknown, f: string) => yel.push({ updateTextStyle: { range: { startIndex: a, endIndex: b }, textStyle: ts, fields: f } })
    const n3 = ps3.findIndex((p) => /^jméno, příjmení:/.test(p.txt.trim()))
    const d3 = ps3.findIndex((p, i) => i > n3 && /^dále též \(v případě více osob/.test(p.txt))
    if (n3 >= 0 && d3 > n3) for (let i = n3; i < d3; i++) {
      const p = ps3[i]; const lab = /^(jméno, příjmení:|RČ:|rodinný stav:|trvale bytem:|e-mail:|tel\.:)/.exec(p.txt)
      if (!lab || p.end - 1 <= p.start) continue
      const L = idxOf(p, lab[0].length)
      st(p.start, L, { bold: false }, 'bold')
      if (lab[1] === 'jméno, příjmení:' && p.end - 1 > L) st(L, p.end - 1, { bold: true }, 'bold')
      else if (p.end - 1 > L) st(L, p.end - 1, { bold: false }, 'bold')
    }
    {
      const pp = ps3.findIndex((p) => /^PROHLÁŠENÍ PEP/.test(p.txt.trim()))
      if (pp >= 0) for (let i = pp; i < ps3.length; i++) {
        const p = ps3[i]; const lab = /^(Jméno, příjmení:|RČ:|Trvale bytem:)/.exec(p.txt)
        if (!lab || p.end - 1 <= p.start) continue
        const L = idxOf(p, lab[0].length)
        st(p.start, L, { bold: false }, 'bold')
        if (p.end - 1 > L) st(L, p.end - 1, { bold: lab[1] === 'Jméno, příjmení:' }, 'bold')
      }
    }
    // sundat podbarvení šablony u vyplněných údajů (žlutě zůstanou jen [[DOPLNIT]])
    const clr = (p: Par) => { if (p.end - 1 > p.start) st(p.start, p.end - 1, {}, 'backgroundColor') }
    if (n3 >= 0 && d3 > n3) for (let i = n3; i < d3; i++) clr(ps3[i])
    {
      const pp2 = ps3.findIndex((p) => /^PROHL\u00c1\u0160EN\u00cd PEP/.test(p.txt.trim()))
      if (pp2 >= 0) for (let i = pp2; i < ps3.length; i++) if (/^(Jm\u00e9no, p\u0159\u00edjmen\u00ed:|R\u010c:|Trvale bytem:)/.test(ps3[i].txt)) clr(ps3[i])
      const o1 = ps3.findIndex((p) => /Klient prohla\u0161uje, \u017ee je vlastn\u00edkem:/.test(p.txt))
      if (o1 >= 0) for (let i = o1 + 1; i < ps3.length && !/^\s*2\./.test(ps3[i].txt); i++) clr(ps3[i])
      for (const p of ps3) if (/^\s*2\.\s+Nemovitost se bude prodávat/.test(p.txt) || (/^a\)\s*kupn\u00ed cena bude \u010dinit minim\u00e1ln\u011b/.test(p.txt) && !/DOPLNIT/.test(p.txt))) clr(p)
    }
    for (const p of ps3) for (const mm of p.txt.matchAll(/\[\[(?:DOPLNIT|OVĚŘIT)[^\]]*\]\]/g)) {
      st(idxOf(p, mm.index as number), idxOf(p, (mm.index as number) + mm[0].length), Y, 'backgroundColor')
      todo.push(mm[0].replace(/^\[\[[^:]*:\s*/, '').replace(/\]\]$/, ''))
    }
    await batch(yel, d.revisionId)

    // 4) kontrola: co v textu smlouvy zůstalo nevyplněné
    const iEnd = ps3.findIndex((p) => /^Příloha 1:/.test(p.txt.trim()))
    const leftover = ps3.slice(0, iEnd > 0 ? iEnd : ps3.length).filter((p) => /\bxxx\b|^VARIANTA|…{3,}|\.{6,}/i.test(p.txt)).map((p) => p.txt.trim().slice(0, 90)).slice(0, 8)
    // 5) LV jako Příloha 1: stránky LV se vloží jako obrázky před prohlášení PEP (jen když ve smlouvě ještě žádný obrázek není)
    let lvPages = 0
    try {
      const dd = await getDoc()
      const body = text(dd)
      const hasImg = body.some((e) => e.paragraph?.elements?.some((x: any) => x.inlineObjectElement))
      const pepEl = body.find((e) => e.paragraph && /^PROHLÁŠENÍ PEP/.test((e.paragraph.elements || []).map((x: any) => x.textRun?.content || '').join('').trim()))
      if (lvBytes && !hasImg && pepEl) {
        const imgs: { data: Uint8Array; ext: string; mime: string; ratio: number }[] = []
        if (lvMime === 'application/pdf') {
          const { PDFiumLibrary } = await import('npm:@hyzyla/pdfium@2')
          const { encode } = await import('npm:fast-png@6')
          const lib = await PDFiumLibrary.init()
          const pdf = await lib.loadDocument(lvBytes)
          try {
            for (const page of pdf.pages()) {
              if (imgs.length >= 8) break
              const im = await page.render({ scale: 2.5, render: 'bitmap' })
              imgs.push({ data: encode({ width: im.width, height: im.height, data: new Uint8Array(im.data), channels: 4, depth: 8 }), ext: 'png', mime: 'image/png', ratio: im.height / im.width })
            }
          } finally { pdf.destroy(); lib.destroy() }
        } else imgs.push({ data: lvBytes, ext: lvMime.includes('png') ? 'png' : 'jpg', mime: lvMime, ratio: 1.414 })
        if (imgs.length) {
          const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
          const tag = crypto.randomUUID()
          const paths: string[] = []; const urls: string[] = []
          try {
            for (let i = 0; i < imgs.length; i++) {
              const path = `tmp/zs-lv/${tag}-${i + 1}.${imgs[i].ext}`
              const up = await admin.storage.from('covers').upload(path, imgs[i].data, { contentType: imgs[i].mime, upsert: true })
              if (up.error) throw new Error('Uložení obrázku LV: ' + up.error.message)
              paths.push(path); urls.push(admin.storage.from('covers').getPublicUrl(path).data.publicUrl)
            }
            const st0 = dd.documentStyle || {}
            const pt = (o: any, def: number) => (o?.magnitude ?? def)
            const availW = pt(st0.pageSize?.width, 595) - pt(st0.marginLeft, 56) - pt(st0.marginRight, 56)
            const availH = pt(st0.pageSize?.height, 842) - pt(st0.marginTop, 56) - pt(st0.marginBottom, 56) - 40
            const P = pepEl.startIndex as number
            const n = imgs.length
            const rq: unknown[] = [
              { insertText: { location: { index: P }, text: '\n'.repeat(n) } },
              { updateParagraphStyle: { range: { startIndex: P, endIndex: P + n + 1 }, paragraphStyle: { pageBreakBefore: true, alignment: 'CENTER' }, fields: 'pageBreakBefore,alignment' } },
            ]
            for (let i = n - 1; i >= 0; i--) {
              const w = Math.floor(Math.min(availW, availH / imgs[i].ratio)); const h = Math.floor(w * imgs[i].ratio)
              rq.push({ insertInlineImage: { location: { index: P + i }, uri: urls[i], objectSize: { width: { magnitude: w, unit: 'PT' }, height: { magnitude: h, unit: 'PT' } } } })
            }
            await batch(rq, dd.revisionId)
            lvPages = n
          } finally { if (paths.length) await admin.storage.from('covers').remove(paths) }
        }
      }
    } catch (e) { missing.push('List vlastnictví se nepodařilo vložit do smlouvy jako přílohu: ' + String((e as Error).message || e).slice(0, 160)) }

    return json({
      ok: true, lv_pages: lvPages, link: doc.webViewLink || `https://docs.google.com/document/d/${doc.id}/edit`, doc_name: doc.name, lv_file: lvName, place, date: today,
      commission: pct, listing_price: deal.listing_price || null, to_fill: [...new Set(todo)], missing, leftover,
    })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
