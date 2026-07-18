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
        <h1 className="text-2xl font-black tracking-tight">Disputas</h1>
        <span className="bg-red-100 text-red-600 text-xs font-bold rounded-full px-2 py-0.5">
          {disputes.filter((d) => d.status !== 'RESOLVED').length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {disputes.map((d) => (
          <div key={d.id} className="bg-white border border-red-100 rounded-xl p-5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-gray-400">{d.tradeId}</span>
              <AssetBadge asset={d.asset} />
              <span className="text-gray-400">{formatDateTime(d.openedAt)}</span>
              <span className={`ml-auto px-2 py-0.5 rounded-full font-medium ${d.status === 'RESOLVED' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {d.status}
              </span>
            </div>
            <div className="mt-2 text-sm font-medium">{d.buyer.displayName} ⚔️ {d.seller.displayName}</div>
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{d.reason}</p>
            {d.status !== 'RESOLVED' && (
              <div className="mt-3 flex gap-2">
                <button onClick={() => setSelected(d)} className="text-xs border border-gray-300 rounded-md px-3 py-1.5">Revisar</button>
                <button onClick={() => resolve(d.id, 'RELEASE')} className="text-xs bg-gray-900 text-white rounded-md px-3 py-1.5">
                  Resolver → Comprador
                </button>
                <button onClick={() => resolve(d.id, 'REFUND')} className="text-xs border border-gray-300 rounded-md px-3 py-1.5">
                  Resolver → Vendedor
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex justify-end z-50" onClick={() => setSelected(null)}>
          <div className="bg-white h-full w-full max-w-md p-6 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} className="text-sm text-gray-400">✕ Fechar</button>
            <h3 className="font-semibold mt-3">Disputa — {selected.tradeId}</h3>
            <p className="text-sm text-gray-500 mt-2">{selected.reason}</p>
            <div className="mt-4 text-sm space-y-1">
              <div><span className="text-gray-400">Ativo:</span> {selected.asset}</div>
              <div><span className="text-gray-400">Valor:</span> {formatAmount(selected.amount)}</div>
              <div><span className="text-gray-400">Aberto por:</span> {selected.openedBy === selected.buyer.id ? selected.buyer.displayName : selected.seller.displayName}</div>
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => resolve(selected.id, 'RELEASE')} className="flex-1 bg-gray-900 text-white rounded-lg py-2 text-sm font-semibold">
                Liberar p/ Comprador
              </button>
              <button onClick={() => resolve(selected.id, 'REFUND')} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm">
                Reembolsar Vendedor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
