import { useState } from 'react'
import { toast } from 'sonner'
import { MOCK_OFFERS } from '../../data/mock'
import { AssetBadge, SideBadge, PaymentBadge, OfferStatusBadge } from '../../components/ui/Badge'

export function ManageOffers() {
  const [offers, setOffers] = useState(MOCK_OFFERS)
  const [showModal, setShowModal] = useState(false)

  const toggleStatus = (id: string) => {
    setOffers((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: o.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' } : o))
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Gerenciar Ofertas</h1>
        <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white text-sm font-semibold rounded-lg px-4 py-2">
          Nova Oferta
        </button>
      </div>

      <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden">
        {offers.map((o) => (
          <div key={o.id} className="px-5 py-3 border-b border-gray-50 last:border-0 flex items-center gap-3 text-sm">
            <AssetBadge asset={o.asset} />
            <SideBadge side={o.side} />
            <span className="font-medium">${o.priceUsd}</span>
            <PaymentBadge method={o.paymentMethod} />
            <OfferStatusBadge status={o.status} />
            <button onClick={() => toggleStatus(o.id)} className="ml-auto text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-md px-2 py-1">
              {o.status === 'ACTIVE' ? 'Pausar' : 'Ativar'}
            </button>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Nova Oferta</h3>
            <p className="text-xs text-gray-400 mt-1">
              {/* TODO: real POST /v1/liquidity/offers call (liquidity.routes.ts) */}
              Formulário mockado — nenhuma chamada real é feita nesta etapa.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  toast.success('Oferta criada com sucesso')
                  setShowModal(false)
                }}
                className="flex-1 bg-gray-900 text-white rounded-lg py-2 text-sm font-semibold"
              >
                Criar Oferta
              </button>
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
