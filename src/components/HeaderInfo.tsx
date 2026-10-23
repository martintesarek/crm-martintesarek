import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// WMO kód počasí → ikonka a popis
function wx(code: number): [string, string] {
  if (code === 0) return ['☀️', 'jasno']
  if (code === 1) return ['🌤️', 'skoro jasno']
  if (code === 2) return ['⛅', 'polojasno']
  if (code === 3) return ['☁️', 'zataženo']
  if (code === 45 || code === 48) return ['🌫️', 'mlha']
  if (code >= 51 && code <= 57) return ['🌦️', 'mrholení']
  if ((code >= 61 && code <= 65) || code === 80 || code === 81 || code === 82) return ['🌧️', 'déšť']
  if (code === 66 || code === 67) return ['🌧️', 'mrznoucí déšť']
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['❄️', 'sníh']
  if (code >= 95) return ['⛈️', 'bouřka']
  return ['☁️', '']
}

/** Svátek dnes (jen jméno) a aktuální počasí ve Valticích do horní lišty nástěnky. */
export function HeaderInfo() {
  const [names, setNames] = useState('')
  const [w, setW] = useState<{ t: number; code: number } | null>(null)

  useEffect(() => {
    const d = new Date()
    const mmdd = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    supabase.from('name_days').select('name').eq('mmdd', mmdd).then(({ data }) => setNames((data || []).map((x: { name: string }) => x.name).join(', ')))
    fetch('https://api.open-meteo.com/v1/forecast?latitude=48.7404&longitude=16.7561&current=temperature_2m,weather_code&timezone=Europe%2FPrague')
      .then((r) => r.json()).then((j) => { if (j?.current) setW({ t: Math.round(j.current.temperature_2m), code: j.current.weather_code }) }).catch(() => {})
  }, [])

  const [icon, label] = w ? wx(w.code) : ['', '']
  return (
    <div className="hidden md:flex items-center gap-4 text-[13px] text-muted">
      {names && <span>Svátek má <b className="text-ink">{names}</b></span>}
      {w && <span title={`Valtice: ${label}`} className="inline-flex items-center gap-1.5"><span className="text-lg leading-none">{icon}</span><b className="text-ink">{w.t} °C</b> Valtice</span>}
    </div>
  )
}
