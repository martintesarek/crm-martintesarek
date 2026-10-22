// Snímek ze Street View pro klientský portál, když obchod nemá fotku. Klíč Google zůstává na serveru.
// Volá se z <img src=".../portal-streetview?t=TOKEN">; token portálu se ověřuje v databázi.
import { createClient } from 'npm:@supabase/supabase-js@2'

const txt = (s: string, st: number) => new Response(s, { status: st, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

Deno.serve(async (req) => {
  try {
    const t = new URL(req.url).searchParams.get('t') || ''
    if (t.length < 20 || t.length > 200) return txt('bad token', 400)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: ok } = await admin.rpc('rate_check', { p_uid: 'pt:' + t.slice(0, 24), p_bucket: 'portal-streetview', p_max: 60, p_seconds: 3600 })
    if (ok === false) return txt('rate limit', 429)
    const { data: d } = await admin.from('deals').select('address, cover_url, intake, account_id').eq('portal_token', t).eq('portal_enabled', true).maybeSingle()
    if (!d || d.cover_url) return txt('not found', 404)
    const { data: acc } = await admin.from('accounts').select('settings').eq('id', d.account_id).single()
    const key = String((acc?.settings as { maps_key?: string } | null)?.maps_key || '').trim()
    if (!key) return txt('no key', 404)
    const v = (d.intake?.values || {}) as Record<string, unknown>
    const lat = Number(v.lat), lng = Number(v.lng)
    const loc = lat && lng ? `${lat},${lng}` : String(d.address || '').trim()
    if (!loc) return txt('no location', 404)
    const u = `https://maps.googleapis.com/maps/api/streetview?size=1280x600&location=${encodeURIComponent(loc)}&fov=85&source=outdoor&return_error_code=true&key=${encodeURIComponent(key)}`
    const r = await fetch(u, { headers: { Referer: 'https://crm.martintesarek.cz/' } })
    if (!r.ok) return txt('no image', 404)
    return new Response(r.body, { headers: { 'Content-Type': r.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return txt('error', 500) }
})
