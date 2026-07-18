import { useState } from 'react'
import { toast } from 'sonner'
import { generateIntentWithQvac, type AgentGeneratedIntent } from '../../lib/qvacAgent'
import { InfoTooltip } from '../ui/InfoTooltip'
import type { TradeSide } from '../../types'

const GOAL_PLACEHOLDER = 'Ex: quero comprar USDT pagando via PIX, tenho até R$ 500 disponíveis'

export function AgentIntentionPanel() {
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<TradeSide>('BUY')
  const [goal, setGoal] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AgentGeneratedIntent | null>(null)

  const handleGenerate = async () => {
    if (!goal.trim()) {
      toast.error('Descreva o que você quer negociar')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const intent = await generateIntentWithQvac(goal.trim(), side)
      setResult(intent)
    } finally {
      setLoading(false)
    }
  }

  const handleUse = () => {
    toast.success('Intenção estruturada pronta — em produção isso viraria uma TradeIntentPayload real via BuyerAgent/SellerAgent.')
  }

  return (
    <div className="card p-4 mb-4">
      <div className="w-full flex items-center justify-between text-left">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-semibold text-brand-text"
        >
          🧠 Agente QVAC — descreva o que você quer negociar
        </button>
        <div className="flex items-center gap-2">
          <InfoTooltip text="QVAC roda um LLM local (llama.cpp, sem nuvem) que transforma seu pedido em linguagem natural numa intenção de trade estruturada — o mesmo papel de BuyerAgent/SellerAgent no backend. Nesta interface o resultado é simulado: ainda não existe uma rota HTTP real conectando o navegador ao QVAC (hoje ele só roda no fluxo de demonstração do servidor)." />
          <button onClick={() => setOpen((o) => !o)} className="text-brand-text-muted text-xs">
            {open ? 'fechar ▲' : 'abrir ▼'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3">
          <div className="flex gap-1 bg-brand-elevated rounded-lg p-1 w-fit mb-2">
            {(['BUY', 'SELL'] as TradeSide[]).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  side === s ? 'bg-brand-surface shadow-sm font-medium text-brand-text' : 'text-brand-text-secondary'
                }`}
              >
                {s === 'BUY' ? 'Quero comprar' : 'Quero vender'}
              </button>
            ))}
          </div>

          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={GOAL_PLACEHOLDER}
            className="input-field w-full"
            rows={2}
          />

          <div className="flex items-center gap-3 mt-2">
            <button onClick={handleGenerate} disabled={loading} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
              {loading ? 'QVAC pensando...' : 'Gerar com QVAC'}
            </button>
            {loading && (
              <span className="text-xs text-brand-text-muted flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
                LLAMA_3_2_1B_INST_Q4_0 · inferência local (simulada)
              </span>
            )}
          </div>

          {result && (
            <div className="mt-3 rounded-lg border border-brand-orange/30 bg-brand-orange/5 p-3">
              <div className="text-xs font-semibold text-brand-orange mb-2">Intenção estruturada gerada</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <Field label="Ativo" value={result.asset} />
                <Field label="Lado" value={result.side === 'BUY' ? 'Compra' : 'Venda'} />
                <Field label="Moeda" value={result.currency} />
                <Field label="Mín." value={result.minValue} />
                <Field label="Máx." value={result.maxValue} />
                <Field label="Método" value={result.fiatMethod} />
              </div>
              <button onClick={handleUse} className="btn-primary mt-3 px-3 py-1.5 text-xs">
                Usar esta intenção
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-brand-surface rounded-md px-2 py-1.5 border border-brand-border">
      <div className="text-brand-text-muted">{label}</div>
      <div className="font-medium text-brand-text">{value}</div>
    </div>
  )
}
