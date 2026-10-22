import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { AppProvider, useApp } from './lib/app'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { supabase } from './lib/supabase'
import { Login } from './pages/Login'
import { Today } from './pages/Today'
import { Deals } from './pages/Deals'
import { DealDetail } from './pages/DealDetail'
import { Intake } from './pages/Intake'
import { NewDeal } from './pages/NewDeal'
import { Contacts, ContactDetail } from './pages/Contacts'
import { Settings } from './pages/Settings'
import { Assistant } from './pages/Assistant'
import { Portal } from './pages/Portal'
import { MfaChallenge } from './components/Mfa'

function Gate() {
  const { session, loading, account } = useApp()
  const [aal, setAal] = useState<'checking' | 'ok' | 'need'>('checking')
  useEffect(() => {
    if (!session) { setAal('checking'); return }
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => setAal(data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2' ? 'need' : 'ok'))
  }, [session])
  if (loading) return <Spinner />
  if (!session) return <Login />
  if (aal === 'checking') return <Spinner />
  if (aal === 'need') return <MfaChallenge onDone={() => setAal('ok')} />
  if (!account) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm bg-white border border-line rounded-3xl p-7 flex flex-col gap-3">
          <img src="/logo.webp" alt="Martin Tesárek" className="w-52" />
          <h1 className="m-0 text-xl font-extrabold">Účet zatím nemá přístup</h1>
          <p className="m-0 text-sm text-muted">E-mail {session.user.email} není pozvaný do žádného CRM. Požádejte vlastníka účtu o pozvánku.</p>
          <button onClick={() => supabase.auth.signOut()} className="h-11 rounded-[14px] bg-navy text-white font-bold">Odhlásit</button>
        </div>
      </div>
    )
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Today />} />
        <Route path="obchody" element={<Deals />} />
        <Route path="obchody/novy" element={<NewDeal />} />
        <Route path="obchody/:id" element={<DealDetail />} />
        <Route path="obchody/:id/nabor" element={<Intake />} />
        <Route path="kontakty" element={<Contacts />} />
        <Route path="kontakty/:id" element={<ContactDetail />} />
        <Route path="asistent" element={<Assistant />} />
        <Route path="nastaveni" element={<Settings />} />
        <Route path="*" element={<Today />} />
      </Route>
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/p/:token" element={<Portal />} />
        <Route path="*" element={<AppProvider><Gate /></AppProvider>} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
