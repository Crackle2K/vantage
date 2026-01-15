import type { Business, Review, Deal } from '../types';
import { api } from '../api';
import { useState, useEffect } from 'react';
import ReviewForm from './ReviewForm';
import ReviewList from './ReviewList';

interface BusinessModalProps {
  business: Business;
  onClose: () => void;
}

export default function BusinessModal({ business, onClose }: BusinessModalProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [business.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [reviewsData, dealsData] = await Promise.all([
        api.getBusinessReviews(business.id),
        api.getDeals(business.id),
      ]);
      setReviews(reviewsData);
      setDeals(dealsData);
    } catch (err) {
      console.error('Failed to load business details', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>×</button>
        
        <div className="modal-header">
          <img src={business.image_url} alt={business.name} className="modal-image" />
          <div className="modal-header-info">
            <h2>{business.name}</h2>
            <span className="category-badge">{business.category}</span>
            <div className="rating">
              <span className="stars">
                {'★'.repeat(Math.round(business.rating))}{'☆'.repeat(5 - Math.round(business.rating))}
              </span>
              <span>{business.rating.toFixed(1)} ({business.review_count} reviews)</span>
            </div>
          </div>
        </div>

        <div className="modal-body">
          <section>
            <h3>About</h3>
            <p>{business.description}</p>
          </section>

          <section>
            <h3>Contact Information</h3>
            <p>📍 {business.address}</p>
            <p>📞 {business.phone}</p>
            <p>📧 {business.email}</p>
            {business.website && (
              <p>🌐 <a href={`https://${business.website}`} target="_blank" rel="noopener noreferrer">{business.website}</a></p>
            )}
          </section>

          {deals.length > 0 && (
            <section className="modal-deals">
              <h3>🎁 Current Deals</h3>
              {deals.map((deal) => (
                <div key={deal.id} className="modal-deal-item">
                  <div className="deal-header">
                    <strong>{deal.title}</strong>
                    <span className="discount-badge">{deal.discount}</span>
                  </div>
                  <p>{deal.description}</p>
                  <p className="deal-valid">Valid until: {new Date(deal.valid_until).toLocaleDateString()}</p>
                </div>
              ))}
            </section>
          )}

          <section>
            <h3>Reviews</h3>
            {loading ? (
              <p>Loading reviews...</p>
            ) : (
              <>
                <ReviewList reviews={reviews} />
                <ReviewForm businessId={business.id} onReviewSubmitted={loadData} />
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
