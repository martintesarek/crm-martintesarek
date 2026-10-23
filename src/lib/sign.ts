import { supabase } from './supabase'

// Volání edge funkce `sign` (podpisy smluv). Chyby vrací česky.
export async function callSign<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('sign', { body })
  if (error) {
    let msg = error.message
    try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}

export type Place = { page: number; x: number; y: number }
export const BOX_W = 0.28 // musí odpovídat funkci `sign`
export const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
export function downloadPdf(b64: string, name: string) {
  const url = URL.createObjectURL(new Blob([b64ToBytes(b64)], { type: 'application/pdf' }))
  const a = document.createElement('a'); a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, '_') + '.pdf'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
