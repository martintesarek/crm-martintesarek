import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Spinner } from './ui'
import type { IValues } from '../lib/intake'

type Photo = { id: string; name: string; thumb: string | null }
type Vid = { id: string; name: string; size: number | null; link: string }

const arr = (x: unknown): string[] => (Array.isArray(x) ? (x as string[]) : [])
const mb = (n: number | null) => (n ? `${Math.round(n / 1048576)} MB` : '')

/** Fotky ke inzerátu: načtou se ze složky klienta „FOTKY – PROFI FOTKY“ na Disku, Martin klepnutím vybere ty do inzerátu
 *  a seřadí je (první = hlavní). Další fotky může přidat z telefonu. Videa ze složky klienta nabídne k použití. */
export function MediaCard({ dealId, accountId, hasFolder, v, set }: { dealId: string; accountId?: string; hasFolder: boolean; v: IValues; set: (k: string, val: IValues[string]) => void }) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [videos, setVideos] = useState<Vid[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [up, setUp] = useState(false)
  const [err, setErr] = useState('')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const file = useRef<HTMLInputElement>(null)
  const [big, setBig] = useState<Record<string, string>>({})
  const [zoom, setZoom] = useState<string | null>(null)
  const [zbusy, setZbusy] = useState(false)
  const sel = arr(v.photos)
  const [dragI, setDragI] = useState<number | null>(null)
  const [overI, setOverI] = useState<number | null>(null)
  const dRef = useRef<{ from: number; over: number } | null>(null)
  const pend = useRef<number>(0)
  const selRef = useRef(sel); selRef.current = sel
  const setRef = useRef(set); setRef.current = set
  const uploaded = arr(v.photos_up)

  const load = useCallback(async () => {
    setBusy(true); setErr('')
    try {
      const { data, error } = await supabase.functions.invoke('drive-media', { body: { deal_id: dealId } })
      if (error) { let msg = error.message; try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ } throw new Error(msg) }
      if (data?.error) throw new Error(data.error)
      setPhotos(data.photos || []); setVideos(data.videos || []); setFolders(data.folders?.photos || []); setTotal(data.photos_total || 0)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }, [dealId])
  useEffect(() => { if (hasFolder) load() }, [hasFolder, load])

  // náhledy nahraných fotek (soukromé úložiště → podepsané odkazy)
  useEffect(() => {
    const need = uploaded.filter((p) => !urls[p])
    if (!need.length) return
    supabase.storage.from('files').createSignedUrls(need, 3600).then(({ data }) => {
      if (!data) return
      setUrls((u) => { const n = { ...u }; for (const d of data) if (d.path && d.signedUrl) n[d.path] = d.signedUrl; return n })
    })
  }, [uploaded, urls])

  const thumbOf = (id: string): string | null => id.startsWith('up:') ? (urls[id.slice(3)] || null) : (photos.find((p) => p.id === id)?.thumb || null)
  const nameOf = (id: string) => id.startsWith('up:') ? 'z telefonu' : (photos.find((p) => p.id === id)?.name || '')
  const toggle = (id: string) => set('photos', sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])
  const move = (i: number, d: number) => { const a = sel.slice(); const j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; set('photos', a) }

  const reorder = (from: number, to: number) => { if (from === to) return; const a = selRef.current.slice(); const [m] = a.splice(from, 1); a.splice(to, 0, m); setRef.current('photos', a) }
  const dnd = (i: number) => ({
    'data-ord': i,
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); dRef.current = { from: i, over: i }; setDragI(i) },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (dRef.current) { dRef.current.over = i; setOverI(i) } },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); const d = dRef.current; if (d) reorder(d.from, i); dRef.current = null; setDragI(null); setOverI(null) },
    onDragEnd: () => { dRef.current = null; setDragI(null); setOverI(null) },
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0]; const x = t.clientX, y = t.clientY
      clearTimeout(pend.current)
      pend.current = window.setTimeout(() => { navigator.vibrate?.(25); dRef.current = { from: i, over: i }; setDragI(i); setOverI(i) }, 350)
      const cancel = (ev: TouchEvent) => { const m = ev.touches[0]; if (!dRef.current && m && Math.hypot(m.clientX - x, m.clientY - y) > 10) { clearTimeout(pend.current); window.removeEventListener('touchmove', cancel) } }
      window.addEventListener('touchmove', cancel, { passive: true })
      window.addEventListener('touchend', () => window.removeEventListener('touchmove', cancel), { once: true })
    },
  })
  useEffect(() => {
    const mv = (e: TouchEvent) => {
      const d = dRef.current; const t = e.touches[0]
      if (!d || !t) return
      e.preventDefault()
      const el = document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-ord]') as HTMLElement | null
      if (el) { d.over = Number(el.dataset.ord); setOverI(d.over) }
      if (t.clientY < 90) window.scrollBy(0, -12); else if (t.clientY > window.innerHeight - 90) window.scrollBy(0, 12)
    }
    const end = () => { clearTimeout(pend.current); const d = dRef.current; if (d) { reorder(d.from, d.over); dRef.current = null; setDragI(null); setOverI(null) } }
    window.addEventListener('touchmove', mv, { passive: false }); window.addEventListener('touchend', end); window.addEventListener('touchcancel', end)
    return () => { window.removeEventListener('touchmove', mv); window.removeEventListener('touchend', end); window.removeEventListener('touchcancel', end) }
  }, [])

  const allIds = [...photos.map((p) => p.id), ...uploaded.map((p) => 'up:' + p)]
  const open = useCallback(async (id: string) => {
    setZoom(id)
    if (big[id]) return
    if (id.startsWith('up:')) {
      const { data } = await supabase.storage.from('files').createSignedUrl(id.slice(3), 3600)
      if (data?.signedUrl) setBig((b) => ({ ...b, [id]: data.signedUrl }))
      return
    }
    setZbusy(true)
    try {
      const { data } = await supabase.functions.invoke('drive-media', { body: { deal_id: dealId, file_id: id } })
      if (data?.image) setBig((b) => ({ ...b, [id]: data.image }))
    } catch { /* zůstane malý náhled */ }
    setZbusy(false)
  }, [big, dealId])
  const step = (d: number) => { if (!zoom) return; const i = allIds.indexOf(zoom); const n = allIds[i + d]; if (n) open(n) }
  useEffect(() => {
    if (!zoom) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(null); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  async function upload(list: FileList | null) {
    if (!list?.length || !accountId) return
    setUp(true); setErr('')
    const addedPaths: string[] = []
    for (const f of Array.from(list)) {
      if (!f.type.startsWith('image/')) { setErr('Nahrát lze jen fotky (JPG, PNG). Video vložte odkazem.'); continue }
      if (f.size > 25 * 1048576) { setErr(`Fotka „${f.name}“ je větší než 25 MB.`); continue }
      const path = `${accountId}/inzerat/${dealId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${f.name.replace(/[^\w.-]+/g, '_')}`
      const { error } = await supabase.storage.from('files').upload(path, f, { contentType: f.type })
      if (error) { setErr('Nahrání se nepovedlo: ' + error.message); continue }
      addedPaths.push(path)
    }
    if (addedPaths.length) { set('photos_up', [...uploaded, ...addedPaths]); set('photos', [...sel, ...addedPaths.map((p) => 'up:' + p)]) }
    setUp(false)
    if (file.current) file.current.value = ''
  }
  async function removeUp(path: string) {
    await supabase.storage.from('files').remove([path])
    set('photos_up', uploaded.filter((p) => p !== path)); set('photos', sel.filter((x) => x !== 'up:' + path))
  }

  const tile = (id: string, thumb: string | null, name: string, extra?: React.ReactNode) => {
    const i = sel.indexOf(id)
    return (
      <div key={id} className="relative">
        <button type="button" aria-pressed={i >= 0} aria-label={name} onClick={() => toggle(id)}
          className={`relative block w-full aspect-square rounded-[14px] overflow-hidden bg-chip border-2 ${i >= 0 ? 'border-navy' : 'border-transparent'}`}>
          {thumb ? <img src={thumb} alt="" className={`w-full h-full object-cover ${i >= 0 ? '' : 'opacity-80'}`} loading="lazy" /> : <span className="absolute inset-0 flex items-center justify-center text-[11px] text-muted p-1 text-center break-all">{name}</span>}
          {i >= 0 && <span className="absolute top-1.5 left-1.5 min-w-6 h-6 px-1.5 rounded-full bg-navy text-white text-xs font-extrabold inline-flex items-center justify-center">{i + 1}</span>}
        </button>
        <button type="button" aria-label="Zvětšit fotku" onClick={() => open(id)} className="absolute bottom-1.5 right-1.5 w-9 h-9 rounded-full bg-white/90 text-navy text-lg font-extrabold shadow">⤢</button>
        {extra}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-white border border-line rounded-[22px] p-[18px] md:p-6 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="m-0 text-[15px] font-extrabold text-navy mr-auto">Fotky do inzerátu</h2>
          <span className="text-sm font-extrabold text-gold">Vybráno {sel.length}</span>
        </div>
        <p className="m-0 text-[12.5px] text-muted">Klepnutím vyberte fotky, které jdou do inzerátu. Čísla ukazují pořadí, <b>1 = hlavní fotka</b>. Doporučeno 15–30 fotek.{folders.length ? ` Načteno ze složky „${folders.join('“, „')}“.` : ''}</p>
        {busy && <div className="flex items-center gap-2 text-sm text-muted"><Spinner />Načítám fotky z Disku…</div>}
        {!hasFolder && <p className="m-0 p-3 rounded-xl bg-[#FDEEE6] text-sm text-[#9A3A14]">Obchod nemá přiřazenou složku na Disku. Odkaz na složku klienta vložte v detailu obchodu, nebo fotky přidejte z telefonu níže.</p>}
        {err && <p className="m-0 p-3 rounded-xl bg-[#FDEEE6] text-sm text-[#9A3A14]">{err}</p>}
        {!busy && hasFolder && !err && !photos.length && <p className="m-0 text-sm text-muted">Ve složce „FOTKY – PROFI FOTKY“ nejsou žádné fotky. Můžete je přidat z telefonu.</p>}
        {photos.length > 0 && (
          <>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => set('photos', [...sel, ...photos.map((p) => p.id).filter((id) => !sel.includes(id))])} className="h-10 px-4 rounded-full border border-line bg-white text-navy text-[13px] font-bold">Vybrat vše</button>
              <button type="button" onClick={() => set('photos', sel.filter((x) => x.startsWith('up:')))} className="h-10 px-4 rounded-full border border-line bg-white text-navy text-[13px] font-bold">Zrušit výběr</button>
              <button type="button" onClick={load} disabled={busy} className="h-10 px-4 rounded-full border border-line bg-white text-navy text-[13px] font-bold">Načíst znovu</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">{photos.map((p) => tile(p.id, p.thumb, p.name))}</div>
            {total > photos.length && <p className="m-0 text-xs text-muted">Zobrazeno {photos.length} z {total} fotek.</p>}
          </>
        )}
      </section>

      <section className="bg-white border border-line rounded-[22px] p-[18px] md:p-6 flex flex-col gap-3">
        <h2 className="m-0 text-[15px] font-extrabold text-navy">Další fotky z telefonu</h2>
        <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        <button type="button" onClick={() => file.current?.click()} disabled={up || !accountId} className="h-12 rounded-full border border-line bg-white text-navy text-[15px] font-extrabold disabled:opacity-60">{up ? 'Nahrávám…' : '+ Přidat fotky'}</button>
        {uploaded.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {uploaded.map((path) => tile('up:' + path, urls[path] || null, 'fotka z telefonu',
              <button type="button" aria-label="Smazat fotku" onClick={() => removeUp(path)} className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 text-[#B42318] text-sm font-extrabold leading-none">×</button>))}
          </div>
        )}
      </section>

      {sel.length > 0 && (
        <section className="bg-white border border-line rounded-[22px] p-[18px] md:p-6 flex flex-col gap-3">
          <h2 className="m-0 text-[15px] font-extrabold text-navy">Pořadí v inzerátu</h2>
          <p className="m-0 text-[12.5px] text-muted">Fotky přetáhněte na jiné místo (na mobilu podržte prst a táhněte) nebo použijte šipky. <b>1 = hlavní fotka.</b></p>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {sel.map((id, i) => (
              <div key={id} {...dnd(i)} style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                className={`relative rounded-[16px] overflow-hidden bg-chip aspect-[4/3] cursor-grab border-2 transition ${dragI === i ? 'opacity-40 border-gold' : overI === i && dragI !== null ? 'border-gold scale-[1.02]' : 'border-transparent'}`}>
                {thumbOf(id) ? <img src={thumbOf(id)!} alt={nameOf(id)} draggable={false} className="w-full h-full object-cover pointer-events-none" /> : <span className="absolute inset-0 flex items-center justify-center text-xs text-muted p-2 text-center break-all">{nameOf(id)}</span>}
                <span className="absolute top-2 left-2 min-w-7 h-7 px-2 rounded-full bg-navy text-white text-sm font-extrabold inline-flex items-center justify-center">{i + 1}</span>
                <div className="absolute bottom-2 left-2 flex gap-1.5">
                  <button type="button" aria-label="Posunout dopředu" disabled={i === 0} onClick={() => move(i, -1)} className="w-9 h-9 rounded-full bg-white/90 text-navy text-base font-extrabold shadow disabled:opacity-30">←</button>
                  <button type="button" aria-label="Posunout dozadu" disabled={i === sel.length - 1} onClick={() => move(i, 1)} className="w-9 h-9 rounded-full bg-white/90 text-navy text-base font-extrabold shadow disabled:opacity-30">→</button>
                </div>
                <button type="button" aria-label="Zvětšit fotku" onClick={() => open(id)} className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-white/90 text-navy text-lg font-extrabold shadow">⤢</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {videos.length > 0 && (
        <section className="bg-white border border-line rounded-[22px] p-[18px] md:p-6 flex flex-col gap-2">
          <h2 className="m-0 text-[15px] font-extrabold text-navy">Videa ve složce klienta</h2>
          {videos.map((vd) => (
            <div key={vd.id} className="flex items-center gap-3 py-1.5 border-t first:border-t-0 border-line-soft">
              <span className="flex flex-col min-w-0 mr-auto"><b className="text-sm truncate">{vd.name}</b><span className="text-xs text-muted">{mb(vd.size)}</span></span>
              <button type="button" onClick={() => set('video_url', vd.link)} className={`h-10 px-4 rounded-full text-[13px] font-bold ${v.video_url === vd.link ? 'bg-navy text-white' : 'border border-line bg-white text-navy'}`}>{v.video_url === vd.link ? '✓ Použito' : 'Použít'}</button>
            </div>
          ))}
        </section>
      )}
      {zoom && (() => {
        const i = allIds.indexOf(zoom); const sIdx = sel.indexOf(zoom)
        const src = big[zoom] || thumbOf(zoom)
        return (
          <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col" role="dialog" aria-label="Náhled fotky">
            <div className="flex items-center gap-3 px-4 py-3 text-white">
              <span className="text-sm font-bold mr-auto truncate">{nameOf(zoom)} · {i + 1} / {allIds.length}{zbusy ? ' · načítám…' : ''}</span>
              <button type="button" onClick={() => setZoom(null)} aria-label="Zavřít" className="w-11 h-11 rounded-full bg-white/15 text-2xl leading-none">×</button>
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center relative" onClick={() => setZoom(null)}>
              {src ? <img src={src} alt="" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} /> : <Spinner />}
              <button type="button" aria-label="Předchozí" disabled={i <= 0} onClick={(e) => { e.stopPropagation(); step(-1) }} className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 text-white text-2xl disabled:opacity-20">‹</button>
              <button type="button" aria-label="Další" disabled={i >= allIds.length - 1} onClick={(e) => { e.stopPropagation(); step(1) }} className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 text-white text-2xl disabled:opacity-20">›</button>
            </div>
            <div className="p-4 flex justify-center">
              <button type="button" onClick={() => toggle(zoom)} className={`h-14 px-8 rounded-full text-base font-extrabold ${sIdx >= 0 ? 'bg-gold text-ink' : 'bg-white text-navy'}`}>{sIdx >= 0 ? `✓ Vybráno (${sIdx + 1}) – klepnutím zrušit` : 'Vybrat do inzerátu'}</button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
