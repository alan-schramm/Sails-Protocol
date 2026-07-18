import { useState } from 'react'
import { toast } from 'sonner'

export function CopyButton({ value, label = 'Copiar' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    toast.success('Copiado!')
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs text-gray-500 hover:text-gray-800 border border-gray-300 rounded-md px-2 py-1"
    >
      {copied ? '✓' : label}
    </button>
  )
}
