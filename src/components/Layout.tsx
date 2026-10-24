import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { useApp } from '../lib/app'
import { supabase } from '../lib/supabase'
import { Avatar } from './ui'
import { VoiceNoteHost, openVoiceNote } from './VoiceNote'
import { ZuzankaProvider } from '../lib/zuzanka'
import { ZuzankaBar } from './ZuzankaBar'

const NAV = [
  { to: '/', label: 'Nástěnka', icon: 'grid', end: true },
  { to: '/obchody', label: 'Nemovitosti', icon: 'house' },
  { to: '/kontakty', label: 'Kontakty', icon: 'user' },
  { to: '/asistent', label: 'Věruška', icon: 'phone' },
  { to: '/nastaveni', label: 'Nastavení', icon: 'gear' },
]

export function Layout() {
  const { session, account, members } = useApp()
  const nav = useNavigate()
  const email = session?.user.email
  const loc = useLocation()
  async function newContact() {
    if (!account) return
    const { data } = await supabase.from('contacts').insert({ country: 'Česká republika', account_id: account.id, first_name: 'Nový', last_name: 'kontakt' }).select().single()
    if (data) nav(`/kontakty/${data.id}`)
  }
  // počet nepřečtených změn v katastru (červený zvoneček u Hlídače)
  const [unseen, setUnseen] = useState(0)
  const [seenTick, setSeenTick] = useState(0)
  useEffect(() => { const h = () => setSeenTick((x) => x + 1); window.addEventListener('cadastre-seen', h); return () => window.removeEventListener('cadastre-seen', h) }, [])
  const [unreadSms, setUnreadSms] = useState(0)
  useEffect(() => { const h = () => setSeenTick((x) => x + 1); window.addEventListener('sms-seen', h); return () => window.removeEventListener('sms-seen', h) }, [])
  useEffect(() => {
    let off = false
    const load = () => supabase.from('sms_replies').select('id', { count: 'exact', head: true }).eq('seen', false).then(({ count }) => { if (!off) setUnreadSms(count || 0) })
    load()
    // nové odpovědi se ukážou i bez obnovení stránky (každých 20 s a po návratu do aplikace)
    const iv = setInterval(load, 20000)
    const vis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', vis)
    return () => { off = true; clearInterval(iv); document.removeEventListener('visibilitychange', vis) }
  }, [loc.pathname, seenTick])
  useEffect(() => {
    let off = false
    Promise.all([
      supabase.from('cadastre_changes').select('id', { count: 'exact', head: true }).eq('seen', false),
      supabase.from('cadastre_watch').select('id', { count: 'exact', head: true }).not('error', 'is', null).eq('active', true),
    ]).then(([a, b]) => { if (!off) setUnseen((a.count || 0) + (b.count || 0)) })
    return () => { off = true }
  }, [loc.pathname, seenTick])

  return (
    <ZuzankaProvider>
    <div className="min-h-screen md:flex">
      <aside className="hidden md:flex w-[248px] shrink-0 flex-col gap-7 bg-white border-r border-line px-4 py-6 sticky top-0 h-screen">
        <img src="/logo.webp" alt="Martin Tesárek – profesionální realitní makléř" className="w-[200px] mx-2 mt-1" />
        <nav className="flex flex-col gap-0.5 text-sm font-semibold">
          {[...NAV.slice(0, 4), { to: '/hlidac', label: 'Hlídač katastru', icon: 'pin', end: false }, ...NAV.slice(4)].map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-[11px] rounded-xl no-underline ${isActive ? 'bg-navy-soft text-navy font-bold' : 'text-muted hover:bg-bg'}`}>
              <Icon name={n.icon} />{n.label}
              {n.to === '/' && unreadSms > 0 && (
                <span className="ml-auto relative inline-flex text-[#D92D20]" aria-label={`Nové odpovědi na SMS: ${unreadSms}`}>
                  <Icon name="bell" size={20} stroke={2} />
                  <b className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#D92D20] text-white text-[11px] leading-[18px] text-center font-extrabold">{unreadSms}</b>
                </span>
              )}
              {n.to === '/hlidac' && unseen > 0 && (
                <span className="ml-auto relative inline-flex text-[#D92D20]" aria-label={`Změny nebo chyby v katastru: ${unseen}`}>
                  <Icon name="bell" size={20} stroke={2} />
                  <b className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#D92D20] text-white text-[11px] leading-[18px] text-center font-extrabold">{unseen}</b>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-col gap-2">
          <button onClick={() => nav('/obchody/novy')} className="h-11 rounded-[14px] bg-navy text-white font-bold text-sm inline-flex items-center justify-center gap-2">
            <Icon name="plus" size={18} />Nový obchod
          </button>
          <button onClick={newContact} className="h-11 rounded-[14px] bg-white border border-line text-navy font-bold text-sm inline-flex items-center justify-center gap-2">
            <Icon name="plus" size={18} />Nový kontakt
          </button>
          <button onClick={() => openVoiceNote()} className="h-11 rounded-[14px] bg-gold-soft text-gold-ink font-bold text-sm inline-flex items-center justify-center gap-2">
            <Icon name="mic" size={18} />Hlasová poznámka
          </button>
        </div>
        <div className="mt-auto flex items-center gap-2.5 p-3 rounded-[14px] bg-bg">
          <Avatar name={members.find((m) => m.user_id === session?.user.id)?.profiles?.full_name || email} size={34} />
          <div className="flex flex-col min-w-0 mr-auto">
            <b className="text-[13px] truncate">{account?.name?.split(' –')[0]}</b>
            <span className="text-xs text-muted truncate">{email}</span>
          </div>
          <button aria-label="Odhlásit" title="Odhlásit" onClick={() => supabase.auth.signOut()} className="w-9 h-9 rounded-lg text-muted hover:bg-white inline-flex items-center justify-center">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 pb-28 md:pb-10">
        <Outlet />
      </main>
      <VoiceNoteHost />
      <ZuzankaBar />

      <nav aria-label="Hlavní menu" className="md:hidden fixed left-0 right-0 bottom-0 pt-2 px-2 bg-white/95 backdrop-blur border-t border-line-soft grid grid-cols-6 items-center z-40" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        {NAV.slice(0, 2).map((n) => <MobileLink key={n.to} {...n} dot={n.to === '/' && unreadSms > 0} />)}
        <button aria-label="Hlasová poznámka" onClick={() => openVoiceNote()} className="justify-self-center w-[52px] h-[52px] rounded-full bg-gold text-ink inline-flex items-center justify-center">
          <Icon name="mic" size={24} stroke={2.2} />
        </button>
        {NAV.slice(2).map((n) => <MobileLink key={n.to} {...n} dot={(n.to === '/nastaveni' && unseen > 0)} />)}
      </nav>
    </div>
    </ZuzankaProvider>
  )
}

function MobileLink({ to, label, icon, end, dot }: { to: string; label: string; icon: string; end?: boolean; dot?: boolean }) {
  return (
    <NavLink to={to} end={end} aria-label={label} title={label} className={({ isActive }) => `h-[52px] flex flex-col items-center justify-center gap-1.5 no-underline ${isActive ? 'text-ink' : 'text-[#8A90A8]'}`}>
      {({ isActive }) => (
        <>
          <span className="relative inline-flex"><Icon name={icon} size={24} stroke={isActive ? 2.1 : 1.8} />{dot && <span className="absolute -top-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-[#D92D20]" />}</span>
          <span className={`w-1 h-1 rounded-full ${isActive ? 'bg-ink' : 'bg-transparent'}`} />
        </>
      )}
    </NavLink>
  )
}
