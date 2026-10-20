import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/app'
import { primaryContact, useDeals } from '../lib/deals'
import { supabase } from '../lib/supabase'
import { BLOCKS, contactName, dateShort, daysSince } from '../lib/format'
import { Icon } from '../components/Icon'
import { Spinner, StagePill } from '../components/ui'

type TaskRow = { id: string; title: string; due_at: string | null; deal_id: string | null; deals: { title: string } | null }

const BLOCK_COLORS: Record<string, string> = { Akvizice: '#3FAE7A', Čekající: '#E8822F', Smlouva: '#6FC08F', Prodej: '#8C8AE8', Uzavření: '#5B9BF0', 'Po prodeji': '#CB992E' }

export function Today() {
  const { account, stages, stageById, session } = useApp()
  const { deals, loading } = useDeals(account?.id)
  const [tasks, setTasks] = useState<TaskRow[]>([])

  useEffect(() => {
    if (!account) return
    supabase.from('tasks').select('id, title, due_at, deal_id, deals(title)').eq('account_id', account.id).eq('done', false)
      .not('due_at', 'is', null).lte('due_at', new Date(Date.now() + 2 * 86_400_000).toISOString()).order('due_at').limit(20)
      .then(({ data }) => setTasks((data as unknown as TaskRow[]) || []))
  }, [account])

  const open = useMemo(() => deals.filter((d) => stageById(d.stage_id)?.kind === 'open'), [deals, stageById])
  const counts = BLOCKS.slice(0, 6).map((b) => ({ b, n: open.filter((d) => stageById(d.stage_id)?.block === b).length }))

  const now = Date.now()
  const upcoming = open.filter((d) => d.next_step_at && new Date(d.next_step_at).getTime() < now + 3 * 86_400_000)
    .sort((a, b) => +new Date(a.next_step_at!) - +new Date(b.next_step_at!))
  const stale = open.filter((d) => {
    const s = stageById(d.stage_id)
    return s && ['Čekající', 'Akvizice'].includes(s.block) && daysSince(d.stage_changed_at) >= 21 && !d.next_step_at
  }).sort((a, b) => +new Date(a.stage_changed_at) - +new Date(b.stage_changed_at)).slice(0, 8)

  const hour = new Date().getHours()
  const hello = hour < 10 ? 'Dobré ráno' : hour < 18 ? 'Dobrý den' : 'Dobrý večer'
  const name = session?.user.email?.startsWith('reality@') ? 'Martine' : ''

  return (
    <div className="px-4 md:px-9 pt-11 md:pt-8 max-w-[1100px] flex flex-col gap-4 md:gap-5">
      <header className="flex items-center gap-3">
        <img src="/icons/icon-192.png" alt="" className="md:hidden w-10 h-10 rounded-lg" />
        <div className="flex flex-col">
          <span className="text-[13px] text-muted">{new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h1 className="m-0 text-xl md:text-[28px] font-extrabold tracking-tight">{hello}{name ? `, ${name}` : ''}</h1>
        </div>
      </header>

      {loading ? <Spinner /> : (
        <>
          <section aria-label="Pipeline" className="bg-navy text-white rounded-[22px] p-5 flex flex-col gap-3.5">
            <div className="flex items-baseline gap-2"><span className="text-[34px] font-extrabold tracking-tight">{open.length}</span><span className="text-sm text-[#D3D7EE]">aktivních obchodů</span></div>
            <div className="flex h-2.5 rounded-md overflow-hidden gap-0.5" aria-hidden="true">
              {counts.filter((c) => c.n).map((c) => <span key={c.b} style={{ flex: c.n, background: BLOCK_COLORS[c.b] }} />)}
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-x-2 gap-y-2.5 text-xs text-[#D3D7EE]">
              {counts.map((c) => (
                <Link key={c.b} to={`/obchody?b=${encodeURIComponent(c.b)}`} className="no-underline text-[#D3D7EE]"><b className="text-white text-[15px]">{c.n}</b> {c.b}</Link>
              ))}
            </div>
          </section>

          <div className="grid md:grid-cols-2 gap-4 md:gap-5 items-start">
            <section className="flex flex-col gap-2.5">
              <h2 className="m-0 text-[17px] font-extrabold">Další kroky a úkoly</h2>
              {upcoming.length === 0 && tasks.length === 0 && <p className="m-0 text-sm text-muted bg-white border border-line rounded-[18px] p-4">Na nejbližší dny nic naplánováno.</p>}
              {upcoming.map((d) => (
                <Link key={d.id} to={`/obchody/${d.id}`} className="flex gap-3 items-center bg-white border border-line rounded-[18px] p-3.5 no-underline text-ink">
                  <span className="w-[58px] shrink-0 text-center font-extrabold text-sm leading-tight">
                    {dateShort(d.next_step_at)}<br /><span className="text-xs text-muted font-bold">{new Date(d.next_step_at!).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                  <span className="w-[3px] self-stretch rounded" style={{ background: stageById(d.stage_id)?.color }} />
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-bold text-[15px] truncate">{d.next_step || 'Další krok'}</span>
                    <span className="text-[13px] text-muted truncate">{d.title}{contactName(primaryContact(d)) ? ' · ' + contactName(primaryContact(d)) : ''}</span>
                  </span>
                </Link>
              ))}
              {tasks.map((t) => (
                <Link key={t.id} to={t.deal_id ? `/obchody/${t.deal_id}` : '#'} className="flex gap-3 items-center bg-white border border-line rounded-[18px] p-3.5 no-underline text-ink">
                  <span className="w-10 h-10 rounded-xl bg-navy-soft text-navy inline-flex items-center justify-center shrink-0"><Icon name="tasks" size={18} /></span>
                  <span className="flex flex-col min-w-0"><b className="text-[15px] truncate">{t.title}</b><span className="text-[13px] text-muted truncate">{dateShort(t.due_at)} · {t.deals?.title}</span></span>
                </Link>
              ))}
            </section>

            <section className="flex flex-col gap-2.5">
              <h2 className="m-0 text-[17px] font-extrabold">Potřebuje pozornost</h2>
              {stale.length === 0 && <p className="m-0 text-sm text-muted bg-white border border-line rounded-[18px] p-4">Všechno je pod kontrolou.</p>}
              {stale.map((d) => (
                <Link key={d.id} to={`/obchody/${d.id}`} className="flex gap-3 items-center bg-white border border-line rounded-[18px] p-3.5 no-underline text-ink">
                  <span className="w-10 h-10 rounded-xl bg-[#FDEEE6] text-[#B4471C] inline-flex items-center justify-center shrink-0"><Icon name="clock" size={20} /></span>
                  <span className="flex flex-col gap-1 min-w-0 mr-auto">
                    <b className="text-[15px] truncate">{d.title}</b>
                    <span className="flex items-center gap-2 text-[13px] text-muted"><StagePill stage={stageById(d.stage_id)} size="sm" />{daysSince(d.stage_changed_at)} dní</span>
                  </span>
                </Link>
              ))}
              {stages.length > 0 && stale.length > 0 && <p className="m-0 text-xs text-muted">Obchody v akvizici a čekající déle než 3 týdny bez naplánovaného dalšího kroku.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
