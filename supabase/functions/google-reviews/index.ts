// Google recenze pro klientský portál (Places API New). Veřejná funkce bez přihlášení – vrací jen veřejné recenze profilu.
// Potřebuje secret GOOGLE_PLACES_KEY (vkládá Martin sám). Bez klíče vrací { configured: false } a portál slider skryje.
const PLACE_ID = 'ChIJDTgr9CaVC0cRIPUxjIyjNP8'
const cors = { 'Access-Control-Allow-Origin': 'https://crm.martintesarek.cz', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const json = (b: unknown, s = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json', ...extra } })

let cache: { at: number; data: unknown } | null = null
const TTL = 12 * 3600 * 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const key = (Deno.env.get('GOOGLE_PLACES_KEY') || '').trim().replace(/^["']|["']$/g, '')
  if (!key) return json({ configured: false })
  if (cache && Date.now() - cache.at < TTL) return json(cache.data, 200, { 'Cache-Control': 'public, max-age=3600' })
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${PLACE_ID}?languageCode=cs`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'displayName,rating,userRatingCount,googleMapsUri,reviews' },
    })
    if (!r.ok) return json({ configured: true, error: 'Google ' + r.status }, 200)
    const p = await r.json()
    const reviews = ((p.reviews || []) as Record<string, any>[])
      .filter((x) => (x.rating || 0) >= 4 && (x.text?.text || x.originalText?.text))
      .map((x) => ({
        author: x.authorAttribution?.displayName || 'Klient',
        photo: x.authorAttribution?.photoUri || null,
        url: x.authorAttribution?.uri || null,
        rating: x.rating,
        text: String(x.text?.text || x.originalText?.text || '').slice(0, 600),
        when: x.relativePublishTimeDescription || '',
      }))
    const data = { configured: true, rating: p.rating ?? null, count: p.userRatingCount ?? null, url: p.googleMapsUri || null, reviews }
    cache = { at: Date.now(), data }
    return json(data, 200, { 'Cache-Control': 'public, max-age=3600' })
  } catch (e) {
    return json({ configured: true, error: String((e as Error).message || e) }, 200)
  }
})
