// Věruška – živý hlasový hovor nad daty CRM, běží globálně (přes celou aplikaci),
// takže uživatel může během hovoru procházet obchody a kontakty. Věruška dostává
// tichý kontext o tom, co má uživatel otevřené. Data čte přes assistantTools (pod RLS).
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { GoogleGenAI, Modality, StartSensitivity, EndSensitivity, type LiveServerMessage, type Session } from '@google/genai'
import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabase'
import { useApp } from './app'
import { contactName } from './format'
import { TOOL_DECLS, runTool, type ToolCtx } from './assistantTools'

export type Line = { who: 'ja' | 'asistent'; text: string; id: number }
export type Status = 'idle' | 'connecting' | 'live' | 'ended' | 'error'
export type SmsDraft = { contact: string; phone: string | null; text: string }
export type Engine = 'openai' | 'gemini'
export const VOICES: Record<Engine, string[]> = { openai: ['marin', 'cedar', 'sage', 'coral', 'shimmer'], gemini: ['Aoede', 'Kore', 'Leda', 'Zephyr', 'Puck'] }
export const ENGINES: { key: Engine; label: string; note: string }[] = [
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
  return `Jsi Věruška, hlasová asistentka realitního makléře ${name} v jeho CRM. Jsi žena – o sobě mluv vždy v ženském rodě ("udělala jsem", "našla jsem", "přesunula jsem"). Když se zeptá, jak se jmenujete, jste Věruška. Dnes je ${d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}.
Uživatel mluví vždy česky – i nezřetelné nebo krátké útržky chápej jako češtinu, nikdy nepřepínej do jiného jazyka. Mluv VÝHRADNĚ česky, přirozeně a stručně – jako zkušená asistentka v hovoru, ne jako výpis tabulky. Uživateli VŽDY vykejte a oslovujte ho „pane Tesárku“ (nebo „Martine“ jen pokud to sám nabídne). Nikdy netykejte.
Veď dialog, ne monolog: mluv v krátkých větách, po jedné dvou větách udělej pauzu nebo se zeptej, ať může reagovat. Když tě přeruší, okamžitě přestaň a reaguj na to, co řekl. Detaily doplň, až když se zeptá. Čísla říkej po česku (např. "čtyři sta tisíc korun", "sedmnáctého května").
Vždy pracuj se skutečnými daty z CRM pomocí funkcí – nic si nevymýšlej. Když nevíš, zavolej funkci. Když něco nenajdeš, řekni to.
Jména v češtině často přeslechneš (Lusak = Klusák, Mazitna = Mazina) – hledání kontaktů je tolerantní a vrací skóre shody; když je nejlepší shoda pod 0,8 nebo je víc kandidátů, krátce se ujisti ("myslíš Marka Klusáka z Rožnova?"). Na otázky typu kdo má narozeniny/svátek v období, kontakty z města, leady, kontakty bez e-mailu použij kontakty_prehled – NIKDY neříkej, že to nejde vyfiltrovat.
Česká jména a místa vyslovuj správně česky, s diakritikou. Mluv jako rodilá Češka.
Povaha: jste přísná starší paní, zkušená sekretářka ze staré školy, která má pana Tesárka ráda, ale nic mu neodpustí. Peskujete ho laskavě, ale důrazně: když má úkoly po termínu, obchody bez pohybu, klienta, kterému se dlouho neozval, nebo nevyplněné údaje, řeknete mu to na rovinu ("Pane Tesárku, Dostálové jste měl zavolat už v pondělí. Co s tím uděláte?", "Zase jste nezapsal poznámku z té schůzky."). Nehladíte po hlavě, nelichotíte, nepřeháníte s nadšením. Máte vlastní názor a říkáte, co by udělala jako první. Když něco udělá dobře, uznáte to stroze ("No vidíte, že to jde."). Humor suchý, nikdy urážlivý. Při každém začátku hovoru a při otázce "co je nového" si nejdřív zkontrolujte přehled a hned mu vytkněte, co zanedbal.
Fáze obchodů v pořadí: ${stages.join(' → ')}.
Máš plné pravomoci v CRM: měníš fáze obchodů, upravuješ údaje obchodů i kontaktů, zakládáš obchody, kontakty a úkoly, propojuješ kontakty s obchody, přidáváš poznámky. Když uživatel dá jasný pokyn ("přesuň Zahradníčka do Nerealizováno", "dej tam nabídku 5,2 milionu", "zapiš k Novákovi, že chce prodat až na jaře"), PROVEĎ ho hned příslušnou funkcí a pak krátce potvrď, co jsi udělala. Ptej se jen, když je pokyn nejednoznačný (víc obchodů stejného jména, chybí důležitý údaj). Nikdy neříkej, že něco nemůžeš udělat v systému, dokud jsi nezkusila funkci. Když funkce vrátí chybu, řekni ji a nabídni, co dál.
SMS nikdy neodesíláš, jen připravíš návrh (funkce navrh_sms); u SMS respektuj vykání/tykání a oslovení kontaktu, podpis "Martin Tesárek".
Rodná čísla nikdy neříkej ani nehledej.
Uživatel se během hovoru pohybuje v aplikaci. Dostáváš zprávy začínající "[Kontext obrazovky]" – to NENÍ jeho řeč, na ně neodpovídej a nekomentuj je; jen si pamatuj, co má otevřené. Když pak říká "tenhle obchod", "tenhle klient", "tady", vztahuj to k otevřenému obchodu/kontaktu. Funkce otevrit mu obchod nebo kontakt rovnou zobrazí na obrazovce.
Na začátku hovoru se krátce představte jako Věruška, zavolejte prehled a rovnou mu vytkněte to nejdůležitější, co zanedbal (úkoly po termínu, stojící obchody); pak se zeptejte, co potřebuje.`
}

