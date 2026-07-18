import { useTheme } from '../../context/ThemeContext'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Alternar tema"
      className="w-8 h-8 flex items-center justify-center rounded-lg border border-brand-border text-brand-text-secondary hover:border-brand-border-hover hover:text-brand-text transition-colors"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
