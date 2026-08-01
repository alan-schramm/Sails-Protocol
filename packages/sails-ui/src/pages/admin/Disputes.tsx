import { useState } from 'react'
import { toast } from 'sonner'
import { MOCK_DISPUTES } from '../../data/mock'
import { AssetBadge } from '../../components/ui/StatusBadges'
import { formatAmount, formatDateTime } from '../../lib/format'
import type { Dispute } from '../../types'
import { Button } from '../../components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../components/ui/sheet'
import { Swords, ArrowRight } from 'lucide-react'

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
        <h1 className="text-2xl font-display font-bold tracking-tight text-brand-text">Disputas</h1>
        <span className="bg-red-500/10 text-red-700 text-xs font-bold rounded-full px-2 py-0.5">
          {disputes.filter((d) => d.status !== 'RESOLVED').length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {disputes.map((d) => (
          <div key={d.id} className="bg-brand-surface border border-red-500/20 rounded-lg p-5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-brand-text-muted">{d.tradeId}</span>
              <AssetBadge asset={d.asset} />
              <span className="text-brand-text-muted">{formatDateTime(d.openedAt)}</span>
              <span className={`ml-auto px-2 py-0.5 rounded-full font-medium ${d.status === 'RESOLVED' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-700'}`}>
                {d.status}
              </span>
            </div>
            <div className="mt-2 text-sm font-medium text-brand-text flex items-center gap-1.5">
              {d.buyer.displayName} <Swords className="h-3.5 w-3.5 text-brand-text-muted" /> {d.seller.displayName}
            </div>
            <p className="text-sm text-brand-text-muted mt-1 line-clamp-2">{d.reason}</p>
            {d.status !== 'RESOLVED' && (
              <div className="mt-3 flex gap-2">
                <Button variant="outline" onClick={() => setSelected(d)} className="text-xs px-3 py-1.5">Revisar</Button>
                <Button onClick={() => resolve(d.id, 'RELEASE')} className="text-xs px-3 py-1.5">
                  Resolver <ArrowRight className="h-3.5 w-3.5" /> Comprador
                </Button>
                <Button variant="outline" onClick={() => resolve(d.id, 'REFUND')} className="text-xs px-3 py-1.5">
                  Resolver <ArrowRight className="h-3.5 w-3.5" /> Vendedor
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Real Radix Sheet (2026-08-01) — replaces a hand-rolled
          `fixed inset-0` backdrop + manual `stopPropagation()` + a
          duplicate "✕ Fechar" button (SheetContent already renders an
          accessible close control). Real gain (focus trap, Escape,
          role="dialog"), not just visual consistency — see
          feedback_slc_ui_philosophy. */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Disputa — {selected.tradeId}</SheetTitle>
                <SheetDescription>{selected.reason}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 text-sm space-y-1">
                <div><span className="text-brand-text-muted">Ativo:</span> <span className="text-brand-text">{selected.asset}</span></div>
                <div><span className="text-brand-text-muted">Valor:</span> <span className="text-brand-text">{formatAmount(selected.amount)}</span></div>
                <div><span className="text-brand-text-muted">Aberto por:</span> <span className="text-brand-text">{selected.openedBy === selected.buyer.id ? selected.buyer.displayName : selected.seller.displayName}</span></div>
              </div>
              <div className="mt-6 flex gap-2">
                <Button onClick={() => resolve(selected.id, 'RELEASE')} className="flex-1 py-2 text-sm">
                  Liberar p/ Comprador
                </Button>
                <Button variant="outline" onClick={() => resolve(selected.id, 'REFUND')} className="flex-1 py-2 text-sm">
                  Reembolsar Vendedor
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