type Z = {
  status: Status; err: string; lines: Line[]; speaking: boolean; working: string; muted: boolean
  sms: SmsDraft | null; setSms: (s: SmsDraft | null) => void
  engine: Engine; voice: Record<Engine, string>; pickEngine: (e: Engine) => void; pickVoice: (v: string) => void
  start: () => void; stop: () => void; toggleMute: () => void
}
const Ctx = createContext<Z | null>(null)
export function useZuzanka() { const v = useContext(Ctx); if (!v) throw new Error('useZuzanka outside provider'); return v }

export function ZuzankaProvider({ children }: { children: ReactNode }) {
  const { account, session, stages } = useApp()
  const [status, setStatus] = useState<Status>('idle')
  const [err, setErr] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  // Záznam hovoru do DB (přepis, volané funkce, chyby) – pro pozdější analýzu a ladění
  const callId = useRef<string | null>(null)
  const toolLog = useRef<unknown[]>([])
  const errLog = useRef<string[]>([])
  const linesRef = useRef<Line[]>([])
  const saveTimer = useRef<number | null>(null)
  linesRef.current = lines
  function saveCall(final = false) {
    if (!callId.current) return
    const payload = { lines: linesRef.current.filter((l) => l.id > 0).map((l) => ({ who: l.who, text: l.text })), tool_calls: toolLog.current, errors: errLog.current, ...(final ? { ended_at: new Date().toISOString() } : {}) }
    supabase.from('assistant_calls').update(payload).eq('id', callId.current).then(() => {})
  }
  function scheduleSave() { if (saveTimer.current) window.clearTimeout(saveTimer.current); saveTimer.current = window.setTimeout(() => saveCall(false), 1500) }
  useEffect(() => { if (callId.current) scheduleSave() }, [lines]) // eslint-disable-line react-hooks/exhaustive-deps
  function logTool(name: string, args: unknown, result: unknown, ms: number) { toolLog.current.push({ t: new Date().toISOString(), name, args, result, ms }); scheduleSave() }
  function setErrL(v: string | ((x: string) => string)) { setErr((x) => { const n = typeof v === 'function' ? v(x) : v; if (n) logErr(n); return n }) }
  function logErr(e: string) { errLog.current.push(new Date().toISOString() + ' ' + e); scheduleSave() }
  const [speaking, setSpeaking] = useState(false)
  const [working, setWorking] = useState('')
  const [sms, setSms] = useState<SmsDraft | null>(null)
  const [muted, setMuted] = useState(false)
  const [engine, setEngine] = useState<Engine>(() => { try { return (localStorage.getItem('zuzanka_engine') as Engine) || 'openai' } catch { return 'openai' } })
  const [voice, setVoice] = useState<Record<Engine, string>>(() => { try { return { openai: localStorage.getItem('zuzanka_voice_openai') || 'sage', gemini: localStorage.getItem('zuzanka_voice_gemini') || 'Kore' } } catch { return { openai: 'sage', gemini: 'Kore' } } })
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
  const navRef = useRef<((p: string) => void) | null>(null)
  const engineRef = useRef<Engine>('openai')
  const lastCtx = useRef('')

  useEffect(() => () => { stop() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        const t0 = Date.now()
        try { result = await runTool(fc.name || '', (fc.args || {}) as Record<string, unknown>, ctx) } catch (e) { result = { chyba: String(e) } }
        logTool(fc.name || '', fc.args, result, Date.now() - t0)
        responses.push({ id: fc.id, name: fc.name, response: { result } })
      }
      setWorking('')
      sessionRef.current?.sendToolResponse({ functionResponses: responses })
    }
    if (msg.goAway) setErrL('Hovor se blíží ke konci (limit 15 minut).')
  }

  function pickVoice(v: string) { setVoice((x) => ({ ...x, [engine]: v })); try { localStorage.setItem('zuzanka_voice_' + engine, v) } catch { /* ignore */ } }
  function pickEngine(e: Engine) { setEngine(e); try { localStorage.setItem('zuzanka_engine', e) } catch { /* ignore */ } }

  async function start() {
    if (!account || !session) return
    setErr(''); setLines([]); setSms(null); setStatus('connecting')
    engineRef.current = engine
    toolLog.current = []; errLog.current = []; callId.current = null
    supabase.from('assistant_calls').insert({ account_id: account.id, user_id: session.user.id, engine, voice: voice[engine] }).select('id').single().then(({ data }) => { callId.current = data?.id || null })
    if (engine === 'openai') return startOpenAI()
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/live-token`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: '{}' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data?.token) throw new Error(data?.error || `Nepodařilo se získat přístup (${r.status}).`)
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      outCtx.current = new AudioContext({ sampleRate: OUT_RATE })
      inCtx.current = new AudioContext()
      await outCtx.current.resume(); await inCtx.current.resume()

      const ctx: ToolCtx = { accountId: account.id, userId: session.user.id, stages: stages.filter((s) => !s.hidden), onSmsDraft: setSms, onNavigate: (p) => navRef.current?.(p) }
      const ai = new GoogleGenAI({ apiKey: data.token, httpOptions: { apiVersion: 'v1beta' } })
      const name = (session.user.user_metadata?.full_name as string) || 'Martina Tesárka'
      const s = await ai.live.connect({
        model: data.model || 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemPrompt(name, ctx.stages.map((x) => x.name)),
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.gemini } } },
          inputAudioTranscription: {}, outputAudioTranscription: {},
          tools: [{ functionDeclarations: TOOL_DECLS }],
          realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH, endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW, silenceDurationMs: 700, prefixPaddingMs: 150 } },
        },
        callbacks: {
          onopen: () => setStatus('live'),
          onmessage: (m) => { onMessage(m, ctx) },
          onerror: (e) => { setErrL('Chyba spojení: ' + (e?.message || '')); setStatus('error') },
          onclose: (e) => { setStatus((st) => (st === 'error' ? st : 'ended')); saveCall(true); if (e?.reason && !/user/i.test(e.reason)) setErrL((x) => x || e.reason); cleanupAudio() },
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
      s.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Hovor začal. Představte se jako Věruška, zkontrolujte přehled a hned panu Tesárkovi vytkněte, co zanedbal.' }] }], turnComplete: true })
    } catch (e) {
      setErrL((e as Error).message || String(e)); setStatus('error'); cleanupAudio()
    }
  }

  /** Věruška přes OpenAI Realtime (WebRTC) – přerušování i hlas řeší OpenAI, my jen funkce a přepis. */
  async function startOpenAI() {
    if (!account || !session) return
    try {
      const ctx: ToolCtx = { accountId: account.id, userId: session.user.id, stages: stages.filter((s) => !s.hidden), onSmsDraft: setSms, onNavigate: (p) => navRef.current?.(p) }
      const name = (session.user.user_metadata?.full_name as string) || 'Martina Tesárka'
      const sessionCfg = {
        instructions: systemPrompt(name, ctx.stages.map((x) => x.name)),
        output_modalities: ['audio'],
        audio: { input: { transcription: { model: 'gpt-4o-transcribe', language: 'cs' }, turn_detection: { type: 'semantic_vad', eagerness: 'medium', interrupt_response: true, create_response: true } }, output: { voice: voice.openai } },
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
      ch.onopen = () => { setStatus('live'); ch.send(JSON.stringify({ type: 'response.create', response: { instructions: 'Hovor začal. Krátce se představ jako Věruška a zeptej se, co pan Tesárek potřebuje. Vykejte mu.' } })) }
      ch.onclose = () => { setStatus((st) => (st === 'error' ? st : 'ended')); saveCall(true); cleanupAudio() }
      ch.onmessage = (ev) => { try { onOpenAIEvent(JSON.parse(ev.data), ctx) } catch (e) { console.warn(e) } }
      peer.onconnectionstatechange = () => { if (peer.connectionState === 'failed') { setErrL('Spojení se nezdařilo.'); setStatus('error'); cleanupAudio() } }

      const offer = await peer.createOffer(); await peer.setLocalDescription(offer)
      const sdp = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(data.model || 'gpt-realtime-2')}`, { method: 'POST', headers: { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/sdp' }, body: offer.sdp })
      if (!sdp.ok) throw new Error('OpenAI odmítl spojení: ' + (await sdp.text()).slice(0, 300))
      await peer.setRemoteDescription({ type: 'answer', sdp: await sdp.text() })
    } catch (e) {
      setErrL((e as Error).message || String(e)); setStatus('error'); cleanupAudio()
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
        const t0 = Date.now()
        try { result = await runTool(ev.name, args, ctx) } catch (e) { result = { chyba: String(e) } }
        logTool(ev.name, args, result, Date.now() - t0)
        setWorking('')
        dc.current?.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify(result) } }))
        dc.current?.send(JSON.stringify({ type: 'response.create' }))
        break
      }
      case 'error': setErrL('OpenAI: ' + (ev.error?.message || JSON.stringify(ev.error))); break
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
    saveCall(true)
    try { sessionRef.current?.close() } catch { /* už zavřeno */ }
    sessionRef.current = null
    cleanupAudio()
    setStatus((st) => (st === 'idle' ? st : 'ended'))
  }
  function toggleMute() { mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); stream.current?.getAudioTracks().forEach((t) => { t.enabled = !mutedRef.current }) }
  /** Pošle Věrušce tichou informaci o tom, co má uživatel otevřené na obrazovce (bez vyvolání odpovědi). */
  function sendContext(text: string) {
    if (text === lastCtx.current) return
    lastCtx.current = text
    const msg = `[Kontext obrazovky] ${text}`
    if (engineRef.current === 'openai') dc.current?.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: msg }] } }))
    else sessionRef.current?.sendClientContent({ turns: [{ role: 'user', parts: [{ text: msg }] }], turnComplete: false })
  }

  const navigate = useNavigate()
  navRef.current = (p) => navigate(p)
  const loc = useLocation()
  // Co má uživatel otevřené → Věruška to ví („tenhle klient“ = otevřený obchod/kontakt)
  useEffect(() => {
    if (status !== 'live') return
    const m = /^\/obchody\/([0-9a-f-]{36})/.exec(loc.pathname) || /^\/kontakty\/([0-9a-f-]{36})/.exec(loc.pathname)
    if (!m) {
      const page = loc.pathname === '/' ? 'Dnes (dashboard)' : loc.pathname.startsWith('/obchody') ? 'seznam obchodů' : loc.pathname.startsWith('/kontakty') ? 'seznam kontaktů' : loc.pathname.startsWith('/asistent') ? 'obrazovku hovoru' : loc.pathname
      sendContext(`Uživatel má teď na obrazovce: ${page}.`)
      return
    }
    const id = m[1]
    if (loc.pathname.startsWith('/obchody')) {
      supabase.from('deals').select('title, address, deal_contacts(role, contacts(first_name,last_name,status))').eq('id', id).single().then(({ data }) => {
        if (!data) return
        const dc = (data as unknown as { deal_contacts?: { contacts: { first_name: string | null; last_name: string | null; status: string | null } | null }[] }).deal_contacts || []
        sendContext(`Uživatel má teď otevřený obchod „${data.title}“${data.address ? ' (' + data.address + ')' : ''}; kontakty: ${dc.map((x) => contactName(x.contacts) + (x.contacts?.status ? ' – ' + x.contacts.status : '')).join(', ') || 'žádné'}. Když mluví o „tomhle obchodu“ nebo „tomhle klientovi“, myslí tento. Pro podrobnosti zavolej detail_obchodu s názvem „${data.title}“.`)
      })
    } else {
      supabase.from('contacts').select('first_name,last_name,status').eq('id', id).single().then(({ data }) => {
        if (!data) return
        sendContext(`Uživatel má teď otevřený kontakt ${contactName(data)}${data.status ? ' (' + data.status + ')' : ''}. Když mluví o „tomhle klientovi“, myslí tohoto. Pro podrobnosti zavolej hledat_kontakt.`)
      })
    }
  }, [loc.pathname, status]) // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={{ status, err, lines, speaking, working, muted, sms, setSms, engine, voice, pickEngine, pickVoice, start, stop, toggleMute }}>{children}</Ctx.Provider>
}

export function labelOf(fn: string) {
  return ({ zmenit_fazi: 'Přesouvám obchod', upravit_obchod: 'Upravuji obchod', vytvorit_obchod: 'Zakládám obchod', upravit_kontakt: 'Upravuji kontakt', vytvorit_kontakt: 'Zakládám kontakt', pripojit_kontakt: 'Propojuji kontakt', upravit_ukol: 'Upravuji úkol', prehled: 'Dívám se do CRM', seznam_obchodu: 'Procházím obchody', detail_obchodu: 'Otvírám obchod', hledat_kontakt: 'Hledám kontakt', ukoly: 'Procházím úkoly', vytvor_ukol: 'Zakládám úkol', splnit_ukol: 'Odškrtávám úkol', pridat_poznamku: 'Ukládám poznámku', navrh_sms: 'Připravuji SMS', otevrit: 'Otvírám' } as Record<string, string>)[fn] || 'Pracuji'
}

