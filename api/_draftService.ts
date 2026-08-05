// Client for the platform draft service hosted by the hub.
// Golf owns pools and rosters; the hub owns draft order, the clock and
// picks. See project-shared-engines in memory.

const HUB = process.env.PLATFORM_API_URL || 'https://mnsfantasy.com'

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const secret = process.env.DRAFT_SERVICE_SECRET
  if (!secret) throw new Error('DRAFT_SERVICE_SECRET not configured')
  const res = await fetch(`${HUB}/api/draft${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-draft-service-secret': secret,
      ...(init.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      (body as { error?: string }).error || `Draft service returned ${res.status}`
    )
  }
  return body as T
}

export interface DraftParticipantInput {
  userId: string
  email?: string | null
  teamName: string
  slot: number
}

export interface DraftItemInput {
  ref: string
  name: string
  rankHint?: number | null
  meta?: Record<string, unknown> | null
}

export interface CreateDraftInput {
  gameSlug: string
  scopeType: 'pool' | 'league'
  scopeId: string
  name: string
  lobbyUrl: string
  mode: 'draft' | 'pickem'
  orderType?: 'snake' | 'linear'
  rounds: number
  pickSeconds?: number | null
  slowPickHours?: number
  createdBy: string
  participants: DraftParticipantInput[]
  items: DraftItemInput[]
}

export function createDraft(input: CreateDraftInput) {
  return call<{ draft: { id: string } }>('', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// Recover a draft the hub already created when golf failed to persist
// its id — otherwise the pool is wedged (golf sees no draft, the hub
// refuses to create a second one for the same scope).
export function findDraftByScope(gameSlug: string, scopeType: string, scopeId: string) {
  return call<{ draft: { id: string } | null }>(
    `?gameSlug=${encodeURIComponent(gameSlug)}&scopeType=${scopeType}&scopeId=${encodeURIComponent(scopeId)}`
  )
}

export function getDraftState(draftId: string) {
  return call<Record<string, unknown>>(`/${draftId}`)
}

export function controlDraft(draftId: string, body: Record<string, unknown>) {
  return call<Record<string, unknown>>(`/${draftId}/control`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
