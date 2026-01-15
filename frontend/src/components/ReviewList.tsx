import type { Review } from '../types';

interface ReviewListProps {
  reviews: Review[];
}

export default function ReviewList({ reviews }: ReviewListProps) {
  if (reviews.length === 0) {
    return <p className="no-reviews">No reviews yet. Be the first to review!</p>;
  }

  return (
    <div className="review-list">
      {reviews.map((review) => (
        <div key={review.id} className="review-item">
          <div className="review-header">
            <div>
              <strong>{review.user_name}</strong>
              {review.verified && <span className="verified-badge">✓ Verified</span>}
            </div>
            <div className="review-rating">
              {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
            </div>
          </div>
          <p className="review-comment">{review.comment}</p>
          <p className="review-date">{new Date(review.date).toLocaleDateString()}</p>
        </div>
      ))}
    </div>
  );
}
