import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/app'
import type { Deal } from '../lib/types'
import { dateTime } from '../lib/format'
import { Btn, Fold, Sheet } from './ui'

export type Automation = { id: string; title: string; description: string | null; icon: string | null; external: boolean; confirm_text: string | null; stage_ids: string[]; enabled: boolean; position: number; linked: boolean }
type Run = { automation_id: string; status: string; error: string | null; created_at: string }

// Sekce „Automatizace ⚙️“ v detailu obchodu: každá automatizace = tlačítko, které spustí scénář v Make.
export function AutomationsCard({ deal, reload }: { deal: Deal; reload: () => void }) {
  const { account } = useApp()
  const [list, setList] = useState<Automation[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [pick, setPick] = useState<Automation | null>(null)
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
  if (!shown.length) return null
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
    <Fold id="deal-automatizace" title="Automatizace ⚙️" summary={`${shown.length} k dispozici`}>
      <div className="flex flex-col gap-1">
        {shown.map((a) => {
          const l = last(a.id)
          return (
            <div key={a.id} className="flex items-center gap-3 py-2 border-t first:border-t-0 border-line-soft">
              <span className="text-2xl w-8 text-center">{a.icon || '⚙️'}</span>
              <div className="flex flex-col min-w-0 mr-auto">
                <b className="text-[15px]">{a.title}</b>
                {a.description && <span className="text-xs text-muted">{a.description}</span>}
                {l && <span className="text-xs mt-0.5" style={{ color: l.status === 'ok' ? '#1F7A4D' : '#A12E2A' }}>{l.status === 'ok' ? '✓ Naposledy spuštěno ' : '✗ Chyba ' }{dateTime(l.created_at)}</span>}
              </div>
              <Btn kind="ghost" onClick={() => { setErr(''); setPick(a) }} disabled={!a.linked} className="h-10 shrink-0">{a.linked ? 'Spustit' : 'Nepropojeno'}</Btn>
            </div>
          )
        })}
      </div>
      <Sheet open={!!pick} onClose={() => setPick(null)} title={pick ? `${pick.icon || '⚙️'} ${pick.title}` : ''}
        footer={pick && <div className="flex gap-2"><Btn onClick={() => run(pick)} disabled={busy} className="flex-1">{busy ? 'Spouštím…' : 'Ano, spustit'}</Btn><Btn kind="ghost" onClick={() => setPick(null)}>Zrušit</Btn></div>}>
        {pick && (
          <div className="flex flex-col gap-3 text-[15px]">
            <p className="m-0">{pick.confirm_text || pick.description || 'Spustí se automatizace.'}</p>
            <p className="m-0 text-sm text-muted">Obchod: <b>{deal.title}</b>{contacts && <> · Kontakty: {contacts}</>}</p>
            {pick.external && last(pick.id)?.status === 'ok' && <p className="m-0 text-sm font-bold" style={{ color: '#A12E2A' }}>Pozor, tahle automatizace už byla u obchodu spuštěna ({dateTime(last(pick.id)!.created_at)}). Opravdu znovu?</p>}
            {err && <p className="m-0 text-sm font-semibold" style={{ color: '#A12E2A' }}>{err}</p>}
          </div>
        )}
      </Sheet>
    </Fold>
  )
}
