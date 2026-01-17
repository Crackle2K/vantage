import type { Deal, Business } from '../types'

interface DealsSectionProps {
  deals: Deal[]
  businesses: Business[]
}

export default function DealsSection({ deals, businesses }: DealsSectionProps) {
  if (deals.length === 0) {
    return null
  }

  const getBusinessName = (businessId: number) => {
    const business = businesses.find((b) => b.id === businessId)
    return business?.name || 'Unknown Business'
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="deals-section">
      <h2 className="deals-title">Current Deals & Offers</h2>
      <div className="deals-grid">
        {deals.slice(0, 3).map((deal) => (
          <div key={deal.id} className="deal-card">
            <div className="deal-discount">{deal.discount}</div>
            <h3 className="deal-title">{deal.title}</h3>
            <p className="deal-business">{getBusinessName(deal.business_id)}</p>
            <p className="deal-description">{deal.description}</p>
            <p className="deal-expiry">Valid until {formatDate(deal.valid_until)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
