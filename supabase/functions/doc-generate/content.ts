// Obsah dokumentů podle Martinových vzorů (SMLOUVY/Smlouvy 2023 - 2025 MTRE).
// Texty článků se nezkracují ani nepřepisují – jen se doplňují údaje z CRM / formuláře.
import type { Block, Spec } from './docx.ts'

export type Person = { name: string; rc?: string; marital?: string; address?: string; email?: string; phone?: string }
export type FirmKey = 'mtre' | 'mtr' | 'prm' | 'mt'
export type DocKind = 'zs' | 'rs' | 'pm' | 'pp'
export type DocInput = {
  kind: DocKind
  firm: FirmKey
  place: string // „Ve Valticích“ / „V Praze“
  date: string // „20. 10. 2026“
  sellers: Person[]
  buyers: Person[]
  property: string // označení nemovitosti (podporuje **tučně** a [[DOPLNIT: …]])
  propertyLabel?: string // krátké označení do názvu souboru (adresa)
  // zprostředkovatelská
  equipment?: string; minPrice?: string; commission?: string; duration?: string
  // rezervační
  price?: string; defects?: string; fee?: string; feeDays?: string; mortgage?: boolean; until?: string; sellerPenalty?: string
  // plná moc
  principal?: Person; agent?: Person; bank?: string; accountNo?: string
}

export const FIRMS: Record<FirmKey, { name: string; short: string; seat: string; ic: string; dic?: string; reg?: string; ds?: string; corr?: string; account: string; rsLine: string }> = {
  mtre: { name: 'MARTIN TESAREK REAL ESTATE s.r.o.', short: 'Martin Tesarek Real Estate s.r.o.', seat: 'Dandova 2619/13, Horní Počernice, 193 00 Praha 9', ic: '07434120', dic: 'CZ07434120', reg: 'C 300933 vedená u Městského soudu v Praze', ds: 'fdwja7w', account: '2601500974/2010', rsLine: 'Martin Tesarek Real Estate s.r.o., IČ: 07434120, sídlem Dandova 2619/13, Horní Počernice - Praha 9' },
  mtr: { name: 'MARTIN TESÁREK REALITY s.r.o.', short: 'Martin Tesárek Reality s.r.o.', seat: 'Zahradní 994, Valtice', ic: '17604371', dic: 'CZ17604371', reg: 'C 130695 vedená u Krajského soudu v Brně', ds: 'spr3wpg', account: '2402339647/2010', rsLine: 'MARTIN TESÁREK REALITY s.r.o., IČ: 17604371, sídlem Zahradní 994, Valtice' },
  prm: { name: 'PROFESIONÁLNÍ REALITNÍ MAKLÉŘ s.r.o.', short: 'Profesionální realitní makléř s.r.o.', seat: 'Novákových 2381/32a, Libeň, 180 00 Praha 8', corr: 'Senovážné nám. 1985/11, Praha 1 - Nové Město', ic: '06610773', dic: 'CZ06610773', reg: 'C 285369 vedená u Městského soudu v Praze', ds: 'qftwcuh', account: '2901345793/2010', rsLine: 'Profesionální realitní makléř s.r.o., IČ: 06610773, sídlem Novákových 2381/32a, Praha - Libeň' },
  mt: { name: 'Bc. Martin Tesárek', short: 'Martin Tesárek', seat: 'Žitná 606/29, Praha 1 - Nové Město', ic: '75196310', account: '2603485325/2010', rsLine: 'Bc. Martinem Tesárkem, IČ: 75196310, sídlem Žitná 606/29, Praha 1 - Nové Město' },
}

const D = (what: string) => `[[DOPLNIT: ${what}]]`
const v = (val: string | undefined, what: string) => (val && val.trim() ? val.trim() : D(what))
const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
const art = (n: number, name: string): Block => ({ type: 'heading', text: `Článek ${roman[n - 1]}.`, subtext: name })
const p = (text: string, extra: Partial<Extract<Block, { type: 'paragraph' }>> = {}): Block => ({ type: 'paragraph', text, ...extra })
const list = (items: string[], extra: Partial<Extract<Block, { type: 'list' }>> = {}): Block => ({ type: 'list', items, ...extra })
const sep = (text = 'a', align: 'left' | 'center' = 'left'): Block => ({ type: 'separator', text, bold: false, align })

function personParty(x: Person, note: string, withMarital = true): Block {
  const fields: [string, string][] = [['jméno, příjmení', v(x.name, 'jméno a příjmení')], ['RČ', v(x.rc, 'rodné číslo')]]
  if (withMarital) fields.push(['rodinný stav', v(x.marital, 'rodinný stav')])
  fields.push(['trvale bytem', v(x.address, 'adresa trvalého bydliště')], ['e-mail', v(x.email, 'e-mail')], ['tel.', v(x.phone, 'telefon')])
  return { type: 'party', fields, note }
}
function firmParty(key: FirmKey): Block {
  const f = FIRMS[key]
  const fields: [string, string][] = [['obchodní firma', f.name], ['sídlem', f.seat]]
  if (f.corr) fields.push(['korespondenční adresa a kanceláře', f.corr])
  fields.push(['IČ', f.ic + (f.dic ? `, DIČ: ${f.dic}` : '')])
  if (f.reg) fields.push(['spisová značka', f.reg])
  fields.push(['jednající', 'Bc. Martinem Tesárkem, jednatelem'])
  if (f.ds) fields.push(['datová schránka', f.ds])
  fields.push(['e-mail', 'reality@martintesarek.cz'], ['mobil', '+420 776 252 777'], ['web', 'www.martintesarek.cz'])
  return { type: 'party', fields, note: 'dále též jen „**Zprostředkovatel**“' }
}

const PEP_LIST = ['hlava státu', 'předseda vlády', 'vedoucí ústředního orgánu státní správy a jeho zástupce (ministr, náměstek, státní tajemník apod.)', 'člen parlamentu', 'člen řídícího orgánu politické strany', 'vedoucí představitel územní samosprávy (starosta, primátor, hejtman)', 'soudce nejvyššího soudu, ústavního soudu nebo jiného nejvyššího justičního orgánu, proti jehož rozhodnutí obecně až na výjimky nelze použít opravné prostředky', 'člen bankovní rady centrální banky', 'vysoký důstojník ozbrojených sil nebo sboru', 'člen nebo zástupce člena, je-li jím právnická osoba, statutárního orgánu obchodní korporace ovládané státem', 'velvyslanec nebo vedoucí diplomatické mise, anebo fyzická osoba, která obdobnou funkci vykonává nebo vykonávala v jiném státě, v orgánu Evropské unie anebo v mezinárodní organizaci,']

