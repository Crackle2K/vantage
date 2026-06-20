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

const campaignTypeLabels: Record<string, string> = {
  slow_hour: 'Slow-hour',
  first_time_visitor: 'First-time visitor',
  event_promotion: 'Event promotion',
  limited_time_perk: 'Limited-time perk',
  non_discount: 'Non-discount',
  custom_template: 'Custom'
}

const campaignAudienceLabels: Record<string, string> = {
  all_visitors: 'All visitors',
  first_time_visitors: 'First-time visitors',
  saved_business_users: 'Saved customers',
  slow_hour: 'Slow-hour visitors',
  event_interested: 'Event-interested visitors',
  intent_match: 'Intent matches',
  category_match: 'Category matches'
}

const funnelStepDescriptions: Record<string, string> = {
  impressions: 'Recorded reach',
  positive_intent: 'Saves and matches',
  profile_opens: 'Profile consideration',
  actions: 'Claims, directions, check-ins',
  redemptions: 'Tracked use'
}

export function formatCampaignType(value: string): string {
  return campaignTypeLabels[value] ?? formatReasonCode(value)
}

export function formatCampaignAudience(value: string): string {
  return campaignAudienceLabels[value] ?? formatReasonCode(value)
}

export function describeFunnelStep(id: string): string {
  return funnelStepDescriptions[id] ?? 'Recorded customer action'
}
