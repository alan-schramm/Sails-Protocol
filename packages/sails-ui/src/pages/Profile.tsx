import { Link, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { MOCK_OFFERS } from '../data/mock'
import { UserAvatar } from '../components/ui/UserAvatar'
import { CopyButton } from '../components/ui/CopyButton'
import { AssetBadge, SideBadge, OfferStatusBadge } from '../components/ui/Badge'

export function Profile() {
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) navigate('/login')
  }, [user, navigate])

  if (!user) return null

  // TODO: replace with @sails/sdk `liquidity.getOffers({ userId })` once
  // the mock swap happens.
  const myOffers = MOCK_OFFERS.filter((o) => o.userId === user.id)

  return (
    <div>
      <div className="flex flex-col md:flex-row gap-6 items-start pb-6 border-b border-gray-200">
        <UserAvatar user={user} size="xl" />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {user.displayName}
            {user.verified && <span className="text-blue-500 text-base" title="Verificado">✓</span>}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-xs text-gray-400 truncate max-w-xs">{user.publicKey}</span>
            <CopyButton value={user.publicKey} />
          </div>
          <p className="text-xs text-gray-400 mt-1">Membro desde {new Date(user.createdAt).toLocaleDateString('pt-BR')}</p>
        </div>

        <div className="grid grid-cols-4 gap-3 md:ml-auto w-full md:w-auto">
          <Stat value={user.totalTrades} label="Trades" />
          <Stat value={user.totalVolumeBtc.toFixed(2)} label="Volume BTC" />
          <Stat value={`${((user.disputeCount / Math.max(user.totalTrades, 1)) * 100).toFixed(0)}%`} label="Disputa" />
          <Stat value={user.reputationScore.toFixed(0)} label="Reputação" />
        </div>
      </div>

      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col items-center">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-32 h-32 -rotate-90">
              <circle cx="64" cy="64" r="56" fill="none" stroke="#e5e7eb" strokeWidth="10" />
              <circle
                cx="64" cy="64" r="56" fill="none" stroke="#111827" strokeWidth="10"
                strokeDasharray={2 * Math.PI * 56}
                strokeDashoffset={2 * Math.PI * 56 * (1 - user.reputationScore / 100)}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute text-center">
              <div className="text-3xl font-black">{user.reputationScore.toFixed(0)}</div>
              <div className="text-xs text-gray-400">de 100</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3">Avaliações recentes</h3>
          {[5, 4, 3, 2, 1].map((stars) => {
            const pct = stars === 5 ? 78 : stars === 4 ? 15 : stars === 3 ? 5 : stars === 2 ? 1 : 1
            return (
              <div key={stars} className="flex items-center gap-3 mb-1.5">
                <span className="text-xs w-14 text-yellow-500">{'★'.repeat(stars)}</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full">
                  <div className="h-1.5 bg-gray-800 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Minhas Ofertas</h3>
          <button className="text-xs bg-gray-900 text-white rounded-lg px-3 py-1.5">Nova Oferta</button>
        </div>
        <div className="mt-3 space-y-2">
          {myOffers.length === 0 && <p className="text-sm text-gray-400">Nenhuma oferta publicada ainda.</p>}
          {myOffers.map((o) => (
            <div key={o.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3">
              <AssetBadge asset={o.asset} />
              <SideBadge side={o.side} />
              <span className="font-medium text-sm">${o.priceUsd}</span>
              <OfferStatusBadge status={o.status} />
              <Link to={`/offer/${o.id}`} className="ml-auto text-xs text-gray-500 hover:text-gray-800">Ver →</Link>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <Link to="/profile/history" className="text-sm text-gray-900 underline">Ver histórico completo de trades →</Link>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
      <div className="text-lg font-black">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}
