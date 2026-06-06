const reasonLabels: Record<string, string> = {
  high_trust: 'High trust',
  open_now: 'Open now',
  nearby: 'Nearby',
  trending: 'Trending',
  hidden_gem: 'Hidden gem',
  most_trusted: 'Most trusted',
  price_match: 'Price match',
  category_match: 'Category match',
  too_far: 'Farther away'
}

export function formatReasonCode(code: string): string {
  const normalized = code.trim().toLowerCase()
  if (!normalized) return 'Unknown reason'
  if (reasonLabels[normalized]) return reasonLabels[normalized]

  return normalized
    .split(/[_-]+/)
    .filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}
