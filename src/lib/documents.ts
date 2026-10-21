// Dokumenty jedním klepnutím – definice typů, výchozí hodnoty z CRM
import type { Contact, Deal } from './types'
import { czk, contactName } from './format'

export type DocKind = 'zs' | 'rs' | 'pm' | 'pp'
export type FirmKey = 'mtre' | 'mtr' | 'prm' | 'mt'
export type Person = { contact_id?: string; name: string; rc?: string; marital?: string; address?: string; email?: string; phone?: string }
export type DocInput = {
  kind: DocKind; firm: FirmKey; place: string; date: string
  sellers: Person[]; buyers: Person[]
  property: string; propertyLabel?: string
  equipment?: string; minPrice?: string; commission?: string; duration?: string
  price?: string; defects?: string; fee?: string; feeDays?: string; mortgage?: boolean; until?: string; sellerPenalty?: string
  principal?: Person; agent?: Person; bank?: string; accountNo?: string
}
export type DocRow = { id: string; deal_id: string; kind: DocKind; title: string; file_name: string; storage_path: string | null; drive_url: string | null; drive_folder_name: string | null; missing: string[]; created_at: string; download_url?: string | null }

export const KINDS: { kind: DocKind; title: string; desc: string; icon: string }[] = [
  { kind: 'zs', title: 'Zprostředkovatelská smlouva', desc: 'Smlouva o realitním zprostředkování s prodávajícím, včetně PEP a čestného prohlášení', icon: 'doc' },
  { kind: 'rs', title: 'Rezervační smlouva', desc: 'Rezervace pro zájemce, rezervační poplatek, PEP a čestné prohlášení zájemce', icon: 'doc' },
  { kind: 'pm', title: 'Plná moc', desc: 'Plná moc prodávajícího k prodeji nemovitosti', icon: 'doc' },
  { kind: 'pp', title: 'Předávací protokol', desc: 'Předání nemovitosti, stavy měřičů, vybavení', icon: 'doc' },
]
export const FIRMS: { key: FirmKey; name: string; note: string; zsOk: boolean }[] = [
  { key: 'mtr', name: 'MARTIN TESÁREK REALITY s.r.o.', note: 'Valtice · jižní Morava', zsOk: true },
  { key: 'mtre', name: 'MARTIN TESAREK REAL ESTATE s.r.o.', note: 'Praha 9', zsOk: true },
  { key: 'prm', name: 'PROFESIONÁLNÍ REALITNÍ MAKLÉŘ s.r.o.', note: 'Praha 8', zsOk: true },
  { key: 'mt', name: 'Bc. Martin Tesárek (OSVČ)', note: 'jen rezervační smlouva', zsOk: false },
]
export const SELLER_ROLES = ['prodávající', 'klient']
export const BUYER_ROLES = ['kupující', 'lead']

const JM = /valtice|břeclav|breclav|mikulov|hustopeč|hustopec|brno|znojm|hodonín|hodonin|vyškov|vyskov|blansko|lednic|poštorn|postorn|vrbic|kyjov|slavkov|bučovic|ivančic|rosice|kuřim|tišnov|boskovic|pavlovic|klobouk|podivín|podivin|lanžhot|lanzhot|bílovic|bilovic|rakvic|zaječí|zajeci|šakvic|pohořelic|pohorelic|dunajovic|drnholec|hrušovan|hrusovan|bzenec|strážnic|straznic|veselí nad|veseli nad|moravsk|jihomoravsk/i
export const isSouthMoravia = (s: string | null | undefined) => !!s && JM.test(s)

export const czDate = (d = new Date()) => `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`
export const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return czDate(d) }

