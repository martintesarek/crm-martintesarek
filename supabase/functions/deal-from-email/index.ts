// Obchodní případ z e-mailu: Martin přepošle e-mail na speciální adresu, Make ho předá sem,
// AI (Gemini) z něj vyčte údaje a funkce založí kontakt + obchod ve fázi „Prvotní kontakt“.
// Přihlášení: hlavička x-inbound-key musí odpovídat secretu INBOUND_EMAIL_KEY (nastavuje Martin).
import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

const SOURCES = ['Doporučení', 'E-book 32', 'Facebook', 'Obchod v minulosti', 'Odhad zdarma', 'PPC reklama', 'Prohlídky', 'Sféra vlivu', 'Web', 'YouTube', 'Letáky']
const CATEGORIES = ['Byty', 'Domy', 'Pozemky', 'Komerční nemovitosti', 'Ostatní']

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    first_name: { type: 'STRING' }, last_name: { type: 'STRING' },
    phone: { type: 'STRING' }, email: { type: 'STRING' },
    address: { type: 'STRING' }, property_label: { type: 'STRING' },
    category: { type: 'STRING' }, transaction_type: { type: 'STRING' },
    listing_price: { type: 'NUMBER' }, source: { type: 'STRING' },
    summary: { type: 'STRING' },
  },
}

const PROMPT = `Z přeposlaného e-mailu vyčti údaje o obchodním případu realitního makléře Martina Tesárka (reality@martintesarek.cz).
Hledáme KLIENTA (majitele nebo zájemce o prodej/pronájem nemovitosti), NE makléře Martina Tesárka a ne odesílatele přeposlání (Martin si e-mail přeposlal sám). Klient je osoba, od které původní e-mail pochází, nebo osoba, o které se v e-mailu píše.
Pravidla:
- Nic nevymýšlej. Co v e-mailu není, nech prázdné (prázdný řetězec, u ceny vynech).
- Jména piš s českou diakritikou a správnými velkými písmeny. first_name = křestní, last_name = příjmení.
- phone ve tvaru jak je v e-mailu (nejlépe +420 xxx xxx xxx). email klienta (ne Martinův).
- address = adresa nebo lokalita nemovitosti. property_label = krátký popis nemovitosti jako "RD Zvole", "byt 3+kk Praha 9", "pozemek Rajhrad", "chata Sedlice" (typ + místo).
- category pouze jedna z: ${CATEGORIES.join(', ')}; jinak prázdné.
- transaction_type pouze "Prodej" nebo "Pronájem"; když není jasné, "Prodej".
- listing_price = cena v Kč jako číslo, jen pokud je v e-mailu.
- source pouze jedna z: ${SOURCES.join(', ')}; jinak prázdné (např. poptávka z webu = Web, z Facebooku = Facebook).
- summary = česky 1–4 věty: co klient chce, termíny, důležité podmínky, na co se ptá. Bez zbytečností.`

async function ai(key: string, text: string) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash'}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: PROMPT + '\n\n--- E-MAIL ---\n' + text.slice(0, 20000) }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.1 } }),
  })
  if (!r.ok) throw new Error('Gemini: ' + (await r.text()).slice(0, 300))
  const t = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  try { return JSON.parse(t) } catch { return {} }
}

