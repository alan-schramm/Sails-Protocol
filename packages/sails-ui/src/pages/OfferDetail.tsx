import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AssetBadge, SideBadge, PaymentBadge } from '../components/ui/Badge'
import { UserAvatar } from '../components/ui/UserAvatar'
import { formatAmount } from '../lib/format'
import { formatByCurrency } from '../lib/currency'
import { sailsClient } from '../lib/sailsClient'
import { ASSET_LABELS, ASSET_SHORT_LABELS, PAYMENT_METHOD_LABELS } from '../lib/labels'
import { useAuth } from '../context/AuthContext'
import type { Offer, User } from '../types'

function toOffer(raw: Awaited<ReturnType<typeof sailsClient.liquidity.getOffer>>): Offer {
  const user: User = {
    id: raw.user.id,
    publicKey: raw.user.publicKey,
    displayName: raw.user.displayName,
    peerId: raw.user.peerId,
    reputationScore: raw.user.reputationScore,
    totalTrades: raw.user.totalTrades,
    disputeCount: raw.user.disputeCount,
    totalVolumeBtc: Number(raw.user.totalVolumeBtc),
    verified: raw.user.verified,
    createdAt: raw.user.createdAt,
  }
  const priceUsd = Number(raw.priceUsd)
  const priceBrl = raw.priceBrl ? Number(raw.priceBrl) : priceUsd
  return {
    id: raw.id,
    userId: raw.userId,
    user,
    asset: raw.asset,
    side: raw.side,
    priceUsd,
    fiatCurrency: 'BRL', // real Offer only ever models a BRL fiat price (priceBrl) — see types.ts's own header comment
    priceFiat: priceBrl,
    minAmount: Number(raw.minAmount),
    maxAmount: Number(raw.maxAmount),
    paymentMethod: raw.paymentMethod,
    paymentDetails: raw.paymentDetails ?? undefined,
    status: raw.status,
    network: raw.network ?? undefined,
    description: raw.description ?? undefined,
    requiresKyc: raw.requiresKyc,
    country: 'BR', // no real country field on Offer yet — same gap types.ts's header already discloses
    tradedWithCurrentUser: false, // needs a real trade-history join this route doesn't do
    blockedRelationship: false, // no real block-list backend yet
    createdAt: raw.createdAt,
  }
}

