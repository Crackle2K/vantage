import { useState, useEffect } from 'react';
import { api } from '../api';

interface ReviewFormProps {
  businessId: number;
  onReviewSubmitted: () => void;
}

export default function ReviewForm({ businessId, onReviewSubmitted }: ReviewFormProps) {
  const [userName, setUserName] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [verification, setVerification] = useState<{ question: string; token: string } | null>(null);
  const [verificationAnswer, setVerificationAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadVerification();
  }, []);

  const loadVerification = async () => {
    try {
      const challenge = await api.requestVerification();
      setVerification(challenge);
    } catch (err) {
      setError('Failed to load verification challenge');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!userName.trim() || !comment.trim()) {
      setError('Please fill in all fields');
      return;
    }

    if (!verification) {
      setError('Verification not loaded');
      return;
    }

    setIsSubmitting(true);

    try {
      await api.createReview({
        business_id: businessId,
        user_name: userName,
        rating,
        comment,
        verification_token: verification.token,
      });

      setSuccess(true);
      setUserName('');
      setComment('');
      setRating(5);
      setVerificationAnswer('');
      loadVerification();
      onReviewSubmitted();

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to submit review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="review-form">
      <h3>Leave a Review</h3>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">Review submitted successfully!</div>}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Your Name</label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label>Rating</label>
          <div className="rating-input">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={`star-btn ${star <= rating ? 'active' : ''}`}
                onClick={() => setRating(star)}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Your Review</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            required
          />
        </div>

        {verification && (
          <div className="form-group verification">
            <label>{verification.question}</label>
            <input
              type="number"
              value={verificationAnswer}
              onChange={(e) => setVerificationAnswer(e.target.value)}
              required
            />
          </div>
        )}

        <button type="submit" disabled={isSubmitting} className="submit-btn">
          {isSubmitting ? 'Submitting...' : 'Submit Review'}
        </button>
      </form>
    </div>
  );
}
