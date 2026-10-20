import { useEffect, useRef, useState } from 'react'

// Přetahování na dotykových zařízeních: dlouhý stisk (cca 0,35 s) chytí kartu,
// pak ji jde táhnout na jinou fázi. Cíle označ atributem data-drop-stage="<id fáze>".
// Krátký dotyk a posun prstem dál fungují normálně (klik / scrollování).

type Drag = { dealId: string; title: string; x: number; y: number; over: string | null; from: string | null }

export function useTouchDrag(onDrop: (dealId: string, stageId: string) => void, scrollEl?: () => HTMLElement | null) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const pending = useRef<{ timer: number; x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const raf = useRef(0)

  const set = (d: Drag | null) => { dragRef.current = d; setDrag(d) }

  useEffect(() => {
    const move = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      if (pending.current && !dragRef.current) {
        if (Math.hypot(t.clientX - pending.current.x, t.clientY - pending.current.y) > 10) { clearTimeout(pending.current.timer); pending.current = null }
        return
      }
      const d = dragRef.current
      if (!d) return
      e.preventDefault()
      const el = document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-drop-stage]') as HTMLElement | null
      set({ ...d, x: t.clientX, y: t.clientY, over: el?.dataset.dropStage || null })
    }
    const end = () => {
      if (pending.current) { clearTimeout(pending.current.timer); pending.current = null }
      const d = dragRef.current
      if (!d) return
      cancelAnimationFrame(raf.current)
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 400)
      if (d.over && d.over !== d.from) onDrop(d.dealId, d.over)
      set(null)
    }
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', end)
    return () => { window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); window.removeEventListener('touchcancel', end) }
  }, [onDrop])

  // Automatické posouvání u okrajů obrazovky
  useEffect(() => {
    if (!drag) return
    const tick = () => {
      const d = dragRef.current
      if (!d) return
      const w = window.innerWidth, h = window.innerHeight, edge = 48, speed = 12
      const box = scrollEl?.()
      if (box) {
        if (d.x < edge) box.scrollLeft -= speed
        else if (d.x > w - edge) box.scrollLeft += speed
      }
      if (d.y < edge + 40) window.scrollBy(0, -speed)
      else if (d.y > h - edge - 90) window.scrollBy(0, speed)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [!!drag]) // eslint-disable-line

  // Props pro přetahovatelnou kartu
  const handle = (dealId: string, title: string, fromStage: string | null) => ({
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0]
      const timer = window.setTimeout(() => {
        pending.current = null
        navigator.vibrate?.(25)
        set({ dealId, title, x: t.clientX, y: t.clientY, over: fromStage, from: fromStage })
      }, 350)
      pending.current = { timer, x: t.clientX, y: t.clientY }
    },
    onClickCapture: (e: React.MouseEvent) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation() } },
    onContextMenu: (e: React.MouseEvent) => { if (dragRef.current || pending.current) e.preventDefault() },
    style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties,
  })

  const ghost = drag ? (
    <div className="fixed z-[70] pointer-events-none -translate-x-1/2 -translate-y-1/2 max-w-[260px] px-4 py-3 rounded-2xl bg-white border-2 border-gold shadow-[0_12px_32px_rgba(27,31,69,.28)] font-bold text-sm rotate-[-2deg]"
      style={{ left: drag.x, top: drag.y }}>
      {drag.title}
    </div>
  ) : null

  return { drag, handle, ghost }
}