function pepBlocks(x: Person, role: 'Klient' | 'Zájemce', placeDate: string): Block[] {
  return [
    { type: 'pagebreak' },
    p('**PROHLÁŠENÍ PEP**', { align: 'center', navy: true, after: 2 }),
    p('(politically exposed person – politicky exponovaná osoba)\npodle zákona č. 253/2008 Sb., o některých opatřeních proti legalizaci výnosů z trestné činnosti a financování terorismu (tzv. AML zákon – Anti-Money Laundering)', { align: 'center', after: 14 }),
    { type: 'party', fields: [['Jméno, příjmení', v(x.name, 'jméno a příjmení')], ['RČ', v(x.rc, 'rodné číslo')], ['Trvale bytem', v(x.address, 'adresa trvalého bydliště')]], note: `(dále jen „**${role}**“)` },
    p(`**${role.toUpperCase()} PROHLAŠUJE, ŽE:**`, { after: 4 }),
    list(['NENÍ POLITICKY EXPONOVANOU OSOBOU.', 'JE POLITICKY EXPONOVANOU OSOBOU.', 'UPLYNULO VÍCE NEŽ 12 MĚSÍCŮ ODE DNE, KDY PŘESTAL VYKONÁVAT PŘÍSLUŠNOU FUNKCI POLITICKY EXPONOVANÉ OSOBY.'], { style: 'bullet', indent_cm: 1.27 }),
    p('Politicky exponovanou osobou se ve smyslu § 4 odst. 5 zákona č. 253/2008 Sb. Zákon o některých opatřeních proti legalizaci výnosů z trestné činnosti a financování terorismu rozumí:'),
    p('a) fyzická osoba, která je nebo byla ve významné veřejné funkci s celostátním nebo regionálním významem, jako je zejména:', { after: 4 }),
    list(PEP_LIST, { style: 'bullet', indent_cm: 1.27 }),
    p('b) fyzická osoba, která je:', { after: 4 }),
    list(['osobou blízkou k osobě uvedené v písmenu a)', 'společníkem nebo skutečným majitelem stejné právnické osoby, popřípadě svěřenského fondu, jako osoba uvedená v písmenu a), nebo je v jakémkoli jiném blízkém podnikatelském vztahu s osobou uvedenou v písmenu a) nebo', 'skutečným majitelem právnické osoby, popřípadě svěřenského fondu, která byla vytvořena ve prospěch osoby uvedené v písmenu a)'], { indent_cm: 1.27 }),
    { type: 'signatures', place_date_text: placeDate, signers: [{ role }] },
  ]
}
function cpBlocks(x: Person, role: 'Klient' | 'Zájemce', placeDate: string): Block[] {
  const seller = role === 'Klient'
  return [
    { type: 'pagebreak' },
    p('**ČESTNÉ PROHLÁŠENÍ**', { align: 'center', navy: true, after: 2 }),
    p('podle zákona č. 253/2008 Sb., o některých opatřeních proti legalizaci výnosů z trestné činnosti a financování terorismu (tzv. AML zákon – Anti-Money Laundering)', { align: 'center', after: 14 }),
    { type: 'party', fields: [['Jméno, příjmení', v(x.name, 'jméno a příjmení')], ['RČ', v(x.rc, 'rodné číslo')], ['Trvale bytem', v(x.address, 'adresa trvalého bydliště')]], note: `(dále jen „**${role}**“)` },
    ...(seller
      ? [
          p('prohlašuji, že nemovitosti specifikované v této smlouvě jsem nabyl/a:', { after: 4 }),
          list(['Koupí', 'Darem', 'Dědictvím', 'Usnesením o příklepu (dražbou)', 'Směnou', 'Vypořádáním společného jmění manželů (SJ)', 'Vypořádáním podílového spoluvlastnictví', 'Převodem majetku z právnické osoby na fyzickou osobu', 'Převodem z restituce', 'Převodem z privatizace', 'Převodem na základě rozhodnutí orgánu veřejné moci', 'Vkladem nepeněžitého majetku do společnosti (apportem)'], { style: 'bullet', indent_cm: 1.27 }),
          p('a koupi jsem financoval:', { after: 4 }),
          list(['Vlastními prostředky', 'Hypotečním úvěrem', 'Kombinací vlastních prostředků a úvěru', 'Darem (finančním)', 'Dědictvím (finančním)', 'Prodejem jiné nemovitosti', 'Kombinací více zdrojů'], { style: 'bullet', indent_cm: 1.27 }),
        ]
      : [
          p('prohlašuji, že peněžní prostředky použité na koupi nemovitosti specifikované v této smlouvě pochází z:', { after: 4 }),
          list(['Příjmy ze zaměstnání (mzda, plat, bonusy)', 'Příjmy z podnikání (zisk, fakturace, podíly)', 'Úspory z minulých let', 'Prodej jiné nemovitosti', 'Hypoteční úvěr nebo jiný bankovní úvěr', 'Dědictví', 'Dar (od rodiny, třetí osoby)', 'Výnosy z investic (akcie, dluhopisy, kryptoměny)', 'Výnosy z pronájmu nemovitosti', 'Půjčka od soukromé osoby'], { style: 'bullet', indent_cm: 1.27 }),
        ]),
    p('Čestné prohlášení je vystaveno na základě povinností uložených zákonem č. 253/2008 Sb. Zákon o některých opatřeních proti legalizaci výnosů z trestné činnosti a financování terorismu.'),
    { type: 'signatures', place_date_text: placeDate, signers: [{ role }] },
  ]
}

const placeDateOf = (i: DocInput) => `${i.place} dne ${i.date}`
const names = (ps: Person[]) => ps.map((x) => x.name).filter(Boolean).join(', ')

