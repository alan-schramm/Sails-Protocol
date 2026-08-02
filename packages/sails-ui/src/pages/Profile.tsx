import { Link, useNavigate } from 'react-router'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { UserAvatar } from '../components/ui/UserAvatar'
import { CopyButton } from '../components/ui/CopyButton'
import { InfoTooltip } from '../components/ui/InfoTooltip'
import { AssetBadge, SideBadge, OfferStatusBadge, OFFER_STATUS_LABEL, PowerTraderBadge } from '../components/ui/StatusBadges'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { badgeVariants } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { Check, Star, ChevronRight } from 'lucide-react'
import { sailsClient } from '../lib/sailsClient'
import { formatDateTime } from '../lib/format'
import { ASSET_SHORT_LABELS } from '../lib/labels'
import { isPowerTrader } from '../lib/reputation'
import type { Offer, OfferStatus, User } from '../types'

// Real, persisted Offer rows (GET /v1/liquidity/offers/mine) — the
// route doesn't join the `user` relation (a self-view never needs to
// look itself up), so the caller's own already-known User (useAuth())
// fills that in. Same field-by-field mapping OfferDetail.tsx's own
// toOffer() uses, minus the user lookup. Real fix, 2026-08-01 — see
// README.md's "What this is not" for the bug this closes (a
// just-published real offer never showed up here, since this screen
// used to read lib/offersStore.ts/localStorage instead).
function toOffer(raw: Awaited<ReturnType<typeof sailsClient.liquidity.getMyOffers>>[number], user: User): Offer {
  const priceUsd = Number(raw.priceUsd)
  const priceBrl = raw.priceBrl ? Number(raw.priceBrl) : priceUsd
  return {
    id: raw.id,
    userId: raw.userId,
    user,
    asset: raw.asset,
    side: raw.side,
    priceUsd,
    fiatCurrency: 'BRL', // real Offer only ever models a BRL fiat price — see types.ts's own header comment
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
    tradedWithCurrentUser: false,
    blockedRelationship: false,
    createdAt: raw.createdAt,
  }
}

const OFFER_FILTERS: { value: OfferStatus | 'Todos'; label: string }[] = [
  { value: 'Todos', label: 'Todos' },
  { value: 'ACTIVE', label: OFFER_STATUS_LABEL.ACTIVE },
  { value: 'PAUSED', label: OFFER_STATUS_LABEL.PAUSED },
  { value: 'COMPLETED', label: OFFER_STATUS_LABEL.COMPLETED },
  { value: 'CANCELLED', label: OFFER_STATUS_LABEL.CANCELLED },
]

const KEY_EXPLAINER =
  'Este é o identificador único da sua conta no Sails Protocol: a mesma chave Ed25519 usada para autenticar (assinar) suas ações E como sua chave de rede P2P (Pears/Holepunch) — o mesmo tipo de "Public Key" que apps como o Keet mostram. É segura para compartilhar; sua chave privada nunca sai do seu dispositivo.'

