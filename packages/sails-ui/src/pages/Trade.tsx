import { useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { MOCK_TRADE } from '../data/mock'
import type { EscrowStatus, Message, MessageType, Offer } from '../types'
import { useAuth } from '../context/AuthContext'
import { TradeStatusBadge, EscrowStatusBadge } from '../components/ui/Badge'
import { EscrowStateMachine } from '../components/trade/EscrowStateMachine'
import { EscrowActions } from '../components/trade/EscrowActions'
import { TradeParties } from '../components/trade/TradeParties'
import { ChatWindow } from '../components/chat/ChatWindow'
import { AgentRiskCard } from '../components/agent/AgentRiskCard'
import { buildTradeFromOffer } from '../lib/buildTrade'
import { formatDateTime } from '../lib/format'
import { formatByCurrency } from '../lib/currency'
import { detectRiskLocally } from '../lib/socialEngineering'
import { ASSET_LABELS } from '../lib/labels'

let msgCounter = 100

function systemMessage(content: string): Message {
  return { id: `sys-${msgCounter++}`, senderId: null, sender: null, content, type: 'SYSTEM', createdAt: new Date().toISOString() }
}

export function Trade() {
  const { id } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  // TODO: replace with @sails/sdk `settlement.getEscrowByTrade(id)` +
  // `openp2p.getTrade(id)` (real routes: GET /v1/settlement/escrow/:id,
  // GET /v1/openp2p/trades/:id). Until then: if the user arrived via
  // OfferDetail's "Iniciar Trade" (real fix — used to always show
  // MOCK_TRADE regardless of which offer/amount was picked), build a
  // trade that actually reflects it (src/lib/buildTrade.ts). A direct
  // navigation to this URL with no state — a bookmark, a page refresh,
  // or TradeHistory's "Ver Trade" links, which reference a historical
  // trade this client-only mock has no way to reconstruct — falls back
  // to the same MOCK_TRADE demo data every screen used before this fix;
  // that fallback is intentional, not the bug being fixed here.
  const trade = useMemo(() => {
    const state = location.state as { offer?: Offer; amount?: number } | null
    if (state?.offer && state.amount && user) {
      return buildTradeFromOffer(state.offer, state.amount, user)
    }
    return MOCK_TRADE
  }, [location.state, user])

  const [escrowStatus, setEscrowStatus] = useState<EscrowStatus>(trade.escrow.status)
  const [messages, setMessages] = useState<Message[]>(trade.messages)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')

  const isBuyer = user?.id === trade.buyer.id
  const isSeller = user?.id === trade.seller.id

  const events = useMemo(() => trade.escrow.events, [trade])

  const appendSystem = (text: string) => setMessages((m) => [...m, systemMessage(text)])

  const handleLockFunds = () => {
    setEscrowStatus('FUNDS_LOCKED')
    appendSystem('🔒 Vendedor bloqueou os fundos no escrow.')
    toast.success('Escrow bloqueado 🔒')
  }

  const handleMarkPaymentSent = () => {
    setEscrowStatus('PAYMENT_PENDING')
    appendSystem('💸 Comprador marcou o pagamento como enviado.')
    toast.success('Pagamento marcado como enviado 💸')
  }

  const handleReleaseFunds = () => {
    setEscrowStatus('COMPLETED')
    appendSystem('✅ Vendedor liberou os fundos. Trade concluído (tx: mock-release-' + Math.random().toString(36).slice(2, 10) + ')')
    toast.success('Fundos liberados — trade concluído!')
  }

  const handleOpenDispute = () => {
    if (!disputeReason.trim()) {
      toast.error('Descreva o motivo da disputa')
      return
    }
    setEscrowStatus('DISPUTED')
    appendSystem(`⚠️ Disputa aberta: "${disputeReason}"`)
    toast.error('Disputa aberta')
    setShowDisputeForm(false)
    setDisputeReason('')
  }

  const handleSend = (content: string) => {
    setMessages((m) => [...m, { id: `m-${msgCounter++}`, senderId: user?.id ?? null, sender: user, content, type: 'TEXT', createdAt: new Date().toISOString() }])

    // Mocked reflection of RFC-017's SocialEngineeringAgent — see
    // lib/socialEngineering.ts's own comment for what's real vs simulated.
    const warning = detectRiskLocally(content)
    if (warning) {
      setTimeout(() => {
        setMessages((m) => [
          ...m,
          {
            id: `risk-${msgCounter++}`, senderId: null, sender: null,
            content: warning.reasoning, type: 'RISK_WARNING', riskPattern: warning.pattern,
            createdAt: new Date().toISOString(),
          },
        ])
      }, 600)
    }
  }

  const handleSendMedia = (media: { url: string; fileName: string; type: MessageType }) => {
    setMessages((m) => [
      ...m,
      { id: `m-${msgCounter++}`, senderId: user?.id ?? null, sender: user, content: '', type: media.type, mediaUrl: media.url, mediaFileName: media.fileName, createdAt: new Date().toISOString() },
    ])
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link to="/" className="text-sm text-brand-text-secondary hover:text-brand-text">←</Link>
        <span className="font-mono text-sm text-brand-text-muted">Trade #{id?.slice(0, 8)}</span>
        <TradeStatusBadge status={trade.status} />
      </div>

      <div className="mt-4 grid lg:grid-cols-[380px_1fr] gap-4">
        <div>
          <div className="card p-4 divide-y divide-brand-border">
            <Row label="Ativo" value={ASSET_LABELS[trade.asset]} />
            <Row label="Quantidade" value={String(trade.amount)} />
            <Row label="Total" value={formatByCurrency(trade.totalBrl, trade.offer.fiatCurrency)} />
            <Row label="Status do escrow" value={<EscrowStatusBadge status={escrowStatus} />} />
          </div>

          <TradeParties buyer={trade.buyer} seller={trade.seller} currentUserId={user?.id} />

          <AgentRiskCard asset={trade.asset} side={isBuyer ? 'BUY' : 'SELL'} maxValue={trade.totalUsd} minValue={trade.totalUsd} />

          <div className="card p-5 mt-3">
            <EscrowStateMachine status={escrowStatus} />

            {!showDisputeForm ? (
              <EscrowActions
                status={escrowStatus}
                isBuyer={isBuyer}
                isSeller={isSeller}
                onLockFunds={handleLockFunds}
                onMarkPaymentSent={handleMarkPaymentSent}
                onReleaseFunds={handleReleaseFunds}
                onOpenDispute={() => setShowDisputeForm(true)}
              />
            ) : (
              <div className="mt-4">
                <textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Descreva o motivo da disputa..."
                  className="input-field w-full"
                  rows={3}
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={handleOpenDispute} className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-lg py-2 text-sm font-semibold transition-colors">Confirmar Disputa</button>
                  <button onClick={() => setShowDisputeForm(false)} className="flex-1 btn-ghost py-2 text-sm">Cancelar</button>
                </div>
              </div>
            )}

            {!isBuyer && !isSeller && user && (
              <p className="text-xs text-brand-text-muted mt-3">Você não é parte deste trade — ações desabilitadas.</p>
            )}
            {!user && <p className="text-xs text-brand-text-muted mt-3">Conecte sua carteira para agir neste trade.</p>}
          </div>

          <details className="mt-3 card p-4">
            <summary className="text-xs font-semibold text-brand-text-muted cursor-pointer">Histórico de eventos</summary>
            <div className="mt-2 space-y-1.5">
              {events.map((e, i) => (
                <div key={i} className="flex gap-3 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-text-muted mt-1 shrink-0" />
                  <span className="font-medium text-brand-text-secondary">{e.status}</span>
                  <span className="text-brand-text-muted">{e.actor}</span>
                  <span className="text-brand-text-muted ml-auto">{formatDateTime(e.timestamp)}</span>
                </div>
              ))}
            </div>
          </details>
        </div>

        <ChatWindow messages={messages} currentUserId={user?.id} onSend={handleSend} onSendMedia={handleSendMedia} />
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2.5 text-sm">
      <span className="text-brand-text-muted">{label}</span>
      <span className="font-medium text-brand-text">{value}</span>
    </div>
  )
}
