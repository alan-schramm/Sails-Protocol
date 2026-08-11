import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import type { Trade as SdkTrade, Escrow as SdkEscrow, Message as SdkMessage, ChatMessageEvent, WebSocketChannel, Ed25519Keypair, EncryptedChatMessage, Dispute } from '@satsails/p2p-trading-sdk'
import { encryptChatMessage, decryptChatMessage } from '@satsails/p2p-trading-sdk'
import type { EscrowStatus, Message, MessageType, User } from '../types'
import { useAuth } from '../context/AuthContext'
import { useEscrowKey } from '../hooks/useEscrowKey'
import { sailsClient } from '../lib/sailsClient'
import { TradeStatusBadge, EscrowStatusBadge } from '../components/ui/StatusBadges'
import { EscrowStateMachine } from '../components/trade/EscrowStateMachine'
import { EscrowCountdown } from '../components/trade/EscrowCountdown'
import { EscrowActions } from '../components/trade/EscrowActions'
import { TradeParties } from '../components/trade/TradeParties'
import { ChatWindow } from '../components/chat/ChatWindow'
import { AgentRiskCard } from '../components/agent/AgentRiskCard'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Textarea } from '../components/ui/textarea'
import { Lock, Banknote, Unlock, ArrowLeft, AlertTriangle, Bot } from 'lucide-react'
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

// SAFE_GUARD_EVM's own signature-collection path (safe-guard-evm.provider.ts's
// buildUnsignedRelease()/releaseFunds()) encodes toAddress into a real
// ethers.js UserOperation — an all-lowercase hex address skips EIP-55
// checksum validation entirely (ethers only enforces checksum on mixed-case
// input), so this is a valid placeholder unlike DEMO_RELEASE_ADDRESS above.
const DEMO_RELEASE_ADDRESS_EVM = '0x000000000000000000000000000000000000dead'

const AUTO_RULING_LABEL: Record<string, string> = { RELEASE: 'liberar para o comprador', REFUND: 'reembolsar o vendedor', SPLIT: 'dividir entre as partes' }

function toParticipantUser(p: Awaited<ReturnType<typeof sailsClient.identity.get>>): User {
  return {
    id: p.id, publicKey: p.publicKey, displayName: p.displayName, peerId: p.peerId,
    reputationScore: p.reputationScore, totalTrades: p.totalTrades, disputeCount: p.disputeCount,
    totalVolumeBtc: Number(p.totalVolumeBtc), verified: p.verified, createdAt: p.createdAt,
  }
}

// ENCRYPTED_TEXT's `content` holds JSON.stringify(EncryptedChatMessage) on
// the wire (types.ts's own comment on MessageType) — opportunistically
// decrypted here so every read path (REST history + live WS) shows the
// same plaintext. Falls back to a user-facing placeholder + `decryptionFailed`
// rather than throwing, since a missing keypair/counterparty key (still
// loading) or a genuinely corrupted message must not crash the whole page.
function decryptIncoming(
  content: string,
  msgType: string | null | undefined,
  myKeypair: Ed25519Keypair | null,
  counterpartyPublicKeyHex: string | undefined
): { content: string; type: MessageType; decryptionFailed?: boolean } {
  if (msgType !== 'ENCRYPTED_TEXT') {
    return { content, type: (msgType as MessageType) ?? 'TEXT' }
  }
  if (!myKeypair || !counterpartyPublicKeyHex) {
    return { content: 'Mensagem criptografada — carregando chaves...', type: 'ENCRYPTED_TEXT', decryptionFailed: true }
  }
  try {
    const encrypted: EncryptedChatMessage = JSON.parse(content)
    const plain = decryptChatMessage(encrypted, counterpartyPublicKeyHex, myKeypair)
    return { content: plain, type: 'ENCRYPTED_TEXT' }
  } catch {
    return { content: 'Não foi possível decifrar esta mensagem.', type: 'ENCRYPTED_TEXT', decryptionFailed: true }
  }
}

