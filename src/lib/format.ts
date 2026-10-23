export const czk = (v: number | null | undefined) =>
  v == null ? '' : new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(v) + ' Kč'

export const mil = (v: number | null | undefined) =>
  v == null ? '' : (v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) + ' mil.'

export const dateShort = (s: string | null | undefined) => {
  if (!s) return ''
  const d = new Date(s)
  const today = new Date()
  const same = d.toDateString() === today.toDateString()
  if (same) return 'Dnes'
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })
}

export const dateLong = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }) : ''

export const dateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

export const daysSince = (s: string | null | undefined) =>
  s ? Math.floor((Date.now() - new Date(s).getTime()) / 86_400_000) : 0

export const contactName = (c: { first_name: string | null; last_name: string | null } | null | undefined) =>
  c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : ''

export const initials = (s: string | null | undefined) =>
  (s || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')

export const BLOCKS = ['Akvizice', 'Čekající', 'Smlouva', 'Prodej', 'Uzavření', 'Po prodeji', 'Uzavřeno'] as const

/** Otevře nový e-mail v Gmailu s předvyplněným příjemcem: na iPhonu/Androidu zkusí aplikaci Gmail,
 *  když není (nebo neodpoví), otevře Gmail na webu; jako poslední záloha mailto:. */
export function openGmail(to: string, subject = '') {
  const web = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}${subject ? '&su=' + encodeURIComponent(subject) : ''}`
  const app = `googlegmail://co?to=${encodeURIComponent(to)}${subject ? '&subject=' + encodeURIComponent(subject) : ''}`
  const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent)
  if (!mobile) { window.open(web, '_blank', 'noopener'); return }
  const t0 = Date.now()
  let done = false
  const onHide = () => { done = true; document.removeEventListener('visibilitychange', onHide) }
  document.addEventListener('visibilitychange', onHide)
  window.location.href = app
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide)
    if (done || document.hidden || Date.now() - t0 > 2500) return
    window.location.href = /iPhone|iPad/i.test(navigator.userAgent) ? `mailto:${to}${subject ? '?subject=' + encodeURIComponent(subject) : ''}` : web
  }, 1200)
}

/** Číslice po tisících s mezerou při psaní: 5000000 → 5 000 000 */
export const spaced = (v: string | number | null | undefined) => String(v ?? '').replace(/[^\d]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')

// Mobil: české číslo začínající 6 nebo 7 (pevné linky 2–5 SMS nepřijmou); zahraniční čísla bereme jako mobil.
export const isMobile = (s?: string | null) => {
  let p = String(s || '').replace(/[\s()./-]/g, '')
  if (!p) return false
  if (/^00/.test(p)) p = '+' + p.slice(2)
  if (/^420\d{9}$/.test(p)) p = '+' + p
  if (/^\d{9}$/.test(p)) p = '+420' + p
  if (p.startsWith('+420')) return /^\+420[67]\d{8}$/.test(p)
  return /^\+\d{9,15}$/.test(p)
}

/** Automatická přání SMS u kontaktu: vypnuto / zapnuto, ale chybí údaje / posílá se. */
export function smsStatus(c: { auto_wishes?: boolean | null; phone?: string | null; salutation?: string | null; name_day?: string | null; birth_date?: string | null }): { state: 'off' | 'missing' | 'ok'; missing: string[] } {
  if (c.auto_wishes === false) return { state: 'off', missing: [] }
  const missing: string[] = []
  if (!isMobile(c.phone)) missing.push(c.phone ? 'mobil (je pevná linka)' : 'mobil')
  if (!String(c.salutation || '').trim()) missing.push('oslovení')
  if (!c.name_day && !c.birth_date) missing.push('datum svátku nebo narození')
  return { state: missing.length ? 'missing' : 'ok', missing }
}