export function OfferDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [offer, setOffer] = useState<Offer | null>(null)
  const [loading, setLoading] = useState(true)
  const [startingTrade, setStartingTrade] = useState(false)
  // Prefilled when arriving back here after being bounced to /login mid
  // way through starting a trade (see handleStartTrade below) — without
  // this, a round trip through login silently dropped whatever amount
  // the user had already typed.
  const [amount, setAmount] = useState<string>(() => {
    const state = location.state as { amount?: number } | null
    return state?.amount ? String(state.amount) : ''
  })

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    sailsClient.liquidity
      .getOffer(id)
      .then((raw) => { if (!cancelled) setOffer(toOffer(raw)) })
      .catch(() => { if (!cancelled) setOffer(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return <div className="text-center py-16 text-brand-text-muted">Carregando oferta...</div>
  }

  if (!offer) {
    return (
      <div className="text-center py-16">
        <p className="text-brand-text-secondary">Oferta não encontrada.</p>
        <Link to="/" className="text-sm text-brand-orange underline mt-2 inline-block">Voltar ao Marketplace</Link>
      </div>
    )
  }

  const amountNum = Number(amount) || 0
  const withinLimits = amountNum >= offer.minAmount && amountNum <= offer.maxAmount
  const totalFiat = amountNum * offer.priceFiat
  // Real bug found in a cold-start UX walkthrough: nothing stopped a
  // user from starting a trade against their own offer — the trade
  // opened with the same person as buyer and seller on both sides.
  const isOwnOffer = user?.id === offer.userId

  const handleStartTrade = async () => {
    if (!user) {
      toast.error('Conecte sua carteira primeiro')
      // Carrega para onde voltar e o valor já digitado — sem isso o
      // usuário conectava a carteira e caía no Marketplace, tendo que
      // reencontrar a oferta e digitar tudo de novo.
      navigate('/login', { state: { from: location.pathname, amount: amountNum || undefined } })
      return
    }
    if (isOwnOffer) {
      toast.error('Você não pode negociar com sua própria oferta')
      return
    }
    if (!amountNum || !withinLimits) {
      toast.error('Informe uma quantidade dentro do limite da oferta')
      return
    }
    setStartingTrade(true)
    try {
      // Real @sails/sdk call — POST /v1/openp2p/trades (requires the
      // active session; the server derives the counterparty from it,
      // trade.routes.ts). This is the real trade.service.ts's
      // createTrade(), which also walks the offer's real Intent through
      // DISCOVERING -> MATCHED -> NEGOTIATING (RFC-018) — not a client-
      // side mock Trade built from whatever was picked here.
      const trade = await sailsClient.openp2p.trade(offer.id, String(amountNum))
      toast.success('Trade iniciado')
      navigate(`/trade/${trade.id}`, { state: { offer, amount: amountNum } })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao iniciar trade')
    } finally {
      setStartingTrade(false)
    }
  }

  return (
    <div>
      <Link to="/" className="text-sm text-brand-text-secondary hover:text-brand-text">← Voltar ao Marketplace</Link>

      <div className="mt-4 grid lg:grid-cols-[1fr_360px] gap-6">
        <div>
          <div className="card p-6">
            <div className="flex gap-2">
              <AssetBadge asset={offer.asset} />
              <SideBadge side={offer.side} />
              <PaymentBadge method={offer.paymentMethod} />
            </div>
            <div className="mt-4 text-4xl font-black tabular-nums text-brand-text">{formatByCurrency(offer.priceFiat, offer.fiatCurrency)}</div>
            <div className="text-sm text-brand-text-muted mt-1">
              por {ASSET_LABELS[offer.asset]}
              {offer.fiatCurrency !== 'USD' && ` · ≈ $${offer.priceUsd} USD`}
            </div>
          </div>

          <div className="mt-4 card p-5">
            <div className="flex items-center gap-3">
              <UserAvatar user={offer.user} size="lg" />
              <div>
                <div className="font-semibold flex items-center gap-1 text-brand-text">
                  {offer.user.displayName}
                  {offer.user.verified && <span className="text-brand-orange text-sm" title="Verificado">✓</span>}
                </div>
                <div className="text-xs text-brand-text-muted">Membro desde {new Date(offer.user.createdAt).toLocaleDateString('pt-BR')}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex justify-between text-xs text-brand-text-muted mb-1">
                <span>Reputação</span>
                <span className="font-semibold text-brand-text">{offer.user.reputationScore.toFixed(1)} / 100</span>
              </div>
              <div className="h-1.5 bg-brand-elevated rounded-full">
                <div className="h-1.5 bg-brand-orange rounded-full" style={{ width: `${offer.user.reputationScore}%` }} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="bg-brand-elevated rounded-lg p-2">
                <div className="font-bold text-brand-text">{offer.user.totalTrades}</div>
                <div className="text-xs text-brand-text-muted">trades</div>
              </div>
              <div className="bg-brand-elevated rounded-lg p-2">
                <div className="font-bold text-brand-text">{offer.user.disputeCount}</div>
                <div className="text-xs text-brand-text-muted">disputas</div>
              </div>
              <div className="bg-brand-elevated rounded-lg p-2">
                <div className="font-bold text-brand-text">{offer.user.totalVolumeBtc.toFixed(2)}</div>
                <div className="text-xs text-brand-text-muted">BTC vol</div>
              </div>
            </div>
          </div>

          <div className="mt-4 card divide-y divide-brand-border">
            <Row label="Rede" value={offer.network ?? '—'} />
            <Row label="Método de pagamento" value={PAYMENT_METHOD_LABELS[offer.paymentMethod]} />
            <Row label="Limites" value={`${formatAmount(offer.minAmount)} – ${formatAmount(offer.maxAmount)} ${ASSET_SHORT_LABELS[offer.asset]}`} />
            <Row label="Requer KYC" value={offer.requiresKyc ? 'Sim' : 'Não'} />
          </div>
        </div>

        <div className="lg:sticky lg:top-20 h-fit">
          {isOwnOffer ? (
            <div className="card p-5">
              <h3 className="font-semibold text-brand-text">Esta é a sua oferta</h3>
              <p className="text-sm text-brand-text-muted mt-2">
                Você não pode iniciar uma negociação com o seu próprio anúncio.
                Gerencie-o em "Minhas Ofertas", no seu perfil.
              </p>
              <Link to="/profile" className="btn-ghost mt-4 w-full py-3 text-sm text-center block">
                Ir para Minhas Ofertas
              </Link>
            </div>
          ) : (
            <div className="card p-5">
              <h3 className="font-semibold text-brand-text">Iniciar negociação</h3>

              <label className="block text-xs text-brand-text-muted mt-4 mb-1">Quanto você quer {offer.side === 'SELL' ? 'comprar' : 'vender'}?</label>
              <div className="relative">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  type="number"
                  className="input-field w-full text-lg font-bold"
                  placeholder="0.00"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-brand-text-muted">{ASSET_SHORT_LABELS[offer.asset]}</span>
              </div>
              {amount && !withinLimits && (
                <p className="text-xs text-red-500 mt-1">Fora do limite: {formatAmount(offer.minAmount)} – {formatAmount(offer.maxAmount)}</p>
              )}

              <div className="mt-4 pt-4 border-t border-brand-border">
                <div className="text-xs text-brand-text-muted">Você {offer.side === 'SELL' ? 'paga' : 'recebe'}</div>
                <div className="text-2xl font-black tabular-nums mt-1 text-brand-text">{formatByCurrency(totalFiat || 0, offer.fiatCurrency)}</div>
              </div>

              <div className="mt-4 bg-brand-orange/5 border border-brand-orange/20 rounded-lg p-3 text-xs text-brand-text-secondary">
                🔒 Escrow não custodial — fundos só liberados após confirmação de pagamento.
              </div>

              <button onClick={handleStartTrade} disabled={startingTrade} className="btn-primary mt-4 w-full py-3">
                {startingTrade ? 'Iniciando...' : 'Iniciar Trade'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-5 py-3 text-sm">
      <span className="text-brand-text-muted">{label}</span>
      <span className="font-medium text-brand-text">{value}</span>
    </div>
  )
}