function toUiMessage(
  m: SdkMessage, buyer: User, seller: User,
  myKeypair: Ed25519Keypair | null, counterpartyPublicKeyHex: string | undefined
): Message {
  const sender = m.senderId === buyer.id ? buyer : m.senderId === seller.id ? seller : null
  return {
    id: m.id, senderId: m.senderId, sender,
    ...decryptIncoming(m.content, m.msgType, myKeypair, counterpartyPublicKeyHex),
    createdAt: m.createdAt,
  }
}

// The live WS NEW_MESSAGE frame's real shape (ChatMessageEvent, fixed
// the same day in @satsails/p2p-trading-sdk's openp2p.ts — see that file's own comment)
// genuinely differs from getMessages()'s REST history shape (SdkMessage
// above): messageId/timestamp, not id/createdAt.
function toUiMessageFromEvent(
  m: ChatMessageEvent, buyer: User, seller: User,
  myKeypair: Ed25519Keypair | null, counterpartyPublicKeyHex: string | undefined
): Message {
  const sender = m.senderId === buyer.id ? buyer : m.senderId === seller.id ? seller : null
  return {
    id: m.messageId, senderId: m.senderId, sender,
    ...decryptIncoming(m.content, m.msgType, myKeypair, counterpartyPublicKeyHex),
    createdAt: m.timestamp,
  }
}

