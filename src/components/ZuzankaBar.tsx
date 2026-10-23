// Plovoucí lišta běžícího hovoru se Zuzankou – zobrazí se všude mimo obrazovku hovoru.
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { useZuzanka } from '../lib/zuzanka'

export function ZuzankaBar() {
  const z = useZuzanka()
  const loc = useLocation()
  const nav = useNavigate()
  if (z.status !== 'live' && z.status !== 'connecting') return null
  if (loc.pathname.startsWith('/asistent')) return null
  const label = z.status === 'connecting' ? 'Spojuji…' : z.working ? `${z.working}…` : z.speaking ? 'Věruška mluví' : z.muted ? 'Mikrofon vypnutý' : 'Věruška poslouchá'
  return (
    <div className="fixed left-3 right-3 bottom-[calc(80px+env(safe-area-inset-bottom))] md:left-auto md:right-6 md:bottom-6 md:w-[360px] z-50 rounded-2xl bg-navy text-white shadow-[0_10px_30px_rgba(27,31,69,.35)] flex items-center gap-3 px-3 py-2.5">
      <button onClick={() => nav('/asistent')} className={`w-10 h-10 rounded-full inline-flex items-center justify-center shrink-0 ${z.speaking ? 'bg-white text-navy' : 'bg-gold text-ink'}`} aria-label="Otevřít hovor">
        <Icon name={z.speaking ? 'volume' : 'mic'} size={20} />
      </button>
      <button onClick={() => nav('/asistent')} className="flex flex-col min-w-0 text-left mr-auto">
        <b className="text-sm truncate">{label}</b>
        <span className="text-[11px] opacity-70 truncate">{z.sms ? 'Návrh SMS čeká na obrazovce hovoru' : 'Hovor běží · klepnutím otevřete přepis'}</span>
      </button>
      <button onClick={z.toggleMute} aria-label={z.muted ? 'Zapnout mikrofon' : 'Ztlumit'} className={`w-10 h-10 rounded-xl inline-flex items-center justify-center ${z.muted ? 'bg-white/20' : 'hover:bg-white/10'}`}><Icon name="mic" size={18} /></button>
      <button onClick={z.stop} aria-label="Zavěsit" className="w-10 h-10 rounded-xl inline-flex items-center justify-center" style={{ background: '#D9534F' }}><Icon name="x" size={18} /></button>
    </div>
  )
}
