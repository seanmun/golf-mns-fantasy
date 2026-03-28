import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--color-background)] disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-neon-green text-black hover:bg-neon-green/90 focus:ring-neon-green/50': variant === 'primary',
            'bg-[var(--color-muted)] text-[var(--color-foreground)] border border-[var(--color-border)] hover:bg-[var(--color-border)]': variant === 'secondary',
            'bg-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]': variant === 'ghost',
            'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500/50': variant === 'danger',
          },
          {
            'px-3 py-1.5 text-sm': size === 'sm',
            'px-4 py-2 text-sm': size === 'md',
            'px-6 py-3 text-base': size === 'lg',
          },
          className
        )}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'
