import { useState } from 'react'
import { toast } from 'sonner'
import { MOCK_OFFERS } from '../../data/mock'
import { AssetBadge, SideBadge, PaymentBadge, OfferStatusBadge } from '../../components/ui/StatusBadges'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog'

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
        <h1 className="text-2xl font-display font-bold tracking-tight text-brand-text">Gerenciar Ofertas</h1>
        <Button onClick={() => setShowModal(true)} className="text-sm px-4 py-2">
          Nova Oferta
        </Button>
      </div>

      <Card className="mt-4 overflow-hidden">
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
      </Card>

      {/* Real Radix Dialog (2026-08-01) — replaces a hand-rolled
          `fixed inset-0` backdrop + manual `stopPropagation()`, which had
          no focus trap, no Escape-to-close, no `role="dialog"`. Real gain,
          not just visual consistency — see feedback_slc_ui_philosophy. */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Oferta</DialogTitle>
            {/* TODO: real POST /v1/liquidity/offers call (liquidity.routes.ts) */}
            <DialogDescription>Formulário mockado — nenhuma chamada real é feita nesta etapa.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => {
                toast.success('Oferta criada com sucesso')
                setShowModal(false)
              }}
              className="flex-1 py-2 text-sm"
            >
              Criar Oferta
            </Button>
            <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1 py-2 text-sm">
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
