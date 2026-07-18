import { useState } from 'react'

export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="Mais informações"
        className="w-4 h-4 rounded-full border border-brand-border text-brand-text-muted text-[10px] flex items-center justify-center hover:border-brand-orange hover:text-brand-orange transition-colors"
      >
        i
      </button>
      {open && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 card p-2.5 text-xs text-brand-text-secondary shadow-lg normal-case font-normal">
          {text}
        </span>
      )}
    </span>
  )
}
