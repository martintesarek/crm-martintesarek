// Schopnosti hlasového asistenta: čtení obchodů, kontaktů a úkolů + několik akcí.
// Vše běží v prohlížeči pod přihlášením uživatele (RLS), takže asistent vidí jen jeho data.
// Rodná čísla se asistentovi nikdy nepředávají.
import { Type, type FunctionDeclaration } from '@google/genai'
import { supabase } from './supabase'
import { DEAL_SELECT } from './deals'
import { contactName, daysSince } from './format'
import type { Contact, Deal, Stage, Task } from './types'

export const norm = (v: string | null | undefined) => (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export type ToolCtx = {
  accountId: string
  userId: string
  stages: Stage[]
  onSmsDraft?: (d: { contact: string; phone: string | null; text: string }) => void
  onNavigate?: (path: string) => void
}

export const TOOL_DECLS: FunctionDeclaration[] = [
  { name: 'prehled', description: 'Souhrn CRM pro dnešek: počty obchodů podle fází, úkoly po termínu a na dnes, obchody bez pohybu, nové leady, dnešní svátky a narozeniny. Použij na otázky "co je nového", "kde hoří", "co mám dnes dělat".' },
  { name: 'seznam_obchodu', description: 'Seznam rozpracovaných obchodů. Volitelně filtr podle názvu fáze nebo textu (adresa, jméno klienta).', parameters: { type: Type.OBJECT, properties: { faze: { type: Type.STRING, description: 'Část názvu fáze, např. "Rezervace".' }, hledat: { type: Type.STRING, description: 'Text pro vyhledání v názvu, adrese nebo jménu klienta.' }, vcetne_uzavrenych: { type: Type.BOOLEAN } } } },
  { name: 'detail_obchodu', description: 'Podrobnosti jednoho obchodu: fáze, ceny, kontakty, poslední aktivity a poznámky, úkoly, dokumenty.', parameters: { type: Type.OBJECT, properties: { hledat: { type: Type.STRING, description: 'Název obchodu, adresa nebo jméno klienta.' } }, required: ['hledat'] } },
  { name: 'hledat_kontakt', description: 'Najde kontakty podle jména, telefonu, e-mailu nebo města. Vrací typ (prodávající/kupující/kontakt/lead), telefon, e-mail, oslovení, vykání/tykání, svátek, narozeniny, poznámky a obchody.', parameters: { type: Type.OBJECT, properties: { hledat: { type: Type.STRING } }, required: ['hledat'] } },
  { name: 'ukoly', description: 'Seznam nehotových úkolů, nejbližší termín první. Volitelně jen po termínu.', parameters: { type: Type.OBJECT, properties: { jen_po_terminu: { type: Type.BOOLEAN } } } },
  { name: 'vytvor_ukol', description: 'Založí úkol. Vždy nejdřív nahlas zopakuj znění a termín a počkej na souhlas uživatele; zavolej až po něm.', parameters: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, termin: { type: Type.STRING, description: 'Datum a čas ISO 8601 (Europe/Prague), nebo prázdné.' }, obchod: { type: Type.STRING, description: 'Název obchodu / klient, ke kterému úkol patří (volitelné).' } }, required: ['text'] } },
  { name: 'splnit_ukol', description: 'Označí úkol jako hotový. Vyžaduje souhlas uživatele.', parameters: { type: Type.OBJECT, properties: { hledat: { type: Type.STRING, description: 'Část textu úkolu.' } }, required: ['hledat'] } },
  { name: 'pridat_poznamku', description: 'Přidá poznámku (komentář) k obchodu. Vždy nejdřív nahlas zopakuj text a počkej na souhlas.', parameters: { type: Type.OBJECT, properties: { obchod: { type: Type.STRING }, text: { type: Type.STRING } }, required: ['obchod', 'text'] } },
  { name: 'navrh_sms', description: 'Připraví návrh SMS pro kontakt a ukáže ho na obrazovce. SMS se NEodesílá automaticky – uživatel ji odešle sám. Respektuj vykání/tykání a oslovení kontaktu.', parameters: { type: Type.OBJECT, properties: { kontakt: { type: Type.STRING }, text: { type: Type.STRING } }, required: ['kontakt', 'text'] } },
  { name: 'zmenit_fazi', description: 'Přesune obchod do jiné fáze (např. Rezervace, Prodáno, Nerealizováno). Když uživatel výslovně řekne, co a kam přesunout, udělej to hned.', parameters: { type: Type.OBJECT, properties: { obchod: { type: Type.STRING }, faze: { type: Type.STRING, description: 'Název (nebo část názvu) cílové fáze.' } }, required: ['obchod', 'faze'] } },
  { name: 'upravit_obchod', description: 'Změní údaje obchodu. Předej jen pole, která se mají změnit.', parameters: { type: Type.OBJECT, properties: { obchod: { type: Type.STRING }, nazev: { type: Type.STRING }, adresa: { type: Type.STRING }, popis: { type: Type.STRING, description: 'Nový popis / poznámka k obchodu (nahradí stávající).' }, cena_inzerce_kc: { type: Type.NUMBER }, nejlepsi_nabidka_kc: { type: Type.NUMBER }, provize_kc: { type: Type.NUMBER }, odhad_od_kc: { type: Type.NUMBER }, odhad_do_kc: { type: Type.NUMBER }, kategorie: { type: Type.STRING }, typ: { type: Type.STRING, description: 'Prodej nebo Pronájem' }, zdroj: { type: Type.STRING }, disk_url: { type: Type.STRING } }, required: ['obchod'] } },
  { name: 'vytvorit_obchod', description: 'Založí nový obchod, volitelně i s novým nebo existujícím klientem.', parameters: { type: Type.OBJECT, properties: { nazev: { type: Type.STRING }, adresa: { type: Type.STRING }, klient: { type: Type.STRING, description: 'Jméno a příjmení klienta (existující se najde, jinak se založí).' }, telefon: { type: Type.STRING }, typ_klienta: { type: Type.STRING, description: 'prodávající | kupující | kontakt | lead' }, faze: { type: Type.STRING }, kategorie: { type: Type.STRING }, typ: { type: Type.STRING }, provize_kc: { type: Type.NUMBER }, poznamka: { type: Type.STRING } }, required: ['nazev'] } },
  { name: 'upravit_kontakt', description: 'Změní údaje kontaktu (typ, telefon, e-mail, oslovení, vykání/tykání, město, poznámky, narozeniny, zdroj). Předej jen měněná pole.', parameters: { type: Type.OBJECT, properties: { kontakt: { type: Type.STRING }, typ: { type: Type.STRING, description: 'prodávající | kupující | kontakt | lead' }, telefon: { type: Type.STRING }, email: { type: Type.STRING }, osloveni: { type: Type.STRING }, tykani: { type: Type.BOOLEAN }, mesto: { type: Type.STRING }, ulice: { type: Type.STRING }, poznamky: { type: Type.STRING, description: 'Text se PŘIDÁ k poznámkám (nepřepisuje).' }, narozeniny: { type: Type.STRING, description: 'YYYY-MM-DD' }, zdroj: { type: Type.STRING }, jmeno: { type: Type.STRING }, prijmeni: { type: Type.STRING } }, required: ['kontakt'] } },
  { name: 'vytvorit_kontakt', description: 'Založí nový kontakt.', parameters: { type: Type.OBJECT, properties: { jmeno: { type: Type.STRING }, prijmeni: { type: Type.STRING }, telefon: { type: Type.STRING }, email: { type: Type.STRING }, typ: { type: Type.STRING, description: 'prodávající | kupující | kontakt | lead' }, osloveni: { type: Type.STRING }, mesto: { type: Type.STRING }, poznamky: { type: Type.STRING }, zdroj: { type: Type.STRING }, obchod: { type: Type.STRING, description: 'Obchod, ke kterému kontakt rovnou připojit (volitelné).' } }, required: ['prijmeni'] } },
  { name: 'pripojit_kontakt', description: 'Připojí existující kontakt k obchodu (nebo odpojí).', parameters: { type: Type.OBJECT, properties: { obchod: { type: Type.STRING }, kontakt: { type: Type.STRING }, typ: { type: Type.STRING, description: 'prodávající | kupující | kontakt | lead' }, odpojit: { type: Type.BOOLEAN } }, required: ['obchod', 'kontakt'] } },
  { name: 'upravit_ukol', description: 'Změní text nebo termín nehotového úkolu, případně ho smaže.', parameters: { type: Type.OBJECT, properties: { hledat: { type: Type.STRING, description: 'Část stávajícího textu úkolu.' }, text: { type: Type.STRING }, termin: { type: Type.STRING, description: 'ISO 8601, nebo "zrusit" pro odstranění termínu.' }, smazat: { type: Type.BOOLEAN } }, required: ['hledat'] } },
  { name: 'otevrit', description: 'Otevře v aplikaci obchod nebo kontakt na obrazovce uživatele.', parameters: { type: Type.OBJECT, properties: { co: { type: Type.STRING, description: '"obchod" nebo "kontakt"' }, hledat: { type: Type.STRING } }, required: ['co', 'hledat'] } },
]

