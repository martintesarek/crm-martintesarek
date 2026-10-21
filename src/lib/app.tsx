import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { FieldDef, Member, Stage } from './types'

type Account = { id: string; name: string; slug: string }

type AppState = {
  session: Session | null
  loading: boolean
  account: Account | null
  role: string | null
  stages: Stage[]
  fields: FieldDef[]
  members: Member[]
  reloadMeta: () => Promise<void>
  stageById: (id: string | null | undefined) => Stage | undefined
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [metaLoading, setMetaLoading] = useState(false)
  const [account, setAccount] = useState<Account | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [fields, setFields] = useState<FieldDef[]>([])
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // automatické odhlášení po neaktivitě (4 hodiny)
  useEffect(() => {
    if (!session) return
    const IDLE_MS = 4 * 3600_000
    const KEY = 'crm_last_active'
    const read = () => { try { return Number(localStorage.getItem(KEY)) || Date.now() } catch { return Date.now() } }
    const touch = () => { try { localStorage.setItem(KEY, String(Date.now())) } catch { /* */ } }
    const check = () => { if (Date.now() - read() > IDLE_MS) { try { localStorage.removeItem(KEY) } catch { /* */ } supabase.auth.signOut() } }
    check()
    touch()
    let last = 0
    const onAct = () => { const n = Date.now(); if (n - last > 15_000) { last = n; touch() } }
    const evs = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const
    evs.forEach((e) => window.addEventListener(e, onAct, { passive: true }))
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    const t = setInterval(check, 60_000)
    return () => { evs.forEach((e) => window.removeEventListener(e, onAct)); document.removeEventListener('visibilitychange', onVis); clearInterval(t) }
  }, [session])

  const reloadMeta = useCallback(async () => {
    if (!session) return
    setMetaLoading(true)
    const { data: ms } = await supabase.from('memberships').select('account_id, role, accounts(id, name, slug)').eq('user_id', session.user.id).limit(1)
    const m = ms?.[0] as unknown as { account_id: string; role: string; accounts: Account } | undefined
    if (!m) { setAccount(null); setMetaLoading(false); return }
    setAccount(m.accounts); setRole(m.role)
    const [st, fd, mem] = await Promise.all([
      supabase.from('stages').select('*').eq('account_id', m.account_id).order('position'),
      supabase.from('field_defs').select('*').eq('account_id', m.account_id).order('position'),
      supabase.from('memberships').select('user_id, role, profiles:user_id(full_name, email)').eq('account_id', m.account_id),
    ])
    setStages((st.data as Stage[]) || [])
    setFields((fd.data as FieldDef[]) || [])
    setMembers((mem.data as unknown as Member[]) || [])
    setMetaLoading(false)
  }, [session])

  useEffect(() => { reloadMeta() }, [reloadMeta])

  const stageById = useCallback((id: string | null | undefined) => stages.find((s) => s.id === id), [stages])

  return (
    <Ctx.Provider value={{ session, loading: !ready || metaLoading, account, role, stages, fields, members, reloadMeta, stageById }}>
      {children}
    </Ctx.Provider>
  )
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside provider')
  return v
}
