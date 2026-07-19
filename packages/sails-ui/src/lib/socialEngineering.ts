/**
 * Mocked reflection of the real `SocialEngineeringAgent`
 * (RFC-017, `docs/rfcs/RFC-017-timeline-and-social-engineering-agent.md`,
 * `src/modules/open-agents/social-engineering-agent.ts`) — the real
 * agent calls QVAC (local LLM, `assessSocialEngineeringRisk()`) to
 * classify a chat message; this file uses a plain keyword regex instead,
 * purely so this UI has *something* to react to without a live backend
 * connection. Same honesty boundary as `qvacAgent.ts`/`aiNegotiator.ts`:
 * no HTTP/WS route exists yet for a browser to receive a real
 * `RISK_WARNING` from (`config.features.socialEngineeringDetection`,
 * off by default even on the backend). Detects the same two patterns
 * the real agent detects today — `unexpected_flow_deviation` isn't
 * detected by the real agent yet either (RFC-017's own scope note), so
 * it's not simulated here.
 */
export type RiskPattern = 'off_channel_migration' | 'payment_instruction_change'

export interface RiskWarning {
  pattern: RiskPattern
  riskScore: number
  reasoning: string
}

const OFF_CHANNEL_HINTS = /whatsapp|telegram|\bzap\b|\bsignal\b|fora do chat|liga(r)? no meu|meu (n[uú]mero|telefone)/i
const PAYMENT_CHANGE_HINTS = /nova chave pix|outra chave pix|troca(r)? a chave|novo pix|conta diferente|outro banco|nova conta/i

export function detectRiskLocally(content: string): RiskWarning | null {
  if (OFF_CHANNEL_HINTS.test(content)) {
    return {
      pattern: 'off_channel_migration',
      riskScore: 78,
      reasoning: 'Mensagem sugere continuar a negociação fora deste chat — um padrão comum antes de golpes P2P.',
    }
  }
  if (PAYMENT_CHANGE_HINTS.test(content)) {
    return {
      pattern: 'payment_instruction_change',
      riskScore: 70,
      reasoning: 'Mensagem sugere uma mudança nos dados de pagamento combinados — confirme diretamente com a contraparte antes de agir.',
    }
  }
  return null
}

export const RISK_PATTERN_LABEL: Record<RiskPattern, string> = {
  off_channel_migration: 'Possível tentativa de sair do chat oficial',
  payment_instruction_change: 'Possível mudança nos dados de pagamento',
}
