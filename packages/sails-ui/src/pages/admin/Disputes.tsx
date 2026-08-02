import { useState } from 'react'
import { toast } from 'sonner'
import { MOCK_DISPUTES } from '../../data/mock'
import { AssetBadge } from '../../components/ui/StatusBadges'
import { formatAmount, formatDateTime } from '../../lib/format'
import type { Dispute } from '../../types'
import { Button } from '../../components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../components/ui/sheet'
import { Swords, ArrowRight, Bot, ShieldCheck, ShieldX } from 'lucide-react'

const AUTO_RULING_LABEL: Record<string, string> = { RELEASE: 'liberar para o comprador', REFUND: 'reembolsar o vendedor', SPLIT: 'dividir entre as partes' }

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

  // RFC-021 D8 — QVAC-assisted first-pass resolution. Accepting just
  // applies the recommendation now instead of waiting for
  // autoResolutionDeadline to pass uncontested (sweepExpiredAutoResolutions()'s
  // real job); SPLIT has no dedicated UI action yet in this reference
  // page (resolve() itself only models RELEASE/REFUND), same disclosed
  // gap as everywhere else this page is still mocked.
  const acceptAutoResolution = (d: Dispute) => {
    if (d.autoResolutionRecommendation === 'SPLIT') {
      toast.error('Divisão parcial (SPLIT) ainda não tem ação dedicada nesta tela de referência')
      return
    }
    if (d.autoResolutionRecommendation) resolve(d.id, d.autoResolutionRecommendation)
  }

  // TODO: real POST /v1/settlement/disputes/:id/contest-auto-resolution
  // (dispute.service.ts's contestAutoResolution() — clears the four
  // autoResolution* fields server-side and reverts status for real
  // human review, same shape mirrored here client-side).
  const contestAutoResolution = (id: string) => {
    setDisputes((prev) => prev.map((d) => (d.id === id ? {
      ...d, status: 'EVIDENCE_SUBMITTED',
      autoResolutionRecommendation: null, autoResolutionConfidence: null,
      autoResolutionReasoning: null, autoResolutionDeadline: null,
    } : d)))
    toast('Recomendação automática contestada — disputa voltou para revisão humana')
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
              <span
                className={`ml-auto px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                  d.status === 'RESOLVED'
                    ? 'bg-green-500/10 text-green-500'
                    : d.status === 'AUTO_PROPOSED'
                      ? 'bg-purple-500/10 text-purple-500'
                      : 'bg-red-500/10 text-red-700'
                }`}
              >
                {d.status === 'AUTO_PROPOSED' && <Bot className="h-3 w-3" />}
                {d.status === 'AUTO_PROPOSED' ? 'Resolução automática proposta' : d.status}
              </span>
            </div>
            <div className="mt-2 text-sm font-medium text-brand-text flex items-center gap-1.5">
              {d.buyer.displayName} <Swords className="h-3.5 w-3.5 text-brand-text-muted" /> {d.seller.displayName}
            </div>
            <p className="text-sm text-brand-text-muted mt-1 line-clamp-2">{d.reason}</p>

            {/* RFC-021 D8 — QVAC-assisted first-pass resolution, off by
                default server-side (config.features.qvacAutoResolutionEnabled).
                A confidence score and reasoning are shown so a human
                arbiter can judge the recommendation, not just accept it
                blindly — the deadline is when it auto-applies if left
                uncontested (sweepExpiredAutoResolutions()). */}
            {d.status === 'AUTO_PROPOSED' && d.autoResolutionRecommendation && (
              <div className="mt-3 bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-purple-500">
                  <Bot className="h-3.5 w-3.5" /> Recomendação: {AUTO_RULING_LABEL[d.autoResolutionRecommendation]}
                  <span className="ml-auto font-normal text-brand-text-muted">{Math.round((d.autoResolutionConfidence ?? 0) * 100)}% de confiança</span>
                </div>
                <p className="text-brand-text-secondary mt-1">{d.autoResolutionReasoning}</p>
                {d.autoResolutionDeadline && (
                  <p className="text-brand-text-muted mt-1">Aplica automaticamente em {formatDateTime(d.autoResolutionDeadline)} se ninguém contestar</p>
                )}
              </div>
            )}

            {d.status === 'AUTO_PROPOSED' ? (
              <div className="mt-3 flex gap-2">
                <Button variant="outline" onClick={() => setSelected(d)} className="text-xs px-3 py-1.5">Revisar</Button>
                <Button onClick={() => acceptAutoResolution(d)} className="text-xs px-3 py-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> Aceitar recomendação
                </Button>
                <Button variant="outline" onClick={() => contestAutoResolution(d.id)} className="text-xs px-3 py-1.5">
                  <ShieldX className="h-3.5 w-3.5" /> Contestar
                </Button>
              </div>
            ) : d.status !== 'RESOLVED' && (
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
                {selected.appealRound > 0 && (
                  <div><span className="text-brand-text-muted">Rodada de apelação:</span> <span className="text-brand-text">#{selected.appealRound}{selected.previousRuling ? ` (decisão anterior: ${AUTO_RULING_LABEL[selected.previousRuling] ?? selected.previousRuling})` : ''}</span></div>
                )}
              </div>

              {selected.status === 'AUTO_PROPOSED' && selected.autoResolutionRecommendation ? (
                <>
                  <div className="mt-4 bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 text-sm">
                    <div className="flex items-center gap-1.5 font-semibold text-purple-500">
                      <Bot className="h-4 w-4" /> Recomendação da QVAC: {AUTO_RULING_LABEL[selected.autoResolutionRecommendation]}
                    </div>
                    <p className="text-brand-text-secondary mt-1.5">{selected.autoResolutionReasoning}</p>
                    <p className="text-brand-text-muted mt-1.5 text-xs">
                      {Math.round((selected.autoResolutionConfidence ?? 0) * 100)}% de confiança
                      {selected.autoResolutionDeadline && ` — aplica automaticamente em ${formatDateTime(selected.autoResolutionDeadline)} se ninguém contestar`}
                    </p>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button onClick={() => acceptAutoResolution(selected)} className="flex-1 py-2 text-sm">
                      <ShieldCheck className="h-4 w-4" /> Aceitar recomendação
                    </Button>
                    <Button variant="outline" onClick={() => contestAutoResolution(selected.id)} className="flex-1 py-2 text-sm">
                      <ShieldX className="h-4 w-4" /> Contestar
                    </Button>
                  </div>
                </>
              ) : (
                <div className="mt-6 flex gap-2">
                  <Button onClick={() => resolve(selected.id, 'RELEASE')} className="flex-1 py-2 text-sm">
                    Liberar p/ Comprador
                  </Button>
                  <Button variant="outline" onClick={() => resolve(selected.id, 'REFUND')} className="flex-1 py-2 text-sm">
                    Reembolsar Vendedor
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
