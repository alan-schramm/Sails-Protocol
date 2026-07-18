import type { User } from '../../types'

const SIZES = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base', xl: 'w-16 h-16 text-xl' } as const

export function UserAvatar({ user, size = 'md' }: { user: User; size?: keyof typeof SIZES }) {
  const initial = (user.displayName ?? user.id).charAt(0).toUpperCase()
  return (
    <div className={`${SIZES[size]} shrink-0 rounded-full bg-gray-700 text-white font-bold flex items-center justify-center`}>
      {initial}
    </div>
  )
}
