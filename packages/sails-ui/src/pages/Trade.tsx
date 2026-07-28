import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import type { Trade as SdkTrade, Escrow as SdkEscrow, Message as SdkMessage, ChatMessageEvent, WebSocketChannel } from '@sails/sdk'
import type { EscrowStatus, Message, MessageType, User } from '../types'
import { useAuth } from '../context/AuthContext'
import { useEscrowKey } from '../hooks/useEscrowKey'
import { sailsClient } from '../lib/sailsClient'
import { TradeStatusBadge, EscrowStatusBadge } from '../components/ui/Badge'
import { EscrowStateMachine } from '../components/trade/EscrowStateMachine'
import { EscrowActions } from '../components/trade/EscrowActions'
import { TradeParties } from '../components/trade/TradeParties'
import { ChatWindow } from '../components/chat/ChatWindow'
import { AgentRiskCard } from '../components/agent/AgentRiskCard'
import { formatDateTime } from '../lib/format'
import { formatByCurrency } from '../lib/currency'
import { detectRiskLocally } from '../lib/socialEngineering'
import { ASSET_LABELS, PAYMENT_METHOD_LABELS } from '../lib/labels'

// A real buyer address doesn't exist yet in this reference implementation
// (wdk-settlement.provider.ts's own doc comment: no per-user EVM address
// onboarding) — same gap this whole project already discloses. Demo-only
// placeholder; only MockSettlementProvider actually accepts an arbitrary
// string here (WDK_USDT_EVM validates a real EVM address, MULTISIG/
// LIGHTNING_HODL below use their own dedicated hex-script placeholder,
// since a real bitcoin/Ark address wouldn't survive this reference
// implementation's own address-format checks either).
const DEMO_RELEASE_ADDRESS = 'demo-buyer-payout-address'

// MULTISIG's Phase 2 initiateRelease() expects a real bech32 testnet
// address (bitcoinjs-lib's Psbt.addOutput() decodes it); LIGHTNING_HODL's
// expects a raw script hex instead (lightning-hodl.provider.ts's own
// header comment / buildUnsignedSpend()). Both demo-only placeholders —
// see DEMO_RELEASE_ADDRESS's own comment above for the broader gap.
const DEMO_RELEASE_ADDRESS_MULTISIG = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
const DEMO_RELEASE_SCRIPT_HEX_ARKADE = '0014' + '00'.repeat(20)

function toParticipantUser(p: Awaited<ReturnType<typeof sailsClient.identity.get>>): User {
  return {
    id: p.id, publicKey: p.publicKey, displayName: p.displayName, peerId: p.peerId,
    reputationScore: p.reputationScore, totalTrades: p.totalTrades, disputeCount: p.disputeCount,
    totalVolumeBtc: Number(p.totalVolumeBtc), verified: p.verified, createdAt: p.createdAt,
  }
}

function toUiMessage(m: SdkMessage, buyer: User, seller: User): Message {
  const sender = m.senderId === buyer.id ? buyer : m.senderId === seller.id ? seller : null
  return {
    id: m.id, senderId: m.senderId, sender,
    content: m.content, type: (m.msgType as MessageType) ?? 'TEXT',
    createdAt: m.createdAt,
  }
}

// The live WS NEW_MESSAGE frame's real shape (ChatMessageEvent, fixed
// the same day in @sails/sdk's openp2p.ts — see that file's own comment)
// genuinely differs from getMessages()'s REST history shape (SdkMessage
// above): messageId/timestamp, not id/createdAt.
function toUiMessageFromEvent(m: ChatMessageEvent, buyer: User, seller: User): Message {
  const sender = m.senderId === buyer.id ? buyer : m.senderId === seller.id ? seller : null
  return {
    id: m.messageId, senderId: m.senderId, sender,
    content: m.content, type: (m.msgType as MessageType) ?? 'TEXT',
    createdAt: m.timestamp,
  }
}

