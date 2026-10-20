import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../lib/app'
import { fieldValue, primaryContact, useDeals } from '../lib/deals'
import type { Deal, FieldDef, Stage } from '../lib/types'
import { BLOCKS, contactName } from '../lib/format'
import { Icon } from '../components/Icon'
import { Spinner, StagePill } from '../components/ui'
import { supabase } from '../lib/supabase'

export function Deals() {
  const { account, stages, fields } = useApp()
  const { deals, setDeals, loading } = useDeals(account?.id)
  const [params, setParams] = useSearchParams()
  const view = params.get('v') === 'board' ? 'board' : 'list'
  const block = params.get('b') || 'active'
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }) }

  const visibleStages = useMemo(() => stages.filter((s) => !s.hidden && (block === 'active' ? s.kind === 'open' : s.block === block)), [stages, block])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return deals
    return deals.filter((d) => {
      const c = primaryContact(d)
      return [d.title, d.address, contactName(c), c?.phone, c?.email].filter(Boolean).join(' ').toLowerCase().includes(t)
    })
  }, [deals, q])

  const byStage = useMemo(() => {
    const m: Record<string, Deal[]> = {}
    for (const d of filtered) (m[d.stage_id || 'none'] ||= []).push(d)
    return m
  }, [filtered])

  const blockCount = (b: string) => stages.filter((s) => s.block === b).reduce((n, s) => n + (byStage[s.id]?.length || 0), 0)
  const activeCount = stages.filter((s) => s.kind === 'open').reduce((n, s) => n + (byStage[s.id]?.length || 0), 0)

  async function moveDeal(dealId: string, stageId: string) {
    const prev = deals
    setDeals((ds) => ds.map((d) => (d.id === dealId ? { ...d, stage_id: stageId, stage_changed_at: new Date().toISOString() } : d)))
    const { error } = await supabase.from('deals').update({ stage_id: stageId }).eq('id', dealId)
    if (error) { setDeals(prev); alert('Změnu fáze se nepodařilo uložit: ' + error.message) }
  }

  const listFields = fields.filter((f) => f.entity === 'deal' && f.show_list && f.key !== 'cover_url')
  const mobileFields = fields.filter((f) => f.entity === 'deal' && f.show_mobile && f.key !== 'cover_url')
  const cardFields = fields.filter((f) => f.entity === 'deal' && f.show_card && f.key !== 'cover_url')
  const showCoverList = fields.find((f) => f.key === 'cover_url')?.show_list ?? true
  const showCoverCard = fields.find((f) => f.key === 'cover_url')?.show_card ?? true
  const showCoverMobile = fields.find((f) => f.key === 'cover_url')?.show_mobile ?? true

  return (
    <div className="px-4 md:px-9 pt-11 md:pt-8 flex flex-col gap-4 md:gap-5 max-w-[1400px]">
      <header className="flex flex-wrap items-center gap-2.5">
        <h1 className="m-0 mr-auto text-[26px] md:text-[30px] font-extrabold tracking-tight">Obchody</h1>
        <div role="tablist" aria-label="Zobrazení" className="flex gap-1 p-1 bg-[#ECEEF5] rounded-[14px]">
          {(['list', 'board'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setParam('v', v)}
              className={`h-9 px-3.5 rounded-[10px] text-sm inline-flex items-center gap-1.5 ${view === v ? 'bg-white font-bold shadow-sm' : 'text-muted font-semibold'}`}>
              <Icon name={v === 'list' ? 'list' : 'board'} size={16} />{v === 'list' ? 'Seznam' : 'Nástěnka'}
            </button>
          ))}
        </div>
        <Link to="/obchody/novy" className="hidden md:inline-flex h-11 px-4 rounded-[14px] bg-navy text-white font-bold text-sm items-center gap-2 no-underline">
          <Icon name="plus" size={18} />Nový obchod
        </Link>
      </header>

      <label className="flex items-center gap-2.5 h-12 px-3.5 bg-white border border-line rounded-2xl md:max-w-md">
        <Icon name="search" size={18} className="text-muted" />
        <input type="search" aria-label="Hledat" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat obchod, klienta, telefon, adresu"
          className="border-0 outline-none bg-transparent flex-1 min-w-0 text-[15px]" />
      </label>

      <div role="group" aria-label="Skupiny fází" className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
        <Chip on={block === 'active'} onClick={() => setParam('b', 'active')} label="Vše aktivní" n={activeCount} />
        {BLOCKS.map((b) => <Chip key={b} on={block === b} onClick={() => setParam('b', b)} label={b} n={blockCount(b)} />)}
      </div>

      {loading ? <Spinner /> : view === 'list' ? (
        <div className="flex flex-col gap-2.5">
          {visibleStages.map((s) => {
            const items = byStage[s.id] || []
            const isCol = collapsed[s.id] ?? (items.length === 0 || s.kind !== 'open')
            return (
              <section key={s.id} className="bg-white border border-line rounded-[20px] overflow-hidden">
                <button onClick={() => setCollapsed((c) => ({ ...c, [s.id]: !isCol }))} aria-expanded={!isCol}
                  className="w-full flex items-center gap-2.5 min-h-[54px] px-3.5 md:px-5 text-left">
                  <StagePill stage={s} />
                  <span className="text-sm font-bold text-muted mr-auto">{items.length}</span>
                  <Icon name="chevD" size={18} className={`text-muted transition-transform ${isCol ? '' : 'rotate-180'}`} />
                </button>
                {!isCol && (
                  <div>
                    {items.length > 0 && (
                      <div className="hidden md:grid gap-3 px-5 py-2 text-xs font-bold text-muted border-t border-line-soft"
                        style={{ gridTemplateColumns: `${showCoverList ? '56px ' : ''}minmax(220px,2fr) ${listFields.map(() => 'minmax(120px,1fr)').join(' ')}` }}>
                        {showCoverList && <span />}<span>Obchod</span>{listFields.map((f) => <span key={f.key}>{f.label}</span>)}
                      </div>
                    )}
                    {items.map((d) => (
                      <Link key={d.id} to={`/obchody/${d.id}`} className="block border-t border-line-soft no-underline text-ink hover:bg-bg">
                        <div className="hidden md:grid gap-3 items-center px-5 py-2.5 text-sm"
                          style={{ gridTemplateColumns: `${showCoverList ? '56px ' : ''}minmax(220px,2fr) ${listFields.map(() => 'minmax(120px,1fr)').join(' ')}` }}>
                          {showCoverList && <Thumb d={d} size={44} />}
                          <span className="font-bold truncate">{d.title}</span>
                          {listFields.map((f) => <span key={f.key} className="text-[#3A4066] truncate">{fieldValue(d, f)?.text || '—'}</span>)}
                        </div>
                        <MobileRow d={d} fields={mobileFields} showCover={showCoverMobile} />
                      </Link>
                    ))}
                    {items.length === 0 && <p className="m-0 px-5 py-3 text-sm text-muted border-t border-line-soft">Žádné obchody</p>}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <Board stages={visibleStages} byStage={byStage} fields={cardFields} showCover={showCoverCard} onMove={moveDeal} />
      )}
    </div>
  )
}

function Chip({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`shrink-0 h-[38px] px-3.5 rounded-full text-sm font-bold inline-flex items-center gap-1.5 border ${on ? 'bg-navy text-white border-navy' : 'bg-white text-ink border-line'}`}>
      {label}<span className="opacity-70">{n}</span>
    </button>
  )
}

function Thumb({ d, size }: { d: Deal; size: number }) {
  return d.cover_url
    ? <img src={d.cover_url} alt="" loading="lazy" className="rounded-xl object-cover shrink-0" style={{ width: size, height: size }} />
    : <span className="rounded-xl bg-navy-soft text-navy inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}><Icon name="home" size={size * 0.42} /></span>
}

function MobileRow({ d, fields, showCover }: { d: Deal; fields: FieldDef[]; showCover: boolean }) {
  const vals = fields.map((f) => fieldValue(d, f)).filter(Boolean)
  return (
    <div className="md:hidden flex items-center gap-3 px-3.5 py-3">
      {showCover && <Thumb d={d} size={56} />}
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="font-bold text-[15px] leading-snug">{d.title}</span>
        {vals.length > 0 && (
          <span className="flex flex-wrap gap-x-2 gap-y-1 text-[13px] text-muted">
            {vals.map((v) => <span key={v!.key} className="truncate">{v!.text}</span>)}
          </span>
        )}
      </div>
    </div>
  )
}

function Board({ stages, byStage, fields, showCover, onMove }: { stages: Stage[]; byStage: Record<string, Deal[]>; fields: FieldDef[]; showCover: boolean; onMove: (dealId: string, stageId: string) => void }) {
  const [over, setOver] = useState<string | null>(null)
  return (
    <div className="overflow-x-auto pb-3 -mx-4 px-4 md:mx-0 md:px-0">
      <div className="flex gap-3.5 items-start w-max">
        {stages.map((s) => {
          const items = byStage[s.id] || []
          return (
            <section key={s.id}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id) }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/deal'); if (id) onMove(id, s.id) }}
              className={`w-[284px] shrink-0 rounded-[22px] p-2.5 flex flex-col gap-2.5 transition-colors ${over === s.id ? 'bg-[#DDE1EE]' : 'bg-[#ECEEF5]'}`}>
              <div className="flex items-center gap-2 px-1.5 pt-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                <span className="text-sm font-extrabold truncate">{s.name}</span>
                <span className="text-[13px] font-bold text-muted">{items.length}</span>
              </div>
              {items.map((d) => {
                const vals = fields.map((f) => fieldValue(d, f)).filter(Boolean)
                return (
                  <Link key={d.id} to={`/obchody/${d.id}`} draggable onDragStart={(e) => e.dataTransfer.setData('text/deal', d.id)}
                    className="flex flex-col bg-white rounded-[18px] overflow-hidden no-underline text-ink shadow-[0_1px_2px_rgba(27,31,69,.06)]">
                    {showCover && d.cover_url && <img src={d.cover_url} alt="" loading="lazy" className="w-full h-[150px] object-cover" draggable={false} />}
                    <span className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
                      <span className="font-bold text-[15px] leading-snug">{d.title}</span>
                      {vals.length > 0 && (
                        <span className="flex flex-col gap-1.5 text-[13px] text-[#3A4066]">
                          {vals.map((v) => <span key={v!.key}><span className="text-muted">{v!.label}:</span> <b className="text-ink">{v!.text}</b></span>)}
                        </span>
                      )}
                    </span>
                  </Link>
                )
              })}
              {items.length === 0 && <p className="m-0 px-2 py-4 text-[13px] text-muted text-center">Sem přetáhni obchod</p>}
            </section>
          )
        })}
      </div>
    </div>
  )
}
