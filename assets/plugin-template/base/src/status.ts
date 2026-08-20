export interface {{TYPE_NAME}}Status {
  available: boolean
  message?: string
}

export function is{{TYPE_NAME}}Status(value: unknown): value is {{TYPE_NAME}}Status {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.available === 'boolean'
    && (candidate.message === undefined || typeof candidate.message === 'string')
}
