// Textový chat s AI nad daty CRM: model (Gemini přes edge funkci chat-llm) volá stejné nástroje jako Věruška.
import { supabase } from './supabase'
import { TOOL_DECLS, runTool, type ToolCtx } from './assistantTools'

type Part = Record<string, unknown>
export type Content = { role: 'user' | 'model'; parts: Part[] }

export function chatSystem(name: string, stages: string[]) {
  const d = new Date()
  return `Jsi AI asistent realitního makléře ${name} v jeho CRM. Dnes je ${d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
Odpovídej česky, stručně a věcně, jako dobrý kolega. Vždy čerpej ze skutečných dat CRM pomocí funkcí, nic si nevymýšlej; když data nemáš nebo nic nenajdeš, řekni to.
Na otázky typu "na co se zaměřit", "kde to hoří" použij funkci prehled a dej konkrétní doporučení s názvy obchodů a jmény. Na "komu jsem se neozval" použij kontakty_bez_kontaktu, na provize obchody_podle_provize, na narozeniny a svátky kontakty_prehled nebo hledat_kontakt.
Seznamy piš jako krátké odrážky (každá položka na vlastní řádek začínající "• "), částky ve tvaru 1 250 000 Kč, data jako 5. 3. 2026. Bez markdown tabulek a hvězdiček.
Odkazy: kdykoli zmíníš konkrétní kontakt nebo obchod, který má v datech pole id, napiš ho jako odkaz [Jméno nebo název](/kontakty/ID) pro kontakt, resp. [název](/obchody/ID) pro obchod (ID zkopíruj přesně z dat, nikdy si ho nevymýšlej; bez id odkaz nedělej). Ostatní markdown nepoužívej.
Jména kontaktů hledej tolerantně (překlepy); když je shoda nejistá, krátce se ujisti.
Změny dat (úkoly, poznámky, fáze, úpravy) dělej jen na jasný pokyn; u vytvoření úkolu nebo poznámky nejdřív zopakuj znění a počkej na souhlas. SMS nikdy neodesíláš, jen navrhneš text (navrh_sms), podpis "Martin Tesárek".
Rodná čísla nikdy neříkej ani nehledej. Fáze obchodů v pořadí: ${stages.join(' → ')}.`
}

export async function askChat(history: Content[], ctx: ToolCtx, name: string, onStep?: (label: string) => void): Promise<{ added: Content[]; text: string }> {
  const added: Content[] = []
  const system = chatSystem(name, ctx.stages.map((s) => s.name))
  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabase.functions.invoke('chat-llm', { body: { contents: [...history, ...added], system, tools: TOOL_DECLS } })
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Chyba spojení s AI.')
    const content = data?.content as Content | null
    if (!content?.parts?.length) throw new Error('AI nevrátila odpověď.')
    added.push({ role: 'model', parts: content.parts })
    const calls = content.parts.filter((p) => p.functionCall) as { functionCall: { name: string; args?: Record<string, unknown> } }[]
    if (!calls.length) return { added, text: content.parts.map((p) => (typeof p.text === 'string' && !p.thought ? p.text : '')).join('').trim() }
    const results: Part[] = []
    for (const c of calls) {
      onStep?.(c.functionCall.name)
      let out: unknown
      try { out = await runTool(c.functionCall.name, c.functionCall.args || {}, ctx) } catch (e) { out = { chyba: String(e) } }
      results.push({ functionResponse: { name: c.functionCall.name, response: { result: out } } })
    }
    added.push({ role: 'user', parts: results })
  }
  throw new Error('Dotaz byl příliš složitý, zkuste ho zjednodušit.')
}