// ---------------- Zprostředkovatelská smlouva ----------------
export function zs(i: DocInput): Spec {
  const pd = placeDateOf(i)
  const sellers = i.sellers.length ? i.sellers : [{ name: '' }]
  const commission = v(i.commission, 'výše provize v % z kupní ceny')
  const blocks: Block[] = [
    firmParty(i.firm),
    sep('a'),
  ]
  sellers.forEach((s, k) => { if (k) blocks.push(sep('a')); blocks.push(personParty(s, 'dále též (v případě více osob souhrnně) jen „**Klient**“')) })
  blocks.push(
    p('uzavřeli níže uvedeného dne, měsíce a roku, tuto', { align: 'center', after: 4 }),
    p('**smlouvu o realitním zprostředkování**', { align: 'center', after: 2 }),
    p('(dále jen „**Smlouva**“)', { align: 'center' }),
    art(1, 'Prohlášení a předmět Smlouvy'),
    list([
      `Klient prohlašuje, že je vlastníkem:\n${v(i.property, 'označení nemovitosti podle LV')}\n(dále jen „**Nemovitost**“).`,
      `Nemovitost se bude prodávat ${v(i.equipment, 'bez vybavení / včetně stávajícího vybavení, k němuž náleží zejména …')}`,
      'Zprostředkovatel se zavazuje vyvíjet pro Klienta činnost tak, aby měl možnost uzavřít se třetí osobou (dále rovněž „**Zájemce**“) smlouvu o převodu nemovitosti (a to zejména kupní smlouvu, případně smlouvu o smlouvě budoucí kupní, či smlouvu o převodu družstevního podílu – dále souhrnně jen jako „**Převodní smlouva**“), přičemž za účelem rezervace nemovitosti Zájemcem bude uzavřena rezervační smlouva.',
      'Zprostředkovatel se zavazuje zprostředkovat Klientovi uzavření Převodní smlouvy, jejímž předmětem je prodej nemovitosti za těchto podmínek:',
    ]),
    list([
      `kupní cena bude činit minimálně **${v(i.minPrice, 'minimální kupní cena')}** (v této ceně je zahrnuta odměna – provize Zprostředkovatele uvedená níže);`,
      'kupní cena (po odečtení rezervační zálohy) bude vypořádána prostřednictvím advokátní, či bankovní úschovy, přičemž návrh na vklad vlastnického práva Zájemce bude v případě Nemovitosti podán po připsání kupní ceny do úschovy a peníze budou Klientovi vyplaceny z úschovy po zápisu vlastnického práva Zájemce k Nemovitosti do katastru nemovitostí a po podání návrhu na výmaz případného původního zástavního práva z katastru nemovitostí; v případě převodu družstevního podílu budou dokumenty doručeny bytovému družstvu po připsání kupní ceny do úschovy a peníze budou Klientovi vyplaceny z úschovy oproti předložení potvrzení o doručení relevantních dokumentů (smlouvy o převodu podílu nebo potvrzení o uzavření této Smlouvy) bytovému družstvu, nebo podle dohody smluvních stran;',
      'Klient předá nemovitost Zájemci ve lhůtě 10 dní ode dne zápisu vlastnického práva Zájemce do katastru nemovitostí.',
    ], { style: 'letter' }),
    list(['V případě, že Zprostředkovatel získá třetí osobu, jakožto potenciálního Zájemce, informuje o tom Klienta a ten poskytne Zprostředkovateli veškerou součinnost k tomu, aby do 5 pracovních dnů mohla být uzavřena rezervační smlouva mezi Klientem a Zájemcem.'], { start: 5 }),
    art(2, 'Odměna – Provize Zprostředkovatele'),
    list([
      `Klient se zavazuje zaplatit Zprostředkovateli odměnu – provizi ve výši **${commission}** z kupní ceny + DPH. Provize je součástí kupní ceny.`,
      'Zprostředkovatel, pokud obdržel rezervační poplatek od Zájemce v rámci rezervační smlouvy, odpovídající výši provize, započte si svůj nárok na úhradu provize vůči složenému rezervačnímu poplatku. To však neplatí pro případ, že je z důvodu na straně Klienta nutné rezervační poplatek vrátit Zájemci (v takovém případě se Klient zavazuje zaplatit Zprostředkovateli provizi ve shora uvedené výši).',
      'Nárok na provizi vzniká Zprostředkovateli splněním jeho závazku podle Článku I. odst. 3. této Smlouvy. Provize je splatná dnem uzavření Převodní smlouvy a přepisem vlastnického práva na třetí osobu.',
      'Nárok na provizi náleží Zprostředkovateli i tehdy, jestliže bude Převodní smlouva mezi Klientem a třetí osobou, získanou přičiněním Zprostředkovatele, uzavřena po uplynutí platnosti této Smlouvy.',
    ]),
    art(3, 'Práva a povinnosti smluvních stran'),
    list([
      'Klient prohlašuje, že ke dni podpisu této Smlouvy nemá uzavřenou s žádným subjektem (fyzickou, či právnickou osobou) stejnou nebo obdobnou smlouvu o obstarání prodeje nemovitosti (např. příkazní smlouvu, smlouvu o zprostředkování, inominátní smlouvu atd.) a zavazuje se, že po dobu trvání této Smlouvy nemovitost nezatíží jakoukoli právní povinností (s výjimkou sjednanou v odst. 6. tohoto Článku této Smlouvy) a neuzavře s žádným subjektem stejnou nebo obdobnou smlouvu o obstarání prodeje nemovitosti a dále neuzavře se třetí osobou, která nebyla nalezena činností Zprostředkovatele, Převodní smlouvu.',
      'V případě, kdy se na Klienta obrátí třetí osoba se žádostí o koupi nemovitosti, je Klient povinen takovou osobu plně odkázat v takové věci na Zprostředkovatele s tím, že pokud Klient uzavře s touto osobou Převodní smlouvu, Zprostředkovatel uhradí Klientovi 30 % z odměny, kterou za zprostředkování uzavření Převodní smlouvy Zprostředkovatel obdrží.',
      'Klient se zavazuje poskytnout Zprostředkovateli veškerou nezbytnou součinnost vedoucí k uzavření Převodní smlouvy k nemovitosti se Zájemcem, a to ve lhůtě stanovené v rezervační smlouvě.',
      'Klient se zavazuje, že nepodnikne žádné faktické ani právní úkony, které by zabránily sjednání Převodní smlouvy mezi ním a třetí osobou získanou Zprostředkovatelem.',
      'S ohledem na skutečnost, že Zprostředkovatel uzavřením této Smlouvy zahájí zprostředkovatelskou činnost (zejména zahájí propagaci nemovitosti, bude provádět prohlídky nemovitosti a povede jednání se Zájemci o koupi nemovitosti vedoucí k prodeji nemovitosti), Klient prohlašuje, že svůj úmysl převést nemovitost zodpovědně zvážil a zavazuje se, že nebude nijak mařit činnost Zprostředkovatele, naopak mu bude poskytovat potřebnou součinnost ke sjednání a uzavření Převodní smlouvy a k převodu nemovitosti na Zájemce. Dále se Klient zavazuje, že v rámci své povinnosti součinnosti oznámí Zprostředkovateli všechny skutečnosti, které by mohly zmařit uzavření Převodní smlouvy, umožní Zprostředkovateli provádět prohlídky nemovitosti, bude se účastnit jednání se Zájemci a reagovat na učiněné návrhy a připomínky v rámci procesu přípravy Převodní smlouvy. Klient se dále zavazuje sdělit Zprostředkovateli všechny nezbytné technické i právní údaje související s nemovitostí a za tímto účelem se zavazuje Zprostředkovateli poskytnout zejména doklad o nabytí nemovitosti a dokumentaci skutečného provedení stavby (pasport stavby), kterou je podle § 9 vyhlášky č. 131/2024 Sb., o dokumentaci staveb, každý vlastník nemovitosti povinen uchovávat. Klient se dále zavazuje, že umožní v předem sjednaném termínu prohlídku nemovitosti a dostaví se po dohodě se Zprostředkovatelem k podpisu Převodní smlouvy. Dále Klient poskytne průkaz energetické náročnosti budovy (PENB), je-li potřeba a neposkytne-li jej, souhlasí, že v inzerci bude v souladu se zákonem uváděna nejhorší energetická třída.',
      'Klient se zavazuje v případě potřeby uzavřít na základě smlouvy o úvěru uzavřené mezi třetí osobou (Zájemcem) a úvěrující bankou, s úvěrující bankou smlouvu o zřízení zástavního práva k nemovitosti a podepsat návrh na vklad zástavního práva do katastru nemovitostí, a to za účelem zajištění splacení úvěru, který úvěrující banka poskytne Zájemci k úhradě kupní ceny nemovitosti či její části.',
      'Zprostředkovatel učiní vše pro to, aby byly zájmy Klienta chráněny, neodpovídá však za splnění závazků třetí osoby, s níž byla uzavřena rezervační či Převodní smlouva. Zprostředkovatel však nesmí navrhnout Klientovi uzavření Převodní smlouvy s osobou, o které má důvodnou pochybnost, zda povinnosti ze zprostředkované smlouvy řádně a včas splní, nebo o které vzhledem k okolnostem takovou pochybnost mít měl. Zprostředkovatel sdělí Klientovi bez zbytečného odkladu vše, co má význam pro jeho rozhodování o uzavření Převodní smlouvy.',
      'Zprostředkovatel se zavazuje umístit nemovitost do své databáze, umístit jej na inzertní servery dle možností a volby Zprostředkovatele, event. poskytnout pro nemovitosti další reklamu.',
      'Zprostředkovatel se zavazuje, že dále poskytne Klientovi marketingové aktivity vedoucí k naplnění předmětu této Smlouvy, konkrétně:',
    ]),
    list(['**tržní odhad nemovitosti,**', '**inzerci na nejnavštěvovanějších realitních portálech sreality.cz, reality.idnes.cz, eurobydleni.cz apod.,**', '**nafocení nemovitosti profesionálním fotografem včetně fotek z dronu,**', '**videoprohlídku nemovitosti,**', '**homestaging,**', '**realistické vizualizace budoucího stavu nemovitosti,**', '**virtuální prohlídku nemovitosti,**', '**samostatnou webovou stránku nemovitosti,**', '**propagaci nemovitosti na sociálních sítích Facebook, Instagram, LinkedIn a YouTube,**', '**propagaci nemovitosti pomocí placené reklamy na sociálních sítích Facebook a Instagram,**'], { style: 'bullet' }),
    list([
      'Zprostředkovatel se zavazuje, že zajistí Klientovi následující služby – přípravu příslušné Převodní smlouvy v požadovaném počtu vyhotovení a návrhu na zápis do katastru nemovitostí, advokátní úschovu, to vše u advokáta zvoleného Zprostředkovatelem. Zprostředkovatel hradí poplatky za návrh na vklad vlastnického práva u katastrálního úřadu, náklady související s pořízením listu vlastnictví pro účely zpracování smluvní dokumentace a list vlastnictví dokládající převod na nového vlastníka, případně na základě dohody smluvních stran i další poplatky spojené s právními službami a advokátní úschovou, budou-li činěny advokátem zvoleným Zprostředkovatelem.',
      'Zprostředkovatel prohlašuje, že má uzavřeno povinné zákonné pojištění své odpovědnosti za škodu v limitu 10 000 000 Kč.',
      'Smluvní strany se zavazují vzájemně a bez zbytečného odkladu se informovat o všech skutečnostech, které mohou mít vliv na jejich vztah založený touto Smlouvou.',
    ], { start: 10 }),
    art(4, 'Prohlášení Klienta'),
    list([
      'Klient prohlašuje, že Zprostředkovateli sdělil všechny nezbytné okolnosti související s převodem nemovitosti, resp. že nezamlčel žádné skutečnosti nutné pro řádné plnění povinností Zprostředkovatele dle této Smlouvy. Klient sdělí Zprostředkovateli vše, co pro něj má rozhodný význam pro uzavření a plnění této Smlouvy.',
      'Klient prohlašuje, že na nemovitosti neváznou žádné závazky ani jiné právní vady, že jeho vlastnické a dispoziční právo k nemovitosti není nijak omezeno, že na nemovitosti neváznou žádné dluhy, věcná břemena, předkupní práva, zástavní práva, nájemní práva či jiná práva třetích osob (kromě případných vad uvedených na LV, které je přílohou této Smlouvy) a že před Zprostředkovatelem nezamlčel žádné podstatné skutečnosti, které by mohly ztížit či zamezit uzavření Převodní smlouvy.',
      'Klient dále prohlašuje, že neexistují žádné smlouvy, které zakládají práva k nemovitosti, jež dosud nejsou zapsány v katastru nemovitostí, ani nejsou u katastrálního úřadu ohledně nemovitosti podány návrhy, o nichž dosud nebylo pravomocně rozhodnuto, s výjimkou případných řízení uvedených na LV, které je přílohou této Smlouvy, a dále, že mu nejsou známa žádná soudní, rozhodčí nebo správní řízení, která by byla vedena ohledně nemovitosti nebo která by mohla jakkoliv omezit jeho dispoziční práva s nemovitostí.',
      'Klient prohlašuje, že vůči němu nebylo zahájeno insolvenční řízení, nebylo vydáno rozhodnutí o moratoriu či rozhodnutí o úpadku ve smyslu insolvenčního zákona, ani nebyl insolvenční návrh zamítnut pro nedostatek majetku, že jeho jakýkoliv majetek není předmětem exekučního řízení ani není dán zákonný důvod k zahájení insolvenčního nebo exekučního řízení, ani není v situaci, kdy by mu úpadek hrozil, ani není důvod pro vydání předběžného opatření k omezení vlastnického práva a že převodem nemovitosti není zkracováno uspokojení vymahatelné pohledávky věřitele a tedy není dán právní důvod pro relativní neúčinnost této Smlouvy jako právního jednání podle § 589 a násl. občanského zákoníku.',
      'Klient si je vědom svých daňových povinností, zejména případné daně z příjmu.',
      'Klient prohlašuje, že se seznámil se zásadami zpracování osobních údajů dle GDPR, které jsou volně dostupné na webových stránkách Zprostředkovatele na této adrese: www.martintesarek.cz. Poskytnutí osobních údajů Klienta je požadováno z důvodu, že jsou tyto nezbytné pro plnění smluvních závazků Zprostředkovatele, případně jejich poskytnutí vyžaduje zákon. Zprostředkovatel se zavazuje tyto údaje chránit před zneužitím a dodržovat veškeré další povinnosti stanovené právními předpisy. Klient souhlasí se zasíláním obchodních nabídek na uvedenou kontaktní adresu. Klient dále podpisem této Smlouvy stvrzuje, že se seznámil s poučením pro spotřebitele zveřejněným na adrese: www.martintesarek.cz',
    ]),
    art(5, 'Smluvní pokuta, náklady'),
    list([
      `V případě, že Klient poruší své smluvní povinnosti uvedené v Článku III. odst. 4. až 6. této Smlouvy a nebo se ukáže nepravdivým, neúplným, klamavým nebo zavádějícím jakékoliv jeho prohlášení uvedené v Článku III. této Smlouvy, je Klient povinen zaplatit Zprostředkovateli smluvní pokutu ve výši **${commission}** z částky uvedené v Článku I. odst. 4. písm. a) této Smlouvy, a to nejpozději do 7 dnů od doručení výzvy Zprostředkovatele k úhradě smluvní pokuty.`,
      'Tím není dotčeno právo Zprostředkovatele na náhradu škody.',
      'V případě, že Klientovi vznikne v souvislosti s rezervační smlouvou uzavřenou ohledně nemovitosti právo požadovat na Zájemci smluvní pokutu, zavazuje se Klient uhradit z této smluvní pokuty 50 % Zprostředkovateli jako paušální náhradu dosud vynaložených nákladů v souvislosti s jeho činností pro Klienta.',
      'Klient se zavazuje uhradit Zprostředkovateli marketingové náklady vynaložené v souvislosti s činností dle této Smlouvy do 30 (třiceti) dnů od doručení písemné výzvy Zprostředkovatele k jejich úhradě v případě, že:',
    ]),
    list([
      'nedojde k uzavření rezervační smlouvy ohledně Nemovitosti za trvání této Smlouvy, nebo',
      'nedojde k uzavření Převodní smlouvy se Zájemcem, kterého vyhledal Zprostředkovatel a Klient neuplatní právo na smluvní pokutu dle rezervační smlouvy nebo',
      'nedojde k uzavření Převodní smlouvy se Zájemcem, kterého vyhledal Zprostředkovatel a Klientovi nevznikne právo na smluvní pokutu dle rezervační smlouvy.',
    ], { prefix: '4.', indent_cm: 1.27 }),
    art(6, 'Trvání a ukončení této Smlouvy'),
    list([
      `Tato Smlouva se uzavírá na dobu určitou, tj. na dobu **${v(i.duration, 'doba trvání, např. šesti měsíců')}** počínaje dnem uzavření této Smlouvy.`,
      'V případě, že kterákoliv smluvní strana nedoručí nejpozději ve lhůtě 30 dnů přede dnem uplynutí doby trvání platnosti této Smlouvy druhé smluvní straně písemné oznámení, v němž projeví svůj nezájem na dalším prodloužení této Smlouvy, prodlužuje se automaticky, i opakovaně, doba platnosti této Smlouvy vždy o tři měsíce.',
      'Smlouva končí též splněním, tedy dnem uzavření Převodní smlouvy a vypořádáním provize.',
      'Skončení Smlouvy nemá vliv na platnost ujednání, z jejichž povahy vyplývá, že platí i po ukončení této Smlouvy (např. ustanovení o smluvních pokutách, čl. V této Smlouvy, apod.).',
    ]),
    art(7, 'Závěrečná ustanovení'),
    list([
      'Práva a povinnosti smluvních stran touto Smlouvou výslovně neupravená se řídí právním řádem České republiky, zejm. zák. č. 39/2020 Sb., zákon o realitním zprostředkování a zák. č. 89/2012 Sb., občanský zákoník.',
      'Smluvní strany se dohodly, že veškerá komunikace bude mezi nimi probíhat primárně e-mailem, a to na e-mailové adresy uvedené v hlavičce této Smlouvy, případně jiným sjednaným způsobem.',
      'Smluvní strany se dohodly, že tuto Smlouvu lze uzavřít i na dálku prostřednictvím služby www.signi.com. Smluvní strany výslovně souhlasí s použitím elektronického podpisu a s tím, že záznamy a auditní stopa (identifikace, čas podpisu, IP adresa, potvrzení o doručení apod.) vedené službou www.signi.com mohou sloužit jako důkaz o uzavření Smlouvy a projevu vůle smluvních stran. Takto uzavřená Smlouva je platná a účinná stejně jako Smlouva uzavřená osobně v listinné podobě.',
      'Zprostředkovatel tímto poučuje Klienta v postavení spotřebitele o tom, že byla-li tato Smlouva uzavřena mimo prostory obvyklé pro podnikání Zprostředkovatele, má Klient právo odstoupit od této Smlouvy bez udání důvodu, a to do 14 dnů od uzavření této Smlouvy. Klient Zprostředkovatele výslovně žádá, aby poskytování služeb začalo již během lhůty pro odstoupení od této Smlouvy. Zprostředkovatel výslovně poučuje Klienta, že nebude mít právo od Smlouvy odstoupit pokud požádal, aby poskytování služeb začalo během lhůty pro odstoupení od Smlouvy a přitom Zprostředkovatel zprostředkoval (nejpozději v den předcházející odeslání oznámení o odstoupení) Zájemce o koupi Nemovitosti za podmínek stanovených v této Smlouvě. V takovém případě nebude k odeslanému odstoupení přihlíženo, a to bez ohledu na to, zda byl Klient o Zájemci již informován ze strany Zprostředkovatele. V případě, že Klient platně odstoupí od této Smlouvy uhradí Zprostředkovateli poměrnou část sjednané provize za plnění poskytnuté do okamžiku odstoupení od Smlouvy. Další informace pro spotřebitele jsou uvedeny na adrese www.martintesarek.cz a Klient podpisem této Smlouvy stvrzuje, že se s nimi seznámil.',
      'V případě, že dojde mezi smluvními stranami ke vzniku sporu z této Smlouvy, který se nepodaří vyřešit vzájemnou dohodou, může Klient, který je spotřebitelem podat návrh na mimosoudní řešení takového sporu určenému subjektu mimosoudního řešení spotřebitelských sporů, kterým je Česká obchodní inspekce, ústřední inspektorát – oddělení ADR, Štěpánská 44, 110 00 Praha 1, e-mail: adr@coi.cz, https://www.coi.cz/informace-o-adr/',
      'Tato smlouva je vyhotovena v tolika stejnopisech, aby každá smluvní strana obdržela po jednom.',
      'Měnit a doplňovat tuto Smlouvu lze pouze písemným dodatkem ke Smlouvě.',
      'Smluvní strany prohlašují, že si tuto Smlouvu přečetly, že odpovídá jejich vlastní, svobodné a vážně míněné vůli a že obsahuje úplné ujednání o předmětu této Smlouvy a všech náležitostech, které strany měly a chtěly ve smlouvě ujednat, a které považují za důležité pro závaznost této Smlouvy.',
    ]),
    { type: 'attachments', items: ['List vlastnictví', 'Prohlášení politicky exponovaná osoba', 'Čestné prohlášení'] },
    { type: 'signatures', place_date_text: pd, signers: [{ role: 'Zprostředkovatel', name: FIRMS[i.firm].name }, ...sellers.map((s) => ({ role: 'Klient', name: s.name || undefined }))] },
  )
  for (const s of sellers) blocks.push(...pepBlocks(s, 'Klient', pd), ...cpBlocks(s, 'Klient', pd))
  return { title: 'Smlouva o realitním zprostředkování', subtitle: 'tato smlouva je uzavřena podle zákona č. 39/2020 Sb., o realitním zprostředkování, a dále podle zákona č. 89/2012 Sb., občanský zákoník', blocks }
}

