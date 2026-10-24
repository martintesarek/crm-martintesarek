// Obrazovka hovoru se Zuzankou – samotný hovor běží globálně (lib/zuzanka.tsx), takže
// uživatel může během hovoru přejít kamkoli v aplikaci a hovor pokračuje.
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Btn, Card } from '../components/ui'
import { Icon } from '../components/Icon'
import { AiChat } from '../components/AiChat'
import { ENGINES, VOICES, useZuzanka } from '../lib/zuzanka'

export function Assistant() {
  const nav = useNavigate()
  const z = useZuzanka()
  const { status, err, lines, speaking, working, muted, sms, setSms, engine, voice } = z
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [lines])
  const live = status === 'live'
  return (
    <div className="px-4 md:px-9 pt-11 md:pt-8 max-w-[900px] flex flex-col gap-4">
      <header className="flex items-center gap-2.5 min-h-[44px]">
        <h1 className="m-0 mr-auto text-[26px] md:text-[30px] font-extrabold tracking-tight">Věruška</h1>
        {live && <span className="inline-flex items-center gap-2 text-sm font-bold text-navy"><span className="w-2.5 h-2.5 rounded-full bg-[#2EB872] animate-pulse" />Hovor běží · {ENGINES.find((e) => e.key === engine)?.label}</span>}
      </header>

      <AiChat />

      <Card className="p-5 md:p-7 flex flex-col items-center gap-4 text-center">
        <div className={`w-28 h-28 rounded-full inline-flex items-center justify-center transition-all ${live ? (speaking ? 'bg-navy text-white scale-110 shadow-[0_0_0_14px_rgba(37,51,113,.12)]' : 'bg-gold text-ink shadow-[0_0_0_10px_rgba(203,153,46,.18)]') : 'bg-chip text-muted'}`}>
          <Icon name={speaking ? 'volume' : 'mic'} size={44} stroke={2} />
        </div>
        {status === 'idle' && <p className="m-0 text-sm text-muted max-w-md">Věruška zná vaše obchody, kontakty i úkoly. Zeptejte se, co je nového, kde to hoří, jak jsme na tom s konkrétním klientem – nebo řekněte, ať něco upraví. Během hovoru můžete procházet aplikaci – Věruška vidí, co máte otevřené.</p>}
        {status === 'connecting' && <p className="m-0 text-sm text-muted">Spojuji…</p>}
        {live && <p className="m-0 text-sm text-muted min-h-5">{working ? `${working}…` : speaking ? 'Mluví – klidně jí skočte do řeči' : muted ? 'Mikrofon vypnutý' : 'Poslouchám'}</p>}
        {status === 'ended' && <p className="m-0 text-sm text-muted">Hovor skončil.</p>}
        {err && <p className="m-0 text-sm font-semibold" style={{ color: '#A12E2A' }}>{err}</p>}
        {!live && status !== 'connecting' && (
          <div className="inline-flex rounded-full border border-line bg-white p-0.5">
            {ENGINES.map((e) => <button key={e.key} onClick={() => z.pickEngine(e.key)} aria-pressed={engine === e.key} title={e.note} className={`h-9 px-3.5 rounded-full text-sm font-bold whitespace-nowrap ${engine === e.key ? 'bg-navy text-white' : 'text-muted'}`}>{e.label}</button>)}
          </div>
        )}
        {!live && status !== 'connecting' && (
          <label className="flex items-center gap-2 text-xs font-bold text-muted">Hlas
            <select value={voice[engine]} onChange={(e) => z.pickVoice(e.target.value)} className="h-9 px-2.5 rounded-xl border border-line bg-white text-sm font-semibold text-ink">{VOICES[engine].map((v) => <option key={v} value={v}>{v}</option>)}</select>
          </label>
        )}
        <div className="flex gap-2 flex-wrap justify-center">
          {!live && status !== 'connecting' && <Btn onClick={z.start} icon="phone" className="h-14 px-7 text-base">{status === 'idle' ? 'Zavolat Věrušce' : 'Zavolat znovu'}</Btn>}
          {live && <Btn kind="ghost" onClick={z.toggleMute} icon="mic">{muted ? 'Zapnout mikrofon' : 'Ztlumit'}</Btn>}
          {live && <Btn kind="ghost" onClick={() => nav('/obchody')} icon="board">Procházet obchody</Btn>}
          {(live || status === 'connecting') && <Btn onClick={z.stop} icon="x" className="bg-[#D9534F]! h-12">Zavěsit</Btn>}
        </div>
      </Card>

      {sms && (
        <Card className="p-4 md:p-5 flex flex-col gap-3 border-2 border-gold">
          <div className="flex items-center gap-2"><Icon name="sms" size={18} /><b>Návrh SMS pro {sms.contact}</b>{sms.phone && <span className="text-sm text-muted">· {sms.phone}</span>}</div>
          <textarea value={sms.text} onChange={(e) => setSms({ ...sms, text: e.target.value })} rows={4} className="p-3.5 rounded-[14px] border border-line outline-none text-[15px]" />
          <div className="flex gap-2 flex-wrap">
            {sms.phone && <a href={`sms:${sms.phone.replace(/\s/g, '')}?&body=${encodeURIComponent(sms.text)}`} className="h-11 px-4 rounded-[14px] bg-navy text-white font-bold text-sm inline-flex items-center gap-2 no-underline"><Icon name="sms" size={16} />Otevřít v SMS</a>}
            <button onClick={() => navigator.clipboard.writeText(sms.text)} className="h-11 px-4 rounded-[14px] border border-line bg-white font-bold text-sm">Zkopírovat</button>
            <button onClick={() => setSms(null)} className="h-11 px-4 rounded-[14px] text-sm font-bold text-muted">Zahodit</button>
          </div>
        </Card>
      )}

      {lines.length > 0 && (
        <Card className="p-4 md:p-5">
          <b className="text-xs font-bold text-muted">Přepis hovoru</b>
          <div ref={listRef} className="mt-2 flex flex-col gap-2 max-h-[50vh] overflow-y-auto pr-1">
            {lines.map((l) => (
              <div key={l.id} className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-[15px] leading-snug ${l.who === 'ja' ? 'self-end bg-navy text-white rounded-br-md' : 'self-start bg-bg rounded-bl-md'}`}>{l.text}</div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
