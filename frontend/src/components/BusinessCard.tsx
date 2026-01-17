import type { Business } from '../types'

interface BusinessCardProps {
  business: Business
  isBookmarked: boolean
  onToggleBookmark: (id: number) => void
  onViewDetails: (business: Business) => void
}

export default function BusinessCard({
  business,
  isBookmarked,
  onToggleBookmark,
  onViewDetails,
}: BusinessCardProps) {
  const categoryLabels: Record<string, string> = {
    food: 'Food & Dining',
    retail: 'Retail',
    services: 'Services',
    entertainment: 'Entertainment',
    health: 'Health & Wellness',
  }

  return (
    <div className="business-card">
      <div className="business-image-container">
        <img
          src={business.image_url || '/placeholder.jpg'}
          alt={business.name}
          className="business-image"
        />
        {business.has_deals && <span className="deal-badge">Deal!</span>}
        <button
          className={`bookmark-btn ${isBookmarked ? 'bookmarked' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleBookmark(business.id)
          }}
          title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        >
          {isBookmarked ? '★' : '☆'}
        </button>
      </div>

      <div className="business-info">
        <h3 className="business-name">{business.name}</h3>
        <p className="business-category">{categoryLabels[business.category] || business.category}</p>
        <p className="business-description">{business.description}</p>

        <div className="business-meta">
          <div className="business-rating">
            <span className="stars">{'★'.repeat(Math.round(business.rating))}</span>
            <span className="rating-text">
              {business.rating.toFixed(1)} ({business.review_count} reviews)
            </span>
          </div>
        </div>

        <button className="view-details-btn" onClick={() => onViewDetails(business)}>
          View Details
        </button>
      </div>
    </div>
  )
}
