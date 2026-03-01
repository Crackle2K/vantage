import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Star, MapPin, Phone, Mail, Globe, Tag, Send, Loader2, MessageSquare, Clock, CheckCircle2, Award, Zap, Edit3, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BusinessImage } from '@/components/explore/BusinessImage'
import type { Business, Review, Deal, BusinessActivityStatus } from '../types'
import { api, buildApiUrl } from '../api'
import { useAuth } from '@/contexts/AuthContext'

interface BusinessModalProps {
  business: Business
  onClose: () => void
  onBusinessUpdated?: (business: Business) => void
}

const categoryGradients: Record<string, string> = {
  food: 'from-brand-light to-brand',
  retail: 'from-brand-dark to-brand-light',
  services: 'from-brand-dark to-brand',
  entertainment: 'from-brand to-brand-light',
  health: 'from-brand-light to-brand-dark',
}

function getBusinessId(business: Business) {
  return business.id || business._id || ''
}

function parseKnownFor(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function BusinessModal({ business, onClose, onBusinessUpdated }: BusinessModalProps) {
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
  const [showFullDescription, setShowFullDescription] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [shortDescription, setShortDescription] = useState(business.short_description || business.description || '')
  const [knownFor, setKnownFor] = useState<string[]>(business.known_for || [])
  const [knownForInput, setKnownForInput] = useState((business.known_for || []).join(', '))

  const businessId = getBusinessId(business)
  const isClaimedOwner = !!(isAuthenticated && business.is_claimed && user?.id === business.owner_id)
  const gradient = categoryGradients[business.category] || 'from-brand-light to-brand'
  const displayShortDescription = shortDescription || business.short_description || business.description || ''
  const displayKnownFor = knownFor.length > 0 ? knownFor : business.known_for || []
  const detailDescription =
    business.description && business.description !== business.address
      ? business.description
      : displayShortDescription
  const showDescriptionToggle = detailDescription.length > 180
  const modalProxyPhotoUrl = business.place_id
    ? buildApiUrl(`/api/photos?place_id=${encodeURIComponent(business.place_id)}&maxwidth=1400`)
    : undefined
  const modalImageCandidates = Array.from(
    new Set([modalProxyPhotoUrl, business.image_url, ...(business.image_urls || []), business.image].filter(Boolean) as string[])
  )

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

  useEffect(() => {
    setShortDescription(business.short_description || business.description || '')
    setKnownFor(business.known_for || [])
    setKnownForInput((business.known_for || []).join(', '))
    setEditingProfile(false)
    setProfileError('')
    setCheckedIn(false)
    setSubmitError('')
  }, [business])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

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

  const handleSaveProfile = async () => {
    if (!isClaimedOwner) return

    setProfileError('')
    setProfileSaving(true)
    try {
      const parsedTags = parseKnownFor(knownForInput)

      const updated = await api.updateBusinessProfile(businessId, {
        short_description: shortDescription,
        known_for: parsedTags,
      })

      setShortDescription(updated.short_description || '')
      setKnownFor(updated.known_for || [])
      setKnownForInput((updated.known_for || []).join(', '))
      onBusinessUpdated?.(updated)
      setEditingProfile(false)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile details')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleCheckIn = async () => {
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
  }

  const handleClaimBusiness = () => {
    onClose()
    navigate(`/claim?business=${businessId}`)
  }

  const closeReviewForm = () => {
    setShowReviewForm(false)
    setSubmitError('')
  }

  const tabs = [
    { id: 'info' as const, label: 'Details' },
    { id: 'reviews' as const, label: `Reviews (${reviews.length})` },
    { id: 'deals' as const, label: `Deals (${deals.length})` },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-scrim-dark/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-3xl max-h-[88vh] rounded-[28px] bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-scrim-dark/40 backdrop-blur-sm text-on-primary flex items-center justify-center hover:bg-scrim-dark/60 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative h-56 overflow-hidden flex-shrink-0">
          {modalImageCandidates.length > 0 ? (
            <BusinessImage
              primaryImage={modalImageCandidates[0]}
              imageCandidates={modalImageCandidates}
              category={business.category}
              alt={business.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
              <span className="text-display font-bold text-on-primary/30">{business.name[0]}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          <div className="absolute bottom-0 left-0 right-0 p-6">
            <h2 className="text-subheading font-bold text-on-primary mb-1 font-heading tracking-tight">{business.name}</h2>
            <div className="flex items-center gap-3 text-on-primary/80 text-ui">
              <span className="capitalize">{business.category}</span>
              <span>|</span>
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(i => (
                  <Star key={i} className={cn('w-3.5 h-3.5', i <= Math.round(business.rating) ? 'text-warning fill-amber-400' : 'text-on-primary/40')} />
                ))}
                <span className="ml-1 font-medium">{business.rating.toFixed(1)}</span>
                <span className="text-secondary">({business.review_count})</span>
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

        <div className="flex border-b border-[hsl(var(--border))] flex-shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 px-4 py-3 text-ui font-medium transition-colors relative',
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

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'info' && (
            <div className="space-y-5 animate-fade-in">
              {activityStatus && activityStatus.is_active_today && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-success dark:bg-success/20 border border-success dark:border-success">
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span className="text-ui font-medium text-success dark:text-success">Active Today</span>
                  <span className="text-caption text-success dark:text-success ml-auto">
                    {activityStatus.checkins_today} check-in{activityStatus.checkins_today !== 1 ? 's' : ''} today
                  </span>
                </div>
              )}

              {business.is_claimed ? (
                <div className="flex items-center gap-2 text-ui text-success dark:text-success">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">Verified Business</span>
                </div>
              ) : business.is_seed !== false && isAuthenticated && user?.role === 'business_owner' ? (
                <button
                  onClick={handleClaimBusiness}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-brand/30 text-brand hover:bg-brand/5 transition-colors text-ui font-medium"
                >
                  <Award className="w-4 h-4" />
                  Claim This Business
                </button>
              ) : null}

              {isAuthenticated && (
                <button
                  onClick={handleCheckIn}
                  disabled={checkingIn || checkedIn}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-ui font-medium transition-all',
                    checkedIn
                      ? 'bg-success dark:bg-success/20 text-success dark:text-success'
                      : 'gradient-primary text-on-primary shadow-md shadow-brand/20 hover:shadow-lg'
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

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-caption font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      Snapshot
                    </p>
                    <p className="text-ui text-[hsl(var(--foreground))]">{displayShortDescription}</p>
                  </div>
                  {isClaimedOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProfile((value) => !value)
                        setProfileError('')
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-3 py-2 text-ui text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                    >
                      <Edit3 className="w-4 h-4" />
                      {editingProfile ? 'Close' : 'Edit'}
                    </button>
                  )}
                </div>

                {displayKnownFor.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {displayKnownFor.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1 text-caption text-[hsl(var(--foreground))]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {editingProfile && isClaimedOwner && (
                  <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/35 p-4">
                    <div>
                      <label className="mb-1.5 block text-ui font-medium text-[hsl(var(--foreground))]">
                        Short description
                      </label>
                      <textarea
                        value={shortDescription}
                        onChange={(event) => setShortDescription(event.target.value.slice(0, 160))}
                        maxLength={160}
                        rows={3}
                        className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-ui text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                      />
                      <p className="mt-1 text-caption text-[hsl(var(--muted-foreground))]">
                        {shortDescription.length}/160 characters
                      </p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-ui font-medium text-[hsl(var(--foreground))]">
                        Known for
                      </label>
                      <input
                        value={knownForInput}
                        onChange={(event) => setKnownForInput(event.target.value)}
                        placeholder="Coffee, Fresh Bakes, Neighborhood Favorite"
                        className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-ui text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                      />
                      <p className="mt-1 text-caption text-[hsl(var(--muted-foreground))]">
                        Enter 3 to 6 comma-separated tags.
                      </p>
                    </div>
                    {profileError && (
                      <p className="text-ui text-error">{profileError}</p>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveProfile}
                        disabled={profileSaving}
                        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-ui font-medium gradient-primary text-on-primary disabled:opacity-60"
                      >
                        {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save details
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-[hsl(var(--muted-foreground))] leading-relaxed">
                    {showFullDescription || !showDescriptionToggle
                      ? detailDescription
                      : `${detailDescription.slice(0, 180).trimEnd()}...`}
                  </p>
                  {showDescriptionToggle && (
                    <button
                      type="button"
                      onClick={() => setShowFullDescription((value) => !value)}
                      className="text-ui font-medium text-[hsl(var(--primary))] hover:underline"
                    >
                      {showFullDescription ? 'Show less' : 'More'}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-ui font-semibold text-[hsl(var(--foreground))] uppercase tracking-wide font-mono">Contact</h4>
                <div className="space-y-2.5">
                  {business.address && (
                    <div className="flex items-start gap-3 text-ui">
                      <MapPin className="w-4 h-4 text-[hsl(var(--primary))] flex-shrink-0 mt-0.5" />
                      <span className="text-[hsl(var(--muted-foreground))]">{business.address}</span>
                    </div>
                  )}
                  {business.phone && (
                    <div className="flex items-center gap-3 text-ui">
                      <Phone className="w-4 h-4 text-[hsl(var(--primary))]" />
                      <a href={`tel:${business.phone}`} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">{business.phone}</a>
                    </div>
                  )}
                  {business.email && (
                    <div className="flex items-center gap-3 text-ui">
                      <Mail className="w-4 h-4 text-[hsl(var(--primary))]" />
                      <a href={`mailto:${business.email}`} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">{business.email}</a>
                    </div>
                  )}
                  {business.website && (
                    <div className="flex items-center gap-3 text-ui">
                      <Globe className="w-4 h-4 text-[hsl(var(--primary))]" />
                      <a href={business.website} target="_blank" rel="noopener noreferrer" className="text-[hsl(var(--primary))] hover:underline">{business.website}</a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="space-y-5 animate-fade-in">
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
                  <p className="text-ui text-[hsl(var(--muted-foreground))]">
                    <a href="/login" className="text-[hsl(var(--primary))] font-medium hover:underline">Sign in</a> to write a review
                  </p>
                </div>
              )}

              {showReviewForm && (
                <form onSubmit={handleSubmitReview} className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-4">
                  <div>
                    <label className="text-ui font-medium text-[hsl(var(--foreground))] mb-2 block">Rating</label>
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
                          <Star className={cn('w-7 h-7 transition-colors', i <= (reviewHover || reviewRating) ? 'text-warning fill-amber-400' : 'text-[hsl(var(--border))]')} />
                        </button>
                      ))}
                      <span className="ml-2 text-ui text-[hsl(var(--muted-foreground))]">
                        {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][reviewRating]}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-ui font-medium text-[hsl(var(--foreground))] mb-2 block">Your Review</label>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Share your experience..."
                      className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-ui focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 focus:border-[hsl(var(--primary))] min-h-[100px] resize-none"
                      required
                    />
                  </div>
                  {submitError && (
                    <p className="text-ui text-error">{submitError}</p>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={closeReviewForm} className="px-4 py-2 rounded-xl text-ui font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] transition-colors">
                      Cancel
                    </button>
                    <button type="submit" disabled={submitting || reviewComment.length < 5} className="px-5 py-2 rounded-xl text-ui font-medium gradient-primary text-on-primary disabled:opacity-50 flex items-center gap-2">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Submit
                    </button>
                  </div>
                </form>
              )}

              {loading ? (
                <div className="space-y-4">
                  {[1,2,3].map(i => <div key={i} className="h-24 rounded-xl skeleton" />)}
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-10">
                  <MessageSquare className="w-10 h-10 text-[hsl(var(--muted-foreground))] mx-auto mb-3 opacity-40" />
                  <p className="font-medium text-[hsl(var(--foreground))]">No reviews yet</p>
                  <p className="text-ui text-[hsl(var(--muted-foreground))]">Be the first to share your experience</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id || review._id} className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-caption font-bold text-brand-on-primary">
                            {review.user_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="text-ui font-semibold text-[hsl(var(--foreground))]">{review.user_name}</p>
                            <div className="flex items-center gap-1">
                              {[1,2,3,4,5].map(i => (
                                <Star key={i} className={cn('w-3 h-3', i <= review.rating ? 'text-warning fill-amber-400' : 'text-[hsl(var(--border))]')} />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-caption text-[hsl(var(--muted-foreground))]">
                          {review.verified && <CheckCircle2 className="w-3.5 h-3.5 text-brand-light" />}
                          <Clock className="w-3 h-3" />
                          {new Date(review.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <p className="text-ui text-[hsl(var(--muted-foreground))] leading-relaxed">{review.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
                  <p className="text-ui text-[hsl(var(--muted-foreground))]">Check back later for special offers</p>
                </div>
              ) : (
                deals.map(deal => (
                  <div key={deal.id || deal._id} className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-brand-light/15 dark:bg-brand-light/20 flex items-center justify-center flex-shrink-0">
                          <Tag className="w-5 h-5 text-brand-light dark:text-brand-light" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-[hsl(var(--foreground))]">{deal.title}</h4>
                          <p className="text-ui text-[hsl(var(--muted-foreground))]">{deal.description}</p>
                        </div>
                      </div>
                      <span className="text-body font-bold text-brand-light dark:text-brand-light flex-shrink-0">
                        {deal.discount_type === 'percentage' ? `${deal.discount_value}%` : `$${deal.discount_value}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[hsl(var(--border))]/50">
                      {deal.code && (
                        <span className="px-3 py-1 rounded-lg bg-[hsl(var(--secondary))] font-mono text-ui text-[hsl(var(--foreground))]">{deal.code}</span>
                      )}
                      <span className="text-caption text-[hsl(var(--muted-foreground))]">
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