export function Profile() {
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) navigate('/login')
  }, [user, navigate])

  const [offers, setOffers] = useState<Offer[]>([])
  const [loadingOffers, setLoadingOffers] = useState(true)
  // offersError (2026-08-02) — a fetch failure used to silently become
  // `setOffers([])`, rendering identically to "you haven't published
  // anything yet" (SLC audit's 🟡 finding). Now a distinct message.
  const [offersError, setOffersError] = useState(false)
  const [statusFilter, setStatusFilter] = useState<OfferStatus | 'Todos'>('Todos')
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null)

  // Real, wired to @sails/sdk (2026-08-01) — GET /v1/liquidity/offers/mine
  // already filters by the authenticated session, so a just-published
  // offer shows up here on the next mount (no client-side userId filter
  // needed, unlike the old localStorage-backed version).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoadingOffers(true)
    setOffersError(false)
    sailsClient.liquidity
      .getMyOffers()
      .then((raw) => { if (!cancelled) setOffers(raw.map((o) => toOffer(o, user))) })
      .catch(() => {
        if (cancelled) return
        setOffers([])
        setOffersError(true)
      })
      .finally(() => { if (!cancelled) setLoadingOffers(false) })
    return () => { cancelled = true }
  }, [user])

  // Real gap found directly by the owner: "Minhas Ordens" had no
  // date/time and no way to know what happened or remove an order —
  // sorted newest-first (an actual history, not an unordered dump) and
  // filterable by status, matching Binance P2P "My Ads" / Bisq "My Open
  // Offers" / HodlHodl "My Contracts" / El Dorado / P2P.me, which all
  // show a dated, filterable list of a user's own listings.
  const myOffers = useMemo(() => {
    return offers
      .filter((o) => statusFilter === 'Todos' || o.status === statusFilter)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [offers, statusFilter])

  if (!user) return null

  // Optimistic update + real PATCH /v1/liquidity/offers/:id/status
  // (2026-08-01) — reverts the optimistic change and shows an error
  // toast if the real call fails, instead of silently drifting from the
  // server's actual state the way the old localStorage-only version
  // could never detect a failure at all.
  const applyStatus = (id: string, status: OfferStatus, message: string) => {
    const previousStatus = offers.find((o) => o.id === id)?.status
    setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)))
    setConfirmingCancelId(null)
    sailsClient.liquidity
      .updateStatus(id, status)
      .then(() => toast.success(message))
      .catch(() => {
        if (previousStatus) setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, status: previousStatus } : o)))
        toast.error('Não foi possível atualizar a oferta — tente novamente.')
      })
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row gap-6 items-start pb-6 border-b border-brand-border">
        <UserAvatar user={user} size="xl" />
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2 flex-wrap text-brand-text">
            {user.displayName}
            {user.verified && (
              <span title="Verificado">
                <Check className="h-4 w-4 text-brand-orange-accent" />
              </span>
            )}
            {isPowerTrader(user) && <PowerTraderBadge />}
          </h1>
          {/* Real gap found directly by the owner: this key was shown with
              no label at all — after seeing Keet call the equivalent value
              "Public Key" with no further context, it wasn't clear this
              was even the same kind of key, let alone *the user's own*.
              It genuinely is the same key: PearNode's own Ed25519 keypair
              IS the identity keypair (docs/ARCHITECTURE.md, pear.service.ts
              `getKeyPair()`) — one primitive, not two, so the explainer
              below says so plainly instead of inventing a distinction. */}
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-xs text-brand-text-muted">Sua chave de identidade (Pears / P2P)</span>
            <InfoTooltip text={KEY_EXPLAINER} />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-xs text-brand-text-secondary truncate max-w-xs">{user.publicKey}</span>
            <CopyButton value={user.publicKey} />
          </div>
          <p className="text-xs text-brand-text-muted mt-1">Membro desde {new Date(user.createdAt).toLocaleDateString('pt-BR')}</p>
        </div>

        <div className="grid grid-cols-4 gap-3 md:ml-auto w-full md:w-auto">
          <Stat value={user.totalTrades} label="Trades" />
          <Stat value={user.totalVolumeBtc.toFixed(2)} label="Volume BTC" />
          <Stat value={`${((user.disputeCount / Math.max(user.totalTrades, 1)) * 100).toFixed(0)}%`} label="Disputa" />
          <Stat value={user.reputationScore.toFixed(0)} label="Reputação" />
        </div>
      </div>

      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <Card className="p-5 flex flex-col items-center">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-32 h-32 -rotate-90">
              <circle cx="64" cy="64" r="56" fill="none" stroke="rgb(var(--color-border))" strokeWidth="10" />
              <circle
                cx="64" cy="64" r="56" fill="none" stroke="rgb(var(--color-orange-accent))" strokeWidth="10"
                strokeDasharray={2 * Math.PI * 56}
                strokeDashoffset={2 * Math.PI * 56 * (1 - user.reputationScore / 100)}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute text-center">
              <div className="text-3xl font-display font-bold text-brand-text">{user.reputationScore.toFixed(0)}</div>
              <div className="text-xs text-brand-text-muted">de 100</div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3 text-brand-text">Avaliações recentes</h3>
          {[5, 4, 3, 2, 1].map((stars) => {
            const pct = stars === 5 ? 78 : stars === 4 ? 15 : stars === 3 ? 5 : stars === 2 ? 1 : 1
            return (
              <div key={stars} className="flex items-center gap-3 mb-1.5">
                <span className="flex w-14 text-yellow-500">
                  {Array.from({ length: stars }).map((_, i) => (
                    <Star key={i} className="h-3 w-3" fill="currentColor" strokeWidth={0} />
                  ))}
                </span>
                <div className="flex-1 h-1.5 bg-brand-elevated rounded-full">
                  <div className="h-1.5 bg-brand-orange-accent rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-brand-text-muted w-8 text-right">{pct}%</span>
              </div>
            )
          })}
        </Card>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-brand-text">Minhas Ofertas</h3>
          <Button onClick={() => navigate('/profile/new-offer')} className="text-xs px-3 py-1.5">Nova Oferta</Button>
        </div>

        <div className="mt-3 flex gap-2 flex-wrap">
          {OFFER_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(badgeVariants({ variant: statusFilter === f.value ? 'default' : 'secondary' }), 'rounded-full px-3 py-1')}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          {loadingOffers && <p className="text-sm text-brand-text-muted">Carregando ofertas...</p>}
          {!loadingOffers && offersError && (
            <p className="text-sm text-red-700">Não foi possível carregar suas ofertas agora — tente novamente.</p>
          )}
          {!loadingOffers && !offersError && myOffers.length === 0 && (
            <p className="text-sm text-brand-text-muted">
              {statusFilter === 'Todos' ? 'Nenhuma oferta publicada ainda.' : `Nenhuma oferta com status "${OFFER_STATUS_LABEL[statusFilter]}".`}
            </p>
          )}
          {!loadingOffers && myOffers.map((o) => {
            const canManage = o.status === 'ACTIVE' || o.status === 'PAUSED'
            return (
              <Card key={o.id} className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SideBadge side={o.side} />
                  <AssetBadge asset={o.asset} />
                  <span className="font-medium text-sm text-brand-text">${o.priceUsd}</span>
                  <OfferStatusBadge status={o.status} />
                  <span className="text-xs text-brand-text-muted ml-auto">
                    {o.minAmount}–{o.maxAmount} {ASSET_SHORT_LABELS[o.asset]}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-brand-text-muted">Criada em {formatDateTime(o.createdAt)}</span>
                  <div className="flex items-center gap-2">
                    {canManage && confirmingCancelId !== o.id && (
                      <>
                        <button
                          onClick={() =>
                            o.status === 'ACTIVE'
                              ? applyStatus(o.id, 'PAUSED', 'Oferta pausada — não aparece mais no Marketplace')
                              : applyStatus(o.id, 'ACTIVE', 'Oferta reativada')
                          }
                          className="text-xs text-brand-text-muted hover:text-brand-text border border-brand-border rounded-md px-2 py-1 transition-colors"
                        >
                          {o.status === 'ACTIVE' ? 'Pausar' : 'Ativar'}
                        </button>
                        <button
                          onClick={() => setConfirmingCancelId(o.id)}
                          className="text-xs text-red-700 hover:text-red-400 border border-red-500/25 rounded-md px-2 py-1 transition-colors"
                        >
                          Cancelar oferta
                        </button>
                      </>
                    )}
                    <Link to={`/offer/${o.id}`} className="text-xs text-brand-text-muted hover:text-brand-text flex items-center">
                      Ver <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>

                {confirmingCancelId === o.id && (
                  <div className="mt-2 rounded-md bg-red-500/5 border border-red-500/20 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-brand-text-secondary">
                      Cancelar esta oferta? Ela sai do Marketplace imediatamente e não pode ser reativada — publique uma nova se mudar de ideia.
                    </span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => applyStatus(o.id, 'CANCELLED', 'Oferta cancelada')}
                        className="text-xs bg-red-600 hover:bg-red-500 text-white rounded-md px-2.5 py-1 font-semibold transition-colors"
                      >
                        Sim, cancelar
                      </button>
                      <Button variant="outline" onClick={() => setConfirmingCancelId(null)} className="text-xs px-2.5 py-1">Voltar</Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </div>

      <div className="mt-8">
        <Link to="/profile/history" className="text-sm text-brand-orange-accent underline flex items-center gap-0.5">
          Ver histórico completo de trades <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <Card className="p-3 text-center">
      <div className="text-lg font-display font-bold text-brand-text">{value}</div>
      <div className="text-xs text-brand-text-muted">{label}</div>
    </Card>
  )
}
