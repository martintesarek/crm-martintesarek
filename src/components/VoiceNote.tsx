import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/app'
import { Icon } from './Icon'

// Otevření odkudkoli: window.dispatchEvent(new CustomEvent('voice-note', { detail: { dealId } }))
export const openVoiceNote = (dealId?: string) => window.dispatchEvent(new CustomEvent('voice-note', { detail: { dealId } }))

type Proposal = {
  transcript: string
  deal_id: string | null
  comment: string
  next_step: { text: string; at: string | null } | null
  tasks: { title: string; due_at: string | null }[]
}
type Phase = 'idle' | 'recording' | 'processing' | 'review' | 'saving' | 'done' | 'error'

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null)

export function VoiceNoteHost() {
  const { account, session } = useApp()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [fixedDeal, setFixedDeal] = useState<string | undefined>()
  const [phase, setPhase] = useState<Phase>('idle')
  const [err, setErr] = useState('')
  const [secs, setSecs] = useState(0)
  const [bars, setBars] = useState<number[]>(Array(24).fill(6))
  const [p, setP] = useState<Proposal | null>(null)
  const [pick, setPick] = useState({ comment: true, next: true, tasks: [] as boolean[] })
  const [deals, setDeals] = useState<{ id: string; title: string }[]>([])
  const [noteId, setNoteId] = useState<string | null>(null)
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const stream = useRef<MediaStream | null>(null)
  const raf = useRef(0)
  const timer = useRef(0)

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail || {}
      setFixedDeal(d.dealId); setOpen(true); setPhase('idle'); setErr(''); setP(null)
      start()
    }
    window.addEventListener('voice-note', h)
    return () => window.removeEventListener('voice-note', h)
  }, [account]) // eslint-disable-line

  useEffect(() => {
    if (!open || !account) return
    supabase.from('deals').select('id, title, stages!inner(kind)').eq('account_id', account.id).eq('stages.kind', 'open').order('title')
      .then(({ data }) => setDeals((data as unknown as { id: string; title: string }[]) || []))
  }, [open, account])

  function cleanup() {
    cancelAnimationFrame(raf.current); clearInterval(timer.current)
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null
  }
  function close() { if (rec.current?.state === 'recording') { rec.current.onstop = null; rec.current.stop() } cleanup(); setOpen(false) }

  async function start() {
    setErr('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.current = s
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) || ''
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      r.onstop = () => upload(new Blob(chunks.current, { type: r.mimeType || mime || 'audio/webm' }))
      r.start(500); rec.current = r
      setPhase('recording'); setSecs(0)
      timer.current = window.setInterval(() => setSecs((x) => x + 1), 1000)
      const ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 64
      ctx.createMediaStreamSource(s).connect(an)
      const buf = new Uint8Array(an.frequencyBinCount)
      const loop = () => { an.getByteFrequencyData(buf); setBars(Array.from(buf.slice(0, 24), (v) => 6 + (v / 255) * 42)); raf.current = requestAnimationFrame(loop) }
      loop()
    } catch {
      setPhase('error'); setErr('Nemám přístup k mikrofonu. Povolte ho v nastavení prohlížeče a zkuste to znovu.')
    }
  }
  function stop() { cleanup(); setPhase('processing'); rec.current?.stop() }

  async function upload(blob: Blob) {
    if (!account) return
    try {
      const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
      const path = `${account.id}/${crypto.randomUUID()}.${ext}`
      setAudioPath(path)
      const up = await supabase.storage.from('voice').upload(path, blob, { contentType: blob.type.split(';')[0] })
      if (up.error) throw new Error(up.error.message)
      const { data: vn } = await supabase.from('voice_notes').insert({ account_id: account.id, user_id: session?.user.id, deal_id: fixedDeal || null, audio_path: path }).select('id').single()
      setNoteId(vn?.id || null)
      const { data, error } = await supabase.functions.invoke('voice-note', { body: { path, deal_id: fixedDeal, voice_note_id: vn?.id } })
      if (error) {
        let msg = error.message
        try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ }
        throw new Error(msg)
      }
      const r = data as Proposal
      // „další krok“ už v CRM není – stane se z něj úkol
      if (r.next_step?.text) { r.tasks = [{ title: r.next_step.text, due_at: r.next_step.at }, ...r.tasks]; r.next_step = null }
      setP(r); setPick({ comment: !!r.comment, next: false, tasks: r.tasks.map(() => true) })
      setPhase('review')
    } catch (e) {
      setPhase('error'); setErr('Zpracování se nepovedlo: ' + (e as Error).message)
    }
  }

  async function confirm() {
    if (!p || !account) return
    setPhase('saving'); setErr('')
    const ops: PromiseLike<unknown>[] = []
    if (p.deal_id && !(pick.comment && p.comment)) ops.push(supabase.from('activities').insert({ account_id: account.id, deal_id: p.deal_id, type: 'ai', body: '🎙️ Hlasová poznámka', author_id: session?.user.id, data: { transcript: p.transcript, voice_note_id: noteId, audio_path: audioPath } }))
    if (p.deal_id && pick.comment && p.comment) ops.push(supabase.from('activities').insert({ account_id: account.id, deal_id: p.deal_id, type: 'ai', body: '🎙️ ' + p.comment, author_id: session?.user.id, data: { transcript: p.transcript, voice_note_id: noteId, audio_path: audioPath } }))
    const tasks = p.tasks.filter((t, i) => pick.tasks[i] && t.title.trim()).map((t, i) => ({ account_id: account.id, deal_id: p.deal_id || null, title: t.title, due_at: t.due_at, assignee_id: session?.user.id, position: 1000 + i }))
    if (tasks.length) ops.push(supabase.from('tasks').insert(tasks))
    if (noteId) ops.push(supabase.from('voice_notes').update({ status: 'applied', deal_id: p.deal_id || null }).eq('id', noteId))
    const res = await Promise.all(ops) as { error?: { message: string } | null }[]
    const bad = res.find((r) => r?.error)
    if (bad?.error) { setPhase('review'); setErr(bad.error.message); return }
    setPhase('done')
    window.dispatchEvent(new CustomEvent('deal-updated', { detail: { dealId: p.deal_id } }))
    window.dispatchEvent(new CustomEvent('tasks-updated'))
  }

  if (!open) return null
  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  const dealTitle = deals.find((d) => d.id === p?.deal_id)?.title
  const inp = 'h-10 px-3 rounded-xl border border-line bg-white outline-none text-sm w-full'

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <button aria-label="Zavřít" className="absolute inset-0 bg-ink/60" onClick={close} />
      <div role="dialog" aria-modal="true" aria-label="Hlasová poznámka" className="relative bg-white w-full md:max-w-lg max-h-[92vh] rounded-t-[28px] md:rounded-[24px] flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center border-b border-line-soft">
          <span className="text-xs font-extrabold tracking-[.06em] text-gold-ink mr-auto">HLASOVÁ POZNÁMKA</span>
          <button onClick={close} className="h-10 px-2 font-bold text-navy">Zavřít</button>
        </div>

        <div className="overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {(phase === 'idle' || phase === 'recording') && (
            <div className="flex flex-col items-center gap-5 py-4">
              <div className="flex items-center gap-1 h-12" aria-hidden="true">
                {bars.map((h, i) => <span key={i} className="w-[5px] rounded" style={{ height: h, background: i > 6 && i < 17 ? '#CB992E' : '#8E95C9' }} />)}
              </div>
              <span className="text-3xl font-extrabold tabular-nums">{mm}</span>
              <span className="text-sm text-muted text-center">Mluvte normálně – kdo, co, kdy. Např. „Svoboda chce prodat do jara, ozvat se v pondělí.“</span>
              <button onClick={stop} disabled={phase !== 'recording'} aria-label="Ukončit nahrávání"
                className="w-24 h-24 rounded-full bg-navy text-white inline-flex items-center justify-center shadow-[0_0_0_10px_#CB992E33] disabled:opacity-50">
                <span className="w-8 h-8 rounded-md bg-white" />
              </button>
              <span className="text-xs text-muted">Klepnutím nahrávání ukončíte a AI ho zpracuje.</span>
            </div>
          )}

          {phase === 'processing' && (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="w-10 h-10 border-[3px] border-line border-t-gold rounded-full animate-spin" />
              <b>Přepisuji a připravuji kroky…</b>
              <span className="text-sm text-muted">Obvykle to trvá 5–15 sekund.</span>
            </div>
          )}

          {(phase === 'review' || phase === 'saving') && p && (
            <>
              <p className="m-0 flex gap-2 text-[13px] leading-snug text-muted"><Icon name="mic" size={16} /><span className="italic line-clamp-3">„{p.transcript}“</span></p>

              <div className="flex flex-col gap-2.5">
                <span className="text-xs font-extrabold tracking-[.06em] text-muted">ÚKOLY</span>
                {p.tasks.map((t, i) => {
                  const upd = (patch: Partial<{ title: string; due_at: string | null }>) => setP({ ...p, tasks: p.tasks.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
                  const quick = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(9, 0, 0, 0); upd({ due_at: d.toISOString() }) }
                  const remove = () => { setP({ ...p, tasks: p.tasks.filter((_, j) => j !== i) }); setPick({ ...pick, tasks: pick.tasks.filter((_, j) => j !== i) }) }
                  return (
                    <div key={i} className="rounded-[20px] border border-line bg-white p-3.5 flex flex-col gap-2.5 shadow-[0_1px_0_#0000000a]">
                      <div className="flex items-start gap-2">
                        <span className="mt-[3px] w-5 h-5 rounded-full border-2 border-gold shrink-0" />
                        <input value={t.title} onChange={(e) => upd({ title: e.target.value })} placeholder="Co je potřeba udělat" className="flex-1 min-w-0 text-[17px] font-bold outline-none bg-transparent" />
                        <button onClick={remove} aria-label="Odebrat úkol" className="w-8 h-8 -mt-1 -mr-1 rounded-full text-muted hover:bg-chip inline-flex items-center justify-center text-lg leading-none">×</button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pl-7">
                        {[['Dnes', 0], ['Zítra', 1], ['Za týden', 7]].map(([l, n]) => <button key={l as string} onClick={() => quick(n as number)} className="h-8 px-3 rounded-full bg-chip text-[13px] font-bold text-navy">{l}</button>)}
                        <input type="datetime-local" value={toLocal(t.due_at)} onChange={(e) => upd({ due_at: fromLocal(e.target.value) })} className="h-8 px-2.5 rounded-full border border-line text-[13px] font-semibold outline-none bg-white" />
                      </div>
                    </div>
                  )
                })}
                <button onClick={() => { setP({ ...p, tasks: [...p.tasks, { title: '', due_at: null }] }); setPick({ ...pick, tasks: [...pick.tasks, true] }) }} className="h-10 rounded-2xl border border-dashed border-line text-sm font-bold text-navy">+ Přidat úkol</button>
              </div>

              <div className="flex flex-col gap-2.5">
                <span className="text-xs font-extrabold tracking-[.06em] text-muted">K OBCHODU <span className="font-semibold tracking-normal">(nepovinné)</span></span>
                <select value={p.deal_id || ''} disabled={!!fixedDeal} onChange={(e) => setP({ ...p, deal_id: e.target.value || null })} className={inp}>
                  <option value="">Bez obchodu – jen úkol</option>
                  {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                  {p.deal_id && !dealTitle && <option value={p.deal_id}>Tento obchod</option>}
                </select>
                {p.deal_id && p.comment && (
                  <Row on={pick.comment} onToggle={(v) => setPick({ ...pick, comment: v })} title="Uložit i komentář do obchodu">
                    <textarea value={p.comment} onChange={(e) => setP({ ...p, comment: e.target.value })} rows={2} className="w-full p-2.5 rounded-xl border border-line text-sm outline-none" />
                  </Row>
                )}
              </div>
            </>
          )}

          {phase === 'done' && p && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="w-16 h-16 rounded-full bg-[#2F7A4E] text-white inline-flex items-center justify-center"><Icon name="check" size={30} stroke={3} /></span>
              <b className="text-lg">Uloženo{dealTitle ? ` do obchodu ${dealTitle}` : ''}</b>
              {p.deal_id && <button onClick={() => { close(); nav(`/obchody/${p.deal_id}`) }} className="h-11 px-4 rounded-xl bg-chip font-bold text-sm">Otevřít obchod</button>}
            </div>
          )}

          {err && <p className="m-0 p-3 rounded-xl bg-[#FDEEE6] text-sm text-[#9A3A14]">{err}</p>}
        </div>

        {(phase === 'review' || phase === 'saving' || phase === 'error') && (
          <div className="px-5 pt-3 pb-6 border-t border-line-soft grid grid-cols-[1fr_1.6fr] gap-2 safe-bottom">
            <button onClick={() => { setP(null); start() }} className="h-14 rounded-2xl bg-chip font-bold">Nahrát znovu</button>
            {phase !== 'error'
              ? <button onClick={confirm} disabled={phase === 'saving'} className="h-14 rounded-2xl bg-gold text-ink font-extrabold disabled:opacity-60">{phase === 'saving' ? 'Ukládám…' : p && p.tasks.length ? `Uložit ${p.tasks.length === 1 ? 'úkol' : p.tasks.length + ' úkoly'}` : 'Uložit'}</button>
              : <button onClick={close} className="h-14 rounded-2xl bg-navy text-white font-bold">Zavřít</button>}
          </div>
        )}
        {phase === 'done' && <div className="px-5 pb-6"><button onClick={close} className="w-full h-14 rounded-2xl bg-navy text-white font-bold">Hotovo</button></div>}
      </div>
    </div>
  )
}

function Row({ on, onToggle, title, children }: { on: boolean; onToggle: (v: boolean) => void; title: string; children: React.ReactNode }) {
  return (
    <div className={`flex gap-3 p-3 rounded-2xl border ${on ? 'border-gold bg-gold-soft/50' : 'border-line opacity-60'}`}>
      <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} aria-label={title} className="w-6 h-6 mt-0.5 accent-navy shrink-0" />
      <div className="flex flex-col gap-2 flex-1 min-w-0"><b className="text-sm">{title}</b>{children}</div>
    </div>
  )
}
