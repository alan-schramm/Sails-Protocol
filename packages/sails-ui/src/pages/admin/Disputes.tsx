import { useState } from 'react'
import { toast } from 'sonner'
import { MOCK_DISPUTES } from '../../data/mock'
import { AssetBadge } from '../../components/ui/Badge'
import { formatAmount, formatDateTime } from '../../lib/format'
import type { Dispute } from '../../types'

export function Disputes() {
  const [disputes, setDisputes] = useState(MOCK_DISPUTES)
  const [selected, setSelected] = useState<Dispute | null>(null)

  const resolve = (id: string, ruling: 'RELEASE' | 'REFUND') => {
    // TODO: real POST /v1/settlement/disputes/:id/resolve
    // (dispute.service.ts's resolveDispute() — only the assigned
    // arbiter, TRUSTED_ARBITRATORS-configured, may call this for real)
    setDisputes((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'RESOLVED' } : d)))
    toast.success(ruling === 'RELEASE' ? 'Resolvido a favor do comprador' : 'Resolvido a favor do vendedor')
    setSelected(null)
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-black tracking-tight text-brand-text">Disputas</h1>
        <span className="bg-red-500/10 text-red-500 text-xs font-bold rounded-full px-2 py-0.5">
          {disputes.filter((d) => d.status !== 'RESOLVED').length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {disputes.map((d) => (
          <div key={d.id} className="bg-brand-surface border border-red-500/20 rounded-xl p-5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-brand-text-muted">{d.tradeId}</span>
              <AssetBadge asset={d.asset} />
              <span className="text-brand-text-muted">{formatDateTime(d.openedAt)}</span>
              <span className={`ml-auto px-2 py-0.5 rounded-full font-medium ${d.status === 'RESOLVED' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                {d.status}
              </span>
            </div>
            <div className="mt-2 text-sm font-medium text-brand-text">{d.buyer.displayName} ⚔️ {d.seller.displayName}</div>
            <p className="text-sm text-brand-text-muted mt-1 line-clamp-2">{d.reason}</p>
            {d.status !== 'RESOLVED' && (
              <div className="mt-3 flex gap-2">
                <button onClick={() => setSelected(d)} className="btn-ghost text-xs px-3 py-1.5">Revisar</button>
                <button onClick={() => resolve(d.id, 'RELEASE')} className="btn-primary text-xs px-3 py-1.5">
                  Resolver → Comprador
                </button>
                <button onClick={() => resolve(d.id, 'REFUND')} className="btn-ghost text-xs px-3 py-1.5">
                  Resolver → Vendedor
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex justify-end z-50" onClick={() => setSelected(null)}>
          <div className="bg-brand-surface border-l border-brand-border h-full w-full max-w-md p-6 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} className="text-sm text-brand-text-muted hover:text-brand-text">✕ Fechar</button>
            <h3 className="font-semibold mt-3 text-brand-text">Disputa — {selected.tradeId}</h3>
            <p className="text-sm text-brand-text-muted mt-2">{selected.reason}</p>
            <div className="mt-4 text-sm space-y-1">
              <div><span className="text-brand-text-muted">Ativo:</span> <span className="text-brand-text">{selected.asset}</span></div>
              <div><span className="text-brand-text-muted">Valor:</span> <span className="text-brand-text">{formatAmount(selected.amount)}</span></div>
              <div><span className="text-brand-text-muted">Aberto por:</span> <span className="text-brand-text">{selected.openedBy === selected.buyer.id ? selected.buyer.displayName : selected.seller.displayName}</span></div>
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => resolve(selected.id, 'RELEASE')} className="btn-primary flex-1 py-2 text-sm">
                Liberar p/ Comprador
              </button>
              <button onClick={() => resolve(selected.id, 'REFUND')} className="btn-ghost flex-1 py-2 text-sm">
                Reembolsar Vendedor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
