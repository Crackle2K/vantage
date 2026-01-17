import { useState, useEffect, useCallback } from 'react'
import type { Business, Review, VerificationChallenge } from '../types'
import { api } from '../api'

interface BusinessModalProps {
  business: Business
  onClose: () => void
}

export default function BusinessModal({ business, onClose }: BusinessModalProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewForm, setReviewForm] = useState({
    user_name: '',
    rating: 5,
    comment: '',
  })
  const [verification, setVerification] = useState<VerificationChallenge | null>(null)
  const [verificationAnswer, setVerificationAnswer] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadReviews = useCallback(async () => {
    try {
      const data = await api.getBusinessReviews(business.id)
      setReviews(data)
    } catch (err) {
      console.error('Failed to load reviews:', err)
    } finally {
      setLoading(false)
    }
  }, [business.id])

  useEffect(() => {
    loadReviews()
  }, [loadReviews])

  const startReview = async () => {
    try {
      const challenge = await api.requestVerification()
      setVerification(challenge)
      setShowReviewForm(true)
    } catch (err) {
      console.error('Failed to start verification:', err)
    }
  }

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!verification) return

    setSubmitError('')
    setSubmitting(true)

    try {
      await api.createReview({
        business_id: business.id,
        user_name: reviewForm.user_name,
        rating: reviewForm.rating,
        comment: reviewForm.comment,
        verification_token: `${verification.token}:${verificationAnswer}`,
      })

      setShowReviewForm(false)
      setVerification(null)
      setReviewForm({ user_name: '', rating: 5, comment: '' })
      setVerificationAnswer('')
      loadReviews()
    } catch {
      setSubmitError('Failed to submit review. Please check your verification answer.')
    } finally {
      setSubmitting(false)
    }
  }

  const categoryLabels: Record<string, string> = {
    food: 'Food & Dining',
    retail: 'Retail',
    services: 'Services',
    entertainment: 'Entertainment',
    health: 'Health & Wellness',
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>

        <div className="modal-header">
          <img
            src={business.image_url || '/placeholder.jpg'}
            alt={business.name}
            className="modal-image"
          />
          <div className="modal-header-info">
            <h2>{business.name}</h2>
            <p className="modal-category">{categoryLabels[business.category] || business.category}</p>
            <div className="modal-rating">
              <span className="stars">{'★'.repeat(Math.round(business.rating))}</span>
              <span>{business.rating.toFixed(1)} ({business.review_count} reviews)</span>
            </div>
          </div>
        </div>

        <div className="modal-body">
          <p className="modal-description">{business.description}</p>

          <div className="modal-details">
            <p><strong>Address:</strong> {business.address}</p>
            <p><strong>Phone:</strong> {business.phone}</p>
            <p><strong>Email:</strong> {business.email}</p>
            {business.website && (
              <p>
                <strong>Website:</strong>{' '}
                <a href={business.website} target="_blank" rel="noopener noreferrer">
                  {business.website}
                </a>
              </p>
            )}
          </div>

          <div className="reviews-section">
            <div className="reviews-header">
              <h3>Reviews</h3>
              {!showReviewForm && (
                <button className="write-review-btn" onClick={startReview}>
                  Write a Review
                </button>
              )}
            </div>

            {showReviewForm && (
              <form className="review-form" onSubmit={handleSubmitReview}>
                <input
                  type="text"
                  placeholder="Your name"
                  value={reviewForm.user_name}
                  onChange={(e) => setReviewForm({ ...reviewForm, user_name: e.target.value })}
                  required
                />

                <div className="rating-input">
                  <label>Rating:</label>
                  <select
                    value={reviewForm.rating}
                    onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })}
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} star{n !== 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <textarea
                  placeholder="Write your review..."
                  value={reviewForm.comment}
                  onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                  required
                  rows={4}
                />

                {verification && (
                  <div className="verification-section">
                    <p className="verification-question">{verification.question}</p>
                    <input
                      type="number"
                      placeholder="Your answer"
                      value={verificationAnswer}
                      onChange={(e) => setVerificationAnswer(e.target.value)}
                      required
                    />
                  </div>
                )}

                {submitError && <p className="error-message">{submitError}</p>}

                <div className="form-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReviewForm(false)
                      setVerification(null)
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit Review'}
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <p>Loading reviews...</p>
            ) : reviews.length === 0 ? (
              <p className="no-reviews">No reviews yet. Be the first to review!</p>
            ) : (
              <div className="reviews-list">
                {reviews.map((review) => (
                  <div key={review.id} className="review-item">
                    <div className="review-header">
                      <span className="reviewer-name">{review.user_name}</span>
                      <span className="review-rating">{'★'.repeat(review.rating)}</span>
                      {review.verified && <span className="verified-badge">Verified</span>}
                    </div>
                    <p className="review-date">{new Date(review.date).toLocaleDateString()}</p>
                    <p className="review-comment">{review.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
