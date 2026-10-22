import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/app'
import type { Deal } from '../lib/types'
import { dateTime } from '../lib/format'
import { Btn, Fold, Sheet } from './ui'
import { ValuoSheet } from './ValuoSheet'
import { dcz } from './ValuoView'

export type Automation = { id: string; title: string; description: string | null; icon: string | null; external: boolean; confirm_text: string | null; stage_ids: string[]; enabled: boolean; position: number; linked: boolean }
type Run = { automation_id: string; status: string; error: string | null; created_at: string }

// Sekce „Automatizace ⚙️“ v detailu obchodu: každá automatizace = tlačítko, které spustí scénář v Make.
export function AutomationsCard({ deal, reload }: { deal: Deal; reload: () => void }) {
  const { account } = useApp()
  const [list, setList] = useState<Automation[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [pick, setPick] = useState<Automation | null>(null)
  const [valuoOpen, setValuoOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    if (!account) return
    const [a, r] = await Promise.all([
      supabase.from('automations').select('id, title, description, icon, external, confirm_text, stage_ids, enabled, position, webhook_url, handler').eq('account_id', account.id).eq('enabled', true).order('position'),
      supabase.from('automation_runs').select('automation_id, status, error, created_at').eq('deal_id', deal.id).order('created_at', { ascending: false }).limit(50),
    ])
    setList(((a.data as (Automation & { webhook_url: string | null; handler: string | null })[]) || []).map((x) => ({ ...x, linked: !!x.webhook_url || !!x.handler })))
    setRuns((r.data as Run[]) || [])
  }, [account, deal.id])
  useEffect(() => { load() }, [load])

  const shown = list.filter((a) => !a.stage_ids?.length || (deal.stage_id && a.stage_ids.includes(deal.stage_id)))
  const valuoAt = (deal.valuo as { at?: string } | null | undefined)?.at
  const last = (id: string) => runs.find((r) => r.automation_id === id)

  async function run(a: Automation) {
    setBusy(true); setErr('')
    try {
      const { data, error } = await supabase.functions.invoke('automation-run', { body: { automation_id: a.id, deal_id: deal.id } })
      if (error) { let msg = error.message; try { msg = (await (error as { context?: Response }).context?.json())?.error || msg } catch { /* */ } throw new Error(msg) }
      if (data?.error) throw new Error(data.error)
      setPick(null)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false); load(); reload()
  }
  const contacts = (deal.deal_contacts || []).map((x) => [x.contacts?.first_name, x.contacts?.last_name].filter(Boolean).join(' ')).filter(Boolean).join(', ')

  return (
    <Fold id="deal-automatizace" title="Automatizace ⚙️" summary={`${shown.length + 1} k dispozici`}>
      <div className="flex flex-col gap-1">
        {shown.map((a) => {
          const l = last(a.id)
          return (
            <div key={a.id} className="flex items-center gap-3 py-2 border-t first:border-t-0 border-line-soft rounded-xl" style={l?.status === 'ok' ? { background: '#F1F9F4', opacity: 0.9 } : undefined}>
              <span className="text-2xl w-8 text-center">{a.icon || '⚙️'}</span>
              <div className="flex flex-col min-w-0 mr-auto">
                <b className={`text-[15px] ${l?.status === 'ok' ? 'line-through' : ''}`} style={l?.status === 'ok' ? { color: '#1F7A4D' } : undefined}>{l?.status === 'ok' && '✓ '}{a.title}</b>
                {l && <span className="text-xs mt-0.5" style={{ color: l.status === 'ok' ? '#1F7A4D' : '#A12E2A' }}>{l.status === 'ok' ? 'Hotovo · spuštěno ' : '✗ Chyba · '}{dateTime(l.created_at)}</span>}
              </div>
              <Btn kind="ghost" onClick={() => { setErr(''); setPick(a) }} disabled={!a.linked} className="h-10 shrink-0">{!a.linked ? 'Nepropojeno' : l?.status === 'ok' ? 'Spustit znovu' : 'Spustit'}</Btn>
            </div>
          )
        })}
        <div className="flex items-center gap-3 py-2 border-t border-line-soft rounded-xl" style={valuoAt ? { background: '#F1F9F4', opacity: 0.9 } : undefined}>
          <span className="text-2xl w-8 text-center">💰</span>
          <div className="flex flex-col min-w-0 mr-auto">
            <b className="text-[15px]">Ocenit nemovitost přes Valuo</b>
            {valuoAt && <span className="text-xs mt-0.5" style={{ color: '#1F7A4D' }}>Hotovo · oceněno {dcz(valuoAt)}</span>}
          </div>
          <Btn kind="ghost" onClick={() => setValuoOpen(true)} className="h-10 shrink-0">{valuoAt ? 'Spustit znovu' : 'Spustit'}</Btn>
        </div>
      </div>
      <ValuoSheet deal={deal} open={valuoOpen} onClose={() => setValuoOpen(false)} reload={reload} />
      <Sheet open={!!pick} onClose={() => !busy && setPick(null)} title="Spustit automatizaci"
        footer={pick && (
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Btn kind="ghost" onClick={() => setPick(null)} disabled={busy} className="sm:w-28">Zrušit</Btn>
            <Btn onClick={() => run(pick)} disabled={busy} className="flex-1 h-12 text-base">{busy ? 'Spouštím…' : 'Ano, spustit'}</Btn>
          </div>
        )}>
        {pick && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center text-center gap-2 pt-1">
              <span className="w-16 h-16 rounded-full bg-chip inline-flex items-center justify-center text-[32px]">{pick.icon || '⚙️'}</span>
              <h3 className="m-0 text-lg font-extrabold leading-tight">{pick.title}</h3>
              <p className="m-0 text-[15px] text-muted max-w-sm">{pick.confirm_text || pick.description || 'Spustí se automatizace.'}</p>
            </div>
            <dl className="m-0 rounded-2xl bg-bg px-4 py-3 flex flex-col gap-2 text-sm">
              <div className="flex gap-3"><dt className="w-16 shrink-0 text-muted font-bold">Obchod</dt><dd className="m-0 font-bold min-w-0 break-words">{deal.title}</dd></div>
              {contacts && <div className="flex gap-3"><dt className="w-16 shrink-0 text-muted font-bold">Klient</dt><dd className="m-0 min-w-0 break-words">{contacts}</dd></div>}
              {deal.category && <div className="flex gap-3"><dt className="w-16 shrink-0 text-muted font-bold">Kategorie</dt><dd className="m-0">{deal.category}</dd></div>}
            </dl>
            {pick.external && last(pick.id)?.status === 'ok' && (
              <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#FFF3DC', color: '#7A4B00' }}>⚠️ Tahle automatizace už u obchodu proběhla ({dateTime(last(pick.id)!.created_at)}). Opravdu ji chcete spustit znovu?</div>
            )}
            {err && <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#FDE9E7', color: '#A12E2A' }}>{err}</div>}
          </div>
        )}
      </Sheet>
    </Fold>
  )
}
