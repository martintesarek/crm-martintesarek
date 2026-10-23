import { useEffect, useRef, useState } from 'react'
import { b64ToBytes, BOX_W, type Place } from '../lib/sign'

export type Marker = Place & { label?: string; color?: string; key?: string }

// Vykreslí všechny stránky PDF pod sebou. Klepnutí na stránku (onPick) vrací pozici jako zlomek stránky,
// značky (markers) jsou podpisová pole ve stejném poměru stran jako v hotovém PDF (3 : 1).
export function PdfPages({ pdf, markers = [], onPick, onMarker }: { pdf: string; markers?: Marker[]; onPick?: (p: Place) => void; onMarker?: (m: Marker) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<{ w: number; h: number }[]>([])
  const [err, setErr] = useState('')
  const canvases = useRef<(HTMLCanvasElement | null)[]>([])

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        pdfjs.GlobalWorkerOptions.workerSrc = worker
        const doc = await pdfjs.getDocument({ data: b64ToBytes(pdf), isEvalSupported: false }).promise
        const width = wrap.current?.clientWidth || 600
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const dims: { w: number; h: number }[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const v1 = page.getViewport({ scale: 1 })
          dims.push({ w: v1.width, h: v1.height })
        }
        if (dead) return
        setPages(dims)
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const vp = page.getViewport({ scale: (width * dpr) / dims[i - 1].w })
          const c = canvases.current[i - 1]
          if (!c || dead) return
          c.width = vp.width; c.height = vp.height
          await page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
        }
      } catch (e) { if (!dead) setErr('Dokument se nepodařilo zobrazit. ' + (e instanceof Error ? e.message : '')) }
    })()
    return () => { dead = true }
  }, [pdf])

  if (err) return <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#FDE9E7', color: '#A12E2A' }}>{err}</div>
  return (
    <div ref={wrap} className="flex flex-col gap-3 w-full">
      {pages.length === 0 && <div className="text-sm text-muted py-6 text-center">Načítám dokument…</div>}
      {pages.map((p, i) => (
        <div key={i} className="relative w-full bg-white border border-line shadow-sm select-none" style={{ aspectRatio: `${p.w} / ${p.h}`, cursor: onPick ? 'crosshair' : 'default' }}
          onClick={(e) => {
            if (!onPick) return
            const r = e.currentTarget.getBoundingClientRect()
            const bh = (BOX_W * r.width / 3) / r.height // výška pole jako zlomek stránky
            onPick({ page: i, x: Math.min(Math.max((e.clientX - r.left) / r.width - BOX_W / 2, 0), 1 - BOX_W), y: Math.min(Math.max((e.clientY - r.top) / r.height - bh / 2, 0), 1 - bh) })
          }}>
          <canvas ref={(el) => { canvases.current[i] = el }} className="absolute inset-0 w-full h-full" />
          <span className="absolute right-2 top-1 text-[10px] text-muted bg-white/80 px-1 rounded">{i + 1}/{pages.length}</span>
          {markers.filter((m) => m.page === i).map((m, k) => (
            <button key={m.key || k} type="button" onClick={(e) => { e.stopPropagation(); onMarker?.(m) }}
              className="absolute flex items-center justify-center text-[11px] font-extrabold rounded-md border-2 border-dashed"
              style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${BOX_W * 100}%`, aspectRatio: '3 / 1', background: (m.color || '#253371') + '22', borderColor: m.color || '#253371', color: m.color || '#253371' }}>
              {m.label || 'Podpis'}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
