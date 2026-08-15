/**
 * Extracted out of Trade.tsx (2026-08-11, codebase-quality pass ahead
 * of dev handoff) — the dispute section had grown into its own
 * self-contained unit (status, QVAC auto-resolution recommendation,
 * evidence submission, appeal), reusing none of Trade.tsx's escrow/chat
 * state directly. Real, trade-party-only actions (dispute.service.ts's
 * own 403 check) — see Disputes.tsx's own comment for why the arbiter
 * console doesn't offer these same three, and why it CAN resolve
 * directly instead of needing this evidence step.
 */
import type { Dispute } from '@satsails/p2p-trading-sdk'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { formatDateTime } from '../../lib/format'
import { AlertTriangle, Bot } from 'lucide-react'

const AUTO_RULING_LABEL: Record<string, string> = { RELEASE: 'liberar para o comprador', REFUND: 'reembolsar o vendedor', SPLIT: 'dividir entre as partes' }

interface Props {
  dispute: Dispute
  isBuyer: boolean
  isSeller: boolean
  acting: boolean
  evidenceNote: string
  onEvidenceNoteChange: (value: string) => void
  onSubmitEvidence: () => void
  onContestAutoResolution: () => void
  onAppeal: () => void
}

export function TradeDisputePanel({
  dispute, isBuyer, isSeller, acting, evidenceNote,
  onEvidenceNoteChange, onSubmitEvidence, onContestAutoResolution, onAppeal,
}: Props) {
  const isParty = isBuyer || isSeller

  return (
    <div className="mt-4 pt-4 border-t border-brand-border">
      <div className="flex items-center gap-2 text-xs">
        <AlertTriangle className="h-3.5 w-3.5 text-red-700 shrink-0" />
        <span className="font-semibold text-red-700">
          {dispute.status === 'RESOLVED' ? 'Disputa resolvida' : 'Disputa em andamento'}
        </span>
        {dispute.status === 'AUTO_PROPOSED' && <Bot className="h-3.5 w-3.5 text-purple-500" />}
      </div>
      <p className="text-sm text-brand-text-secondary mt-1.5">{dispute.reason}</p>

      {dispute.status === 'AUTO_PROPOSED' && dispute.autoResolutionRecommendation && (
        <div className="mt-3 bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-purple-500">
            <Bot className="h-3.5 w-3.5" /> Recomendação da QVAC: {AUTO_RULING_LABEL[dispute.autoResolutionRecommendation]}
          </div>
          <p className="text-brand-text-secondary mt-1">{dispute.autoResolutionReasoning}</p>
          <p className="text-brand-text-muted mt-1">
            {Math.round((dispute.autoResolutionConfidence ?? 0) * 100)}% de confiança
            {dispute.autoResolutionDeadline && ` — aplica automaticamente em ${formatDateTime(dispute.autoResolutionDeadline)} se ninguém contestar`}
          </p>
          {isParty && (
            <Button variant="outline" onClick={onContestAutoResolution} disabled={acting} className="mt-2 text-xs px-3 py-1.5">
              Contestar recomendação
            </Button>
          )}
        </div>
      )}

      {dispute.status === 'RESOLVED' && dispute.ruling && (
        <p className="text-xs text-green-500 mt-2">
          Decisão: {AUTO_RULING_LABEL[dispute.ruling] ?? dispute.ruling}
          {dispute.resolvedAt && ` — ${formatDateTime(dispute.resolvedAt)}`}
        </p>
      )}

      {isParty && (dispute.status === 'OPENED' || dispute.status === 'EVIDENCE_SUBMITTED') && (
        <div className="mt-3">
          <Textarea
            value={evidenceNote}
            onChange={(e) => onEvidenceNoteChange(e.target.value)}
            placeholder="Adicionar evidência (ex: comprovante de pagamento, explicação)..."
            className="w-full"
            rows={2}
          />
          <Button variant="outline" onClick={onSubmitEvidence} disabled={acting || !evidenceNote.trim()} className="mt-2 text-xs px-3 py-1.5">
            Enviar evidência
          </Button>
        </div>
      )}

      {isParty && dispute.status === 'RESOLVED' && (
        <Button variant="outline" onClick={onAppeal} disabled={acting} className="mt-3 text-xs px-3 py-1.5">
          Apelar da decisão
        </Button>
      )}
    </div>
  )
}