// ---------------- Rezervační smlouva (prodej) ----------------
export function rs(i: DocInput): Spec {
  const pd = placeDateOf(i)
  const f = FIRMS[i.firm]
  const sellers = i.sellers.length ? i.sellers : [{ name: '' }]
  const buyers = i.buyers.length ? i.buyers : [{ name: '' }]
  const fee = v(i.fee, 'výše rezervačního poplatku')
  const blocks: Block[] = [p('Dnešního dne, měsíce a roku smluvní strany:', { align: 'left' })]
  sellers.forEach((s, k) => { if (k) blocks.push(sep('a')); blocks.push(personParty(s, 'jakožto prodávající na straně jedné (dále jen „**Prodávající**“)')) })
  blocks.push(sep('a'))
  buyers.forEach((s, k) => { if (k) blocks.push(sep('a')); blocks.push(personParty(s, 'jakožto zájemce na straně druhé (dále jen „**Zájemce**“)')) })
  blocks.push(
    sep('uzavírají', 'center'),
    p('v souladu s ustanovením § 1746 odst. 2 zák. č. 89/2012 Sb., občanský zákoník,\ntuto rezervační smlouvu (dále jen „**smlouva**“):', { align: 'center' }),
    art(1, 'Úvodní ustanovení'),
    list([
      `Prodávající prohlašuje, že má ve výlučném vlastnictví nemovitosti, které jsou předmětem této smlouvy, že na předmětných nemovitostech neváznou žádná věcná břemena, zástavní práva, předkupní práva, nájemní práva a ani jiná omezení vlastníka, vyjma na listu vlastnictví a v této smlouvě výslovně uvedených, a že po splnění podmínek stanovených v této smlouvě uzavře se Zájemcem Kupní smlouvu na převod nemovitostí:\n${v(i.property, 'označení nemovitosti podle LV')}\n(dále jen „**Nemovitosti**“).`,
      'Prodávající prohlašuje, že si není vědom žádných překážek, které by mohly zmařit uzavření Realitní smlouvy dle čl. II.',
      `Prodávající současně upozorňuje Zájemce na následující závady na Nemovitostech:\n${v(i.defects, 'závady na nemovitostech, případně „žádné“')}`,
      'Zájemce prohlašuje, že se na základě informací od Prodávajícího seznámil s faktickým, právním, stavebním i technickým stavem Nemovitostí a se stavem Nemovitostí je srozuměn. Níže sjednaná kupní cena odpovídá faktickému a právnímu stavu Nemovitostí.',
      'Zájemce má zájem o nabytí vlastnického práva k Nemovitostem a Prodávající má zájem převést na Zájemce vlastnické právo k Nemovitostem.',
      `Prodávající informuje Zájemce, že uzavřel s realitním zprostředkovatelem:\n**${f.rsLine}**\n(dále jen „**Zprostředkovatel**“) samostatnou smlouvu o realitním zprostředkování, jíž Zprostředkovatele pověřil výlučným zprostředkováním prodeje Nemovitostí a hájením zájmů Prodávajícího, a dále ho jakožto platební místo pověřil přijmout rezervační poplatek hrazený Prodávajícímu. Zájemce bere na vědomí, že tato Smlouva zakládá právní vztah pouze mezi Prodávajícím a Zájemcem; z této Smlouvy nevyplývají žádná práva ani povinnosti Zprostředkovateli.`,
    ]),
    art(2, 'Náležitosti budoucí Realitní smlouvy'),
    list([
      'Zájemce prohlašuje, že má v úmyslu s Prodávajícím uzavřít kupní smlouvu, na základě které dojde k převodu vlastnického práva k Nemovitostem ve prospěch Zájemce (dále jen „**Realitní smlouva**“).',
      `Kupní cena Nemovitostí se všemi jejich součástmi a příslušenstvím je stanovena Prodávajícím ve výši **${v(i.price, 'kupní cena')}** a Zájemce tuto kupní cenu akceptuje.`,
      'Předmětem této smlouvy je dále rezervace Nemovitostí pro Zájemce do doby uzavření Realitní smlouvy, nejpozději však do konce trvání této Smlouvy.',
    ]),
    art(3, 'Rezervace a rezervační poplatek'),
    list([
      'Prodávající se zavazuje nepřevést po dobu trvání této Smlouvy Nemovitosti ve prospěch jiné osoby než Zájemce nebo Zájemcem přímo určené.',
      `Za účelem rezervace a za účelem poskytnutí jistoty, že Zájemce uzavře Realitní smlouvu, Zájemce složí rezervační poplatek ve výši **${fee}** (dále jen „**Rezervační poplatek**“), a to nejpozději **do ${v(i.feeDays, 'počet dnů')} dnů** od uzavření této smlouvy. Dle výslovného určení Prodávajícího bude Rezervační poplatek složen na účet Zprostředkovatele č. ú.: **${f.account}** u Fio banka, a.s. (pro ${f.short}).\nNebude-li Rezervační poplatek v uvedené lhůtě uhrazen, tato smlouva se ruší a současně Zájemce uhradí Prodávajícímu smluvní pokutu ve výši 100 000 Kč. Zánik této smlouvy se nijak práva ani nároku na smluvní pokutu nedotýká.`,
      'Okamžikem uzavření Realitní smlouvy se Rezervační poplatek považuje za uhrazenou první část Kupní ceny náležející Prodávajícímu.',
    ]),
    art(4, 'Závazek uzavřít Realitní smlouvu'),
    list([
      'Zájemce a Prodávající se vzájemně zavazují uzavřít Realitní smlouvu, a to nejpozději v poslední den účinnosti této smlouvy. Strany si poskytnou nezbytnou součinnost, aby mohla být Realitní smlouva uzavřena v době trvání této smlouvy.',
      'Zájemce prohlašuje, že je schopen doplatit a doplatí Kupní cenu podle podmínek uvedených v této smlouvě.',
      'Zájemce zaplatí Prodávajícímu Kupní cenu následujícím způsobem a v následujících lhůtách:',
    ]),
    list([
      'část kupní ceny bude uhrazena jako Rezervační poplatek podle této smlouvy,',
      ...(i.mortgage ? ['část kupní ceny bude Zájemcem uhrazena prostřednictvím úvěru s tím, že bude ve prospěch strany Prodávající uvolněna po splnění odkládacích podmínek banky (zejména podpis úvěrové a zástavní dokumentace, podání návrhu na vklad vlastnického práva do katastru nemovitostí a podání návrhu na vklad zástavního práva ve prospěch banky, případně sjednání pojištění a vinkulace pojistného plnění, pokud je bankou vyžadováno),'] : []),
      'zbývající část Kupní ceny bude Zájemcem uhrazena do úschovy zřízené za účelem zajištění plnění z Realitní smlouvy s tím, že bude uvolněna ve prospěch strany Prodávající po provedení vkladu vlastnického práva podle Realitní smlouvy.',
    ], { style: 'letter' }),
    art(5, 'Trvání rezervace'),
    list([
      `Tato smlouva se uzavírá na dobu určitou do **${v(i.until, 'datum konce rezervace')}**.`,
      `Neuzavře-li Prodávající Realitní smlouvu ve stanovené lhůtě, je povinen zajistit vrácení Rezervačního poplatku zpět Zájemci. Zároveň se prodávající zavazuje uhradit Zájemci smluvní pokutu ve výši **${v(i.sellerPenalty, 'smluvní pokuta prodávajícího')}**, splatnou nejpozději v den, kdy tato smlouva skončí. Neuzavře-li se Realitní smlouva ve stanovené lhůtě z důvodů na straně Zájemce (zejména nedostavení se k podpisu, neposkytnutí součinnosti, nekomunikace, neprokázání financování), nevzniká Zájemci právo na smluvní pokutu podle tohoto odstavce a postupuje se podle ustanovení této Smlouvy o porušení povinností Zájemcem a o započtení smluvní pokuty proti Rezervačnímu poplatku.`,
      'Pokud Zájemce poruší povinnost uzavřít Realitní smlouvu nebo Zájemce uvede v této smlouvě nepravdivé informace, je Zájemce povinen zaplatit Prodávajícímu smluvní pokutu ve výši odpovídající Rezervačnímu poplatku. Strany berou na vědomí, že nárok Prodávajícího na smluvní pokutu se bez potřeby dalšího jednání započítává proti nároku Zájemce na vrácení Rezervačního poplatku, a to ke dni následujícímu po dni uplynutí doby trvání této Smlouvy, bez ohledu na splatnost obou nároků.',
    ]),
    art(6, 'Závěrečná ustanovení'),
    list([
      'Tuto smlouvu lze upravovat a měnit jen písemnou formou za výslovného souhlasu všech stran stvrzeného jejich podpisem.',
      'Přílohou této smlouvy je výpis z listu vlastnictví citovaný v čl. I. této smlouvy.',
      'Tato smlouva je vyhotovena v tolika stejnopisech, aby každá smluvní strana obdržela po jednom.',
      'Prodávající a Zájemce po přečtení této smlouvy prohlašují, že souhlasí s jejím obsahem, že byla sepsána na základě pravdivých údajů, jejich pravé a svobodné vůle a nebyla ujednána v tísni ani za jinak jednostranně nevýhodných podmínek. Na důkaz toho připojují své podpisy.',
      'Prodávající a Zájemce se dohodli, že tuto Smlouvu lze uzavřít i na dálku prostřednictvím služby www.signi.com. Smluvní strany výslovně souhlasí s použitím elektronického podpisu a s tím, že záznamy a auditní stopa (identifikace, čas podpisu, IP adresa, potvrzení o doručení apod.) vedené službou www.signi.com mohou sloužit jako důkaz o uzavření Smlouvy a projevu vůle smluvních stran. Takto uzavřená Smlouva je platná a účinná stejně jako Smlouva uzavřená osobně v listinné podobě.',
    ]),
    { type: 'attachments', items: ['List vlastnictví', 'Prohlášení politicky exponovaná osoba', 'Čestné prohlášení'] },
  )
  const rows = Math.max(sellers.length, buyers.length)
  const signers: { role: string; name?: string }[] = []
  for (let k = 0; k < rows; k++) signers.push({ role: 'Prodávající', name: sellers[k]?.name || undefined }, { role: 'Zájemce', name: buyers[k]?.name || undefined })
  blocks.push({ type: 'signatures', place_date_text: pd, signers, per_row: 2 })
  for (const b of buyers) blocks.push(...pepBlocks(b, 'Zájemce', pd), ...cpBlocks(b, 'Zájemce', pd))
  return { title: 'Rezervační smlouva', subtitle: 'v souvislosti s prodejem věcí nemovitých', blocks }
}

