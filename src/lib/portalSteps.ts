// 21 kroků prodeje podle článku „Kompletní průvodce postupem prodeje nemovitosti od A do Z“.
export const ICONS: Record<string, string> = {
  meet: 'M5.5 7a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M13.5 7a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M3 19v-2a5 5 0 015-5M21 19v-2a5 5 0 00-5-5M7 15h10v5',
  search: 'M4 10a6 6 0 1012 0a6 6 0 10-12 0M14.5 14.5L20 20M7 10.5l3-2.5 3 2.5V13H7z',
  sign: 'M6 3h8l4 4v6M6 3v18h7M14 3v4h4M9 11h5M9 15h3M15 20l5-5 1.5 1.5-5 5H15z',
  docs: 'M8 3h8l4 4v12H8zM4 7v14h12M11 10h6M11 14h6',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM9 13a3 3 0 106 0a3 3 0 10-6 0',
  mega: 'M3 10v4h4l7 4V6L7 10zM17 9a4 4 0 010 6M7 14l1 5h2',
  people: 'M4.5 8a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M14.5 8a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M2 20a5 5 0 0110 0M12 20a5 5 0 0110 0',
  check: 'M6 3h8l4 4v14H6zM14 3v4h4M9 14l2 2 4-4',
  money: 'M3 7h18v10H3zM9.5 12a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M6 10v4M18 10v4',
  scales: 'M12 4v16M8 20h8M5 8h14M5 8l-3 6a3 3 0 006 0zM19 8l-3 6a3 3 0 006 0z',
  calc: 'M3 11l7-6 7 6M5 10v10h6M14 13h7v8h-7zM16 16h3M16 18.5h3',
  bank: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  cin: 'M12 3v8M8.5 7.5L12 11l3.5-3.5M3 15h18v6H3z',
  cout: 'M12 11V3M8.5 6.5L12 3l3.5 3.5M3 15h18v6H3z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  deed: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h4M14 16l1.5 1.5L18.5 14.5',
  keys: 'M4 15a4 4 0 108 0a4 4 0 10-8 0M11 12l8-8M16 7l2 2M14 9l2 2',
  party: 'M7 3h5l-1 7a1.5 1.5 0 01-3 0zM9.5 11.5V20M7 20h5M14 5h5l-1 7a1.5 1.5 0 01-3 0zM16.5 13.5V20M14 20h5',
}

export type PortalStep = { name: string; icon: string; gap: number; group: string; me: string; you: string }

const S: [string, string, number, string, string, string][] = [
  ['Schůzka s realitním makléřem', 'meet', 0, 'Příprava', 'prohlédnu nemovitost a vysvětlím, jak bude prodej probíhat.', 'řeknete mi své priority a vše podstatné o nemovitosti.'],
  ['Tržní odhad a marketingový plán', 'search', 3, '', 'porovnám ceny podobných nemovitostí a navrhnu cenu a propagaci, do týdne e-mailem.', ''],
  ['Podpis smlouvy o zprostředkování', 'sign', 3, '', 'připravím a vysvětlím smlouvu, podpis jde i na dálku.', 'podepíšete smlouvu.'],
  ['Kompletace dokumentů', 'docs', 2, '', 'zkontroluji úplnost dokumentů.', 'dodáte PENB, evidenční list, prohlášení vlastníka, projektovou dokumentaci, kolaudaci a revize.'],
  ['Homestaging, focení, video, 3D scan', 'camera', 5, '', 'zajistím přípravu interiéru a profesionální focení.', 'umožníte úpravy a focení.'],
  ['Inzerce a placená reklama', 'mega', 5, '', 'vložím inzerát na realitní servery a spustím cílenou reklamu.', 'schválíte podobu inzerátu.'],
  ['Prohlídky se zájemci', 'people', 0, 'Hledání kupce', 'provázím zájemce, ověřuji jejich financování a po každé prohlídce vám pošlu zpětnou vazbu.', 'udržujte nemovitost připravenou na prohlídky, termíny vám dám vědět předem.'],
  ['Podpis rezervační smlouvy', 'check', 40, '', 'vyjednám cenu s kupujícím a připravím podpis.', 'podepíšete rezervační smlouvu.'],
  ['Rezervační záloha na účet kanceláře', 'money', 3, '', 'potvrdím přijetí zálohy od kupujícího.', ''],
  ['Objednávka právních služeb', 'scales', 3, 'Smlouvy a financování', 'zajistím ověřené advokáty a přípravu smluv.', 'projdete podmínky transakce.'],
  ['Odhad nemovitosti pro banku', 'calc', 10, '', 'připravím podklady pro odhadce banky.', 'umožníte odhadci prohlídku.'],
  ['Schválení hypotečního úvěru', 'bank', 30, '', 'hlídám komunikaci s bankou a poradcem kupujícího.', ''],
  ['Podpis zástavní, kupní a úschovní smlouvy', 'sign', 7, '', 'koordinuji podpisy všech stran.', 'podepíšete kupní smlouvu s ověřenými podpisy.'],
  ['Vlastní prostředky do úschovy', 'cin', 3, '', 'sleduji, že kupující složil svou část do úschovy.', ''],
  ['Zástavní smlouva na katastr', 'layers', 2, 'Katastr a předání', 'hlídám vklad zástavního práva.', ''],
  ['Hypotéka do úschovy', 'cin', 7, '', 'zajistím podklady pro čerpání hypotéky.', ''],
  ['Kupní smlouva na katastr', 'layers', 2, '', 'zajistím podání návrhu na vklad.', ''],
  ['Zápis vlastnického práva', 'deed', 25, '', 'sleduji zápis nového vlastníka.', ''],
  ['Výplata peněz z úschovy', 'cout', 3, '', 'dohlédnu na uvolnění kupní ceny.', 'obdržíte kupní cenu.'],
  ['Předání nemovitosti', 'keys', 2, '', 'připravím předávací protokol a převod energií.', 'předáte klíče a informace o nemovitosti.'],
  ['Oslava!', 'party', 0, '', 'děkuji za důvěru.', 'slavíte s námi.'],
]

export const PORTAL_STEPS: PortalStep[] = S.map(([name, icon, gap, group, me, you]) => ({ name, icon, gap, group, me, you }))
