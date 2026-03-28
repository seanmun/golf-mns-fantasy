export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div
        className="animate-spin rounded-full h-8 w-8 border-b-2"
        style={{ borderColor: 'var(--color-green-primary)' }}
      />
    </div>
  )
}