// ---------------- Plná moc (prodávající) ----------------
export function pm(i: DocInput): Spec {
  const pd = placeDateOf(i)
  const z = i.principal ?? i.sellers[0] ?? { name: '' }
  const a = i.agent ?? { name: '' }
  const blocks: Block[] = [
    p('Já, níže podepsaný/á', { align: 'left' }),
    { type: 'party', fields: [['jméno a příjmení', v(z.name, 'jméno a příjmení zmocnitele')], ['RČ', v(z.rc, 'rodné číslo zmocnitele')], ['trvale bytem', v(z.address, 'adresa zmocnitele')]], note: '(dále jen „**zmocnitel**“)' },
    p('**tímto zplnomocňuji**', { align: 'left' }),
    { type: 'party', fields: [['jméno a příjmení', v(a.name, 'jméno a příjmení zmocněnce')], ['RČ', v(a.rc, 'rodné číslo zmocněnce')], ['trvale bytem', v(a.address, 'adresa zmocněnce')]], note: '(dále jen „**zmocněnec**“)' },
    p('aby mým jménem učinil veškeré právní a faktické úkony související s uzavřením kupní smlouvy na prodej nemovitostí a zástavní smlouvy na zřízení zástavního práva, a to včetně souvisejících zápisů a případně i věcného práva spočívajícího v zákazu zcizení a zatížení k nemovitostem:'),
    p(v(i.property, 'označení nemovitosti podle LV'), { indent_cm: 1.27 }),
    p('(dále rovněž „**nemovité věci**“ nebo „**nemovitosti**“).'),
    p('Zmocnitel uděluje zmocněnci zmocnění ke všem úkonům spojeným s prodejem nemovitostí a zřízením zástavního práva k nemovitostem, včetně souvisejících zápisů a případně i věcného práva spočívajícího v zákazu zcizení a zatížení, k výše uvedeným nemovitým věcem a jejich příslušenství a k zastupování v plné míře při řízení před příslušným katastrálním úřadem či jinými orgány státní správy.'),
    p('Na základě této plné moci je zmocněnec oprávněn zejména:', { after: 4 }),
    list([
      'jednat a uzavřít s kupujícím shora uvedených nemovitých věcí rezervační smlouvu (smlouvu o smlouvě budoucí) a kupní smlouvu (smlouvu o převodu vlastnictví nemovitostí),',
      'uzavřít smlouvu o advokátní úschově kupní ceny s advokátem, případně smlouvu o bankovní či notářské úschově kupní ceny,',
      'uzavřít smlouvu o úschově listin a finančních prostředků (rezervační zálohy) s advokátem,',
      'podepsat návrh na vklad vlastnického práva do katastru nemovitostí ke shora uvedeným nemovitostem a zastupovat zmocnitele ve všech úkonech v řízení před katastrálním úřadem,',
      'podepsat zástavní smlouvu na nemovitosti (zejména za účelem jejich zastavení ve prospěch financující banky kupujícího) a v souvislosti se zástavním právem zřídit potřebné související zápisy a případně zřídit také věcné právo spočívající v zákazu zcizení a zatížení nemovitostí ve prospěch banky kupujícího, podepsat příslušný návrh na vklad zástavního práva (včetně souvisejících zápisů a případného zákazu zcizení a zatížení) do katastru nemovitostí a zastupovat zmocnitele ve všech úkonech v řízení před katastrálním úřadem,',
      'podepsat předávací protokol o předání nemovité věci kupujícímu,',
      'jednat s dodavateli energií a služeb souvisejících s nemovitostmi ohledně smluv, které zmocnitel s těmito dodavateli v minulosti uzavřel, a učinit veškeré kroky potřebné k ukončení veškerých smluvních závazků s těmito dodavateli a případnému převedení práv a povinností týkajících se dodávek energie a služeb souvisejících s nemovitostmi na kupujícího,',
      'jednat se společenstvím vlastníků jednotek ohledně prodeje nemovitostí a zajištění potřebných podkladů (potvrzení o bezdlužnosti, PENB aj.) a tyto doklady převzít,',
      'učinit veškeré právní a faktické úkony související se zřízením a zápisem údaje o trvalém pobytu dle zákona o evidenci obyvatel (změně údaje o trvalém pobytu) a učinit veškeré související úkony, zejména podepsat a podat přihlašovací lístek k trvalému pobytu a zajistit potřebné podklady, zastupovat zmocnitele v plné míře při řízení před příslušnými orgány státní správy, jakož i při všech jednáních s nimi a',
      'učinit veškeré související úkony.',
    ], { style: 'bullet', indent_cm: 1.27 }),
    p(`Zmocněnec i zmocnitel se dohodli, že úhrada za kupní ceny bude hrazena na bankovní účet Zmocnitele, vedený u **${v(i.bank, 'banka zmocnitele')}**, číslo účtu: **${v(i.accountNo, 'číslo účtu zmocnitele')}**.`),
    { type: 'signatures', place_date_text: pd, signers: [{ role: 'Zmocnitel', name: z.name || undefined }] },
    p('Zmocnění přijímám:', { align: 'left', before: 10 }),
    { type: 'signatures', place_date_text: pd, signers: [{ role: 'Zmocněnec', name: a.name || undefined }] },
  ]
  return { title: 'Plná moc', blocks }
}

