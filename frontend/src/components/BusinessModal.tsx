import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Star, MapPin, Phone, Mail, Globe, Tag, Send, Loader2, MessageSquare, Clock, CheckCircle2, Award, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Business, Review, Deal, BusinessActivityStatus } from '../types'
import { api } from '../api'
import { useAuth } from '@/contexts/AuthContext'

interface BusinessModalProps {
  business: Business
  onClose: () => void
}

const categoryGradients: Record<string, string> = {
  food: 'from-[#4ade80] to-[#22c55e]',
  retail: 'from-[#052e16] to-[#4ade80]',
  services: 'from-[#052e16] to-[#22c55e]',
  entertainment: 'from-[#22c55e] to-[#4ade80]',
  health: 'from-[#4ade80] to-[#052e16]',
}

export function BusinessModal({ business, onClose }: BusinessModalProps) {
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const [reviews, setReviews] = useState<Review[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [activityStatus, setActivityStatus] = useState<BusinessActivityStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'info' | 'reviews' | 'deals'>('info')
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewHover, setReviewHover] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkedIn, setCheckedIn] = useState(false)

  const businessId = business.id || business._id || ''
  const gradient = categoryGradients[business.category] || 'from-[#4ade80] to-[#22c55e]'

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [reviewsData, dealsData, activityData] = await Promise.allSettled([
        api.getBusinessReviews(businessId),
        api.getBusinessDeals(businessId),
        api.getBusinessActivity(businessId),
      ])
      if (reviewsData.status === 'fulfilled') setReviews(reviewsData.value)
      if (dealsData.status === 'fulfilled') setDeals(dealsData.value)
      if (activityData.status === 'fulfilled') setActivityStatus(activityData.value)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    setSubmitting(true)
    try {
      await api.createReview({
        business_id: businessId,
        rating: reviewRating,
        comment: reviewComment,
      })
      setShowReviewForm(false)
      setReviewRating(5)
      setReviewComment('')
      loadData()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit review')
    } finally {
      setSubmitting(false)
    }
  }

  const tabs = [
    { id: 'info' as const, label: 'Details' },
    { id: 'reviews' as const, label: `Reviews (${reviews.length})` },
    { id: 'deals' as const, label: `Deals (${deals.length})` },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[90vh] rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/60 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Hero Image */}
        <div className="relative h-56 overflow-hidden flex-shrink-0">
          {business.image_url ? (
            <img src={business.image_url} alt={business.name} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
              <span className="text-7xl font-bold text-white/30">{business.name[0]}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* Title overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <h2 className="text-2xl font-bold text-white mb-1 font-heading tracking-tight">{business.name}</h2>
            <div className="flex items-center gap-3 text-white/80 text-sm">
              <span className="capitalize">{business.category}</span>
              <span>|</span>
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(i => (
                  <Star key={i} className={cn('w-3.5 h-3.5', i <= Math.round(business.rating) ? 'text-amber-400 fill-amber-400' : 'text-white/40')} />
                ))}
                <span className="ml-1 font-medium">{business.rating.toFixed(1)}</span>
                <span className="text-white/60">({business.review_count})</span>
              </div>
              {business.distance !== undefined && (
                <>
                  <span>|</span>
                  <span>{business.distance.toFixed(1)} km</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[hsl(var(--border))] flex-shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 px-4 py-3 text-sm font-medium transition-colors relative',
                activeTab === tab.id
                  ? 'text-[hsl(var(--primary))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-4 right-4 h-0.5 gradient-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* INFO TAB */}
          {activeTab === 'info' && (
            <div className="space-y-5 animate-fade-in">
              {/* Activity Signal */}
              {activityStatus && activityStatus.is_active_today && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">Active Today</span>
                  <span className="text-xs text-green-600 dark:text-green-500 ml-auto">
                    {activityStatus.checkins_today} check-in{activityStatus.checkins_today !== 1 ? 's' : ''} today
                  </span>
                </div>
              )}

              {/* Claimed badge or Claim button */}
              {business.is_claimed ? (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">Verified Business</span>
                </div>
              ) : business.is_seed !== false && isAuthenticated && user?.role === 'business_owner' ? (
                <button
                  onClick={() => { onClose(); navigate(`/claim?business=${businessId}`) }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-[#22c55e]/30 text-[#22c55e] hover:bg-[#22c55e]/5 transition-colors text-sm font-medium"
                >
                  <Award className="w-4 h-4" />
                  Claim This Business
                </button>
              ) : null}

              {/* Check-in button */}
              {isAuthenticated && (
                <button
                  onClick={async () => {
                    if (checkedIn || checkingIn) return
                    setCheckingIn(true)
                    try {
                      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
                      }).catch(() => null)
                      await api.checkIn({
                        business_id: businessId,
                        latitude: pos?.coords.latitude,
                        longitude: pos?.coords.longitude,
                      })
                      setCheckedIn(true)
                    } catch (err) {
                      setSubmitError(err instanceof Error ? err.message : 'Check-in failed')
                    } finally {
                      setCheckingIn(false)
                    }
                  }}
                  disabled={checkingIn || checkedIn}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all',
                    checkedIn
                      ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                      : 'gradient-primary text-white shadow-md shadow-[#22c55e]/20 hover:shadow-lg'
                  )}
                >
                  {checkingIn ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : checkedIn ? (
                    <><CheckCircle2 className="w-4 h-4" /> Checked In!</>
                  ) : (
                    <><Zap className="w-4 h-4" /> Check In Here</>
                  )}
                </button>
              )}

              <p className="text-[hsl(var(--muted-foreground))] leading-relaxed">{business.description}</p>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-[hsl(var(--foreground))] uppercase tracking-wide font-mono">Contact</h4>
                <div className="space-y-2.5">
                  {business.address && (
                    <div className="flex items-start gap-3 text-sm">
                      <MapPin className="w-4 h-4 text-[hsl(var(--primary))] flex-shrink-0 mt-0.5" />
                      <span className="text-[hsl(var(--muted-foreground))]">{business.address}</span>
                    </div>
                  )}
                  {business.phone && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="w-4 h-4 text-[hsl(var(--primary))]" />
                      <a href={`tel:${business.phone}`} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">{business.phone}</a>
                    </div>
                  )}
                  {business.email && (
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="w-4 h-4 text-[hsl(var(--primary))]" />
                      <a href={`mailto:${business.email}`} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">{business.email}</a>
                    </div>
                  )}
                  {business.website && (
                    <div className="flex items-center gap-3 text-sm">
                      <Globe className="w-4 h-4 text-[hsl(var(--primary))]" />
                      <a href={business.website} target="_blank" rel="noopener noreferrer" className="text-[hsl(var(--primary))] hover:underline">{business.website}</a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* REVIEWS TAB */}
          {activeTab === 'reviews' && (
            <div className="space-y-5 animate-fade-in">
              {/* Write review button / form */}
              {isAuthenticated && !showReviewForm && (
                <button
                  onClick={() => setShowReviewForm(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  Write a Review
                </button>
              )}

              {!isAuthenticated && (
                <div className="p-4 rounded-xl bg-[hsl(var(--secondary))] text-center">
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    <a href="/login" className="text-[hsl(var(--primary))] font-medium hover:underline">Sign in</a> to write a review
                  </p>
                </div>
              )}

              {showReviewForm && (
                <form onSubmit={handleSubmitReview} className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-[hsl(var(--foreground))] mb-2 block">Rating</label>
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map(i => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setReviewRating(i)}
                          onMouseEnter={() => setReviewHover(i)}
                          onMouseLeave={() => setReviewHover(0)}
                          className="p-0.5"
                        >
                          <Star className={cn('w-7 h-7 transition-colors', i <= (reviewHover || reviewRating) ? 'text-amber-400 fill-amber-400' : 'text-[hsl(var(--border))]')} />
                        </button>
                      ))}
                      <span className="ml-2 text-sm text-[hsl(var(--muted-foreground))]">
                        {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][reviewRating]}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[hsl(var(--foreground))] mb-2 block">Your Review</label>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Share your experience..."
                      className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 focus:border-[hsl(var(--primary))] min-h-[100px] resize-none"
                      required
                    />
                  </div>
                  {submitError && (
                    <p className="text-sm text-red-500">{submitError}</p>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowReviewForm(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] transition-colors">
                      Cancel
                    </button>
                    <button type="submit" disabled={submitting || reviewComment.length < 5} className="px-5 py-2 rounded-xl text-sm font-medium gradient-primary text-white disabled:opacity-50 flex items-center gap-2">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Submit
                    </button>
                  </div>
                </form>
              )}

              {/* Reviews list */}
              {loading ? (
                <div className="space-y-4">
                  {[1,2,3].map(i => <div key={i} className="h-24 rounded-xl skeleton" />)}
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-10">
                  <MessageSquare className="w-10 h-10 text-[hsl(var(--muted-foreground))] mx-auto mb-3 opacity-40" />
                  <p className="font-medium text-[hsl(var(--foreground))]">No reviews yet</p>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">Be the first to share your experience</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id || review._id} className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-white">
                            {review.user_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{review.user_name}</p>
                            <div className="flex items-center gap-1">
                              {[1,2,3,4,5].map(i => (
                                <Star key={i} className={cn('w-3 h-3', i <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-[hsl(var(--border))]')} />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                          {review.verified && <CheckCircle2 className="w-3.5 h-3.5 text-[#4ade80]" />}
                          <Clock className="w-3 h-3" />
                          {new Date(review.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{review.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DEALS TAB */}
          {activeTab === 'deals' && (
            <div className="space-y-4 animate-fade-in">
              {loading ? (
                <div className="space-y-4">
                  {[1,2].map(i => <div key={i} className="h-20 rounded-xl skeleton" />)}
                </div>
              ) : deals.length === 0 ? (
                <div className="text-center py-10">
                  <Tag className="w-10 h-10 text-[hsl(var(--muted-foreground))] mx-auto mb-3 opacity-40" />
                  <p className="font-medium text-[hsl(var(--foreground))]">No active deals</p>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">Check back later for special offers</p>
                </div>
              ) : (
                deals.map(deal => (
                  <div key={deal.id || deal._id} className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#4ade80]/15 dark:bg-[#4ade80]/20 flex items-center justify-center flex-shrink-0">
                          <Tag className="w-5 h-5 text-[#4ade80] dark:text-[#4ade80]" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-[hsl(var(--foreground))]">{deal.title}</h4>
                          <p className="text-sm text-[hsl(var(--muted-foreground))]">{deal.description}</p>
                        </div>
                      </div>
                      <span className="text-lg font-bold text-[#4ade80] dark:text-[#4ade80] flex-shrink-0">
                        {deal.discount_type === 'percentage' ? `${deal.discount_value}%` : `$${deal.discount_value}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[hsl(var(--border))]/50">
                      {deal.code && (
                        <span className="px-3 py-1 rounded-lg bg-[hsl(var(--secondary))] font-mono text-sm text-[hsl(var(--foreground))]">{deal.code}</span>
                      )}
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        Valid until {new Date(deal.valid_until).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
