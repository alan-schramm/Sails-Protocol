import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [connecting, setConnecting] = useState(false)

  const handleConnect = () => {
    setConnecting(true)
    // TODO: replace with @sails/sdk's real Ed25519 flow:
    //   identity.register({ publicKey }) once, then
    //   identity.authenticate({ publicKey, signature }) on every login
    // (packages/sails-sdk/src/modules/identity.ts — real, tested,
    // byte-for-byte checked against common/middleware/auth.ts's
    // verification logic). WDK itself (@tetherto/wdk-wallet-evm) never
    // runs in a browser tab — it holds seed material, server-side only.
    setTimeout(() => {
      login()
      setConnecting(false)
      toast.success('Conectado!')
      navigate('/')
    }, 700)
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-center px-14 bg-gray-900 text-white">
        <h1 className="text-4xl font-black tracking-tight leading-tight">
          O marketplace P2P para crypto soberana
        </h1>
        <p className="text-gray-400 text-lg mt-4">Sem custódia. Sem intermediários. Seus fundos, suas chaves.</p>

        <ul className="mt-10 space-y-4 text-sm">
          <Feature icon="🔒" title="Escrow não custodial" desc="Seus fundos bloqueados, nunca em posse nossa" />
          <Feature icon="⚡" title="P2P direto" desc="Negocie direto com a contraparte via chat criptografado" />
          <Feature icon="🌐" title="Multi-chain" desc="BTC, Lightning, Liquid, USDT e mais" />
        </ul>

        <p className="mt-16 text-xs text-gray-500">Powered by Pears · WDK · QVAC · Holepunch</p>
      </div>

      <div className="flex flex-col justify-center px-6 lg:px-16 py-16">
        <h2 className="text-2xl font-bold">Conectar Wallet</h2>
        <p className="text-sm text-gray-500 mt-1">Use seu keypair Ed25519 para autenticar</p>

        <button
          onClick={handleConnect}
          disabled={connecting}
          className="mt-8 h-14 bg-gray-900 hover:bg-gray-700 text-white font-semibold rounded-xl disabled:opacity-60"
        >
          {connecting ? 'Conectando...' : '🔑 Conectar com WDK'}
        </button>
        <p className="text-xs text-gray-400 text-center mt-2">Powered by Tether WDK</p>

        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-4 flex gap-3">
          <span className="text-gray-500">🛡️</span>
          <p className="text-xs text-gray-500">
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
        <div className="text-gray-400 text-xs">{desc}</div>
      </div>
    </li>
  )
}
