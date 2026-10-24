// Textový chat s AI nad daty CRM (otázky, přehledy, doporučení).
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app'
import { askChat, type Content } from '../lib/chat'
import { Icon } from './Icon'
import { Card } from './ui'

type Msg = { id: number; who: 'ja' | 'ai'; text: string; err?: boolean }
const SUGGEST = ['Na co se mám dnes zaměřit?', 'Komu jsem se půl roku neozval?', 'U koho jsem měl nejvyšší provizi?', 'Kdo má v příštích 14 dnech narozeniny?']

export function AiChat() {
  const { session, account, stages } = useApp()
  const nav = useNavigate()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const hist = useRef<Content[]>([])
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy])

  async function send(text: string) {
    const t = text.trim()
    if (!t || busy || !account || !session) return
    setQ(''); setBusy(true)
    setMsgs((m) => [...m, { id: Date.now(), who: 'ja', text: t }])
    const user: Content = { role: 'user', parts: [{ text: t }] }
    try {
      const extra: string[] = []
      const { added, text: answer } = await askChat([...hist.current, user], {
        accountId: account.id, userId: session.user.id, stages,
        onSmsDraft: (d) => extra.push(`Návrh SMS pro ${d.contact}${d.phone ? ' (' + d.phone + ')' : ''}:\n${d.text}`),
        onNavigate: (path) => nav(path),
      }, (session.user.user_metadata?.full_name as string) || 'Martina Tesárka')
      hist.current = [...hist.current, user, ...added].slice(-40)
      setMsgs((m) => [...m, { id: Date.now() + 1, who: 'ai', text: [answer, ...extra].filter(Boolean).join('\n\n') || 'Hotovo.' }])
    } catch (e) {
      setMsgs((m) => [...m, { id: Date.now() + 1, who: 'ai', text: e instanceof Error ? e.message : 'Něco se nepovedlo.', err: true }])
    } finally { setBusy(false) }
  }

  return (
    <Card className="p-4 md:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <b className="text-base font-extrabold mr-auto">Zeptejte se písemně ✨</b>
        {msgs.length > 0 && <button onClick={() => { setMsgs([]); hist.current = [] }} className="text-xs font-bold text-muted">Nový chat</button>}
      </div>
      {msgs.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGEST.map((s) => <button key={s} onClick={() => send(s)} className="h-9 px-3 rounded-full bg-chip text-[13px] font-bold text-navy text-left">{s}</button>)}
        </div>
      )}
      {(msgs.length > 0 || busy) && (
        <div ref={box} className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto pr-1">
          {msgs.map((m) => (
            <div key={m.id} className={`max-w-[92%] px-3.5 py-2.5 rounded-2xl text-[15px] leading-snug whitespace-pre-wrap ${m.who === 'ja' ? 'self-end bg-navy text-white rounded-br-md' : m.err ? 'self-start bg-[#FDEEE6] text-[#9A3A14] rounded-bl-md' : 'self-start bg-bg rounded-bl-md'}`}>{m.text}</div>
          ))}
          {busy && <div className="self-start px-3.5 py-2.5 rounded-2xl bg-bg text-sm text-muted rounded-bl-md">Hledám v CRM…</div>}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(q) }} className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zeptejte se na cokoli v CRM…" className="flex-1 min-w-0 h-12 px-4 rounded-2xl border border-line bg-white outline-none text-[15px]" />
        <button type="submit" disabled={busy || !q.trim()} aria-label="Odeslat" className="w-12 h-12 rounded-2xl bg-navy text-white inline-flex items-center justify-center disabled:opacity-40"><Icon name="arrow" size={20} /></button>
      </form>
    </Card>
  )
}
