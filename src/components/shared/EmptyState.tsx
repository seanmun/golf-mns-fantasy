interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center py-20 px-4">
      <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </h2>
      {description && (
        <p className="text-sm mb-6 max-w-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