let dealCache: { at: number; deals: Deal[] } | null = null
async function allDeals(ctx: ToolCtx, force = false): Promise<Deal[]> {
  if (!force && dealCache && Date.now() - dealCache.at < 60_000) return dealCache.deals
  const { data } = await supabase.from('deals').select(DEAL_SELECT).eq('account_id', ctx.accountId).order('updated_at', { ascending: false }).limit(1000)
  dealCache = { at: Date.now(), deals: (data as Deal[]) || [] }
  return dealCache.deals
}

const stageOf = (ctx: ToolCtx, d: Deal) => ctx.stages.find((s) => s.id === d.stage_id)
const isOpen = (ctx: ToolCtx, d: Deal) => (stageOf(ctx, d)?.kind || 'open') === 'open'
const dealText = (d: Deal) => norm([d.title, d.address, ...(d.deal_contacts || []).map((x) => contactName(x.contacts))].join(' '))

function dealBrief(ctx: ToolCtx, d: Deal) {
  const st = stageOf(ctx, d)
  return {
    nazev: d.title, faze: st?.name || null, blok: st?.block || null, adresa: d.address, kategorie: d.category, typ: d.transaction_type,
    kontakty: (d.deal_contacts || []).map((x) => ({ jmeno: contactName(x.contacts), typ: x.contacts?.status || x.role, telefon: x.contacts?.phone })),
    provize_kc: d.expected_commission, cena_inzerce_kc: d.listing_price, nejlepsi_nabidka_kc: d.top_offer,
    dni_ve_fazi: daysSince(d.stage_changed_at), dni_od_posledni_zmeny: daysSince(d.updated_at),
    nehotove_ukoly: (d.tasks || []).filter((t) => !t.done).length,
  }
}

