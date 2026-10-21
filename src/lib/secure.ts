import { supabase } from './supabase'

export const isEnc = (v: unknown): v is string => typeof v === 'string' && v.startsWith('enc:')
export const MASK = '••••••/••••'

/** Rodné číslo je v databázi zašifrované. Dešifruje se na serveru, jen pro toho, kdo kontakt smí vidět, a zapíše se do auditního logu. */
export async function revealBirthNumber(contactId: string, raw?: string | null): Promise<string> {
  if (!raw) return ''
  if (!isEnc(raw)) return raw // starý nezašifrovaný záznam (před nasazením šifrování)
  const { data } = await supabase.rpc('reveal_birth_number', { p_contact: contactId })
  return typeof data === 'string' ? data : ''
}