export function Trade() {
  const { id } = useParams()
  const { user } = useAuth()
  const { submitEscrowKeyIfNeeded, signAndSubmitPendingTransactionIfNeeded } = useEscrowKey()

  const [trade, setTrade] = useState<SdkTrade | null>(null)
  const [escrow, setEscrow] = useState<SdkEscrow | null>(null)
  const [buyer, setBuyer] = useState<User | null>(null)
  const [seller, setSeller] = useState<User | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const channelRef = useRef<WebSocketChannel | null>(null)

  // Real fetch — openp2p.getTrade() + identity.get() for both real
  // parties + settlement.get() for the real escrow (if one exists yet)
  // + real chat history. Independent of how the page was reached (a
  // fresh POST /v1/openp2p/trades navigation, a bookmark, or a refresh)
  // — no client-only mock construction left (buildTrade.ts, replaced).
  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const t = await sailsClient.openp2p.getTrade(id)
      if (cancelled) return
      setTrade(t)

      const [b, s] = await Promise.all([
        sailsClient.identity.get(t.buyerId).then(toParticipantUser),
        sailsClient.identity.get(t.sellerId).then(toParticipantUser),
      ])
      if (cancelled) return
      setBuyer(b)
      setSeller(s)

      if (t.escrowId) {
        let e = await sailsClient.settlement.get(t.escrowId)
        // Client-held-keys write path (MULTISIG/LIGHTNING_HODL only, see
        // useEscrowKey's own header comment) — submitting is idempotent
        // and requires an authenticated session, so only attempted for a
        // logged-in counterparty, not every visitor who opens this page.
        if (user && (user.id === t.buyerId || user.id === t.sellerId)) {
          await submitEscrowKeyIfNeeded(e.type, e.id).catch(() => {})
          // Phase 2 (2026-07-27), MULTISIG only — if a release/refund
          // signature round is already in flight and this user is one of
          // its required signers, auto-sign and submit (useEscrowKey's
          // own header comment on signAndSubmitPendingTransactionIfNeeded
          // has the full "no dedicated screen, call speculatively" scope
          // note). A safe no-op otherwise.
          await signAndSubmitPendingTransactionIfNeeded(e.type, e.id, user.id).catch(() => {})
          e = await sailsClient.settlement.get(t.escrowId)
        }
        if (!cancelled) setEscrow(e)
      }

      if (user) {
        const history = await sailsClient.openp2p.getMessages(t.id).catch(() => [])
        if (!cancelled) setMessages(history.map((m) => toUiMessage(m, b, s)))

        // Real WS chat (RFC-004/API_REFERENCE.md §5) — live NEW_MESSAGE
        // frames appended as they arrive, same channel used to send.
        const channel = sailsClient.openp2p.chat(t.id)
        channel.onMessage((m) => setMessages((prev) => [...prev, toUiMessageFromEvent(m, b, s)]))
        channelRef.current = channel
      }
    })().finally(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
      channelRef.current?.close()
      channelRef.current = null
    }
  }, [id, user])

  const isBuyer = !!user && !!trade && user.id === trade.buyerId
  const isSeller = !!user && !!trade && user.id === trade.sellerId

  const events = useMemo(() => {
    if (!escrow) return []
    // No dedicated escrow-history endpoint is wired into this SDK yet —
    // deriving a single current-state entry from the real Escrow row
    // rather than fabricating a full event log this UI can't fetch.
    return [{ status: escrow.status as EscrowStatus, timestamp: escrow.updatedAt, actor: 'system' as const }]
  }, [escrow])

  const withGuard = async (fn: () => Promise<void>) => {
    setActing(true)
    try {
      await fn()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha na ação')
    } finally {
      setActing(false)
    }
  }

  const handleCreateEscrow = () => trade && withGuard(async () => {
    const e = await sailsClient.settlement.create({ tradeId: trade.id, lockedAmount: trade.amount, asset: trade.asset })
    setEscrow(e)
    toast.success('Escrow criado')
  })

  const handleLockFunds = () => escrow && withGuard(async () => {
    const e = await sailsClient.settlement.lock(escrow.id)
    setEscrow(e)
    toast.success('Escrow bloqueado 🔒')
  })

  const handleMarkPaymentSent = () => escrow && withGuard(async () => {
    const e = await sailsClient.settlement.markPaymentSent(escrow.id)
    setEscrow(e)
    toast.success('Pagamento marcado como enviado 💸')
  })

  const handleReleaseFunds = () => escrow && withGuard(async () => {
    // Phase 2 (2026-07-27) — MULTISIG and LIGHTNING_HODL both use
    // client-signature collection now, since buyer/seller keys are
    // client-held. The seller (normal path) or assigned arbiter (disputed
    // path) initiates the round here; if this user is also one of its
    // required signers (the normal path), sign and submit immediately
    // rather than requiring a second visit to this page — the other
    // required party still needs to open the page once to trigger their
    // own auto-sign (see the escrow-fetch effect above).
    if (escrow.type === 'MULTISIG' || escrow.type === 'LIGHTNING_HODL') {
      const toAddress = escrow.type === 'MULTISIG' ? DEMO_RELEASE_ADDRESS_MULTISIG : DEMO_RELEASE_SCRIPT_HEX_ARKADE
      await sailsClient.settlement.initiateRelease(escrow.id, toAddress)
      if (user) await signAndSubmitPendingTransactionIfNeeded(escrow.type, escrow.id, user.id).catch(() => {})
      const e = await sailsClient.settlement.get(escrow.id)
      setEscrow(e)
      toast.success(
        e.status === 'COMPLETED'
          ? 'Fundos liberados — trade concluído!'
          : 'Liberação iniciada — aguardando assinatura da contraparte'
      )
      return
    }
    const e = await sailsClient.settlement.release(escrow.id, DEMO_RELEASE_ADDRESS)
    setEscrow(e)
    toast.success('Fundos liberados — trade concluído!')
  })

  const handleOpenDispute = () => escrow && withGuard(async () => {
    if (!disputeReason.trim()) {
      toast.error('Descreva o motivo da disputa')
      return
    }
    await sailsClient.settlement.dispute(escrow.id, disputeReason.trim())
    const refreshed = await sailsClient.settlement.get(escrow.id)
    setEscrow(refreshed)
    toast.error('Disputa aberta')
    setShowDisputeForm(false)
    setDisputeReason('')
  })

  const handleSend = (content: string) => {
    channelRef.current?.send({ content, msgType: 'TEXT' })
    // Mocked reflection of RFC-017's SocialEngineeringAgent — see
    // lib/socialEngineering.ts's own comment for what's real vs simulated.
    // Client-local only, never sent over the real chat channel.
    const warning = detectRiskLocally(content)
    if (warning) {
      setTimeout(() => {
        setMessages((m) => [
          ...m,
          {
            id: `risk-${Date.now()}`, senderId: null, sender: null,
            content: warning.reasoning, type: 'RISK_WARNING', riskPattern: warning.pattern,
            createdAt: new Date().toISOString(),
          },
        ])
      }, 600)
    }
  }

  // No real media upload/storage endpoint exists yet (types.ts's own
  // comment on MessageType) — stays client-local, never reaches the real
  // chat channel, which only carries a plain-text `content` field today.
  const handleSendMedia = (media: { url: string; fileName: string; type: MessageType }) => {
    setMessages((m) => [
      ...m,
      { id: `m-${Date.now()}`, senderId: user?.id ?? null, sender: user, content: '', type: media.type, mediaUrl: media.url, mediaFileName: media.fileName, createdAt: new Date().toISOString() },
    ])
  }

  if (loading) {
    return <div className="text-center py-16 text-brand-text-muted">Carregando trade...</div>
  }

  if (!trade || !buyer || !seller) {
    return (
      <div className="text-center py-16">
        <p className="text-brand-text-secondary">Trade não encontrado.</p>
        <Link to="/" className="text-sm text-brand-orange-accent underline mt-2 inline-block">Voltar ao Marketplace</Link>
      </div>
    )
  }

  const escrowStatus: EscrowStatus = (escrow?.status as EscrowStatus) ?? 'CREATED'
  const amount = Number(trade.amount)
  const totalBrl = Number(trade.totalUsd) // no real BRL conversion available from Trade — see OfferDetail's own comment on this same gap

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
            <Row label="Quantidade" value={String(amount)} />
            <Row label="Total" value={formatByCurrency(totalBrl, 'BRL')} />
            <Row label="Status do escrow" value={<EscrowStatusBadge status={escrowStatus} />} />
          </div>

          {isBuyer && trade.offer && (
            // Found auditing this screen: paymentMethod/paymentDetails
            // (where to actually send fiat) were fetched by OfferDetail
            // but never carried into the Trade screen — a buyer who'd
            // already left that page had no way to see it again once
            // the trade was underway. trade.service.ts's getTrade() now
            // includes the originating Offer specifically for this.
            <div className="card p-4 mt-3 border border-brand-orange-accent/30">
              <p className="text-xs font-semibold text-brand-text-muted mb-2">
                Como pagar — {PAYMENT_METHOD_LABELS[trade.offer.paymentMethod]}
              </p>
              {trade.offer.paymentDetails ? (
                <p className="text-sm font-mono text-brand-text break-all">{trade.offer.paymentDetails}</p>
              ) : (
                <p className="text-xs text-brand-text-muted">
                  O vendedor não informou os dados de pagamento aqui — combine pelo chat.
                </p>
              )}
            </div>
          )}

          <TradeParties buyer={buyer} seller={seller} currentUserId={user?.id} />

          <AgentRiskCard asset={trade.asset} side={isBuyer ? 'BUY' : 'SELL'} maxValue={Number(trade.totalUsd)} minValue={Number(trade.totalUsd)} />

          <div className="card p-5 mt-3">
            <EscrowStateMachine status={escrowStatus} />

            {!escrow ? (
              isSeller ? (
                <button onClick={handleCreateEscrow} disabled={acting} className="btn-primary w-full py-2.5 text-sm mt-4">
                  {acting ? 'Criando...' : '🔓 Criar Escrow'}
                </button>
              ) : (
                <p className="text-xs text-brand-text-muted mt-3">Aguardando o vendedor criar o escrow.</p>
              )
            ) : !showDisputeForm ? (
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
                  <button onClick={handleOpenDispute} disabled={acting} className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-lg py-2 text-sm font-semibold transition-colors">Confirmar Disputa</button>
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
