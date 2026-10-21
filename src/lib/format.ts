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
