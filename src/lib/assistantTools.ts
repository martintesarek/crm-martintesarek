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

export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<unknown> {
  const a = (k: string) => (args?.[k] == null ? '' : String(args[k]))
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
      const { data, error } = await supabase.from('tasks').insert({ account_id: ctx.accountId, deal_id: d?.id || null, title: a('text'), due_at: due && !isNaN(due.getTime()) ? due.toISOString() : null, assignee_id: ctx.userId, position: Date.now() }).select().single()
      if (error) return { chyba: error.message }
      dealCache = null
      return { ok: true, ukol: data.title, termin: data.due_at, obchod: d?.title || null }
    }
    case 'splnit_ukol': {
      const { data } = await supabase.from('tasks').select('*').eq('account_id', ctx.accountId).eq('done', false).limit(200)
      const n = norm(a('hledat')); const t = ((data as Task[]) || []).find((x) => norm(x.title).includes(n))
      if (!t) return { chyba: 'Úkol nenalezen.' }
      await supabase.from('tasks').update({ done: true }).eq('id', t.id)
      return { ok: true, ukol: t.title }
    }
    case 'pridat_poznamku': {
      const deals = await allDeals(ctx)
      const d = findDeal(ctx, deals, a('obchod'))[0]
      if (!d) return { chyba: 'Obchod nenalezen.' }
      const { error } = await supabase.from('activities').insert({ account_id: ctx.accountId, deal_id: d.id, type: 'comment', body: a('text'), author_id: ctx.userId })
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
