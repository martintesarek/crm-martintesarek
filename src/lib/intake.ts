// Náběrový formulář – definice otázek pro byt, dům a pozemek.
// Data se ukládají do deals.intake = { type, values }. Klíče (k) jsou stabilní, aby šlo později exportovat
// na sreality.cz, reality.idnes.cz a bazos.cz. Platnost inzerátu se nevyplňuje: při exportu je vždy 360 dnů.

export type IType = 'byt' | 'dum' | 'pozemek'
export type IField =
  | { t: 'text'; k: string; l: string; ph?: string; hint?: string; half?: boolean }
  | { t: 'num'; k: string; l: string; unit?: string; half?: boolean; big?: boolean }
  | { t: 'chips'; k: string; l: string; o: string[]; multi?: boolean; hint?: string }
  | { t: 'seg'; k: string; l: string; o: string[] }
  | { t: 'sel'; k: string; l: string; o: string[] }
  | { t: 'tog'; k: string; l: string }
  | { t: 'step'; k: string; l: string }
  | { t: 'date'; k: string; l: string }
export type ISection = { title: string; f: IField[] }
export type IStep = { title: string; s: ISection[] }
export type IValues = Record<string, string | number | boolean | string[] | undefined>

export const TYPES: { key: IType; label: string; icon: string }[] = [
  { key: 'byt', label: 'Byt', icon: 'M5 21V4h9v17M14 9h5v12M2 21h20M8 8h2M8 12h2M8 16h2' },
  { key: 'dum', label: 'Dům', icon: 'M3 11l9-8 9 8M5 9.5V21h14V9.5M10 21v-6h4v6' },
  { key: 'pozemek', label: 'Pozemek', icon: 'M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3zM9 4v13M15 7v13' },
]

export function typeFromCategory(c?: string | null): IType | null {
  const s = (c || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/byt/.test(s)) return 'byt'
  if (/dum|dom|vila|chata|chalup|rodinn/.test(s)) return 'dum'
  if (/pozem/.test(s)) return 'pozemek'
  return null
}

const STAV = ['Velmi dobrý', 'Dobrý', 'Špatný', 'Novostavba', 'Po rekonstrukci', 'Před rekonstrukcí', 'V rekonstrukci', 'Ve výstavbě', 'K demolici', 'Projekt']
const ZPUSOB = ['Sídliště', 'Klidná část obce', 'Centrum obce', 'Rušná část obce', 'Okraj obce', 'Samota', 'Polosamota']
const OKOLI = ['Škola', 'Školka', 'Supermarket', 'Pošta', 'Úřady', 'Zdravotnická zařízení', 'Restaurace', 'Lékárna', 'Sportoviště', 'Park']
const DOPRAVA = ['Autobus', 'MHD', 'Vlak', 'Silnice', 'Dálnice']
const KONSTR = ['Cihlová', 'Dřevostavba', 'Panelová', 'Montovaná', 'Skeletová', 'Kamenná', 'Smíšená', 'Modulární']
const TELEKOM = ['Internet', 'Telefon', 'Satelit', 'Kabelové rozvody', 'Kabelová televize', 'Optika']

const katastr = (byt = false): ISection => ({
  title: 'Katastr (z listu vlastnictví)', f: [
    { t: 'text', k: 'cadastre', l: 'Katastrální území' },
    { t: 'text', k: 'parcel', l: byt ? 'Parcela, na které dům stojí' : 'Parcelní čísla', half: true }, { t: 'text', k: 'lv', l: 'Číslo LV', half: true },
    ...(byt ? [{ t: 'text', k: 'unit_no', l: 'Číslo jednotky', half: true } as IField] : []),
  ],
})