export function Trade() {
  const { id } = useParams()
  const { user, keypair } = useAuth()
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
  // RFC-021 D6/D7/D8 — evidence/contest/appeal are real, trade-party-only
  // actions (dispute.service.ts rejects anyone whose id isn't
  // trade.buyerId/sellerId with a real 403) — deliberately NOT offered on
  // Disputes.tsx's arbiter console, which has no standing to call them.
  // Shares `acting`/withGuard with the escrow actions below, not a
  // separate loading flag.
  const [evidenceNote, setEvidenceNote] = useState('')
  // Opt-in per BACKLOG.md's own note on chat-encryption.ts — encrypting
  // by default would silently change behaviour for every existing
  // plaintext history, so this starts off and only the sender's own new
  // messages are affected.
  const [encryptionEnabled, setEncryptionEnabled] = useState(false)
  // Real presence (2026-08-02) — null until a USER_ONLINE/USER_OFFLINE
  // frame for the counterparty specifically has actually arrived over
  // this trade's chat WebSocketChannel (chat.routes.ts broadcasts these
  // on room join/leave/socket close) — see UserAvatar.tsx's own comment
  // on why null is a distinct "not yet observed" state, never guessed.
  const [counterpartyOnline, setCounterpartyOnline] = useState<boolean | null>(null)
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
        // b/s (just-fetched) rather than the `buyer`/`seller` state, which
        // hasn't re-rendered yet at this point in the same async run.
        const counterpartyPublicKeyHex = user.id === t.buyerId ? s.publicKey : user.id === t.sellerId ? b.publicKey : undefined
        const counterpartyId = user.id === t.buyerId ? t.sellerId : t.buyerId
        setCounterpartyOnline(null) // unknown again on every new trade/channel

        // getMessages() returns PaginatedMessages now (chat pagination,
        // landed concurrently on the backend/SDK side) — was a bare
        // Message[] when this call was first written. 100 is the real
        // route's own max (chat.routes.ts), requested explicitly rather
        // than falling back to its default 50 for a trade's full history.
        const history = await sailsClient.openp2p.getMessages(t.id, { limit: 100 }).catch(() => null)
        if (!cancelled) setMessages((history?.items ?? []).map((m) => toUiMessage(m, b, s, keypair, counterpartyPublicKeyHex)))

        // Real WS chat (RFC-004/API_REFERENCE.md §5) — live NEW_MESSAGE
        // frames appended as they arrive, same channel used to send.
        const channel = sailsClient.openp2p.chat(t.id)
        channel.onMessage((m) => setMessages((prev) => [...prev, toUiMessageFromEvent(m, b, s, keypair, counterpartyPublicKeyHex)]))
        // Real presence — USER_ONLINE/USER_OFFLINE are the only two frame
        // types onEvent() needs to react to here; everything else
        // (TRADE_STATUS_UPDATE/ESCROW_STATUS_UPDATE/...) is a separate,
        // not-yet-built live-sync improvement, not attempted in this pass.
        channel.onEvent((frame) => {
          if (frame.type !== 'USER_ONLINE' && frame.type !== 'USER_OFFLINE') return
          const payload = frame.payload as { participantId?: string }
          if (payload.participantId !== counterpartyId) return
          setCounterpartyOnline(frame.type === 'USER_ONLINE')
        })
        channelRef.current = channel
      }
    })().finally(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
      channelRef.current?.close()
      channelRef.current = null
    }
  }, [id, user, keypair])

  const isBuyer = !!user && !!trade && user.id === trade.buyerId
  const isSeller = !!user && !!trade && user.id === trade.sellerId
  // Only valid once buyer/seller state has settled from the fetch effect
  // above — fine here, since handleSend can't fire before this page has
  // finished loading and rendered a real chat compose box.
  const counterpartyPublicKeyHex = isBuyer ? seller?.publicKey : isSeller ? buyer?.publicKey : undefined
  const counterpartyName = isBuyer ? seller?.displayName : isSeller ? buyer?.displayName : undefined

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
    toast.success('Escrow bloqueado', { icon: <Lock className="h-4 w-4" /> })
  })

  const handleMarkPaymentSent = () => escrow && withGuard(async () => {
    const e = await sailsClient.settlement.markPaymentSent(escrow.id)
    setEscrow(e)
    toast.success('Pagamento marcado como enviado', { icon: <Banknote className="h-4 w-4" /> })
  })

  const handleReleaseFunds = () => escrow && withGuard(async () => {
    // Phase 2 (2026-07-27) — MULTISIG and LIGHTNING_HODL both use
    // client-signature collection now, since buyer/seller keys are
    // client-held. SAFE_GUARD_EVM joined this group 2026-08-02 (RFC-020) —
    // its own releaseFunds() throws "not directly callable" for the same
    // reason (escrow.service.ts's SIGNATURE_COLLECTION_PROVIDERS), so it
    // must go through initiateRelease() too, not the plain release() call
    // below. The seller (normal path) or assigned arbiter (disputed path)
    // initiates the round here; if this user is also one of its required
    // signers (the normal path), sign and submit immediately rather than
    // requiring a second visit to this page — the other required party
    // still needs to open the page once to trigger their own auto-sign
    // (see the escrow-fetch effect above).
    if (escrow.type === 'MULTISIG' || escrow.type === 'LIGHTNING_HODL' || escrow.type === 'SAFE_GUARD_EVM') {
      const toAddress =
        escrow.type === 'MULTISIG' ? DEMO_RELEASE_ADDRESS_MULTISIG
          : escrow.type === 'LIGHTNING_HODL' ? DEMO_RELEASE_SCRIPT_HEX_ARKADE
            : DEMO_RELEASE_ADDRESS_EVM
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

  // dispute.service.ts's submitEvidence()/contestAutoResolution()/appeal()
  // each return the updated Dispute row directly — patched into
  // escrow.disputes in place rather than a full settlement.get() refetch,
  // since escrow.status itself doesn't change from any of these three calls.
  const patchDispute = (updated: Dispute) => {
    setEscrow((prev) => (prev ? { ...prev, disputes: [updated] } : prev))
  }

  const handleSubmitEvidence = () => dispute && withGuard(async () => {
    if (!evidenceNote.trim()) {
      toast.error('Descreva a evidência antes de enviar')
      return
    }
    const updated = await sailsClient.settlement.submitDisputeEvidence(dispute.id, { type: 'text', note: evidenceNote.trim() })
    patchDispute(updated)
    setEvidenceNote('')
    toast.success('Evidência enviada')
  })

  const handleContestAutoResolution = () => dispute && withGuard(async () => {
    const updated = await sailsClient.settlement.contestAutoResolution(dispute.id)
    patchDispute(updated)
    toast('Recomendação automática contestada — disputa voltou para revisão humana')
  })

  const handleAppeal = () => dispute && withGuard(async () => {
    const { dispute: updated, appealFeeRequired } = await sailsClient.settlement.appealDispute(dispute.id)
    patchDispute(updated)
    toast.success(`Apelação registrada — taxa de apelação: ${appealFeeRequired}`)
  })

  const handleSend = (content: string) => {
    if (encryptionEnabled && keypair && counterpartyPublicKeyHex) {
      const encrypted = encryptChatMessage(content, counterpartyPublicKeyHex, keypair)
      channelRef.current?.send({ content: JSON.stringify(encrypted), msgType: 'ENCRYPTED_TEXT' })
    } else {
      channelRef.current?.send({ content, msgType: 'TEXT' })
    }
    // Risk detection always runs on the plaintext the user actually typed —
    // unaffected by whether the outgoing wire content ends up encrypted.
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
  // Escrow.disputes (2026-08-03, see that field's own doc comment) — at
  // most one entry in practice (Dispute.@@unique([tradeId])), but a real
  // Prisma include shape, so this stays an array server-side.
  const dispute = escrow?.disputes?.[0] ?? null
  const amount = Number(trade.amount)
  const totalBrl = Number(trade.totalUsd) // no real BRL conversion available from Trade — see OfferDetail's own comment on this same gap

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link to="/" className="p-2 -m-2 text-sm text-brand-text-secondary hover:text-brand-text"><ArrowLeft className="h-4 w-4" /></Link>
        <span className="font-mono text-sm text-brand-text-muted">Trade #{id?.slice(0, 8)}</span>
        <TradeStatusBadge status={trade.status} />
      </div>

      <div className="mt-4 grid lg:grid-cols-[380px_1fr] gap-4">
        <div>
          <Card className="p-4 divide-y divide-brand-border">
            <Row label="Ativo" value={ASSET_LABELS[trade.asset]} />
            <Row label="Quantidade" value={String(amount)} />
            <Row label="Total" value={formatByCurrency(totalBrl, 'BRL')} />
            <Row label="Status do escrow" value={<EscrowStatusBadge status={escrowStatus} />} />
            {/* Real fields (Trade.completedAt/cancelledAt) that existed
                on the SDK's own Trade type but were never rendered
                anywhere in this UI before — found the same way as the
                escrow timelock above (grepped for usages, found zero). */}
            {trade.completedAt && <Row label="Concluído em" value={formatDateTime(trade.completedAt)} />}
            {trade.cancelledAt && <Row label="Cancelado em" value={formatDateTime(trade.cancelledAt)} />}
          </Card>

          {isBuyer && trade.offer && (
            // Found auditing this screen: paymentMethod/paymentDetails
            // (where to actually send fiat) were fetched by OfferDetail
            // but never carried into the Trade screen — a buyer who'd
            // already left that page had no way to see it again once
            // the trade was underway. trade.service.ts's getTrade() now
            // includes the originating Offer specifically for this.
            <Card className="p-4 mt-3 border border-brand-orange-accent/30">
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
            </Card>
          )}

          <TradeParties buyer={buyer} seller={seller} currentUserId={user?.id} counterpartyOnline={counterpartyOnline} />

          <AgentRiskCard asset={trade.asset} side={isBuyer ? 'BUY' : 'SELL'} maxValue={Number(trade.totalUsd)} minValue={Number(trade.totalUsd)} />

          <Card className="p-5 mt-3">
            <EscrowStateMachine status={escrowStatus} />
            {escrow && (
              <EscrowCountdown expiresAt={escrow.expiresAt} timelockHours={escrow.timelockHours} status={escrowStatus} />
            )}

            {!escrow ? (
              isSeller ? (
                <Button onClick={handleCreateEscrow} disabled={acting} className="w-full py-2.5 text-sm mt-4">
                  {acting ? (
                    'Criando...'
                  ) : (
                    <>
                      <Unlock className="h-4 w-4" />
                      Criar Escrow
                    </>
                  )}
                </Button>
              ) : (
                <p className="text-xs text-brand-text-muted mt-3">Aguardando o vendedor criar o escrow.</p>
              )
            ) : !showDisputeForm ? (
              <EscrowActions
                status={escrowStatus}
                isBuyer={isBuyer}
                isSeller={isSeller}
                acting={acting}
                onLockFunds={handleLockFunds}
                onMarkPaymentSent={handleMarkPaymentSent}
                onReleaseFunds={handleReleaseFunds}
                onOpenDispute={() => setShowDisputeForm(true)}
              />
            ) : (
              <div className="mt-4">
                <Textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Descreva o motivo da disputa..."
                  className="w-full"
                  rows={3}
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={handleOpenDispute} disabled={acting} className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-lg py-2 text-sm font-semibold transition-colors">Confirmar Disputa</button>
                  <Button variant="outline" onClick={() => setShowDisputeForm(false)} className="flex-1 py-2 text-sm">Cancelar</Button>
                </div>
              </div>
            )}

            {!isBuyer && !isSeller && user && (
              <p className="text-xs text-brand-text-muted mt-3">Você não é parte deste trade — ações desabilitadas.</p>
            )}
            {!user && <p className="text-xs text-brand-text-muted mt-3">Conecte sua carteira para agir neste trade.</p>}

            {/* Escrow.disputes (2026-08-03) — the only way a trade party
                who didn't open the dispute could ever learn it existed
                before was the opener's own POST response; getEscrow()
                now surfaces it here too. Evidence/contest/appeal are all
                real, trade-party-only actions (dispute.service.ts's own
                403 check) — see Disputes.tsx's own comment for why the
                arbiter console doesn't offer contest, and why it CAN
                resolve directly instead of needing this same evidence step. */}
            {dispute && (
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
                    {(isBuyer || isSeller) && (
                      <Button variant="outline" onClick={handleContestAutoResolution} disabled={acting} className="mt-2 text-xs px-3 py-1.5">
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

                {(isBuyer || isSeller) && (dispute.status === 'OPENED' || dispute.status === 'EVIDENCE_SUBMITTED') && (
                  <div className="mt-3">
                    <Textarea
                      value={evidenceNote}
                      onChange={(e) => setEvidenceNote(e.target.value)}
                      placeholder="Adicionar evidência (ex: comprovante de pagamento, explicação)..."
                      className="w-full"
                      rows={2}
                    />
                    <Button variant="outline" onClick={handleSubmitEvidence} disabled={acting || !evidenceNote.trim()} className="mt-2 text-xs px-3 py-1.5">
                      Enviar evidência
                    </Button>
                  </div>
                )}

                {(isBuyer || isSeller) && dispute.status === 'RESOLVED' && (
                  <Button variant="outline" onClick={handleAppeal} disabled={acting} className="mt-3 text-xs px-3 py-1.5">
                    Apelar da decisão
                  </Button>
                )}
              </div>
            )}
          </Card>

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

        <ChatWindow
          messages={messages}
          currentUserId={user?.id}
          onSend={handleSend}
          onSendMedia={handleSendMedia}
          encryptionEnabled={encryptionEnabled}
          onToggleEncryption={setEncryptionEnabled}
          encryptionAvailable={!!keypair && !!counterpartyPublicKeyHex}
          counterpartyName={counterpartyName ?? undefined}
          counterpartyOnline={counterpartyOnline}
        />
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
