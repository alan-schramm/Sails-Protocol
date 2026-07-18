import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MOCK_TRADE_HISTORY } from '../data/mock'
import { AssetBadge, TradeStatusBadge } from '../components/ui/Badge'
import { formatBrl, formatAmount } from '../lib/format'
import type { TradeStatus } from '../types'

const FILTERS: { value: TradeStatus | 'Todos'; label: string }[] = [
  { value: 'Todos', label: 'Todos' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'DISPUTED', label: 'Em disputa' },
  { value: 'CANCELLED', label: 'Cancelado' },
]

export function TradeHistory() {
  const [filter, setFilter] = useState<TradeStatus | 'Todos'>('Todos')

  const trades = useMemo(
    () => MOCK_TRADE_HISTORY.filter((t) => filter === 'Todos' || t.status === filter),
    [filter]
  )

  const totalVolume = MOCK_TRADE_HISTORY.reduce((sum, t) => sum + t.totalBrl, 0)
  const completed = MOCK_TRADE_HISTORY.filter((t) => t.status === 'COMPLETED').length
  const disputeRate = ((MOCK_TRADE_HISTORY.filter((t) => t.status === 'DISPUTED').length / MOCK_TRADE_HISTORY.length) * 100).toFixed(0)

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight text-brand-text">Histórico de Trades</h1>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <SummaryStat value={formatBrl(totalVolume)} label="Volume total" />
        <SummaryStat value={completed} label="Concluídos" />
        <SummaryStat value={`${disputeRate}%`} label="Taxa de disputa" />
      </div>

      <div className="mt-4 flex gap-2">
        {FILTERS.map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)} className={filter === f.value ? 'pill-active' : 'pill-inactive'}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {trades.map((t) => (
          <div key={t.id} className="card p-4 flex flex-col md:flex-row md:items-center gap-2">
            <div className="flex items-center gap-2">
              <AssetBadge asset={t.asset} />
              <span className="font-medium text-sm text-brand-text">{formatAmount(t.amount)} com {t.counterpart}</span>
            </div>
            <div className="flex items-center gap-2 md:ml-4">
              <span className={`text-xs px-2 py-0.5 rounded-full ${t.role === 'BUYER' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'}`}>
                {t.role === 'BUYER' ? 'Comprador' : 'Vendedor'}
              </span>
              <span className="text-xs text-brand-text-muted">{t.date}</span>
            </div>
            <div className="md:ml-auto flex items-center gap-3">
              <span className="font-bold text-brand-text">{formatBrl(t.totalBrl)}</span>
              <TradeStatusBadge status={t.status} />
              <Link to={`/trade/${t.tradeId}`} className="text-xs text-brand-text-muted hover:text-brand-text">Ver Trade</Link>
            </div>
          </div>
        ))}
        {trades.length === 0 && <p className="text-center text-brand-text-muted py-10">Nenhum trade encontrado.</p>}
      </div>
    </div>
  )
}

function SummaryStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-lg font-black text-brand-text">{value}</div>
      <div className="text-xs text-brand-text-muted">{label}</div>
    </div>
  )
}
