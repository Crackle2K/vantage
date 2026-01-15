import type { Deal, Business } from '../types';

interface DealsSectionProps {
  deals: Deal[];
  businesses: Business[];
}

export default function DealsSection({ deals, businesses }: DealsSectionProps) {
  const getBusinessName = (businessId: number) => {
    return businesses.find(b => b.id === businessId)?.name || 'Unknown';
  };

  if (deals.length === 0) {
    return null;
  }

  return (
    <div className="deals-section">
      <h2>🎁 Special Deals & Coupons</h2>
      <div className="deals-grid">
        {deals.map((deal) => (
          <div key={deal.id} className="deal-card">
            <div className="deal-header">
              <h3>{deal.title}</h3>
              <span className="discount-badge">{deal.discount}</span>
            </div>
            <p className="business-name">{getBusinessName(deal.business_id)}</p>
            <p className="deal-description">{deal.description}</p>
            <p className="valid-until">Valid until: {new Date(deal.valid_until).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