export function personFrom(c: Contact): Person {
  const cx = (c as Contact & { birth_number?: string | null; custom?: Record<string, unknown> | null })
  const address = [[c.street, c.house_no].filter(Boolean).join(' '), [c.zip, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return { contact_id: c.id, name: contactName(c), rc: cx.birth_number || '', marital: String(cx.custom?.rodinny_stav || ''), address, email: c.email || '', phone: c.phone || '' }
}

function propertyText(deal: Deal): string {
  const custom = (deal.custom || {}) as Record<string, string>
  const address = deal.address || '[[DOPLNIT: adresa nemovitosti]]'
  const ku = custom.katastr || '[[DOPLNIT: katastrální území]]'
  const lv = custom.lv || '[[DOPLNIT: číslo LV]]'
  const cat = (deal.category || '').toLowerCase()
  if (/byt/.test(cat)) return `- **bytové jednotky č. [[DOPLNIT: číslo jednotky]]** nacházející se v **budově č.p. [[DOPLNIT: číslo popisné]]**, byt. dům, na adrese ${address}, katastrální území **${ku}**, postavené na pozemku **parc. č. [[DOPLNIT: parcelní číslo]]** včetně souvisejících podílů na společných částech, jak je zapsáno na listu vlastnictví číslo ${lv}, který je přílohou této Smlouvy.`
  if (/družstev|druzstev/.test(cat)) return `- **podílu v bytovém družstvu [[DOPLNIT: název družstva]]**, IČO [[DOPLNIT: IČO družstva]] (dále jen „**bytové družstvo**“), jehož je Klient členem, s nímž je spojeno rovněž právo nájmu **družstevního bytu č. [[DOPLNIT: číslo bytu]]**, na adrese ${address}.`
  if (/pozem/.test(cat)) return `- **pozemku parc. č. [[DOPLNIT: parcelní číslo]]**,\nvše v katastrálním území ${ku}, obec [[DOPLNIT: obec]], na adrese ${address}, jak je zapsáno na listu vlastnictví číslo ${lv}, který je přílohou této Smlouvy.`
  return `- **pozemku parc. č. [[DOPLNIT: parcelní číslo]]**, na němž je umístěna **budova č. p. [[DOPLNIT: číslo popisné]]**,\n- **pozemku parc. č. [[DOPLNIT: parcelní číslo]]**,\nvše v katastrálním území ${ku}, obec [[DOPLNIT: obec]], na adrese ${address}, jak je zapsáno na listu vlastnictví číslo ${lv}, který je přílohou této Smlouvy.`
}

export function defaultInput(kind: DocKind, deal: Deal, agent?: Person): DocInput {
  const dcs = deal.deal_contacts || []
  const sellers = dcs.filter((d) => d.contacts && SELLER_ROLES.includes(d.role)).map((d) => personFrom(d.contacts!))
  const buyers = dcs.filter((d) => d.contacts && BUYER_ROLES.includes(d.role)).map((d) => personFrom(d.contacts!))
  const south = isSouthMoravia(deal.address) || (sellers.length > 0 && !deal.address && isSouthMoravia(sellers[0].address))
  const price = deal.listing_price ? czk(deal.listing_price) : ''
  const pct = deal.listing_price && deal.expected_commission ? Math.round((deal.expected_commission / deal.listing_price) * 1000) / 10 : null
  const fee = deal.expected_commission ? czk(Math.round(deal.expected_commission)) : ''
  return {
    kind, firm: south ? 'mtr' : 'mtre', place: south ? 'Ve Valticích' : 'V Praze', date: czDate(),
    sellers, buyers, property: propertyText(deal), propertyLabel: deal.address || deal.title,
    equipment: 'bez vybavení.', minPrice: price, commission: pct ? `${String(pct).replace('.', ',')} %` : '', duration: 'šesti měsíců',
    price, defects: 'žádné', fee, feeDays: '3', mortgage: true, until: plusDays(30), sellerPenalty: fee,
    principal: sellers[0], agent: agent || { name: 'Bc. Martin Tesárek' }, bank: '', accountNo: '',
  }
}

export const missingOf = (i: DocInput): string[] => Array.from(new Set(Array.from(JSON.stringify(i).matchAll(/\[\[(?:DOPLNIT|OVĚŘIT): ([^\]]+)\]\]/g)).map((m) => m[1])))