const nazev: IField = { t: 'text', k: 'title', l: 'Název nabídky', hint: 'Navrženo automaticky z údajů – můžete přepsat.' }
const adresa = (ulice = 'Ulice', cp = 'Č. popisné'): IField[] => [
  { t: 'text', k: 'street', l: ulice, half: true }, { t: 'text', k: 'cp', l: cp, half: true },
  { t: 'text', k: 'city', l: 'Obec', half: true }, { t: 'text', k: 'zip', l: 'PSČ', half: true },
]
const zobrazeni: IField[] = [
  { t: 'seg', k: 'addr_mode', l: 'Jak se má adresa zobrazit v inzerátu', o: ['Přesně', 'Jen ulice', 'Jen obec'] },
  { t: 'tog', k: 'hide_map', l: 'Nezobrazovat na mapě' },
]
const cena = (extra: IField[] = []): ISection => ({
  title: 'Cena', f: [
    { t: 'num', k: 'price', l: 'Inzerovaná cena', unit: 'Kč', big: true },
    { t: 'chips', k: 'price_incl', l: 'Co je v ceně', multi: true, o: ['S provizí RK', 'Včetně právního servisu', 'Včetně DPH', 'Včetně poplatků', 'Cena k jednání'] },
    { t: 'text', k: 'price_note', l: 'Poznámka k ceně' },
    { t: 'tog', k: 'price_hide', l: 'Neuvádět cenu v inzerátu' },
    { t: 'tog', k: 'mortgage', l: 'Lze financovat hypotékou' },
    ...extra,
  ],
})
const smlouva: ISection = { title: 'Smlouva a dostupnost', f: [{ t: 'tog', k: 'exclusive', l: 'Exkluzivní smlouva' }, { t: 'date', k: 'free_from', l: 'Volné od' }] }
const penb: ISection = {
  title: 'Energetický štítek (PENB)', f: [
    { t: 'chips', k: 'penb_class', l: 'Třída energetické náročnosti', o: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
    { t: 'num', k: 'penb_value', l: 'Ukazatel energetické náročnosti', unit: 'kWh/m²·rok' },
    { t: 'chips', k: 'penb_decree', l: 'Dle vyhlášky', o: ['č. 264/2020 Sb.', 'č. 148/2007 Sb.', 'č. 78/2013 Sb.', 'č. 222/2024 Sb.'] },
    { t: 'tog', k: 'penb_none', l: 'PENB zatím nemám – použít náhradní text' },
  ],
}

// Povinné údaje pro inzerát (Sreality) – podle typu
export const REQUIRED: Record<IType, { k: string; l: string; section: string }[]> = {
  dum: [{ k: 'city', l: 'Obec', section: 'Adresa' }, { k: 'price', l: 'Cena', section: 'Cena' }, { k: 'usable_area', l: 'Užitná plocha', section: 'Plochy' }, { k: 'plot_area', l: 'Plocha pozemku', section: 'Plochy' }, { k: 'penb_class', l: 'Třída PENB', section: 'PENB' }],
  byt: [{ k: 'city', l: 'Obec', section: 'Adresa' }, { k: 'price', l: 'Cena', section: 'Cena' }, { k: 'usable_area', l: 'Užitná plocha', section: 'Plochy' }, { k: 'floor', l: 'Podlaží', section: 'Poloha v domě' }, { k: 'penb_class', l: 'Třída PENB', section: 'PENB' }],
  pozemek: [{ k: 'city', l: 'Obec', section: 'Adresa' }, { k: 'price', l: 'Cena', section: 'Cena' }, { k: 'plot_area', l: 'Celková plocha', section: 'Plochy' }],
}

export const FORMS: Record<IType, IStep[]> = {
  dum: [
    { title: 'Základ a adresa', s: [
      { title: 'Co se nabízí', f: [nazev,
        { t: 'chips', k: 'subtype', l: 'Druh domu', o: ['Rodinný dům', 'Vila', 'Chata', 'Chalupa', 'Zemědělská usedlost', 'Vícegenerační', 'Na klíč', 'Památka / jiné'] },
        { t: 'chips', k: 'placement', l: 'Umístění domu', o: ['Samostatně stojící', 'Řadový', 'V bloku', 'Rohový'] },
        { t: 'seg', k: 'floors_type', l: 'Podlažnost', o: ['Přízemní', 'Patrový'] },
        { t: 'sel', k: 'condition', l: 'Stav objektu', o: STAV },
        { t: 'num', k: 'year', l: 'Rok výstavby / rekonstrukce' }] },
      { title: 'Adresa', f: [...adresa(), { t: 'chips', k: 'location', l: 'Umístění v obci', o: ZPUSOB }, ...zobrazeni] },
      katastr(),
    ] },
    { title: 'Plochy a dispozice', s: [
      { title: 'Dispozice', f: [
        { t: 'chips', k: 'layout', l: 'Dispozice', o: ['3+kk', '4+kk', '5+kk', '5+1', '6+kk', '6 a více', 'Jiná'] },
        { t: 'step', k: 'floors', l: 'Počet nadzemních pater' }, { t: 'step', k: 'floors_under', l: 'Podzemní patra' },
        { t: 'step', k: 'rooms', l: 'Počet pokojů' }, { t: 'step', k: 'bathrooms', l: 'Počet koupelen' },
        { t: 'step', k: 'garages', l: 'Počet garáží' }, { t: 'step', k: 'parking', l: 'Parkovací stání' }] },
      { title: 'Plochy v m²', f: [
        { t: 'num', k: 'usable_area', l: 'Užitná plocha', unit: 'm²' }, { t: 'num', k: 'living_area', l: 'Obytná plocha', unit: 'm²' },
        { t: 'num', k: 'built_area', l: 'Zastavěná plocha', unit: 'm²' }, { t: 'num', k: 'plot_area', l: 'Celý pozemek', unit: 'm²' },
        { t: 'num', k: 'garden_area', l: 'Zahrada', unit: 'm²' }, { t: 'num', k: 'terrace_area', l: 'Terasa', unit: 'm²' },
        { t: 'num', k: 'garage_area', l: 'Garáž', unit: 'm²' }, { t: 'num', k: 'cellar_area', l: 'Sklep', unit: 'm²' },
        { t: 'num', k: 'pool_area', l: 'Bazén', unit: 'm²' }, { t: 'num', k: 'other_area', l: 'Ostatní', unit: 'm²' }] },
    ] },
    { title: 'Technika, vybavení, okolí', s: [
      { title: 'Stavba a technika', f: [
        { t: 'chips', k: 'construction', l: 'Konstrukce budovy', o: KONSTR },
        { t: 'chips', k: 'heating', l: 'Topení', o: ['Ústřední elektrické', 'Ústřední plynové', 'Ústřední tuhá paliva', 'Lokální elektrické', 'Podlahové', 'Lokální plynové'] },
        { t: 'chips', k: 'heat_source', l: 'Zdroj topení', o: ['Elektrokotel', 'Plynový kondenzační kotel', 'Tepelné čerpadlo', 'Kotel na tuhá paliva', 'Krbová kamna'] },
        { t: 'chips', k: 'water', l: 'Voda', o: ['Vodovod', 'Studna', 'Místní zdroj vody', 'Retenční nádrž'] },
        { t: 'chips', k: 'sewer', l: 'Odpad', o: ['Veřejná kanalizace', 'Septik', 'Jímka', 'Trativod', 'ČOV pro celý objekt'] },
        { t: 'chips', k: 'energy', l: 'Elektřina a plyn', multi: true, o: ['Elektřina 230 V', 'Elektřina 400 V', 'Plynovod', 'Plyn individuální'] },
        { t: 'chips', k: 'telecom', l: 'Telekomunikace', multi: true, o: TELEKOM },
        { t: 'chips', k: 'equipment', l: 'Vybavení domu', multi: true, o: ['Zahrada', 'Terasa', 'Garáž', 'Parkování', 'Oplocení', 'Sklep', 'Balkon', 'Bazén', 'Krb', 'Solární panely', 'Fotovoltaika', 'Lodžie'] }] },
      { title: 'Okolí a dostupnost', f: [
        { t: 'chips', k: 'surroundings', l: 'Vybavenost okolí', multi: true, o: OKOLI },
        { t: 'chips', k: 'transport', l: 'Dopravní spojení', multi: true, o: DOPRAVA },
        { t: 'chips', k: 'neighbourhood', l: 'Zástavba okolí', multi: true, o: ['Bydlení', 'Rekreační', 'Průmyslová', 'Venkovská'] }] },
    ] },
    { title: 'Energie, cena, smlouva', s: [cena(), smlouva, penb] },
  ],

  byt: [
    { title: 'Základ a adresa', s: [
      { title: 'Co se nabízí', f: [nazev,
        { t: 'chips', k: 'layout', l: 'Dispozice', o: ['1+kk', '1+1', '2+kk', '2+1', '3+kk', '3+1', '4+kk', '4+1', '5+kk a větší', 'Atypický'] },
        { t: 'chips', k: 'subtype', l: 'Typ bytu', o: ['Standardní', 'Mezonet', 'Loft', 'Podkrovní', 'Garsoniéra'] },
        { t: 'seg', k: 'ownership', l: 'Vlastnictví', o: ['Osobní', 'Družstevní'] },
        { t: 'sel', k: 'condition', l: 'Stav objektu', o: STAV },
        { t: 'num', k: 'year', l: 'Rok výstavby / rekonstrukce' }] },
      { title: 'Poloha v domě', f: [{ t: 'num', k: 'floor', l: 'Podlaží bytu', half: true }, { t: 'num', k: 'floors_total', l: 'Pater domu celkem', half: true },
        { t: 'tog', k: 'elevator', l: 'Výtah' }, { t: 'tog', k: 'barrier_free', l: 'Bezbariérový přístup' }] },
      { title: 'Adresa', f: [...adresa(), { t: 'chips', k: 'location', l: 'Umístění v obci', o: ZPUSOB }, ...zobrazeni] },
      katastr(true),
    ] },
    { title: 'Plochy a dispozice', s: [
      { title: 'Plochy bytu', f: [{ t: 'num', k: 'usable_area', l: 'Užitná plocha', unit: 'm²', half: true }, { t: 'num', k: 'floor_area', l: 'Podlahová plocha', unit: 'm²', half: true },
        { t: 'step', k: 'rooms', l: 'Počet pokojů' }, { t: 'step', k: 'bathrooms', l: 'Počet koupelen' },
        { t: 'tog', k: 'separate_wc', l: 'Samostatné WC' }, { t: 'tog', k: 'dressing', l: 'Šatna / komora' }] },
      { title: 'Venkovní prostory', f: [
        { t: 'tog', k: 'balcony', l: 'Balkon' }, { t: 'num', k: 'balcony_area', l: 'Plocha balkonu', unit: 'm²' },
        { t: 'tog', k: 'loggia', l: 'Lodžie' }, { t: 'num', k: 'loggia_area', l: 'Plocha lodžie', unit: 'm²' },
        { t: 'tog', k: 'terrace', l: 'Terasa' }, { t: 'num', k: 'terrace_area', l: 'Plocha terasy', unit: 'm²' },
        { t: 'tog', k: 'front_garden', l: 'Předzahrádka' }] },
      { title: 'Sklep a příslušenství', f: [
        { t: 'tog', k: 'cellar', l: 'Sklep' }, { t: 'num', k: 'cellar_area', l: 'Plocha sklepa', unit: 'm²' },
        { t: 'tog', k: 'garage', l: 'Garáž' },
        { t: 'chips', k: 'parking_type', l: 'Parkování', o: ['Parkovací stání', 'Garážové stání', 'Parkování před domem', 'Bez parkování'] },
        { t: 'step', k: 'parking', l: 'Počet parkovacích míst' }] },
    ] },
    { title: 'Budova, vybavení, okolí', s: [
      { title: 'Budova', f: [
        { t: 'chips', k: 'construction', l: 'Konstrukce budovy', o: ['Cihlová', 'Panelová', 'Smíšená', 'Skeletová', 'Dřevěná', 'Montovaná', 'Kamenná'] },
        { t: 'sel', k: 'building_condition', l: 'Stav budovy', o: STAV },
        { t: 'tog', k: 'insulated', l: 'Zateplený dům' }, { t: 'tog', k: 'new_windows', l: 'Nová okna' }, { t: 'tog', k: 'common_renovated', l: 'Rekonstruované společné prostory' }] },
      { title: 'Technika', f: [
        { t: 'chips', k: 'heating', l: 'Vytápění', o: ['Ústřední dálkové', 'Ústřední plynové', 'Lokální plynové', 'Elektrické', 'Podlahové', 'Tepelné čerpadlo'] },
        { t: 'chips', k: 'heat_source', l: 'Zdroj topení', o: ['Plyn', 'Elektřina', 'Dálkové', 'Tepelné čerpadlo', 'Pevná paliva'] },
        { t: 'chips', k: 'hot_water', l: 'Ohřev vody', o: ['Ústřední', 'Plynový kotel', 'Elektrický bojler', 'Solár'] },
        { t: 'tog', k: 'aircon', l: 'Klimatizace' }, { t: 'tog', k: 'recuperation', l: 'Rekuperace' }] },
      { title: 'Vybavení bytu', f: [
        { t: 'seg', k: 'furnished', l: 'Zařízeno nábytkem', o: ['Ano', 'Částečně', 'Ne'] },
        { t: 'tog', k: 'kitchen', l: 'Kuchyňská linka' }, { t: 'tog', k: 'appliances', l: 'Spotřebiče v kuchyni' }, { t: 'tog', k: 'wardrobes', l: 'Vestavěné skříně' },
        { t: 'tog', k: 'security_door', l: 'Bezpečnostní vchod / dveře' }, { t: 'tog', k: 'alarm', l: 'Alarm / kamerový systém' }] },
      { title: 'Okolí a doprava', f: [
        { t: 'chips', k: 'surroundings', l: 'V okolí', multi: true, o: OKOLI },
        { t: 'chips', k: 'transport', l: 'Doprava', multi: true, o: [...DOPRAVA, 'Tramvaj', 'Metro'] }] },
    ] },
    { title: 'Energie, cena, smlouva', s: [
      cena([{ t: 'num', k: 'fund', l: 'Měsíční zálohy do fondu oprav', unit: 'Kč', half: true }, { t: 'num', k: 'service_fee', l: 'Poplatky za služby', unit: 'Kč', half: true },
        { t: 'num', k: 'energy_fee', l: 'Zálohy na energie', unit: 'Kč', half: true }, { t: 'num', k: 'monthly_total', l: 'Celkem měsíčně', unit: 'Kč', half: true },
        { t: 'text', k: 'svj', l: 'Název SVJ / družstva' }, { t: 'tog', k: 'lien', l: 'Zástavní právo / hypotéka na bytě' }]),
      smlouva, penb] },
  ],

  pozemek: [
    { title: 'Základ a adresa', s: [
      { title: 'Co se nabízí', f: [nazev,
        { t: 'chips', k: 'subtype', l: 'Druh pozemku', o: ['Bydlení', 'Komerční', 'Pole', 'Louka', 'Les', 'Zahrada', 'Sad / vinice', 'Rybník', 'Ostatní'] },
        { t: 'chips', k: 'zoning', l: 'Využití podle územního plánu', o: ['Plocha bydlení', 'Smíšená plocha', 'Výroba a sklady', 'Rekreace', 'Zemědělská půda', 'Jiné'] },
        { t: 'seg', k: 'ownership', l: 'Vlastnictví', o: ['Osobní', 'Družstevní'] }] },
      { title: 'Parcela a katastr', f: [{ t: 'text', k: 'cadastre', l: 'Katastrální území' }, { t: 'text', k: 'parcel', l: 'Parcelní číslo', half: true }, { t: 'text', k: 'lv', l: 'Číslo LV', half: true },
        { t: 'tog', k: 'multi_parcel', l: 'Pozemek je tvořen více parcelami' }, { t: 'tog', k: 'zpf', l: 'Zemědělský půdní fond (ZPF)' }, { t: 'tog', k: 'permit', l: 'Územní rozhodnutí / stavební povolení' }] },
      { title: 'Adresa a poloha', f: [...adresa('Ulice (nepovinné)', 'Č. parcely / orient.'),
        { t: 'chips', k: 'location', l: 'Umístění v obci', o: ['Centrum obce', 'Klidná část obce', 'Okraj obce', 'Samota', 'Mimo zástavbu'] }, ...zobrazeni] },
    ] },
    { title: 'Plochy, sítě, přístup', s: [
      { title: 'Plochy', f: [{ t: 'num', k: 'plot_area', l: 'Celková plocha pozemku', unit: 'm²' }, { t: 'num', k: 'buildable_area', l: 'Z toho zastavitelná plocha', unit: 'm²' },
        { t: 'num', k: 'width', l: 'Šířka u cesty', unit: 'm', half: true }, { t: 'num', k: 'depth', l: 'Hloubka', unit: 'm', half: true },
        { t: 'chips', k: 'shape', l: 'Tvar pozemku', o: ['Rovinatý', 'Mírný svah', 'Svažitý', 'Nepravidelný'] },
        { t: 'tog', k: 'fenced', l: 'Oplocený' }, { t: 'tog', k: 'building', l: 'Stavba na pozemku (chata, sklad…)' }] },
      { title: 'Inženýrské sítě', f: [
        { t: 'chips', k: 'water', l: 'Voda', o: ['Veřejný vodovod', 'Studna', 'Vrt', 'Na hranici pozemku', 'Žádná'] },
        { t: 'chips', k: 'sewer', l: 'Odpad', o: ['Veřejná kanalizace', 'Septik', 'Žumpa', 'ČOV', 'Žádný'] },
        { t: 'chips', k: 'electricity', l: 'Elektřina', o: ['230 V', '400 V', 'Na hranici pozemku', 'Žádná'] },
        { t: 'chips', k: 'gas', l: 'Plyn', o: ['Plynovod', 'Na hranici pozemku', 'Bez plynu'] },
        { t: 'chips', k: 'telecom', l: 'Telekomunikace', multi: true, o: TELEKOM }] },
      { title: 'Přístup a okolí', f: [
        { t: 'chips', k: 'road', l: 'Přístupová komunikace', o: ['Asfaltová', 'Dlážděná', 'Betonová', 'Zpevněná', 'Neupravená', 'Polní cesta'] },
        { t: 'tog', k: 'easement_access', l: 'Přístup přes cizí pozemek (věcné břemeno)' },
        { t: 'chips', k: 'surroundings', l: 'V okolí', multi: true, o: [...OKOLI.slice(0, 4), 'Les', 'Voda', 'Sportoviště', 'Restaurace'] },
        { t: 'chips', k: 'transport', l: 'Doprava', multi: true, o: ['Autobus', 'Vlak', 'Dálnice', 'MHD'] }] },
    ] },
    { title: 'Cena a smlouva', s: [cena(), smlouva] },
  ],
}

// Navržený název nabídky z vyplněných údajů
export function suggestTitle(type: IType, v: IValues): string {
  const m2 = (k: string) => (v[k] ? `${v[k]} m²` : '')
  const parts: string[] = []
  if (type === 'byt') parts.push('Prodej bytu', String(v.layout || ''), m2('usable_area'))
  else if (type === 'dum') parts.push('Prodej', String(v.subtype === 'Rodinný dům' || !v.subtype ? 'rodinného domu' : String(v.subtype).toLowerCase()), String(v.layout || ''), m2('usable_area'))
  else parts.push('Prodej', v.subtype === 'Bydlení' || !v.subtype ? 'stavebního pozemku' : `pozemku (${String(v.subtype).toLowerCase()})`, m2('plot_area'))
  const head = parts.filter(Boolean).join(' ')
  return [head, String(v.city || '')].filter(Boolean).join(', ')
}

export function missing(type: IType, v: IValues) {
  const empty = (x: unknown) => x == null || x === '' || (Array.isArray(x) && !x.length)
  return REQUIRED[type].filter((r) => empty(v[r.k]) && !(r.k === 'penb_class' && v.penb_none))
}
export function progress(type: IType, v: IValues) {
  const steps = FORMS[type]
  return steps.map((st) => {
    const fs = st.s.flatMap((s) => s.f).filter((f) => f.t !== 'tog')
    const done = fs.filter((f) => { const x = v[f.k]; return !(x == null || x === '' || (Array.isArray(x) && !x.length)) }).length
    return { done, total: fs.length }
  })
}

// Výchozí odpovědi (Martinovo pravidlo): platí pro všechny typy, jdou kdykoli změnit.
export const DEFAULTS: IValues = {
  price_incl: ['S provizí RK', 'Včetně právního servisu'],
  price_note: 'lze financovat hypotečním úvěrem',
  mortgage: true,
  exclusive: true,
  addr_mode: 'Přesně',
}
/** Doplní výchozí odpovědi jen tam, kde se ještě nic nevyplnilo (smazané pole zůstane prázdné). */
export function withDefaults(v: IValues): { values: IValues; changed: boolean } {
  const out = { ...v }; let changed = false
  for (const [k, val] of Object.entries(DEFAULTS)) if (out[k] === undefined) { out[k] = val; changed = true }
  return { values: out, changed }
}

// Údaje, které jde vyplnit z listu vlastnictví (jen ty, které formulář daného typu má)
export const LV_LABELS: Record<string, string> = {
  street: 'Ulice', cp: 'Číslo popisné', city: 'Obec', zip: 'PSČ', cadastre: 'Katastrální území', parcel: 'Parcelní čísla', lv: 'Číslo LV',
  unit_no: 'Číslo jednotky', plot_area: 'Plocha pozemku (m²)', built_area: 'Zastavěná plocha (m²)',
}
export function lvKeys(type: IType): string[] {
  const have = new Set(FORMS[type].flatMap((st) => st.s.flatMap((x) => x.f.map((f) => f.k))))
  return Object.keys(LV_LABELS).filter((k) => have.has(k))
}

/** Adresu z obchodu rozdělí na ulici, číslo, PSČ a obec (např. „Zákostelní 665/9, 193 00 Praha 9“). */
export function parseAddress(a?: string | null) {
  const out: { street?: string; cp?: string; city?: string; zip?: string } = {}
  const parts = String(a || '').split(',').map((x) => x.trim()).filter(Boolean)
  if (!parts.length) return out
  let rest = parts.slice()
  const first = rest[0]
  const m = first.match(/^(.*?)\s+(\d+[\/\dA-Za-z]*)$/)
  if (m && rest.length > 1) { out.street = m[1]; out.cp = m[2]; rest = rest.slice(1) }
  else if (!/\d/.test(first) && rest.length > 1) { out.street = first; rest = rest.slice(1) }
  else if (m && rest.length === 1) { out.city = m[1]; out.cp = m[2]; rest = [] } // „Mutěnice 151“ = obec + číslo popisné
  for (const r of rest) {
    const z = r.match(/(\d{3})\s?(\d{2})/)
    if (z) { out.zip = z[1] + ' ' + z[2]; const c = r.replace(z[0], '').trim(); if (c) out.city = c; }
    else if (!out.city) out.city = r
  }
  return out
}
/** Údaje, které už Martin vyplnil u obchodu (cena, adresa), se doplní do formuláře – nikdy nepřepíšou nic vyplněného. */
export function withDealData(v: IValues, deal: { listing_price?: number | null; address?: string | null }): { values: IValues; changed: boolean } {
  const out = { ...v }; let changed = false
  const empty = (x: unknown) => x == null || x === ''
  if (deal.listing_price && empty(out.price)) { out.price = String(deal.listing_price).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); changed = true }
  const a = parseAddress(deal.address)
  for (const k of ['street', 'cp', 'city', 'zip'] as const) if (a[k] && empty(out[k])) { out[k] = a[k]; changed = true }
  return { values: out, changed }
}
