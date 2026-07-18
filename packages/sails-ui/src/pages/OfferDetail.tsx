import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { MOCK_OFFERS } from '../data/mock'
import { AssetBadge, SideBadge, PaymentBadge } from '../components/ui/Badge'
import { UserAvatar } from '../components/ui/UserAvatar'
import { formatBrl, formatAmount } from '../lib/format'
import { useAuth } from '../context/AuthContext'

export function OfferDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  // TODO: replace with @sails/sdk `liquidity.getOffer(id)` (real route:
  // GET /v1/liquidity/offers/:asset/book, or a future single-offer route)
  const offer = MOCK_OFFERS.find((o) => o.id === id)
  const [amount, setAmount] = useState('')

  if (!offer) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Oferta não encontrada.</p>
        <Link to="/" className="text-sm text-gray-900 underline mt-2 inline-block">Voltar ao Marketplace</Link>
      </div>
    )
  }

  const amountNum = Number(amount) || 0
  const withinLimits = amountNum >= offer.minAmount && amountNum <= offer.maxAmount
  const totalBrl = amountNum * (offer.priceBrl ?? offer.priceUsd * 5)

  const handleStartTrade = () => {
    if (!user) {
      toast.error('Conecte sua carteira primeiro')
      navigate('/login')
      return
    }
    if (!amountNum || !withinLimits) {
      toast.error('Informe uma quantidade dentro do limite da oferta')
      return
    }
    // TODO: replace with @sails/sdk `openp2p.trade(offerId, amount)`
    // (real route: POST /v1/openp2p/trades, requires auth — see
    // trade.routes.ts). This mock just jumps straight to the mocked trade.
    toast.success('Trade iniciado')
    navigate('/trade/trade-a1b2c3d4')
  }

  return (
    <div>
      <Link to="/" className="text-sm text-gray-500 hover:text-gray-800">← Voltar ao Marketplace</Link>

      <div className="mt-4 grid lg:grid-cols-[1fr_360px] gap-6">
        <div>
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex gap-2">
              <AssetBadge asset={offer.asset} />
              <SideBadge side={offer.side} />
              <PaymentBadge method={offer.paymentMethod} />
            </div>
            <div className="mt-4 text-4xl font-black tabular-nums">{offer.priceBrl ? formatBrl(offer.priceBrl) : `$${offer.priceUsd}`}</div>
            <div className="text-sm text-gray-500 mt-1">por {offer.asset} · ${offer.priceUsd} USD</div>
          </div>

          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-3">
              <UserAvatar user={offer.user} size="lg" />
              <div>
                <div className="font-semibold flex items-center gap-1">
                  {offer.user.displayName}
                  {offer.user.verified && <span className="text-blue-500 text-sm" title="Verificado">✓</span>}
                </div>
                <div className="text-xs text-gray-400">Membro desde {new Date(offer.user.createdAt).toLocaleDateString('pt-BR')}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Reputação</span>
                <span className="font-semibold text-gray-800">{offer.user.reputationScore.toFixed(1)} / 100</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full">
                <div className="h-1.5 bg-gray-800 rounded-full" style={{ width: `${offer.user.reputationScore}%` }} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="font-bold">{offer.user.totalTrades}</div>
                <div className="text-xs text-gray-400">trades</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="font-bold">{offer.user.disputeCount}</div>
                <div className="text-xs text-gray-400">disputas</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="font-bold">{offer.user.totalVolumeBtc.toFixed(2)}</div>
                <div className="text-xs text-gray-400">BTC vol</div>
              </div>
            </div>
          </div>

          <div className="mt-4 bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            <Row label="Rede" value={offer.network ?? '—'} />
            <Row label="Método de pagamento" value={offer.paymentMethod} />
            <Row label="Limites" value={`${formatAmount(offer.minAmount)} – ${formatAmount(offer.maxAmount)} ${offer.asset}`} />
            <Row label="Requer KYC" value={offer.requiresKyc ? 'Sim' : 'Não'} />
          </div>
        </div>

        <div className="lg:sticky lg:top-20 h-fit">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="font-semibold">Iniciar negociação</h3>

            <label className="block text-xs text-gray-500 mt-4 mb-1">Quanto você quer {offer.side === 'SELL' ? 'comprar' : 'vender'}?</label>
            <div className="relative">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-lg font-bold"
                placeholder="0.00"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{offer.asset}</span>
            </div>
            {amount && !withinLimits && (
              <p className="text-xs text-red-500 mt-1">Fora do limite: {formatAmount(offer.minAmount)} – {formatAmount(offer.maxAmount)}</p>
            )}

            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="text-xs text-gray-500">Você {offer.side === 'SELL' ? 'paga' : 'recebe'}</div>
              <div className="text-2xl font-black tabular-nums mt-1">{formatBrl(totalBrl || 0)}</div>
            </div>

            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
              🔒 Escrow não custodial — fundos só liberados após confirmação de pagamento.
            </div>

            <button
              onClick={handleStartTrade}
              className="mt-4 w-full bg-gray-900 hover:bg-gray-700 text-white font-semibold rounded-lg py-3"
            >
              Iniciar Trade
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-5 py-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  )
}
