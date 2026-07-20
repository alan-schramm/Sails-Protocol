import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { InfoTooltip } from '../components/ui/InfoTooltip'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [connecting, setConnecting] = useState(false)

  const handleConnect = async () => {
    setConnecting(true)
    try {
      // Real Ed25519 challenge-response — identity.create() once (fresh
      // keypair), identity.authenticate() every login
      // (packages/sails-sdk/src/modules/identity.ts). WDK itself
      // (@tetherto/wdk-wallet-evm) never runs in a browser tab — it holds
      // seed material, server-side only; this is the separate identity
      // keypair (Ed25519), not a WDK-managed key.
      await login()
      toast.success('Conectado!')
      // Real fix: this used to always navigate to '/', so any protected
      // action (e.g. OfferDetail's "Iniciar Trade") that bounced an
      // unauthenticated user here lost all context — they'd land back on
      // the Marketplace and have to re-find the offer and retype the
      // amount. Now returns to wherever the redirect came from, carrying
      // the amount forward too (OfferDetail reads it back to prefill).
      const state = location.state as { from?: string; amount?: number } | null
      navigate(state?.from ?? '/', { state: state?.amount ? { amount: state.amount } : undefined })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao conectar')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-brand-bg">
      {/* Brand showcase panel — deliberately always dark (the official
          Satsails identity), independent of the light/dark toggle,
          which only affects the form panel on the right. */}
      <div
        className="hidden lg:flex flex-col justify-center px-14 text-white relative overflow-hidden"
        style={{ backgroundColor: '#050505', backgroundImage: 'radial-gradient(ellipse 80% 40% at 50% -5%, rgba(249,115,22,0.1) 0%, transparent 65%)' }}
      >
        <h1 className="text-4xl font-black tracking-tight leading-tight">
          O marketplace P2P para crypto soberana
        </h1>
        <p className="text-neutral-400 text-lg mt-4">Sem custódia. Sem intermediários. Seus fundos, suas chaves.</p>

        <ul className="mt-10 space-y-4 text-sm">
          <Feature icon="🔒" title="Escrow não custodial" desc="Seus fundos bloqueados, nunca em posse nossa" />
          <Feature icon="⚡" title="P2P direto" desc="Negocie direto com a contraparte via chat criptografado" />
          <Feature icon="🌐" title="Multi-chain" desc="BTC, Lightning, Liquid, USDT e mais" />
        </ul>

        <p className="mt-16 text-xs text-neutral-500">Powered by Pears · WDK · QVAC · Holepunch</p>
      </div>

      <div className="flex flex-col justify-center px-6 lg:px-16 py-16 relative">
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>

        {/* Real fix from a cold-start UX walkthrough: "Use seu keypair
            Ed25519 para autenticar" and "Conectar com WDK" were the
            FIRST and ONLY things a brand-new, non-technical user saw —
            neither means anything without already knowing what this
            product is. The technical detail is true and stays (this is
            a reference implementation of real crypto, not a claim to
            water down) but it now lives behind an info icon instead of
            being the primary copy a first-time user has to parse. */}
        <div className="flex items-center gap-1.5">
          <h2 className="text-2xl font-bold text-brand-text">Entrar</h2>
          <InfoTooltip text="Tecnicamente: autenticação por assinatura de chave Ed25519 — sem senha, sem servidor guardando credenciais. Sua chave privada nunca sai do seu dispositivo." />
        </div>
        <p className="text-sm text-brand-text-muted mt-1">Conecte sua carteira para comprar e vender com segurança</p>

        <button onClick={handleConnect} disabled={connecting} className="btn-primary mt-8 h-14">
          {connecting ? 'Conectando...' : '🔑 Conectar Carteira'}
        </button>
        <p className="text-xs text-brand-text-muted text-center mt-2">Powered by Tether WDK</p>

        <div className="mt-8 bg-brand-elevated border border-brand-border rounded-xl p-4 flex gap-3">
          <span className="text-brand-text-secondary">🛡️</span>
          <p className="text-xs text-brand-text-secondary">
            Sua chave privada nunca sai do seu dispositivo. O Sails Protocol só verifica sua assinatura.
          </p>
        </div>
      </div>
    </div>
  )
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <li className="flex gap-3">
      <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">{icon}</span>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-neutral-400 text-xs">{desc}</div>
      </div>
    </li>
  )
}
