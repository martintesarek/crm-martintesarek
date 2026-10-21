// Vyhledávání v celém CRM: obchody, kontakty, úkoly (bez ohledu na diakritiku).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/app'
import { contactName } from '../lib/format'
import type { Contact, Deal } from '../lib/types'
import { Icon } from './Icon'

type TaskLite = { id: string; title: string; deal_id: string | null; due_at: string | null; done: boolean }
const norm = (s: string | null | undefined) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const digits = (s: string | null | undefined) => (s || '').replace(/\D/g, '')

export function GlobalSearch({ deals }: { deals: Deal[] }) {
  const { account } = useApp()
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [tasks, setTasks] = useState<TaskLite[] | null>(null)
  const box = useRef<HTMLDivElement>(null)

  // data se načtou až při prvním použití
  useEffect(() => {
    if (!focus || !account || contacts) return
    ;(async () => {
      const all: Contact[] = []
      for (let from = 0; from < 5000; from += 1000) {
        const { data } = await supabase.from('contacts').select('*').eq('account_id', account.id).range(from, from + 999)
        all.push(...((data as Contact[]) || []))
        if (!data || data.length < 1000) break
      }
      setContacts(all)
      const { data: t } = await supabase.from('tasks').select('id, title, deal_id, due_at, done').eq('account_id', account.id).order('created_at', { ascending: false }).limit(2000)
      setTasks((t as TaskLite[]) || [])
    })()
  }, [focus, account, contacts])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setFocus(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const res = useMemo(() => {
    const n = norm(q).trim(), d = digits(q)
    if (n.length < 2) return null
    const words = n.split(/\s+/)
    const hit = (hay: string) => words.every((w) => hay.includes(w))
    const dealRes = deals.filter((x) => hit(norm([x.title, x.address, x.description].join(' ')))).slice(0, 8)
    const conRes = (contacts || []).filter((c) => hit(norm([c.first_name, c.last_name, c.email, c.city, c.street, ...(c.tags || [])].join(' '))) || (d.length >= 3 && digits(c.phone).includes(d))).slice(0, 8)
    const taskRes = (tasks || []).filter((t) => hit(norm(t.title))).slice(0, 6)
    return { dealRes, conRes, taskRes }
  }, [q, deals, contacts, tasks])

  const total = res ? res.dealRes.length + res.conRes.length + res.taskRes.length : 0
  const close = () => { setFocus(false); setQ('') }
  const row = 'flex items-center gap-3 px-3 py-2.5 rounded-xl no-underline text-ink hover:bg-bg'
  const head = (t: string) => <div className="px-3 pt-3 pb-1 text-[11px] font-extrabold tracking-wider text-muted">{t}</div>

  return (
    <div ref={box} className="relative">
      <div className="flex items-center gap-2.5 h-12 px-4 rounded-2xl bg-white border border-line focus-within:border-navy">
        <Icon name="search" size={18} className="text-muted shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} placeholder="Hledat v celém CRM – obchod, kontakt, telefon, úkol…" aria-label="Hledat v celém CRM"
          className="flex-1 min-w-0 bg-transparent outline-none text-[15px]" />
        {q && <button aria-label="Smazat hledání" onClick={() => setQ('')} className="w-8 h-8 rounded-lg text-muted inline-flex items-center justify-center"><Icon name="x" size={16} /></button>}
      </div>
      {focus && res && (
        <div className="absolute z-30 left-0 right-0 mt-2 bg-white border border-line rounded-[20px] shadow-lg p-2 max-h-[70vh] overflow-y-auto">
          {(contacts === null || tasks === null) && <div className="px-3 py-2 text-sm text-muted">Načítám…</div>}
          {total === 0 && contacts !== null && <div className="px-3 py-4 text-sm text-muted">Nic jsem nenašel.</div>}
          {res.dealRes.length > 0 && head('OBCHODY')}
          {res.dealRes.map((x) => (
            <Link key={x.id} to={`/obchody/${x.id}`} onClick={close} className={row}>
              <span className="w-8 h-8 rounded-lg bg-navy-soft text-navy inline-flex items-center justify-center shrink-0"><Icon name="board" size={16} /></span>
              <span className="flex flex-col min-w-0"><b className="text-[15px] truncate">{x.title}</b>{x.address && <span className="text-xs text-muted truncate">{x.address}</span>}</span>
            </Link>
          ))}
          {res.conRes.length > 0 && head('KONTAKTY')}
          {res.conRes.map((c) => (
            <Link key={c.id} to={`/kontakty/${c.id}`} onClick={close} className={row}>
              <span className="w-8 h-8 rounded-lg bg-navy-soft text-navy inline-flex items-center justify-center shrink-0"><Icon name="user" size={16} /></span>
              <span className="flex flex-col min-w-0"><b className="text-[15px] truncate">{contactName(c)}</b><span className="text-xs text-muted truncate">{[c.phone, c.email].filter(Boolean).join(' · ')}</span></span>
            </Link>
          ))}
          {res.taskRes.length > 0 && head('ÚKOLY')}
          {res.taskRes.map((t) => (
            <Link key={t.id} to={t.deal_id ? `/obchody/${t.deal_id}` : '/'} onClick={close} className={row}>
              <span className="w-8 h-8 rounded-lg bg-navy-soft text-navy inline-flex items-center justify-center shrink-0"><Icon name="check" size={16} /></span>
              <span className="flex flex-col min-w-0"><b className={`text-[15px] truncate ${t.done ? 'line-through text-muted' : ''}`}>{t.title}</b>{t.due_at && <span className="text-xs text-muted">{new Date(t.due_at).toLocaleDateString('cs-CZ')}{t.done ? ' · splněno' : ''}</span>}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
