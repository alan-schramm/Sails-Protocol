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
        <h1 className="text-2xl font-black tracking-tight text-brand-text">Gerenciar Ofertas</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary text-sm px-4 py-2">
          Nova Oferta
        </button>
      </div>

      <div className="mt-4 card overflow-hidden">
        {offers.map((o) => (
          <div key={o.id} className="px-5 py-3 border-b border-brand-border last:border-0 flex items-center gap-3 text-sm">
            <AssetBadge asset={o.asset} />
            <SideBadge side={o.side} />
            <span className="font-medium text-brand-text">${o.priceUsd}</span>
            <PaymentBadge method={o.paymentMethod} />
            <OfferStatusBadge status={o.status} />
            <button onClick={() => toggleStatus(o.id)} className="ml-auto text-xs text-brand-text-muted hover:text-brand-text border border-brand-border rounded-md px-2 py-1 transition-colors">
              {o.status === 'ACTIVE' ? 'Pausar' : 'Ativar'}
            </button>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-brand-text">Nova Oferta</h3>
            <p className="text-xs text-brand-text-muted mt-1">
              {/* TODO: real POST /v1/liquidity/offers call (liquidity.routes.ts) */}
              Formulário mockado — nenhuma chamada real é feita nesta etapa.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  toast.success('Oferta criada com sucesso')
                  setShowModal(false)
                }}
                className="btn-primary flex-1 py-2 text-sm"
              >
                Criar Oferta
              </button>
              <button onClick={() => setShowModal(false)} className="btn-ghost flex-1 py-2 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
