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
  const sel = arr(v.photos)
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
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">{photos.map((p) => tile(p.id, p.thumb, p.name))}</div>
            {total > photos.length && <p className="m-0 text-xs text-muted">Zobrazeno {photos.length} z {total} fotek.</p>}
          </>
        )}
      </section>

      <section className="bg-white border border-line rounded-[22px] p-[18px] md:p-6 flex flex-col gap-3">
        <h2 className="m-0 text-[15px] font-extrabold text-navy">Další fotky z telefonu</h2>
        <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        <button type="button" onClick={() => file.current?.click()} disabled={up || !accountId} className="h-12 rounded-full border border-line bg-white text-navy text-[15px] font-extrabold disabled:opacity-60">{up ? 'Nahrávám…' : '+ Přidat fotky'}</button>
        {uploaded.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {uploaded.map((path) => tile('up:' + path, urls[path] || null, 'fotka z telefonu',
              <button type="button" aria-label="Smazat fotku" onClick={() => removeUp(path)} className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 text-[#B42318] text-sm font-extrabold leading-none">×</button>))}
          </div>
        )}
      </section>

      {sel.length > 1 && (
        <section className="bg-white border border-line rounded-[22px] p-[18px] md:p-6 flex flex-col gap-3">
          <h2 className="m-0 text-[15px] font-extrabold text-navy">Pořadí v inzerátu</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {sel.map((id, i) => (
              <div key={id} className="shrink-0 w-[84px] flex flex-col gap-1">
                <div className="relative w-[84px] h-[84px] rounded-[12px] overflow-hidden bg-chip">
                  {thumbOf(id) ? <img src={thumbOf(id)!} alt={nameOf(id)} className="w-full h-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted p-1 text-center break-all">{nameOf(id)}</span>}
                  <span className="absolute top-1 left-1 min-w-5 h-5 px-1 rounded-full bg-navy text-white text-[11px] font-extrabold inline-flex items-center justify-center">{i + 1}</span>
                </div>
                <div className="flex gap-1">
                  <button type="button" aria-label="Posunout dopředu" disabled={i === 0} onClick={() => move(i, -1)} className="flex-1 h-8 rounded-lg border border-line bg-white text-navy text-sm font-extrabold disabled:opacity-30">←</button>
                  <button type="button" aria-label="Posunout dozadu" disabled={i === sel.length - 1} onClick={() => move(i, 1)} className="flex-1 h-8 rounded-lg border border-line bg-white text-navy text-sm font-extrabold disabled:opacity-30">→</button>
                </div>
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
    </div>
  )
}
