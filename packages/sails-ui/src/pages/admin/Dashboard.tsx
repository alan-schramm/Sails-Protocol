import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_DATA, MOCK_TRADE_HISTORY, MOCK_OFFERS, MOCK_DISPUTES } from '../../data/mock'
import { AssetBadge, TradeStatusBadge } from '../../components/ui/Badge'
import { formatBrl } from '../../lib/format'

export function Dashboard() {
  const activeOffers = MOCK_OFFERS.filter((o) => o.status === 'ACTIVE').length
  const openDisputes = MOCK_DISPUTES.filter((d) => d.status !== 'RESOLVED').length

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight text-brand-text">Painel do Operador</h1>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Ofertas Ativas" value={activeOffers} />
        <StatCard label="Trades Hoje" value={MOCK_TRADE_HISTORY.length} />
        <StatCard label="Volume 24h (BRL)" value={formatBrl(MOCK_TRADE_HISTORY.reduce((s, t) => s + t.totalBrl, 0))} />
        <StatCard label="Disputas Abertas" value={openDisputes} tone={openDisputes > 0 ? 'danger' : 'default'} />
      </div>

      <div className="mt-6 card p-5">
        <h3 className="text-sm font-semibold text-brand-text-muted mb-3">Volume diário (30 dias) — mockado</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={CHART_DATA}>
            <CartesianGrid stroke="rgb(var(--color-border))" />
            <XAxis dataKey="date" stroke="rgb(var(--color-text-muted))" tick={{ fontSize: 10, fill: 'rgb(var(--color-text-muted))' }} interval={4} />
            <YAxis stroke="rgb(var(--color-text-muted))" tick={{ fontSize: 10, fill: 'rgb(var(--color-text-muted))' }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, background: 'rgb(var(--color-surface))', border: '1px solid rgb(var(--color-border))', color: 'rgb(var(--color-text))' }} />
            <Line type="monotone" dataKey="volume" stroke="rgb(var(--color-orange))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 card overflow-hidden">
        <div className="px-5 py-3 border-b border-brand-border text-xs font-semibold text-brand-text-muted uppercase tracking-wider">
          Trades recentes
        </div>
        {MOCK_TRADE_HISTORY.map((t) => (
          <div key={t.id} className="px-5 py-3 border-b border-brand-border last:border-0 flex items-center gap-4 text-sm">
            <span className="font-mono text-xs text-brand-text-muted w-24">{t.tradeId}</span>
            <AssetBadge asset={t.asset} />
            <span className="text-brand-text-secondary">{t.counterpart}</span>
            <span className="ml-auto font-medium text-brand-text">{formatBrl(t.totalBrl)}</span>
            <TradeStatusBadge status={t.status} />
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'danger' }) {
  return (
    <div className="card p-4">
      <div className={`text-2xl font-black ${tone === 'danger' ? 'text-red-500' : 'text-brand-text'}`}>{value}</div>
      <div className="text-xs text-brand-text-muted mt-1">{label}</div>
    </div>
  )
}
