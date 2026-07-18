import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_DATA, MOCK_TRADE_HISTORY, MOCK_OFFERS, MOCK_DISPUTES } from '../../data/mock'
import { AssetBadge, TradeStatusBadge } from '../../components/ui/Badge'
import { formatBrl } from '../../lib/format'

export function Dashboard() {
  const activeOffers = MOCK_OFFERS.filter((o) => o.status === 'ACTIVE').length
  const openDisputes = MOCK_DISPUTES.filter((d) => d.status !== 'RESOLVED').length

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight">Painel do Operador</h1>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Ofertas Ativas" value={activeOffers} />
        <StatCard label="Trades Hoje" value={MOCK_TRADE_HISTORY.length} />
        <StatCard label="Volume 24h (BRL)" value={formatBrl(MOCK_TRADE_HISTORY.reduce((s, t) => s + t.totalBrl, 0))} />
        <StatCard label="Disputas Abertas" value={openDisputes} tone={openDisputes > 0 ? 'danger' : 'default'} />
      </div>

      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">Volume diário (30 dias) — mockado</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={CHART_DATA}>
            <CartesianGrid stroke="#f1f1f1" />
            <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 10 }} interval={4} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Line type="monotone" dataKey="volume" stroke="#111827" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Trades recentes
        </div>
        {MOCK_TRADE_HISTORY.map((t) => (
          <div key={t.id} className="px-5 py-3 border-b border-gray-50 last:border-0 flex items-center gap-4 text-sm">
            <span className="font-mono text-xs text-gray-400 w-24">{t.tradeId}</span>
            <AssetBadge asset={t.asset} />
            <span className="text-gray-600">{t.counterpart}</span>
            <span className="ml-auto font-medium">{formatBrl(t.totalBrl)}</span>
            <TradeStatusBadge status={t.status} />
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'danger' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className={`text-2xl font-black ${tone === 'danger' ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  )
}
