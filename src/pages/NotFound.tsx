import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center px-4">
      <h1 className="font-display text-6xl mb-4" style={{ color: 'var(--color-text-primary)' }}>404</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>Page not found</p>
      <Link to="/" className="px-4 py-2 rounded-lg text-sm border"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
        Go home
      </Link>
    </div>
  )
}
