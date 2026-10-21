// Živý hlasový asistent: hovor s AI nad daty CRM (Gemini Live). Mluví se česky,
// uživatel může kdykoli skočit do řeči. Data čte přes assistantTools (v prohlížeči, pod RLS).
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleGenAI, Modality, StartSensitivity, EndSensitivity, type LiveServerMessage, type Session } from '@google/genai'
import { useApp } from '../lib/app'
import { SUPABASE_URL, SUPABASE_KEY } from '../lib/supabase'
import { Btn, Card } from '../components/ui'
import { Icon } from '../components/Icon'
import { TOOL_DECLS, runTool, type ToolCtx } from '../lib/assistantTools'

type Line = { who: 'ja' | 'asistent'; text: string; id: number }
type Status = 'idle' | 'connecting' | 'live' | 'ended' | 'error'
type SmsDraft = { contact: string; phone: string | null; text: string }
type Engine = 'openai' | 'gemini'
const ENGINES: { key: Engine; label: string; note: string }[] = [
  { key: 'openai', label: 'OpenAI gpt‑realtime‑2', note: 'nejchytřejší, nejlepší čeština' },
  { key: 'gemini', label: 'Gemini 3.8 Live', note: 'rychlý a levný' },
]
/** Deklarace funkcí ve formátu OpenAI Realtime (ploché objekty). */
function openaiTools() {
  return TOOL_DECLS.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters ? JSON.parse(JSON.stringify(t.parameters).replace(/"OBJECT"/g, '"object"').replace(/"STRING"/g, '"string"').replace(/"NUMBER"/g, '"number"').replace(/"BOOLEAN"/g, '"boolean"')) : { type: 'object', properties: {} } }))
}

const IN_RATE = 16000
const OUT_RATE = 24000

/** AudioWorklet: převede mikrofon na 16 kHz PCM16 a posílá kousky po ~100 ms. */
const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.len = 0; this.ratio = sampleRate / ${IN_RATE}; this.acc = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]; if (!ch) return true
    const out = []
    for (let i = 0; i < ch.length; i++) { this.acc += 1; if (this.acc >= this.ratio) { this.acc -= this.ratio; out.push(ch[i]) } }
    if (out.length) { this.buf.push(Float32Array.from(out)); this.len += out.length }
    if (this.len >= ${IN_RATE / 10}) {
      const all = new Int16Array(this.len); let o = 0
      for (const b of this.buf) for (let i = 0; i < b.length; i++) { const s = Math.max(-1, Math.min(1, b[i])); all[o++] = s < 0 ? s * 0x8000 : s * 0x7fff }
      let e = 0; for (let i = 0; i < all.length; i++) e += (all[i] / 32768) ** 2
      this.port.postMessage({ pcm: all.buffer, rms: Math.sqrt(e / all.length) }, [all.buffer]); this.buf = []; this.len = 0
    }
    return true
  }
}
registerProcessor('pcm-capture', PcmCapture)`

const b64 = (buf: ArrayBuffer) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }
const unb64 = (s: string) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer }

function systemPrompt(name: string, stages: string[]) {
  const d = new Date()
  return `Jsi Zuzanka, hlasová asistentka realitního makléře ${name} v jeho CRM. Jsi žena – o sobě mluv vždy v ženském rodě ("udělala jsem", "našla jsem", "přesunula jsem"). Když se zeptá, jak se jmenuješ, jsi Zuzanka. Dnes je ${d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}.
