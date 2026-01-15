import type { Business } from '../types';

interface BusinessCardProps {
  business: Business;
  isBookmarked: boolean;
  onToggleBookmark: (id: number) => void;
  onViewDetails: (business: Business) => void;
}

export default function BusinessCard({ business, isBookmarked, onToggleBookmark, onViewDetails }: BusinessCardProps) {
  return (
    <div className="business-card">
      <img src={business.image_url} alt={business.name} className="business-image" />
      <div className="business-content">
        <div className="business-header">
          <h3>{business.name}</h3>
          <button 
            className={`bookmark-btn ${isBookmarked ? 'bookmarked' : ''}`}
            onClick={() => onToggleBookmark(business.id)}
            title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
          >
            {isBookmarked ? '★' : '☆'}
          </button>
        </div>
        <span className="category-badge">{business.category}</span>
        {business.has_deals && <span className="deal-badge">🎁 Special Deal</span>}
        <p className="business-description">{business.description}</p>
        <div className="business-info">
          <div className="rating">
            <span className="stars">{'★'.repeat(Math.round(business.rating))}{'☆'.repeat(5 - Math.round(business.rating))}</span>
            <span>{business.rating.toFixed(1)} ({business.review_count} reviews)</span>
          </div>
          <div className="contact-info">
            <p>📍 {business.address}</p>
            <p>📞 {business.phone}</p>
          </div>
        </div>
        <button className="view-details-btn" onClick={() => onViewDetails(business)}>
          View Details
        </button>
      </div>
    </div>
  );
}