function findDeal(ctx: ToolCtx, deals: Deal[], q: string) {
  const n = norm(q); const words = n.split(/\s+/).filter(Boolean)
  const scored = deals.map((d) => { const t = dealText(d); return { d, score: words.filter((w) => t.includes(w)).length } }).filter((x) => x.score > 0)
  scored.sort((a, b) => b.score - a.score || (isOpen(ctx, a.d) ? -1 : 1))
  return scored.map((x) => x.d)
}

const safeContact = (c: Contact) => ({
  jmeno: contactName(c), typ: c.status, telefon: c.phone, email: c.email, osloveni: c.salutation, vykani: c.formality !== 'tykani',
  mesto: c.city, svatek: c.name_day ? `${Number(c.name_day.slice(3))}. ${Number(c.name_day.slice(0, 2))}.` : null,
  narozeniny: c.birth_date, zdroj: c.source, stitky: c.tags, poznamky: c.notes, id: c.id,
})

const STATUS_KEYS = ['prodávající', 'kupující', 'kontakt', 'lead']
const statusKey = (v: string) => { const n = norm(v); return STATUS_KEYS.find((k) => norm(k).startsWith(n.slice(0, 4))) || null }
const findStage = (ctx: ToolCtx, q: string) => { const n = norm(q); return ctx.stages.find((s) => norm(s.name) === n) || ctx.stages.find((s) => norm(s.name).includes(n)) || ctx.stages.find((s) => n.includes(norm(s.name))) }
async function findContacts(ctx: ToolCtx, q: string): Promise<Contact[]> {
  const s = q.replace(/[%,()]/g, ' ').trim()
  const { data } = await supabase.from('contacts').select('*').eq('account_id', ctx.accountId).or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`).limit(10)
  let list = (data as Contact[]) || []
  if (!list.length) {
    const { data: all } = await supabase.from('contacts').select('*').eq('account_id', ctx.accountId).limit(2000)
    const n = norm(s); const words = n.split(/\s+/).filter(Boolean)
    list = ((all as Contact[]) || []).filter((c) => { const t = norm(contactName(c)); return words.every((w) => t.includes(w)) }).slice(0, 10)
  }
  // preferuj přesnou shodu celého jména
  const n = norm(s); list.sort((x, y) => (norm(contactName(y)) === n ? 1 : 0) - (norm(contactName(x)) === n ? 1 : 0))
  return list
}
/** Každou změnu, kterou Zuzanka udělá, zapíše do aktivit (u obchodu; u kontaktu ke všem jeho obchodům). */
async function log(ctx: ToolCtx, dealId: string | null, body: string) {
  await supabase.from('activities').insert({ account_id: ctx.accountId, deal_id: dealId, type: 'comment', body: body.startsWith('Zuzanka') ? body : 'Zuzanka: ' + body, author_id: ctx.userId })
}
async function logContact(ctx: ToolCtx, contactId: string, body: string) {
  const deals = (await allDeals(ctx)).filter((d) => (d.deal_contacts || []).some((x) => x.contacts?.id === contactId))
  if (!deals.length) { await log(ctx, null, body); return }
  for (const d of deals) await log(ctx, d.id, body)
}

export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<unknown> {
  const a = (k: string) => (args?.[k] == null ? '' : String(args[k]))
  const num = (k: string) => (args?.[k] == null || args[k] === '' ? undefined : Number(args[k]))
  const has = (k: string) => args?.[k] != null && args[k] !== ''
  const today = new Date(); const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  switch (name) {
    case 'prehled': {
      const deals = await allDeals(ctx)
      const open = deals.filter((d) => isOpen(ctx, d))
      const byStage: Record<string, number> = {}
      for (const d of open) { const n = stageOf(ctx, d)?.name || 'bez fáze'; byStage[n] = (byStage[n] || 0) + 1 }
      const { data: tasks } = await supabase.from('tasks').select('*').eq('account_id', ctx.accountId).eq('done', false).order('due_at', { nullsFirst: false }).limit(200)
      const t = (tasks as Task[]) || []
      const now = Date.now(); const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999)
      const titleOf = (id: string | null) => deals.find((d) => d.id === id)?.title || null
      const overdue = t.filter((x) => x.due_at && new Date(x.due_at).getTime() < now).map((x) => ({ ukol: x.title, termin: x.due_at, obchod: titleOf(x.deal_id) }))
      const todayTasks = t.filter((x) => x.due_at && new Date(x.due_at).getTime() >= now && new Date(x.due_at) <= endOfDay).map((x) => ({ ukol: x.title, termin: x.due_at, obchod: titleOf(x.deal_id) }))
      const stale = open.filter((d) => daysSince(d.updated_at) >= 14).sort((x, y) => daysSince(y.updated_at) - daysSince(x.updated_at)).slice(0, 10).map((d) => ({ obchod: d.title, faze: stageOf(ctx, d)?.name, dni_bez_pohybu: daysSince(d.updated_at) }))
      const { data: cs } = await supabase.from('contacts').select('first_name,last_name,status,phone,salutation,name_day,birth_date,created_at').eq('account_id', ctx.accountId)
      const contacts = (cs as Contact[]) || []
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const newLeads = contacts.filter((c) => c.status === 'lead' && new Date(c.created_at) >= monthStart).map(contactName)
      const namedays = contacts.filter((c) => c.name_day === mmdd).map((c) => ({ jmeno: contactName(c), telefon: c.phone, typ: c.status }))
      const birthdays = contacts.filter((c) => c.birth_date && c.birth_date.slice(5) === mmdd).map((c) => ({ jmeno: contactName(c), telefon: c.phone, typ: c.status }))
      const wonThisMonth = deals.filter((d) => stageOf(ctx, d)?.kind === 'won' && d.closed_at && new Date(d.closed_at) >= monthStart).map((d) => ({ obchod: d.title, provize_kc: d.expected_commission }))
      return { dnes: today.toISOString().slice(0, 10), rozpracovane_obchody: open.length, podle_faze: byStage, ukoly_po_terminu: overdue, ukoly_dnes: todayTasks, obchody_bez_pohybu_14_dni: stale, nove_leady_tento_mesic: newLeads, dnes_svatek: namedays, dnes_narozeniny: birthdays, uzavreno_tento_mesic: wonThisMonth, kontaktu_celkem: contacts.length }
    }
    case 'seznam_obchodu': {
      const deals = await allDeals(ctx)
      let list = a('vcetne_uzavrenych') === 'true' ? deals : deals.filter((d) => isOpen(ctx, d))
      if (a('faze')) { const f = norm(a('faze')); list = list.filter((d) => norm(stageOf(ctx, d)?.name).includes(f)) }
      if (a('hledat')) list = findDeal(ctx, list, a('hledat'))
      return { pocet: list.length, obchody: list.slice(0, 40).map((d) => dealBrief(ctx, d)) }
    }
    case 'detail_obchodu': {
      const deals = await allDeals(ctx)
      const hits = findDeal(ctx, deals, a('hledat'))
      if (!hits.length) return { chyba: 'Obchod nenalezen.' }
      const d = hits[0]
      const [{ data: acts }, { data: tasks }, { data: docs }] = await Promise.all([
        supabase.from('activities').select('type, body, created_at').eq('deal_id', d.id).order('created_at', { ascending: false }).limit(12),
        supabase.from('tasks').select('title, done, due_at').eq('deal_id', d.id).order('due_at', { nullsFirst: false }),
        supabase.from('documents').select('kind, title, created_at').eq('deal_id', d.id).order('created_at', { ascending: false }).limit(10),
      ])
      return {
        ...dealBrief(ctx, d), popis: d.description, zdroj: d.source, odhad_kc: d.estimate_low && d.estimate_high ? [d.estimate_low, d.estimate_high] : null, nejlepsi_nabidka_datum: d.top_offer_date,
        kontakty_detail: (d.deal_contacts || []).map((x) => x.contacts && safeContact(x.contacts)),
        aktivity: (acts || []).map((x) => ({ kdy: x.created_at, typ: x.type, text: x.body })),
        ukoly: (tasks || []), dokumenty: docs || [], portal_klienta: d.portal_enabled ? { zobrazeni: d.portal_view_count, naposledy: d.portal_viewed_at } : null,
        dalsi_shody: hits.slice(1, 4).map((x) => x.title),
      }
    }
    case 'hledat_kontakt': {
      const s = a('hledat').replace(/[%,()]/g, ' ').trim()
      const { data } = await supabase.from('contacts').select('*').eq('account_id', ctx.accountId).or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,city.ilike.%${s}%`).limit(10)
      let list = (data as Contact[]) || []
      if (!list.length) {
        // bez diakritiky: zkusit přes všechny kontakty
        const { data: all } = await supabase.from('contacts').select('*').eq('account_id', ctx.accountId).limit(2000)
        const n = norm(s); list = ((all as Contact[]) || []).filter((c) => norm(contactName(c)).includes(n)).slice(0, 10)
      }
      const deals = await allDeals(ctx)
      return { kontakty: list.map((c) => ({ ...safeContact(c), obchody: deals.filter((d) => (d.deal_contacts || []).some((x) => x.contacts?.id === c.id)).map((d) => ({ obchod: d.title, faze: stageOf(ctx, d)?.name })) })) }
    }
    case 'ukoly': {
      const { data } = await supabase.from('tasks').select('*').eq('account_id', ctx.accountId).eq('done', false).order('due_at', { nullsFirst: false }).limit(100)
      const deals = await allDeals(ctx)
      let t = (data as Task[]) || []
      if (a('jen_po_terminu') === 'true') t = t.filter((x) => x.due_at && new Date(x.due_at).getTime() < Date.now())
      return { ukoly: t.map((x) => ({ ukol: x.title, termin: x.due_at, obchod: deals.find((d) => d.id === x.deal_id)?.title || null })) }
    }
    case 'vytvor_ukol': {
      const deals = await allDeals(ctx)
      const d = a('obchod') ? findDeal(ctx, deals, a('obchod'))[0] : undefined
      const due = a('termin') ? new Date(a('termin')) : null
      const { data, error } = await supabase.from('tasks').insert({ account_id: ctx.accountId, deal_id: d?.id || null, title: a('text'), due_at: due && !isNaN(due.getTime()) ? due.toISOString() : null, assignee_id: ctx.userId, position: 0 }).select().single()
      if (error) return { chyba: error.message }
      await log(ctx, d?.id || null, `založila úkol „${data.title}“${data.due_at ? ' s termínem ' + new Date(data.due_at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}.`)
      dealCache = null
      return { ok: true, ukol: data.title, termin: data.due_at, obchod: d?.title || null }
    }
    case 'splnit_ukol': {
      const { data } = await supabase.from('tasks').select('*').eq('account_id', ctx.accountId).eq('done', false).limit(200)
      const n = norm(a('hledat')); const t = ((data as Task[]) || []).find((x) => norm(x.title).includes(n))
      if (!t) return { chyba: 'Úkol nenalezen.' }
      await supabase.from('tasks').update({ done: true, completed_at: new Date().toISOString() }).eq('id', t.id)
      await log(ctx, t.deal_id, `označila úkol „${t.title}“ jako hotový.`)
      return { ok: true, ukol: t.title }
    }
    case 'pridat_poznamku': {
      const deals = await allDeals(ctx)
      const d = findDeal(ctx, deals, a('obchod'))[0]
      if (!d) return { chyba: 'Obchod nenalezen.' }
      const { error } = await supabase.from('activities').insert({ account_id: ctx.accountId, deal_id: d.id, type: 'comment', body: 'Zuzanka (poznámka z hovoru): ' + a('text'), author_id: ctx.userId })
      if (error) return { chyba: error.message }
      return { ok: true, obchod: d.title }
    }
    case 'navrh_sms': {
      const r = (await runTool('hledat_kontakt', { hledat: a('kontakt') }, ctx)) as { kontakty: { jmeno: string; telefon: string | null }[] }
      const c = r.kontakty[0]
      if (!c) return { chyba: 'Kontakt nenalezen.' }
      ctx.onSmsDraft?.({ contact: c.jmeno, phone: c.telefon, text: a('text') })
      return { ok: true, zobrazeno: true, kontakt: c.jmeno, telefon: c.telefon, pozn: 'Návrh je na obrazovce, uživatel ho odešle sám.' }
    }
    case 'zmenit_fazi': {
      const deals = await allDeals(ctx)
      const d = findDeal(ctx, deals, a('obchod'))[0]
      if (!d) return { chyba: 'Obchod nenalezen.' }
      const st = findStage(ctx, a('faze'))
      if (!st) return { chyba: 'Fáze nenalezena.', dostupne_faze: ctx.stages.map((s) => s.name) }
      const patch: Partial<Deal> = { stage_id: st.id, stage_changed_at: new Date().toISOString(), closed_at: st.kind === 'open' ? null : new Date().toISOString() }
      const { error } = await supabase.from('deals').update(patch).eq('id', d.id)
      if (error) return { chyba: error.message }
      await log(ctx, d.id, `Zuzanka přesunula obchod do fáze „${st.name}“.`)
      dealCache = null
      return { ok: true, obchod: d.title, puvodni_faze: stageOf(ctx, d)?.name, nova_faze: st.name }
    }
    case 'upravit_obchod': {
      const deals = await allDeals(ctx)
      const d = findDeal(ctx, deals, a('obchod'))[0]
      if (!d) return { chyba: 'Obchod nenalezen.' }
      const patch: Record<string, unknown> = {}
      if (has('nazev')) patch.title = a('nazev')
      if (has('adresa')) patch.address = a('adresa')
      if (has('popis')) patch.description = a('popis')
      if (has('cena_inzerce_kc')) patch.listing_price = num('cena_inzerce_kc')
      if (has('nejlepsi_nabidka_kc')) { patch.top_offer = num('nejlepsi_nabidka_kc'); patch.top_offer_date = new Date().toISOString().slice(0, 10) }
      if (has('provize_kc')) patch.expected_commission = num('provize_kc')
      if (has('odhad_od_kc')) patch.estimate_low = num('odhad_od_kc')
      if (has('odhad_do_kc')) { patch.estimate_high = num('odhad_do_kc'); patch.estimate_date = new Date().toISOString().slice(0, 10) }
      if (has('kategorie')) patch.category = a('kategorie')
      if (has('typ')) patch.transaction_type = /pron/i.test(a('typ')) ? 'Pronájem' : 'Prodej'
      if (has('zdroj')) patch.source = a('zdroj')
      if (has('disk_url')) patch.drive_folder_url = a('disk_url')
      if (!Object.keys(patch).length) return { chyba: 'Není co měnit.' }
      const { error } = await supabase.from('deals').update(patch).eq('id', d.id)
      if (error) return { chyba: error.message }
      await log(ctx, d.id, 'Zuzanka upravila obchod: ' + Object.entries(patch).map(([k, v]) => `${k} = ${v}`).join(', '))
      dealCache = null
      return { ok: true, obchod: d.title, zmeneno: patch }
    }
    case 'vytvorit_obchod': {
      const st = has('faze') ? findStage(ctx, a('faze')) : undefined
      const def = st || ctx.stages.find((s) => s.name === 'Prvotní kontakt') || ctx.stages.find((s) => s.kind === 'open')
      const { data: d, error } = await supabase.from('deals').insert({ account_id: ctx.accountId, title: a('nazev'), stage_id: def?.id || null, address: a('adresa') || null, category: a('kategorie') || null, transaction_type: has('typ') ? (/pron/i.test(a('typ')) ? 'Pronájem' : 'Prodej') : 'Prodej', expected_commission: num('provize_kc') ?? null, assignee_id: ctx.userId, position: -Date.now() / 1000 }).select().single()
      if (error || !d) return { chyba: error?.message || 'Nepodařilo se založit.' }
      let klient: string | null = null
      if (has('klient')) {
        const typ = statusKey(a('typ_klienta')) || 'prodávající'
        let c = (await findContacts(ctx, a('klient')))[0]
        if (!c || norm(contactName(c)) !== norm(a('klient'))) {
          const parts = a('klient').trim().split(/\s+/); const last = parts.pop() || ''; const first = parts.join(' ') || null
          const { data: nc } = await supabase.from('contacts').insert({ account_id: ctx.accountId, first_name: first, last_name: last, phone: a('telefon') || null, status: typ }).select().single()
          c = nc as Contact
        }
        if (c) { await supabase.from('deal_contacts').insert({ deal_id: d.id, contact_id: c.id, account_id: ctx.accountId, role: typ }); klient = contactName(c) }
      }
      await log(ctx, d.id, `založila obchod „${d.title}“${klient ? ' s klientem ' + klient : ''}.`)
      if (has('poznamka')) await log(ctx, d.id, 'Zuzanka (poznámka z hovoru): ' + a('poznamka'))
      dealCache = null
      return { ok: true, obchod: d.title, faze: def?.name, klient }
    }
    case 'upravit_kontakt': {
      const c = (await findContacts(ctx, a('kontakt')))[0]
      if (!c) return { chyba: 'Kontakt nenalezen.' }
      const patch: Record<string, unknown> = {}
      if (has('typ')) patch.status = statusKey(a('typ'))
      if (has('telefon')) patch.phone = a('telefon')
      if (has('email')) patch.email = a('email')
      if (has('osloveni')) patch.salutation = a('osloveni')
      if (has('tykani')) patch.formality = args.tykani === true || a('tykani') === 'true' ? 'tykani' : 'vykani'
      if (has('mesto')) patch.city = a('mesto')
      if (has('ulice')) patch.street = a('ulice')
      if (has('narozeniny')) patch.birth_date = a('narozeniny')
      if (has('zdroj')) patch.source = a('zdroj')
      if (has('jmeno')) patch.first_name = a('jmeno')
      if (has('prijmeni')) patch.last_name = a('prijmeni')
      if (has('poznamky')) patch.notes = [c.notes, `${new Date().toLocaleDateString('cs-CZ')}: ${a('poznamky')}`].filter(Boolean).join('\n')
      if (!Object.keys(patch).length) return { chyba: 'Není co měnit.' }
      const { error } = await supabase.from('contacts').update(patch).eq('id', c.id)
      if (error) return { chyba: error.message }
      await logContact(ctx, c.id, `upravila kontakt ${contactName(c)}: ` + Object.entries(patch).map(([k, v]) => `${k} = ${v}`).join(', '))
      dealCache = null
      return { ok: true, kontakt: contactName(c), zmeneno: patch }
    }
    case 'vytvorit_kontakt': {
      const { data: c, error } = await supabase.from('contacts').insert({ account_id: ctx.accountId, first_name: a('jmeno') || null, last_name: a('prijmeni'), phone: a('telefon') || null, email: a('email') || null, status: statusKey(a('typ')) || 'kontakt', salutation: a('osloveni') || null, city: a('mesto') || null, notes: a('poznamky') || null, source: a('zdroj') || null }).select().single()
      if (error || !c) return { chyba: error?.message || 'Nepodařilo se založit.' }
      let obchod: string | null = null
      if (has('obchod')) { const d = findDeal(ctx, await allDeals(ctx), a('obchod'))[0]; if (d) { await supabase.from('deal_contacts').insert({ deal_id: d.id, contact_id: c.id, account_id: ctx.accountId, role: c.status || 'kontakt' }); obchod = d.title } }
      await log(ctx, obchod ? findDeal(ctx, await allDeals(ctx), a('obchod'))[0]?.id || null : null, `založila kontakt ${contactName(c as Contact)} (${c.status}).`)
      dealCache = null
      return { ok: true, kontakt: contactName(c as Contact), typ: c.status, obchod }
    }
    case 'pripojit_kontakt': {
      const d = findDeal(ctx, await allDeals(ctx), a('obchod'))[0]
      if (!d) return { chyba: 'Obchod nenalezen.' }
      const c = (await findContacts(ctx, a('kontakt')))[0]
      if (!c) return { chyba: 'Kontakt nenalezen.' }
      if (args.odpojit === true) { await supabase.from('deal_contacts').delete().eq('deal_id', d.id).eq('contact_id', c.id); await log(ctx, d.id, `odpojila kontakt ${contactName(c)} od obchodu.`); dealCache = null; return { ok: true, odpojeno: contactName(c), obchod: d.title } }
      const typ = statusKey(a('typ')) || c.status || 'kontakt'
      const { error } = await supabase.from('deal_contacts').insert({ deal_id: d.id, contact_id: c.id, account_id: ctx.accountId, role: typ })
      if (error && !/duplicate/i.test(error.message)) return { chyba: error.message }
      if (has('typ')) await supabase.from('contacts').update({ status: typ }).eq('id', c.id)
      await log(ctx, d.id, `připojila kontakt ${contactName(c)} (${typ}) k obchodu.`)
      dealCache = null
      return { ok: true, kontakt: contactName(c), obchod: d.title, typ }
    }
    case 'upravit_ukol': {
      const { data } = await supabase.from('tasks').select('*').eq('account_id', ctx.accountId).eq('done', false).limit(300)
      const n = norm(a('hledat')); const t = ((data as Task[]) || []).find((x) => norm(x.title).includes(n))
      if (!t) return { chyba: 'Úkol nenalezen.' }
      if (args.smazat === true) { const { error } = await supabase.from('tasks').delete().eq('id', t.id); if (!error) await log(ctx, t.deal_id, `smazala úkol „${t.title}“.`); return error ? { chyba: error.message } : { ok: true, smazano: t.title } }
      const patch: Record<string, unknown> = {}
      if (has('text')) patch.title = a('text')
      if (has('termin')) { if (/zru/i.test(a('termin'))) patch.due_at = null; else { const dd = new Date(a('termin')); if (!isNaN(dd.getTime())) patch.due_at = dd.toISOString() } }
      const { error } = await supabase.from('tasks').update(patch).eq('id', t.id)
      if (!error) await log(ctx, t.deal_id, `upravila úkol „${t.title}“` + (patch.title ? ` → „${patch.title}“` : '') + (patch.due_at !== undefined ? `, termín ${patch.due_at ? new Date(patch.due_at as string).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'zrušen'}` : '') + '.')
      return error ? { chyba: error.message } : { ok: true, ukol: patch.title || t.title, termin: patch.due_at === undefined ? t.due_at : patch.due_at }
    }
    case 'otevrit': {
      if (a('co').startsWith('kont')) {
        const r = (await runTool('hledat_kontakt', { hledat: a('hledat') }, ctx)) as { kontakty: { id: string; jmeno: string }[] }
        const c = r.kontakty[0]; if (!c) return { chyba: 'Kontakt nenalezen.' }
        ctx.onNavigate?.(`/kontakty/${c.id}`); return { ok: true, otevreno: c.jmeno }
      }
      const deals = await allDeals(ctx); const d = findDeal(ctx, deals, a('hledat'))[0]
      if (!d) return { chyba: 'Obchod nenalezen.' }
      ctx.onNavigate?.(`/obchody/${d.id}`); return { ok: true, otevreno: d.title }
    }
    default: return { chyba: `Neznámá funkce ${name}` }
  }
}