Uživatel mluví vždy česky – i nezřetelné nebo krátké útržky chápej jako češtinu, nikdy nepřepínej do jiného jazyka. Mluv VÝHRADNĚ česky, přirozeně a stručně – jako zkušená asistentka v hovoru, ne jako výpis tabulky. Uživateli tykej a oslovuj ho Martine.
Veď dialog, ne monolog: mluv v krátkých větách, po jedné dvou větách udělej pauzu nebo se zeptej, ať může reagovat. Když tě přeruší, okamžitě přestaň a reaguj na to, co řekl. Detaily doplň, až když se zeptá. Čísla říkej po česku (např. "čtyři sta tisíc korun", "sedmnáctého května").
Vždy pracuj se skutečnými daty z CRM pomocí funkcí – nic si nevymýšlej. Když nevíš, zavolej funkci. Když něco nenajdeš, řekni to.
Měj vlastní názor: upozorni, co spěchá, co stojí, kde hrozí, že klient vychladne, a co bys udělala jako první.
Fáze obchodů v pořadí: ${stages.join(' → ')}.
Máš plné pravomoci v CRM: měníš fáze obchodů, upravuješ údaje obchodů i kontaktů, zakládáš obchody, kontakty a úkoly, propojuješ kontakty s obchody, přidáváš poznámky. Když uživatel dá jasný pokyn ("přesuň Zahradníčka do Nerealizováno", "dej tam nabídku 5,2 milionu", "zapiš k Novákovi, že chce prodat až na jaře"), PROVEĎ ho hned příslušnou funkcí a pak krátce potvrď, co jsi udělala. Ptej se jen, když je pokyn nejednoznačný (víc obchodů stejného jména, chybí důležitý údaj). Nikdy neříkej, že něco nemůžeš udělat v systému, dokud jsi nezkusila funkci. Když funkce vrátí chybu, řekni ji a nabídni, co dál.
SMS nikdy neodesíláš, jen připravíš návrh (funkce navrh_sms); u SMS respektuj vykání/tykání a oslovení kontaktu, podpis "Martin Tesárek".
Rodná čísla nikdy neříkej ani nehledej.
Na začátku hovoru se krátce představ jako Zuzanka jednou větou a zeptej se, co potřebuje – nebo pokud řekne "co je nového", rovnou zavolej prehled.`
}

export function Assistant() {
  const { account, session, stages } = useApp()
  const nav = useNavigate()
  const [status, setStatus] = useState<Status>('idle')
  const [err, setErr] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [working, setWorking] = useState('')
  const [sms, setSms] = useState<SmsDraft | null>(null)
  const [muted, setMuted] = useState(false)
  const [engine, setEngine] = useState<Engine>(() => { try { return (localStorage.getItem('zuzanka_engine') as Engine) || 'openai' } catch { return 'openai' } })
  const pc = useRef<RTCPeerConnection | null>(null)
  const dc = useRef<RTCDataChannel | null>(null)
  const audioEl = useRef<HTMLAudioElement | null>(null)
  const oaOut = useRef('')
  const sessionRef = useRef<Session | null>(null)
  const inCtx = useRef<AudioContext | null>(null)
  const outCtx = useRef<AudioContext | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const playAt = useRef(0)
  const sources = useRef<AudioBufferSourceNode[]>([])
  const mutedRef = useRef(false)
  const speakingRef = useRef(false)
  const noise = useRef(0.01) // adaptivní odhad hluku pozadí
  const loudSince = useRef(0)
  const partial = useRef<{ ja: string; asistent: string }>({ ja: '', asistent: '' })
  const lineId = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => { stop() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [lines])

  function appendPartial(who: 'ja' | 'asistent', text: string) {
    if (text) partial.current[who] += text
    setLines((l) => {
      const last = l[l.length - 1]
      if (last && last.id === -1 - (who === 'ja' ? 0 : 1)) return [...l.slice(0, -1), { ...last, text: partial.current[who] }]
      return [...l, { who, text: partial.current[who], id: -1 - (who === 'ja' ? 0 : 1) }]
    })
  }
  function finalize(who: 'ja' | 'asistent') {
    const t = partial.current[who].trim(); partial.current[who] = ''
    setLines((l) => { const rest = l.filter((x) => x.id !== -1 - (who === 'ja' ? 0 : 1)); return t ? [...rest, { who, text: t, id: ++lineId.current }] : rest })
  }

  function stopPlayback() {
    for (const s of sources.current) { try { s.stop() } catch { /* už dohrál */ } }
    sources.current = []; playAt.current = 0; speakingRef.current = false; setSpeaking(false)
  }
  function playChunk(data: string) {
    const ctx = outCtx.current; if (!ctx) return
    const pcm = new Int16Array(unb64(data))
    const f32 = new Float32Array(pcm.length); for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 0x8000
    const buf = ctx.createBuffer(1, f32.length, OUT_RATE); buf.copyToChannel(f32, 0)
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination)
    const start = Math.max(ctx.currentTime + 0.02, playAt.current)
    src.start(start); playAt.current = start + buf.duration
    sources.current.push(src); speakingRef.current = true; setSpeaking(true)
    src.onended = () => { sources.current = sources.current.filter((x) => x !== src); if (!sources.current.length) { setSpeaking(false); setTimeout(() => { if (!sources.current.length) speakingRef.current = false }, 350) } }
  }

  async function onMessage(msg: LiveServerMessage, ctx: ToolCtx) {
    const sc = msg.serverContent
    if (sc?.interrupted) { stopPlayback(); finalize('asistent') }
    if (sc?.inputTranscription?.text) { finalize('asistent'); appendPartial('ja', sc.inputTranscription.text) }
    if (sc?.outputTranscription?.text) { if (partial.current.ja) finalize('ja'); appendPartial('asistent', sc.outputTranscription.text) }
    for (const p of sc?.modelTurn?.parts || []) if (p.inlineData?.data) playChunk(p.inlineData.data)
    if (sc?.turnComplete) { finalize('ja'); finalize('asistent') }
    if (msg.toolCall?.functionCalls?.length) {
      const responses = []
      for (const fc of msg.toolCall.functionCalls) {
        setWorking(labelOf(fc.name || ''))
        let result: unknown
        try { result = await runTool(fc.name || '', (fc.args || {}) as Record<string, unknown>, ctx) } catch (e) { result = { chyba: String(e) } }
        responses.push({ id: fc.id, name: fc.name, response: { result } })
      }
      setWorking('')
      sessionRef.current?.sendToolResponse({ functionResponses: responses })
    }
    if (msg.goAway) setErr('Hovor se blíží ke konci (limit 15 minut).')
  }

  function pickEngine(e: Engine) { setEngine(e); try { localStorage.setItem('zuzanka_engine', e) } catch { /* ignore */ } }

  async function start() {
    if (!account || !session) return
    setErr(''); setLines([]); setSms(null); setStatus('connecting')
    if (engine === 'openai') return startOpenAI()
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/live-token`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: '{}' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data?.token) throw new Error(data?.error || `Nepodařilo se získat přístup (${r.status}).`)
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      outCtx.current = new AudioContext({ sampleRate: OUT_RATE })
      inCtx.current = new AudioContext()
      await outCtx.current.resume(); await inCtx.current.resume()

      const ctx: ToolCtx = { accountId: account.id, userId: session.user.id, stages: stages.filter((s) => !s.hidden), onSmsDraft: setSms, onNavigate: (p) => window.open(p, '_blank') }
      const ai = new GoogleGenAI({ apiKey: data.token, httpOptions: { apiVersion: 'v1beta' } })
      const name = (session.user.user_metadata?.full_name as string) || 'Martina Tesárka'
      const s = await ai.live.connect({
        model: data.model || 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemPrompt(name, ctx.stages.map((x) => x.name)),
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
          inputAudioTranscription: {}, outputAudioTranscription: {},
          tools: [{ functionDeclarations: TOOL_DECLS }],
          realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH, endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW, silenceDurationMs: 700, prefixPaddingMs: 150 } },
        },
        callbacks: {
          onopen: () => setStatus('live'),
          onmessage: (m) => { onMessage(m, ctx) },
          onerror: (e) => { setErr('Chyba spojení: ' + (e?.message || '')); setStatus('error') },
          onclose: (e) => { setStatus((st) => (st === 'error' ? st : 'ended')); if (e?.reason && !/user/i.test(e.reason)) setErr((x) => x || e.reason); cleanupAudio() },
        },
      })
      sessionRef.current = s

      const ic = inCtx.current
      await ic.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })))
      const srcNode = ic.createMediaStreamSource(stream.current)
      const node = new AudioWorkletNode(ic, 'pcm-capture')
      node.port.onmessage = (ev) => {
        if (mutedRef.current || !sessionRef.current) return
        const { pcm, rms } = ev.data as { pcm: ArrayBuffer; rms: number }
        // Skok do řeči: když uživatel začne mluvit (hlasitost výrazně nad hlukem pozadí), její hlas okamžitě utichne
        // a nečeká se na server. Hluk pozadí se průběžně učí z tichých úseků.
        if (!speakingRef.current || rms < noise.current * 2) noise.current = noise.current * 0.95 + rms * 0.05
        if (speakingRef.current) {
          if (rms > Math.max(0.035, noise.current * 4)) { if (!loudSince.current) loudSince.current = Date.now(); else if (Date.now() - loudSince.current > 180) { stopPlayback(); loudSince.current = 0 } }
          else loudSince.current = 0
        } else loudSince.current = 0
        sessionRef.current.sendRealtimeInput({ audio: { data: b64(pcm), mimeType: `audio/pcm;rate=${IN_RATE}` } })
      }
      srcNode.connect(node)
      // pozdrav na úvod
      s.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Hovor začal. Krátce se pozdrav.' }] }], turnComplete: true })
    } catch (e) {
      setErr((e as Error).message || String(e)); setStatus('error'); cleanupAudio()
    }
  }

  /** Zuzanka přes OpenAI Realtime (WebRTC) – přerušování i hlas řeší OpenAI, my jen funkce a přepis. */
  async function startOpenAI() {
    if (!account || !session) return
    try {
      const ctx: ToolCtx = { accountId: account.id, userId: session.user.id, stages: stages.filter((s) => !s.hidden), onSmsDraft: setSms, onNavigate: (p) => window.open(p, '_blank') }
      const name = (session.user.user_metadata?.full_name as string) || 'Martina Tesárka'
      const sessionCfg = {
        instructions: systemPrompt(name, ctx.stages.map((x) => x.name)),
        output_modalities: ['audio'],
        audio: { input: { transcription: { model: 'gpt-4o-transcribe', language: 'cs' }, turn_detection: { type: 'semantic_vad', eagerness: 'medium', interrupt_response: true, create_response: true } }, output: { voice: 'marin' } },
        tools: openaiTools(), tool_choice: 'auto',
      }
      const r = await fetch(`${SUPABASE_URL}/functions/v1/openai-realtime-token`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ session: sessionCfg }) })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data?.token) throw new Error(data?.error || `Nepodařilo se získat přístup (${r.status}).`)

      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      const peer = new RTCPeerConnection()
      pc.current = peer
      const el = audioEl.current || new Audio(); el.autoplay = true; audioEl.current = el
      peer.ontrack = (ev) => { el.srcObject = ev.streams[0]; el.play().catch(() => {}) }
      for (const t of stream.current.getTracks()) peer.addTrack(t, stream.current)
      const ch = peer.createDataChannel('oai-events')
      dc.current = ch
      ch.onopen = () => { setStatus('live'); ch.send(JSON.stringify({ type: 'response.create', response: { instructions: 'Hovor začal. Krátce se představ jako Zuzanka a zeptej se, co Martin potřebuje.' } })) }
      ch.onclose = () => { setStatus((st) => (st === 'error' ? st : 'ended')); cleanupAudio() }
      ch.onmessage = (ev) => { try { onOpenAIEvent(JSON.parse(ev.data), ctx) } catch (e) { console.warn(e) } }
      peer.onconnectionstatechange = () => { if (peer.connectionState === 'failed') { setErr('Spojení se nezdařilo.'); setStatus('error'); cleanupAudio() } }

      const offer = await peer.createOffer(); await peer.setLocalDescription(offer)
      const sdp = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(data.model || 'gpt-realtime-2')}`, { method: 'POST', headers: { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/sdp' }, body: offer.sdp })
      if (!sdp.ok) throw new Error('OpenAI odmítl spojení: ' + (await sdp.text()).slice(0, 300))
      await peer.setRemoteDescription({ type: 'answer', sdp: await sdp.text() })
    } catch (e) {
      setErr((e as Error).message || String(e)); setStatus('error'); cleanupAudio()
    }
  }
  async function onOpenAIEvent(ev: Record<string, any>, ctx: ToolCtx) { // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (ev.type) {
      case 'input_audio_buffer.speech_started': speakingRef.current = false; setSpeaking(false); break
      case 'conversation.item.input_audio_transcription.completed': if (ev.transcript?.trim()) setLines((l) => [...l, { who: 'ja', text: ev.transcript.trim(), id: ++lineId.current }]); break
      case 'response.output_audio.delta': if (!speakingRef.current) { speakingRef.current = true; setSpeaking(true) } break
      case 'response.output_audio_transcript.delta': oaOut.current += ev.delta || ''; partial.current.asistent = oaOut.current; appendPartial('asistent', ''); break
      case 'response.output_audio_transcript.done': oaOut.current = ''; partial.current.asistent = ev.transcript || partial.current.asistent; finalize('asistent'); break
      case 'response.output_audio.done': case 'response.done': speakingRef.current = false; setSpeaking(false); break
      case 'response.function_call_arguments.done': {
        setWorking(labelOf(ev.name || ''))
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(ev.arguments || '{}') } catch { /* prázdné */ }
        let result: unknown
        try { result = await runTool(ev.name, args, ctx) } catch (e) { result = { chyba: String(e) } }
        setWorking('')
        dc.current?.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify(result) } }))
        dc.current?.send(JSON.stringify({ type: 'response.create' }))
        break
      }
      case 'error': setErr('OpenAI: ' + (ev.error?.message || JSON.stringify(ev.error))); break
    }
  }

  function cleanupAudio() {
    stopPlayback()
    try { dc.current?.close() } catch { /* ok */ } dc.current = null
    try { pc.current?.close() } catch { /* ok */ } pc.current = null
    if (audioEl.current) { audioEl.current.srcObject = null }
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null
    inCtx.current?.close().catch(() => {}); inCtx.current = null
    outCtx.current?.close().catch(() => {}); outCtx.current = null
  }
  function stop() {
    try { sessionRef.current?.close() } catch { /* už zavřeno */ }
    sessionRef.current = null
    cleanupAudio()
    setStatus((st) => (st === 'idle' ? st : 'ended'))
  }
  function toggleMute() { mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); stream.current?.getAudioTracks().forEach((t) => { t.enabled = !mutedRef.current }) }

  const live = status === 'live'
  return (
    <div className="px-4 md:px-9 pt-11 md:pt-8 max-w-[900px] flex flex-col gap-4">
      <header className="flex items-center gap-2.5">
        <button onClick={() => nav(-1)} aria-label="Zpět" className="w-11 h-11 rounded-[14px] border border-line bg-white inline-flex items-center justify-center"><Icon name="chevL" /></button>
        <h1 className="m-0 mr-auto text-[26px] md:text-[30px] font-extrabold tracking-tight">Zuzanka</h1>
        {live && <span className="inline-flex items-center gap-2 text-sm font-bold text-navy"><span className="w-2.5 h-2.5 rounded-full bg-[#2EB872] animate-pulse" />Hovor běží · {ENGINES.find((e) => e.key === engine)?.label}</span>}
      </header>

      <Card className="p-5 md:p-7 flex flex-col items-center gap-4 text-center">
        <div className={`w-28 h-28 rounded-full inline-flex items-center justify-center transition-all ${live ? (speaking ? 'bg-navy text-white scale-110 shadow-[0_0_0_14px_rgba(37,51,113,.12)]' : 'bg-gold text-ink shadow-[0_0_0_10px_rgba(203,153,46,.18)]') : 'bg-chip text-muted'}`}>
          <Icon name={speaking ? 'volume' : 'mic'} size={44} stroke={2} />
        </div>
        {status === 'idle' && <p className="m-0 text-sm text-muted max-w-md">Zuzanka zná vaše obchody, kontakty i úkoly. Zeptejte se, co je nového, kde to hoří, jak jsme na tom s konkrétním klientem – nebo řekněte, ať založí úkol. Můžete jí kdykoli skočit do řeči.</p>}
        {status === 'connecting' && <p className="m-0 text-sm text-muted">Spojuji…</p>}
        {live && <p className="m-0 text-sm text-muted min-h-5">{working ? `${working}…` : speaking ? 'Mluví – klidně jí skočte do řeči' : muted ? 'Mikrofon vypnutý' : 'Poslouchám'}</p>}
        {status === 'ended' && <p className="m-0 text-sm text-muted">Hovor skončil.</p>}
        {err && <p className="m-0 text-sm font-semibold" style={{ color: '#A12E2A' }}>{err}</p>}
        {!live && status !== 'connecting' && (
          <div className="inline-flex rounded-full border border-line bg-white p-0.5">
            {ENGINES.map((e) => <button key={e.key} onClick={() => pickEngine(e.key)} aria-pressed={engine === e.key} title={e.note} className={`h-9 px-3.5 rounded-full text-sm font-bold whitespace-nowrap ${engine === e.key ? 'bg-navy text-white' : 'text-muted'}`}>{e.label}</button>)}
          </div>
        )}
        <div className="flex gap-2 flex-wrap justify-center">
          {!live && status !== 'connecting' && <Btn onClick={start} icon="phone" className="h-14 px-7 text-base">{status === 'idle' ? 'Zavolat Zuzance' : 'Zavolat znovu'}</Btn>}
          {live && <Btn kind="ghost" onClick={toggleMute} icon="mic">{muted ? 'Zapnout mikrofon' : 'Ztlumit'}</Btn>}
          {(live || status === 'connecting') && <Btn onClick={stop} icon="x" className="bg-[#D9534F]! h-12">Zavěsit</Btn>}
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

function labelOf(fn: string) {
  return ({ zmenit_fazi: 'Přesouvám obchod', upravit_obchod: 'Upravuji obchod', vytvorit_obchod: 'Zakládám obchod', upravit_kontakt: 'Upravuji kontakt', vytvorit_kontakt: 'Zakládám kontakt', pripojit_kontakt: 'Propojuji kontakt', upravit_ukol: 'Upravuji úkol', prehled: 'Dívám se do CRM', seznam_obchodu: 'Procházím obchody', detail_obchodu: 'Otvírám obchod', hledat_kontakt: 'Hledám kontakt', ukoly: 'Procházím úkoly', vytvor_ukol: 'Zakládám úkol', splnit_ukol: 'Odškrtávám úkol', pridat_poznamku: 'Ukládám poznámku', navrh_sms: 'Připravuji SMS', otevrit: 'Otvírám' } as Record<string, string>)[fn] || 'Pracuji'
}
