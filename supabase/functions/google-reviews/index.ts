// Google recenze pro klientský portál. Veřejná funkce bez přihlášení.
// Recenze (jen ty o PRODEJI nemovitosti, max. 20) jsou vybrané ručně z veřejného profilu na Google Mapách (22. 10. 2026),
// protože Places API vrací jen 5 náhodných recenzí. Hodnocení a počet se (když je secret GOOGLE_PLACES_KEY) berou živě z Googlu.
const PLACE_ID = 'ChIJDTgr9CaVC0cRIPUxjIyjNP8'
const MAPS_URL = 'https://g.page/martin-tesarek-real-estate-s-r-o/review?id'
const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const json = (b: unknown, s = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json', ...extra } })

const R = (author: string, when: string, text: string) => ({ author, photo: null, url: null, rating: 5, text, when })
const REVIEWS = [
  R('Jan Stareček', 'před 11 měsíci', 'Chtěli bychom Vám touto cestou ještě jednou co nejsrdečněji poděkovat za naprosto profesionální a bezchybné služby při prodeji našeho domu. Jak dobře víte, nebylo to pro nás jednoduché období, ale díky Vám celý proces proběhl hladce a rychle. Příprava nemovitosti k prodeji, profesionální fotografie a marketingová strategie byly na špičkové úrovni. Obzvláště jsme ale ocenili Vaši nekonečnou trpělivost a lidský přístup.'),
  R('Ondrej Dudáš', 'před rokem', 'O panu Tesárkovi jsem před spoluprací neslyšel poprvé a při výběru makléře to proto byla jasná volba. Výsledek? Naprosto fantastický. Od prvního setkání, přes naprosto úžasnou prezentaci nemovitosti, až po její úspěšný prodej. Po celou dobu profesionální, ale i lidský přístup. Vše, na čem jsme se domluvili, do puntíku platilo. Martine, děkuji.'),
  R('Zuzana Kučerová', 'před rokem', 'Moc děkuji Martinovi za skvělou spolupráci při prodeji mého bytu. Jednalo se o mou první zkušenost a díky Martinovi byla skvělá. Na doporučení od známé jsem se obrátila ohledně prodeje bytu na Martina. Už při první nezávazné schůzce mě přesvědčil svými znalostmi realitního trhu a lidským přístupem. Instinkt mi říkal, že budu ve správných rukou. A také, že ano.'),
  R('Aneta Ljubojevićová', 'před rokem', 'Spolupráce s panem Tesárkem při prodeji nemovitosti a pronájmu bytu byla naprosto skvělá. Od začátku byl vždy profesionální, přístupný a ochotný pomoci s jakýmkoli dotazem nebo problémem. Ať už šlo o vyjednávání, přípravu dokumentů nebo komunikaci s potenciálními zájemci, vše probíhalo hladce a bez stresu.'),
  R('Pavla Jüstelová', 'před 2 lety', 'Opravdu moc děkuji panu Tesárkovi za profesionální práci při prodeji našeho domu. Vzhledem k lokalitě, ale také načasování prodeje při růstu úrokových sazeb hypoték i cen nemovitostí to nebyl vůbec jednoduchý obchod. Přesto skvělou prezentací dokázal vypíchnout přednosti a prodal náš dům za cenu, kterou jsme si představovali a dokonce i v čase, který jsme byli schopní akceptovat. Příště zas!'),
  R('Kamil Knotek', 'před rokem', 'Martina jsem delší dobu sledoval na sociálních sítích, znal jsem jeho styl práce a když jsem chtěl prodávat nemovitost, byl jeden z makléřů, které jsem oslovil. Jsem rád, že jsem si vybral právě Martina, nezklamal :). Spolupráce na velice profesionální úrovni již od první chvíle. Zpracování prezentace nemovitosti byla perfektní, stejně tak komunikace s kupujícími. Martina mohu jen doporučit!'),
  R('Petr Hanzlík', 'před 2 lety', 'Martin Tesárek mi pomáhal již s druhým prodejem nemovitosti a rád bych mu touto cestou moc poděkoval, protože vše proběhlo hladce a bez zbytečných nervů. Velmi oceňuji profesionální přípravu nemovitosti, fotky, video i web přímo pro náš dům. Rád bych zmínil ještě jednu věc, které si velmi cením, a to je zkušenost s jednáním s bankou.'),
  R('Michal Renta', 'před 2 lety', 'Při prodeji rodinného domu v Klentnici nám Martin poskytl naprosto vynikající služby. Jeho odbornost, profesionalita a osobní přístup nám výrazně ulehčily celý proces prodeje. Martin byl vždy k dispozici pro konzultace, rychle reagoval na naše otázky a s pečlivostí nám vysvětlil všechny kroky. Jeho schopnost komunikovat s potenciálními kupci byla mimořádná a přispěla k úspěšnému a hlavně rychlému uzavření obchodu.'),
  R('Veronika Žabová', 'před 3 lety', 'Protože jsem se rozhodla prodat svou nemovitost v době, která na prodej nebyla úplně příznivá, tak jsem si na to netroufla úplně sama a využila služeb realitního makléře. Bylo mi jasné, že v tak těžké době musím makléře vybírat opravdu svědomitě. Několik makléřů mi doma prošlo tzv. „výběrovým řízením“ a musím říct, že pan Martin Tesárek byla ta nejlepší volba!'),
  R('Eliška Šimonková', 'před 2 lety', 'Vážený pane Tesárku, rádi bychom Vám poděkovali za zprostředkování prodeje rodinného domu. Byli jsme s Vašimi službami nadmíru spokojeni, jste opravdu profesionál a jednička v oboru. Velmi oceňujeme Vaše férové jednání, přímočarost a pečlivost. Vše máte perfektně promyšlené a dotažené do posledního detailu. Ještě jednou děkujeme a vřele Vás každému doporučíme!'),
  R('Marek Hladký', 'před rokem', 'Pan Tesárek nám prodával nemovitost, vyzdvihnul bych profesionální přístup, od hledání kupce, až po předání nemovitosti. Mohu doporučit.'),
  R('Filip Hanus', 'před 3 lety', 'Spolupráce s panem Tesárkem je jedním slovem dokonalá! Při prodeji naší nemovitosti jsme nenarazili ani na jeden problém. Celý proces byl na velmi vysoké úrovni, přes komunikaci až po skvělou prezentaci prodávané nemovitosti. K našemu překvapení se celý prodej realizoval velmi rychle a jen s jednou schůzkou.'),
  R('Dana Nekovarova', 'před 3 lety', 'Před pár dny jsem předala klíče rodinného domu novým majitelům a tím jsem ukončila skvělou spolupráci s panem Tesárkem. Do prodeje nemovitosti jsem se pouštěla poprvé a nevěděla jsem, co očekávat. Hned první, stále nezávislá, schůzka a posléze e-mail byl velice informativní a přesvědčil mě o budoucí spolupráci. Videoprezentace, profesionální fotky, komunikace, vše bylo dokonalé.'),
  R('Josef Šídlo', 'před 2 lety', 'Pan Tesárek je velký profesionál. Postaral se nám o prodej domu od A do Z, k naší velké spokojenosti. Vždy byl ochotně k dispozici a pružně reagoval na vzniklé situace. Skutečně nerad prodávám přes realitky, v tomto případě ale provizi s přehledem pokryl ten pocit, že je o vše postaráno. Výsledná cena byla nakonec ještě vyšší, než jsme čekali.'),
  R('Keshava Kempe', 'před 3 lety', 'S panem Tesárkem spolupracuji už delší dobu a jsem s jeho službou moc spokojený. Vždy odvedl velice profesionální práci a prodal mé nemovitosti za nejvyšší možnou cenu. Určitě se k němu budu s radostí vracet. Vřele pana Tesárka doporučuji.'),
  R('Michaela Šťastná', 'před rokem', 'Prodej mojí nemovitosti s Martinem Tesárkem proběhl na vysoké profesionální úrovni. Ve všem mi vyšel vstříc a vždy dodržel slovo. Mohu jen doporučit. Děkuji.'),
  R('Tomáš Korálek', 'před 2 lety', 'Děkuji za profesionální a zároveň lidskou práci. Byl jsem velmi spokojen a vřele doporučuji pana Tesárka ke spolupráci při prodeji nemovitosti.'),
  R('Luboš Drofa', 'před 4 lety', 'Pan Tesárek nám v letech 2020–2021 zajistil (z důvodu spoluvlastnických vztahů) komplikovaný prodej činžovního domu na Vinohradech. Konstatuji, že veškerá jednání p. Tesárka byla od počátku do konce akce vedena vysoce profesionálně a korektně, spolehlivě a s velkým pracovním nasazením, a zcela naplnila naše očekávání.'),
  R('Petr Hornát', 'před rokem', 'Pokud hledáte makléře, který je nejen maximálně profesionální, ale zároveň i lidský, pak je Martin Tesárek jasná volba. Patří mezi absolutní špičku v oboru a právem je považován za jednoho z nejlepších makléřů v ČR. Má výborný přehled o trhu, dokáže skvěle poradit a celý proces prodeje či koupě nemovitosti s ním probíhá spolehlivě. Doporučuji všemi deseti!'),
].slice(0, 20)

let cache: { at: number; rating: number | null; count: number | null } | null = null
const TTL = 12 * 3600 * 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let rating: number | null = 4.9, count: number | null = null
  const key = (Deno.env.get('GOOGLE_PLACES_KEY') || '').trim().replace(/^["']|["']$/g, '')
  if (cache && Date.now() - cache.at < TTL) { rating = cache.rating; count = cache.count }
  else if (key) {
    try {
      const r = await fetch(`https://places.googleapis.com/v1/places/${PLACE_ID}?languageCode=cs`, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'rating,userRatingCount' } })
      if (r.ok) { const p = await r.json(); rating = p.rating ?? rating; count = p.userRatingCount ?? null; cache = { at: Date.now(), rating, count } }
    } catch { /* zůstane výchozí hodnocení */ }
  }
  return json({ configured: true, rating, count, url: MAPS_URL, reviews: REVIEWS }, 200, { 'Cache-Control': 'public, max-age=3600' })
})
