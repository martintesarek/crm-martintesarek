import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { useApp } from '../lib/app'
import { supabase } from '../lib/supabase'
import { Avatar } from './ui'

const NAV = [
  { to: '/', label: 'Dnes', icon: 'home', end: true },
  { to: '/obchody', label: 'Obchody', icon: 'board' },
  { to: '/kontakty', label: 'Kontakty', icon: 'user' },
  { to: '/nastaveni', label: 'Nastavení', icon: 'gear' },
]

export function Layout() {
  const { session, account } = useApp()
  const nav = useNavigate()
  const email = session?.user.email

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:flex w-[248px] shrink-0 flex-col gap-7 bg-white border-r border-line px-4 py-6 sticky top-0 h-screen">
        <img src="/logo.webp" alt="Martin Tesárek – profesionální realitní makléř" className="w-[200px] mx-2 mt-1" />
        <nav className="flex flex-col gap-0.5 text-sm font-semibold">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-[11px] rounded-xl no-underline ${isActive ? 'bg-navy-soft text-navy font-bold' : 'text-muted hover:bg-bg'}`}>
              <Icon name={n.icon} />{n.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={() => nav('/obchody/novy')} className="h-11 rounded-[14px] bg-navy text-white font-bold text-sm inline-flex items-center justify-center gap-2">
          <Icon name="plus" size={18} />Nový obchod
        </button>
        <div className="mt-auto flex items-center gap-2.5 p-3 rounded-[14px] bg-bg">
          <Avatar name={email} size={34} />
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

      <nav aria-label="Hlavní menu" className="md:hidden fixed left-3 right-3 bottom-4 h-[72px] bg-white border border-line rounded-3xl shadow-[0_8px_24px_rgba(27,31,69,.10)] grid grid-cols-5 items-center z-40 safe-bottom">
        {NAV.slice(0, 2).map((n) => <MobileLink key={n.to} {...n} />)}
        <button aria-label="Nový obchod" onClick={() => nav('/obchody/novy')} className="justify-self-center w-[52px] h-[52px] rounded-[18px] bg-gold text-ink inline-flex items-center justify-center">
          <Icon name="plus" size={24} stroke={2.6} />
        </button>
        {NAV.slice(2).map((n) => <MobileLink key={n.to} {...n} />)}
      </nav>
    </div>
  )
}

function MobileLink({ to, label, icon, end }: { to: string; label: string; icon: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-1 text-[11px] no-underline ${isActive ? 'text-navy font-bold' : 'text-muted font-semibold'}`}>
      <Icon name={icon} size={22} />{label}
    </NavLink>
  )
}
