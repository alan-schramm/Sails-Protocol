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
      <h1 className="text-2xl font-black tracking-tight">Histórico de Trades</h1>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <SummaryStat value={formatBrl(totalVolume)} label="Volume total" />
        <SummaryStat value={completed} label="Concluídos" />
        <SummaryStat value={`${disputeRate}%`} label="Taxa de disputa" />
      </div>

      <div className="mt-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3.5 py-1.5 text-sm border ${
              filter === f.value ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {trades.map((t) => (
          <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-2">
            <div className="flex items-center gap-2">
              <AssetBadge asset={t.asset} />
              <span className="font-medium text-sm">{formatAmount(t.amount)} com {t.counterpart}</span>
            </div>
            <div className="flex items-center gap-2 md:ml-4">
              <span className={`text-xs px-2 py-0.5 rounded-full ${t.role === 'BUYER' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                {t.role === 'BUYER' ? 'Comprador' : 'Vendedor'}
              </span>
              <span className="text-xs text-gray-400">{t.date}</span>
            </div>
            <div className="md:ml-auto flex items-center gap-3">
              <span className="font-bold">{formatBrl(t.totalBrl)}</span>
              <TradeStatusBadge status={t.status} />
              <Link to={`/trade/${t.tradeId}`} className="text-xs text-gray-500 hover:text-gray-800">Ver Trade</Link>
            </div>
          </div>
        ))}
        {trades.length === 0 && <p className="text-center text-gray-400 py-10">Nenhum trade encontrado.</p>}
      </div>
    </div>
  )
}

function SummaryStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
      <div className="text-lg font-black">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}