const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
const digits = (s: string) => s.replace(/\D/g, '').replace(/^00?420/, '').replace(/^420(?=\d{9}$)/, '')
const same = (a: string, b: string) => a.length === b.length && a.length > 0 && a.split('').reduce((x, c, i) => x | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Použijte POST.' }, 405)
  try {
    const expected = Deno.env.get('INBOUND_EMAIL_KEY') || ''
    if (expected.length < 16 || !same(req.headers.get('x-inbound-key') || '', expected)) return json({ error: 'Neplatný klíč.' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: ok } = await admin.rpc('rate_check', { p_uid: 'deal-from-email', p_bucket: 'deal-from-email', p_max: 60, p_seconds: 3600 })
    if (ok === false) return json({ error: 'Příliš mnoho požadavků.' }, 429)

    const b = (await req.json().catch(() => ({}))) as { subject?: string; from?: string; body?: string; message_id?: string; link?: string }
    const body = clean(b.body), subject = clean(b.subject)
    if (!body && !subject) return json({ error: 'Prázdný e-mail.' }, 400)
    const messageId = clean(b.message_id)

    const { data: m } = await admin.from('memberships').select('account_id, user_id').eq('role', 'owner').limit(1).single()
    if (!m) return json({ error: 'Chybí účet.' }, 500)
    const accountId = m.account_id as string, ownerId = m.user_id as string

    // stejný e-mail už byl zpracován
    if (messageId) {
      const { data: dup } = await admin.from('activities').select('deal_id').eq('account_id', accountId).contains('data', { email_message_id: messageId }).limit(1)
      if (dup?.length) return json({ ok: true, duplicate: true, deal_id: dup[0].deal_id })
    }

    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return json({ error: 'Chybí GEMINI_API_KEY.' }, 500)
    const x = await ai(key, `Předmět: ${subject}\nOd: ${clean(b.from)}\n\n${body}`)

    let first = clean(x.first_name), last = clean(x.last_name)
    const phone = clean(x.phone), email = clean(x.email).toLowerCase()
    const label = clean(x.property_label) || clean(x.address)

    // kontakt: najdi podle e-mailu / telefonu, jinak založ
    let contactId: string | null = null, created = false
    if (email) {
      const { data } = await admin.from('contacts').select('id').eq('account_id', accountId).ilike('email', email).limit(1)
      contactId = data?.[0]?.id || null
    }
    if (!contactId && digits(phone).length >= 9) {
      const { data } = await admin.from('contacts').select('id, phone').eq('account_id', accountId).not('phone', 'is', null)
      contactId = data?.find((c) => digits(c.phone || '') === digits(phone))?.id || null
    }
    if (!contactId && (first || last || phone || email)) {
      const { data: c, error } = await admin.from('contacts').insert({
        account_id: accountId, country: 'Česká republika', first_name: first || null, last_name: last || null,
        phone: phone || null, email: email || null, status: 'lead', source: SOURCES.includes(clean(x.source)) ? clean(x.source) : null, created_by: ownerId,
      }).select('id').single()
      if (error) throw new Error('Kontakt: ' + error.message)
      contactId = c.id; created = true
    } else if (contactId) {
      const { data: c } = await admin.from('contacts').select('first_name, last_name').eq('id', contactId).single()
      first = first || c?.first_name || ''; last = last || c?.last_name || ''
    }

    const { data: st } = await admin.from('stages').select('id').eq('account_id', accountId).eq('name', 'Prvotní kontakt').limit(1)
    const stageId = st?.[0]?.id || null
    const who = [first, last].filter(Boolean).join(' ')
    const title = [who || 'Nový kontakt z e-mailu', label].filter(Boolean).join(' | ')
    const category = CATEGORIES.includes(clean(x.category)) ? clean(x.category) : null
    const tt = clean(x.transaction_type) === 'Pronájem' ? 'Pronájem' : 'Prodej'
    const price = typeof x.listing_price === 'number' && x.listing_price > 0 ? x.listing_price : null

    const { data: deal, error: de } = await admin.from('deals').insert({
      account_id: accountId, title, stage_id: stageId, address: clean(x.address) || null, category, transaction_type: tt,
      source: SOURCES.includes(clean(x.source)) ? clean(x.source) : null, listing_price: price, assignee_id: ownerId, position: -Date.now() / 1000,
    }).select('id').single()
    if (de || !deal) throw new Error('Obchod: ' + (de?.message || 'nezaložen'))

    if (contactId) await admin.from('deal_contacts').insert({ deal_id: deal.id, contact_id: contactId, account_id: accountId, role: 'prodávající' })
    const note = ['📧 Založeno z e-mailu' + (subject ? ` „${subject}“` : '') + '.', clean(x.summary), b.link ? `Původní zpráva: ${clean(b.link)}` : ''].filter(Boolean).join('\n\n')
    await admin.from('activities').insert({ account_id: accountId, deal_id: deal.id, type: 'comment', body: note, author_id: ownerId, data: { email_message_id: messageId || null, from: clean(b.from) || null } })
    // celý původní text e-mailu pro pozdější dohledání
    if (body) await admin.from('activities').insert({ account_id: accountId, deal_id: deal.id, type: 'comment', body: 'Text e-mailu:\n\n' + body.slice(0, 8000), author_id: ownerId })

    return json({ ok: true, deal_id: deal.id, title, contact_id: contactId, contact_created: created, stage: stageId ? 'Prvotní kontakt' : null })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