// ---------------- Předávací protokol ----------------
export function pp(i: DocInput): Spec {
  const pd = placeDateOf(i)
  const sellers = i.sellers.length ? i.sellers : [{ name: '' }]
  const buyers = i.buyers.length ? i.buyers : [{ name: '' }]
  const party = (x: Person, note: string): Block => ({ type: 'party', fields: [['Jméno a příjmení', v(x.name, 'jméno a příjmení')], ['Trvale bytem', v(x.address, 'adresa trvalého bydliště')], ['Datum narození, nebo RČ', v(x.rc, 'datum narození nebo rodné číslo')]], note })
  const blocks: Block[] = []
  sellers.forEach((s, k) => { if (k) blocks.push(sep('a')); blocks.push(party(s, '(dále jen „**strana předávající**“)\nna straně jedné')) })
  blocks.push(sep('a'))
  buyers.forEach((s, k) => { if (k) blocks.push(sep('a')); blocks.push(party(s, '(dále jen „**strana přebírající**“)\nna straně druhé')) })
  const dotLine = '…'.repeat(52)
  blocks.push(
    p('**Strana předávající předává straně přebírající tuto nemovitost:**', { align: 'left', after: 4 }),
    p(v(i.property, 'označení nemovitosti'), { align: 'left' }),
    p('**Ve shora uvedené nemovitosti je k dnešnímu dni toto vybavení:**', { align: 'left', after: 4 }),
    p(dotLine, { align: 'left', after: 2 }), p(dotLine, { align: 'left', after: 2 }), p(dotLine, { align: 'left' }),
    p('**Stavy měřičů ke dni předání:**', { align: 'left', after: 6 }),
    { type: 'table', header: ['Měřidlo', 'Číslo měřidla', 'Stav ke dni předání'], rows: [['Studená voda', '', ''], ['Teplá voda', '', ''], ['Elektroměr', '', ''], ['Plynoměr', '', ''], ['Měřidlo tepla', '', '']], widths_cm: [4.9, 6, 5] },
    p('**Další informace:**', { align: 'left', after: 4 }),
    p(dotLine, { align: 'left', after: 2 }), p(dotLine, { align: 'left', after: 2 }), p(dotLine, { align: 'left' }),
    p('Předávající a přebírající svým podpisem potvrzují, že nemovitosti byly předávajícím řádně předány a přebírajícím byly bez výhrad řádně převzaty.'),
    p('Smluvní strany výslovně sjednávají, že k faktickému předání nemovitosti dochází již před zápisem vlastnického práva přebírajícího do katastru nemovitostí. Přebírající tímto výslovně prohlašuje, že přebírá nemovitost do užívání ke dni podpisu tohoto předávacího protokolu.'),
    p('V souladu s ustanovením § 2121 odst. 2 zákona č. 89/2012 Sb., občanského zákoníku, platí, že odpovědnost za vady, které se na nemovitosti vyskytnou po tomto dni, přechází na přebírajícího okamžikem převzetí, tj. dnem podpisu tohoto předávacího protokolu, a to i přesto, že ke dni převzetí ještě nedošlo k zápisu vlastnického práva do katastru nemovitostí.'),
    p('Tento protokol je vyhotoven ve dvou stejnopisech, z nichž po jednom vyhotovení obdrží předávající a přebírající.'),
  )
  const rows = Math.max(sellers.length, buyers.length)
  const signers: { role: string; name?: string }[] = []
  for (let k = 0; k < rows; k++) signers.push({ role: 'Předávající', name: sellers[k]?.name || undefined }, { role: 'Přebírající', name: buyers[k]?.name || undefined })
  blocks.push({ type: 'signatures', place_date_text: pd, signers, per_row: 2 })
  return { title: 'Předávací protokol', blocks }
}

export const BUILDERS: Record<DocKind, (i: DocInput) => Spec> = { zs, rs, pm, pp }
export const KIND_META: Record<DocKind, { title: string; folder: RegExp }> = {
  zs: { title: 'Zprostředkovatelská smlouva', folder: /^zs$|zprost/i },
  rs: { title: 'Rezervační smlouva', folder: /^rs$|rezerva/i },
  pm: { title: 'Plná moc', folder: /pln[aá] moc/i },
  pp: { title: 'Předávací protokol', folder: /p[řr]ed[aá]v/i },
}
export { names }
