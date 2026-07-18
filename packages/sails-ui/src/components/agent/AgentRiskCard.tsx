import { useEffect, useState } from 'react'
import { assessRiskWithQvac, type AgentRiskAssessment } from '../../lib/qvacAgent'
import { InfoTooltip } from '../ui/InfoTooltip'
import type { AssetType, TradeSide } from '../../types'

const RISK_STYLE: Record<AgentRiskAssessment['risk'], string> = {
  low: 'text-green-500 bg-green-500/10 border-green-500/25',
  medium: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/25',
  high: 'text-red-500 bg-red-500/10 border-red-500/25',
}

const RECOMMENDATION_LABEL: Record<AgentRiskAssessment['recommendation'], string> = {
  proceed: 'Prosseguir',
  hold: 'Aguardar confirmação',
  reject: 'Não prosseguir',
}

interface Props {
  asset: AssetType
  side: TradeSide
  maxValue: number
  minValue: number
}

export function AgentRiskCard({ asset, side, maxValue, minValue }: Props) {
  const [loading, setLoading] = useState(true)
  const [assessment, setAssessment] = useState<AgentRiskAssessment | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    assessRiskWithQvac({ asset, side, maxValue, minValue }).then((result) => {
      if (!cancelled) {
        setAssessment(result)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [asset, side, maxValue, minValue])

  return (
    <div className="card p-4 mt-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-text mb-2">
        🧠 Avaliação de risco do Agente QVAC
        <InfoTooltip text="Reflete o passo real de assessIntentRisk() do backend (QvacAgentProvider, LLM local via @qvac/sdk) que roda antes da coordenação de um Intent (RFC-012). Nesta interface o resultado é simulado — ainda não existe rota HTTP conectando o navegador a essa avaliação real." />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-brand-text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
          Analisando negociação com QVAC...
        </div>
      ) : assessment ? (
        <div>
          <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${RISK_STYLE[assessment.risk]}`}>
            Risco {assessment.risk === 'low' ? 'baixo' : assessment.risk === 'medium' ? 'médio' : 'alto'}
          </div>
          <p className="text-sm text-brand-text-secondary mt-2">{assessment.reasoning}</p>
          <p className="text-xs text-brand-text-muted mt-1">
            Recomendação: <span className="font-medium text-brand-text">{RECOMMENDATION_LABEL[assessment.recommendation]}</span>
          </p>
        </div>
      ) : null}
    </div>
  )
}
