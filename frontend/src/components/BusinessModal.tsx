/**
 * @fileoverview Full-screen modal for viewing a single business in detail.
 * Shows the business image, rating, contact info, verified/trust status,
 * check-in button, tabbed content (Details, Reviews, Deals), and an
 * inline review form. Claimed owners can edit their short description
 * and "known for" tags directly from this modal.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Star, MapPin, Phone, Mail, Globe, Tag, Send, Loader2, MessageSquare, Clock, CheckCircle2, Award, Zap, Edit3, Save, Navigation } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BusinessImage } from '@/components/explore/BusinessImage'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import type { Business, Review, Deal, BusinessActivityStatus, OfferClaim, Campaign, CampaignClaim } from '../types'
import { api, buildApiUrl } from '../api'
import { logger } from '@/lib/logger'
import { useAuth } from '@/contexts/AuthContext'
import { getAnonymousSessionId, trackCustomerEvent } from '@/lib/customerEvents'

interface BusinessModalSourceContext {
  sourceSurface: string
  intent?: string
  constraints?: string[]
  matchReasonCodes?: string[]
  locationContext?: Record<string, unknown>
  anonymousSessionId?: string
}

/** Props for the BusinessModal component. */
interface BusinessModalProps {
  business: Business
  onClose: () => void
  onBusinessUpdated?: (business: Business) => void
  sourceContext?: BusinessModalSourceContext
}

const categoryGradients: Record<string, string> = {
  food: 'from-brand-light to-brand',
  retail: 'from-brand-strong to-brand-light',
  services: 'from-brand-strong to-brand',
  entertainment: 'from-brand to-brand-light',
  health: 'from-brand-light to-brand-strong',
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

function hasOwnerLink(business: Business) {
  return Boolean(business.owner_id?.trim())
}

function getDealId(deal: Deal) {
  return deal.id || deal._id || ''
}

function getCampaignId(campaign: Campaign) {
  return campaign.id || campaign._id || ''
}

function dealIsCurrent(deal: Deal) {
  if (!deal.is_active) return false
  if (!deal.valid_until) return true
  const expiresAt = new Date(deal.valid_until).getTime()
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
}

function campaignIsCurrent(campaign: Campaign) {
  if (campaign.status !== 'active') return false
  const startsAt = new Date(campaign.starts_at).getTime()
  const endsAt = new Date(campaign.ends_at).getTime()
  const now = Date.now()
  return Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt <= now && endsAt > now
}

function campaignValueLabel(campaign: Campaign) {
  if (campaign.offer_kind === 'discount' && campaign.discount_value != null) {
    return campaign.discount_type === 'fixed'
      ? `$${campaign.discount_value}`
      : `${campaign.discount_value}%`
  }
  if (campaign.offer_kind === 'event') return 'Event'
  if (campaign.offer_kind === 'non_discount') return 'Perk'
  return 'Offer'
}

function buildDirectionsUrl(business: Business) {
  const coords = business.location?.coordinates
  if (coords && coords.length === 2) {
    const [lng, lat] = coords
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
  }
  const query = [business.name, business.address].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/**
 * Renders a business detail modal with three tabs (Details, Reviews, Deals).
 *
 * Key behaviors:
 * - Loads reviews, deals, and activity status on mount via the API.
 * - Supports check-in with browser geolocation.
 * - Authenticated users can write reviews; claimed owners can edit profile.
 * - Closes on Escape key or backdrop click; locks body scroll while open.
 *
 * @param {BusinessModalProps} business - The business to display.
 * @param {BusinessModalProps} onClose - Callback to close the modal.
 * @param {BusinessModalProps} onBusinessUpdated - Optional callback when profile is edited.
 * @returns {JSX.Element} The modal overlay and content.
 */
export function BusinessModal({ business, onClose, onBusinessUpdated, sourceContext }: BusinessModalProps) {
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  useBodyScrollLock(true)
  const [reviews, setReviews] = useState<Review[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
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
  const [claimingDealId, setClaimingDealId] = useState<string | null>(null)
  const [claimedOffers, setClaimedOffers] = useState<Record<string, OfferClaim>>({})
  const [claimingCampaignId, setClaimingCampaignId] = useState<string | null>(null)
  const [claimedCampaigns, setClaimedCampaigns] = useState<Record<string, CampaignClaim>>({})
  const [offerError, setOfferError] = useState('')
  const [redeemingClaimId, setRedeemingClaimId] = useState<string | null>(null)
  const [redemptionPlaceholders, setRedemptionPlaceholders] = useState<string[]>([])
  const [redeemingCampaignClaimId, setRedeemingCampaignClaimId] = useState<string | null>(null)
  const [campaignRedemptionPlaceholders, setCampaignRedemptionPlaceholders] = useState<string[]>([])
  const [trackedCampaignImpressions, setTrackedCampaignImpressions] = useState<string[]>([])
  const [trackedCampaignOpens, setTrackedCampaignOpens] = useState<string[]>([])

  const businessId = getBusinessId(business)
  const isOwner = !!(isAuthenticated && user?.id && user.id === business.owner_id)
  const canManageProfile = isOwner
  const canWriteReview = isAuthenticated && !isOwner
  const isOwnerLinked = hasOwnerLink(business)
  const canClaimBusiness =
    business.is_seed !== false &&
    !business.is_claimed &&
    !isOwnerLinked &&
    isAuthenticated &&
    user?.role === 'business_owner'
  const gradient = categoryGradients[business.category] || 'from-brand-light to-brand'
  const displayShortDescription = shortDescription || business.short_description || business.description || ''
  const displayKnownFor = knownFor.length > 0 ? knownFor : business.known_for || []
  const currentDeals = useMemo(() => deals.filter(dealIsCurrent), [deals])
  const currentCampaigns = useMemo(() => campaigns.filter(campaignIsCurrent), [campaigns])
  const primaryCampaign = currentCampaigns[0]
  const primaryDeal = currentDeals[0]
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
      const [reviewsData, dealsData, campaignsData, activityData] = await Promise.allSettled([
        api.getBusinessReviews(businessId),
        api.getBusinessDeals(businessId),
        api.getBusinessCampaigns(businessId, 'active'),
        api.getBusinessActivity(businessId),
      ])
      if (reviewsData.status === 'fulfilled') setReviews(reviewsData.value)
      if (dealsData.status === 'fulfilled') setDeals(dealsData.value)
      if (campaignsData.status === 'fulfilled') setCampaigns(campaignsData.value)
      if (activityData.status === 'fulfilled') setActivityStatus(activityData.value)
    } catch (err) {
      logger.error('Failed to load data:', err)
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
    setTrackedCampaignImpressions([])
    setTrackedCampaignOpens([])
  }, [business])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    const untracked = currentCampaigns.filter(campaign => {
      const campaignId = getCampaignId(campaign)
      return campaignId && !trackedCampaignImpressions.includes(campaignId)
    })
    if (untracked.length === 0) return

    setTrackedCampaignImpressions(current => [
      ...current,
      ...untracked.map(getCampaignId).filter(Boolean)
    ])
    untracked.forEach(campaign => {
      void trackCustomerEvent({
        event_type: 'campaign_impression',
        business_id: businessId,
        campaign_id: getCampaignId(campaign),
        source_surface: sourceContext?.sourceSurface ?? 'business_modal',
        intent: sourceContext?.intent,
        constraints: sourceContext?.constraints,
        match_reason_codes: sourceContext?.matchReasonCodes,
        anonymous_session_id: sourceContext?.anonymousSessionId ?? getAnonymousSessionId(),
        location_context: sourceContext?.locationContext,
        metadata: { campaign_type: campaign.campaign_type }
      })
    })
  }, [businessId, currentCampaigns, sourceContext, trackedCampaignImpressions])

  useEffect(() => {
    if (activeTab !== 'deals') return
    const untracked = currentCampaigns.filter(campaign => {
      const campaignId = getCampaignId(campaign)
      return campaignId && !trackedCampaignOpens.includes(campaignId)
    })
    if (untracked.length === 0) return

    setTrackedCampaignOpens(current => [
      ...current,
      ...untracked.map(getCampaignId).filter(Boolean)
    ])
    untracked.forEach(campaign => {
      void trackCustomerEvent({
        event_type: 'campaign_open',
        business_id: businessId,
        campaign_id: getCampaignId(campaign),
        source_surface: sourceContext?.sourceSurface ?? 'business_modal',
        intent: sourceContext?.intent,
        constraints: sourceContext?.constraints,
        match_reason_codes: sourceContext?.matchReasonCodes,
        anonymous_session_id: sourceContext?.anonymousSessionId ?? getAnonymousSessionId(),
        location_context: sourceContext?.locationContext,
        metadata: { campaign_type: campaign.campaign_type }
      })
    })
  }, [activeTab, businessId, currentCampaigns, sourceContext, trackedCampaignOpens])

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
    if (!canManageProfile) return

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
      void trackCustomerEvent({
        event_type: 'check_in_placeholder',
        business_id: businessId,
        campaign_id: primaryCampaign ? getCampaignId(primaryCampaign) : undefined,
        source_surface: sourceContext?.sourceSurface ?? 'business_modal',
        intent: sourceContext?.intent,
        constraints: sourceContext?.constraints,
        match_reason_codes: sourceContext?.matchReasonCodes,
        anonymous_session_id: sourceContext?.anonymousSessionId ?? getAnonymousSessionId(),
        location_context: {
          ...(sourceContext?.locationContext ?? {}),
          used_browser_location: !!pos,
        },
        metadata: { status: 'self_reported' },
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

  const handleDirectionsClick = () => {
    void trackCustomerEvent({
      event_type: 'directions_click',
      business_id: businessId,
      source_surface: sourceContext?.sourceSurface ?? 'business_modal',
      intent: sourceContext?.intent,
      constraints: sourceContext?.constraints,
      match_reason_codes: sourceContext?.matchReasonCodes,
      anonymous_session_id: sourceContext?.anonymousSessionId ?? getAnonymousSessionId(),
      location_context: {
        ...(sourceContext?.locationContext ?? {}),
        has_address: !!business.address,
        has_coordinates: !!business.location?.coordinates,
      },
    })
    window.open(buildDirectionsUrl(business), '_blank', 'noopener,noreferrer')
  }

  const handleClaimOffer = async (deal: Deal) => {
    const dealId = getDealId(deal)
    if (!dealId || claimingDealId) return

    setOfferError('')
    setClaimingDealId(dealId)
    try {
      const claim = await api.claimOffer(dealId, {
        source_surface: sourceContext?.sourceSurface ?? 'business_modal',
        anonymous_session_id: sourceContext?.anonymousSessionId ?? getAnonymousSessionId(),
        intent: sourceContext?.intent,
        metadata: { business_id: businessId },
      })
      setClaimedOffers((current) => ({ ...current, [dealId]: claim }))
    } catch (err) {
      setOfferError(err instanceof Error ? err.message : 'Failed to claim offer')
    } finally {
      setClaimingDealId(null)
    }
  }

  const handleClaimCampaign = async (campaign: Campaign) => {
    const campaignId = getCampaignId(campaign)
    if (!campaignId || claimingCampaignId) return

    setOfferError('')
    setClaimingCampaignId(campaignId)
    try {
      const claim = await api.claimCampaign(campaignId, {
        source_surface: sourceContext?.sourceSurface ?? 'business_modal',
        anonymous_session_id: sourceContext?.anonymousSessionId ?? getAnonymousSessionId(),
        intent: sourceContext?.intent,
        metadata: {
          business_id: businessId,
          campaign_type: campaign.campaign_type
        },
      })
      setClaimedCampaigns((current) => ({ ...current, [campaignId]: claim }))
    } catch (err) {
      setOfferError(err instanceof Error ? err.message : 'Failed to claim campaign')
    } finally {
      setClaimingCampaignId(null)
    }
  }

  const handleCampaignDirectionsClick = (campaign: Campaign) => {
    const campaignId = getCampaignId(campaign)
    void trackCustomerEvent({
      event_type: 'campaign_directions_click',
      business_id: businessId,
      campaign_id: campaignId,
      source_surface: sourceContext?.sourceSurface ?? 'business_modal',
      intent: sourceContext?.intent,
      constraints: sourceContext?.constraints,
      match_reason_codes: sourceContext?.matchReasonCodes,
      anonymous_session_id: sourceContext?.anonymousSessionId ?? getAnonymousSessionId(),
      location_context: {
        ...(sourceContext?.locationContext ?? {}),
        has_address: !!business.address,
        has_coordinates: !!business.location?.coordinates,
      },
      metadata: { campaign_type: campaign.campaign_type },
    })
    window.open(buildDirectionsUrl(business), '_blank', 'noopener,noreferrer')
  }

  const handleRedemptionPlaceholder = async (claim: OfferClaim) => {
    if (redeemingClaimId) return

    setOfferError('')
    setRedeemingClaimId(claim.offer_claim_id)
    try {
      await api.redeemOfferPlaceholder(claim.offer_claim_id, {
        source_surface: sourceContext?.sourceSurface ?? 'business_modal',
        anonymous_session_id: sourceContext?.anonymousSessionId ?? getAnonymousSessionId(),
        intent: sourceContext?.intent,
        metadata: { placeholder_only: true },
      })
      setRedemptionPlaceholders((current) =>
        current.includes(claim.offer_claim_id) ? current : [...current, claim.offer_claim_id]
      )
    } catch (err) {
      setOfferError(err instanceof Error ? err.message : 'Failed to record placeholder')
    } finally {
      setRedeemingClaimId(null)
    }
  }

  const handleCampaignRedemptionPlaceholder = async (claim: CampaignClaim) => {
    if (redeemingCampaignClaimId) return

    setOfferError('')
    setRedeemingCampaignClaimId(claim.campaign_claim_id)
    try {
      await api.redeemCampaignPlaceholder(claim.campaign_claim_id, {
        source_surface: sourceContext?.sourceSurface ?? 'business_modal',
        anonymous_session_id: sourceContext?.anonymousSessionId ?? getAnonymousSessionId(),
        intent: sourceContext?.intent,
        metadata: { placeholder_only: true },
      })
      setCampaignRedemptionPlaceholders((current) =>
        current.includes(claim.campaign_claim_id) ? current : [...current, claim.campaign_claim_id]
      )
    } catch (err) {
      setOfferError(err instanceof Error ? err.message : 'Failed to record placeholder')
    } finally {
      setRedeemingCampaignClaimId(null)
    }
  }

  const closeReviewForm = () => {
    setShowReviewForm(false)
    setSubmitError('')
  }

  const tabs = [
    { id: 'info' as const, label: 'Details' },
    { id: 'reviews' as const, label: `Reviews (${reviews.length})` },
    { id: 'deals' as const, label: `Offers (${currentDeals.length + currentCampaigns.length})` },
  ]

  return (
    <div className="product-modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-[hsl(var(--foreground))]/60" />

      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-[hsl(var(--border))/0.82] bg-[hsl(var(--card))] shadow-[0_30px_90px_hsl(var(--shadow-soft)/0.22)] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/18 bg-[hsl(var(--foreground))]/45 text-on-primary backdrop-blur-md transition-colors hover:bg-[hsl(var(--foreground))]/62"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative h-64 flex-shrink-0 overflow-hidden sm:h-72">
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

        <div className="flex-1 overflow-y-auto p-5 sm:p-7">
          {activeTab === 'info' && (
            <div className="space-y-5 animate-fade-in">
              {activityStatus && activityStatus.is_active_today && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-success border border-success">
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span className="text-ui font-medium text-success">Active Today</span>
                  <span className="text-caption text-success ml-auto">
                    {activityStatus.checkins_today} check-in{activityStatus.checkins_today !== 1 ? 's' : ''} today
                  </span>
                </div>
              )}

              {business.is_claimed ? (
                <div className="flex items-center gap-2 text-ui text-success">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">Verified Business</span>
                </div>
              ) : isOwnerLinked ? (
                <div className="flex items-center gap-2 text-ui text-success">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">Owner Managed</span>
                </div>
              ) : canClaimBusiness ? (
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
                      ? 'bg-success text-success'
                      : 'gradient-primary text-on-primary shadow-md shadow-brand/20 hover:shadow-lg'
                  )}
                >
                  {checkingIn ? (
                    <Loader2 className="w-4 h-4 icon-spinner" />
                  ) : checkedIn ? (
                    <><CheckCircle2 className="w-4 h-4" /> Checked In!</>
                  ) : (
                    <><Zap className="w-4 h-4" /> Check In Here</>
                  )}
                </button>
              )}

              {!isAuthenticated && (
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/45 p-3 text-center text-ui text-[hsl(var(--muted-foreground))]">
                  <a href="/login" className="font-medium text-[hsl(var(--primary))] hover:underline">Sign in</a> to check in or keep claimed offers.
                </div>
              )}

              {primaryCampaign && (
                <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/35 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-caption font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Active campaign</p>
                      <h3 className="mt-1 text-ui font-semibold text-[hsl(var(--foreground))]">{primaryCampaign.title}</h3>
                      <p className="mt-1 text-caption text-[hsl(var(--muted-foreground))]">{primaryCampaign.description}</p>
                      {primaryCampaign.perk_description && (
                        <p className="mt-2 text-caption font-medium text-[hsl(var(--foreground))]">
                          {primaryCampaign.perk_description}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleClaimCampaign(primaryCampaign)}
                      disabled={claimingCampaignId === getCampaignId(primaryCampaign)}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-ui font-medium gradient-primary text-on-primary disabled:opacity-60"
                    >
                      {claimingCampaignId === getCampaignId(primaryCampaign) ? <Loader2 className="w-4 h-4 icon-spinner" /> : <Tag className="w-4 h-4" />}
                      Claim campaign
                    </button>
                  </div>
                  {claimedCampaigns[getCampaignId(primaryCampaign)] && (
                    <div className="mt-3 rounded-xl border border-success bg-success p-3 text-ui text-success">
                      Claimed. Code: <span className="font-mono font-semibold">{claimedCampaigns[getCampaignId(primaryCampaign)].claim_code}</span>
                    </div>
                  )}
                  {offerError && <p className="mt-3 text-ui text-error">{offerError}</p>}
                </div>
              )}

              {primaryDeal && (
                <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/35 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-caption font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Active offer</p>
                      <h3 className="mt-1 text-ui font-semibold text-[hsl(var(--foreground))]">{primaryDeal.title}</h3>
                      <p className="mt-1 text-caption text-[hsl(var(--muted-foreground))]">{primaryDeal.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleClaimOffer(primaryDeal)}
                      disabled={claimingDealId === getDealId(primaryDeal)}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-ui font-medium gradient-primary text-on-primary disabled:opacity-60"
                    >
                      {claimingDealId === getDealId(primaryDeal) ? <Loader2 className="w-4 h-4 icon-spinner" /> : <Tag className="w-4 h-4" />}
                      Claim offer
                    </button>
                  </div>
                  {claimedOffers[getDealId(primaryDeal)] && (
                    <div className="mt-3 rounded-xl border border-success bg-success p-3 text-ui text-success">
                      Claimed. Code: <span className="font-mono font-semibold">{claimedOffers[getDealId(primaryDeal)].claim_code}</span>
                    </div>
                  )}
                  {offerError && <p className="mt-3 text-ui text-error">{offerError}</p>}
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-caption font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      Snapshot
                    </p>
                    <p className="text-ui text-[hsl(var(--foreground))]">{displayShortDescription}</p>
                  </div>
                  {canManageProfile && (
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

                {editingProfile && canManageProfile && (
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
                        {profileSaving ? <Loader2 className="w-4 h-4 icon-spinner" /> : <Save className="w-4 h-4" />}
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
                    <div className="flex items-start justify-between gap-3 text-ui">
                      <div className="flex min-w-0 items-start gap-3">
                        <MapPin className="w-4 h-4 text-[hsl(var(--primary))] flex-shrink-0 mt-0.5" />
                        <span className="text-[hsl(var(--muted-foreground))]">{business.address}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleDirectionsClick}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-3 py-2 text-caption font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        Get directions
                      </button>
                    </div>
                  )}
                  {!business.address && business.location?.coordinates && (
                    <button
                      type="button"
                      onClick={handleDirectionsClick}
                      className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-3 py-2 text-ui font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                    >
                      <Navigation className="h-4 w-4 text-[hsl(var(--primary))]" />
                      Get directions
                    </button>
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
              {canWriteReview && !showReviewForm && (
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

              {isOwner && (
                <div className="p-4 rounded-xl bg-[hsl(var(--secondary))] text-center">
                  <p className="text-ui text-[hsl(var(--muted-foreground))]">
                    Owners cannot review their own listings.
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
                      {submitting ? <Loader2 className="w-4 h-4 icon-spinner" /> : <Send className="w-4 h-4" />}
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
              ) : currentDeals.length + currentCampaigns.length === 0 ? (
                <div className="text-center py-10">
                  <Tag className="w-10 h-10 text-[hsl(var(--muted-foreground))] mx-auto mb-3 opacity-40" />
                  <p className="font-medium text-[hsl(var(--foreground))]">No active offers</p>
                  <p className="text-ui text-[hsl(var(--muted-foreground))]">Check back later for special offers</p>
                </div>
              ) : (
                <>
                {currentCampaigns.map(campaign => {
                  const campaignId = getCampaignId(campaign)
                  const claim = claimedCampaigns[campaignId]
                  const placeholderRecorded = claim ? campaignRedemptionPlaceholders.includes(claim.campaign_claim_id) : false
                  return (
                  <div key={campaignId} className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-brand-light/15 flex items-center justify-center flex-shrink-0">
                          <Zap className="w-5 h-5 text-brand-light" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-[hsl(var(--foreground))]">{campaign.title}</h4>
                          <p className="text-ui text-[hsl(var(--muted-foreground))]">{campaign.description}</p>
                          {campaign.perk_description && (
                            <p className="mt-1 text-caption font-medium text-[hsl(var(--foreground))]">
                              {campaign.perk_description}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-body font-bold text-brand-light flex-shrink-0">
                        {campaignValueLabel(campaign)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[hsl(var(--border))]/50">
                      <span className="px-3 py-1 rounded-lg bg-[hsl(var(--secondary))] text-caption font-medium text-[hsl(var(--foreground))]">
                        {campaign.campaign_type.replaceAll('_', ' ')}
                      </span>
                      <span className="text-caption text-[hsl(var(--muted-foreground))]">
                        Ends {new Date(campaign.ends_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      {claim ? (
                        <div className="rounded-xl border border-success bg-success px-3 py-2 text-ui text-success">
                          Claim code <span className="font-mono font-semibold">{claim.claim_code}</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleClaimCampaign(campaign)}
                          disabled={claimingCampaignId === campaignId}
                          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-ui font-medium gradient-primary text-on-primary disabled:opacity-60"
                        >
                          {claimingCampaignId === campaignId ? <Loader2 className="w-4 h-4 icon-spinner" /> : <Tag className="w-4 h-4" />}
                          Claim campaign
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCampaignDirectionsClick(campaign)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 py-2.5 text-ui font-medium text-[hsl(var(--foreground))]"
                      >
                        <Navigation className="w-4 h-4" />
                        Get directions
                      </button>
                      {claim && (
                        <button
                          type="button"
                          onClick={() => void handleCampaignRedemptionPlaceholder(claim)}
                          disabled={placeholderRecorded || redeemingCampaignClaimId === claim.campaign_claim_id}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 py-2.5 text-ui font-medium text-[hsl(var(--foreground))] disabled:opacity-60"
                        >
                          {redeemingCampaignClaimId === claim.campaign_claim_id ? <Loader2 className="w-4 h-4 icon-spinner" /> : <CheckCircle2 className="w-4 h-4" />}
                          {placeholderRecorded ? 'Placeholder recorded' : 'Record use placeholder'}
                        </button>
                      )}
                    </div>
                    {claim && (
                      <p className="mt-2 text-caption text-[hsl(var(--muted-foreground))]">
                        Redemption is not verified in this milestone.
                      </p>
                    )}
                  </div>
                )})}
                {currentDeals.map(deal => {
                  const dealId = getDealId(deal)
                  const claim = claimedOffers[dealId]
                  const placeholderRecorded = claim ? redemptionPlaceholders.includes(claim.offer_claim_id) : false
                  return (
                  <div key={deal.id || deal._id} className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-brand-light/15 flex items-center justify-center flex-shrink-0">
                          <Tag className="w-5 h-5 text-brand-light" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-[hsl(var(--foreground))]">{deal.title}</h4>
                          <p className="text-ui text-[hsl(var(--muted-foreground))]">{deal.description}</p>
                        </div>
                      </div>
                      <span className="text-body font-bold text-brand-light flex-shrink-0">
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
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      {claim ? (
                        <div className="rounded-xl border border-success bg-success px-3 py-2 text-ui text-success">
                          Claim code <span className="font-mono font-semibold">{claim.claim_code}</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleClaimOffer(deal)}
                          disabled={claimingDealId === dealId}
                          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-ui font-medium gradient-primary text-on-primary disabled:opacity-60"
                        >
                          {claimingDealId === dealId ? <Loader2 className="w-4 h-4 icon-spinner" /> : <Tag className="w-4 h-4" />}
                          Claim offer
                        </button>
                      )}
                      {claim && (
                        <button
                          type="button"
                          onClick={() => void handleRedemptionPlaceholder(claim)}
                          disabled={placeholderRecorded || redeemingClaimId === claim.offer_claim_id}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 py-2.5 text-ui font-medium text-[hsl(var(--foreground))] disabled:opacity-60"
                        >
                          {redeemingClaimId === claim.offer_claim_id ? <Loader2 className="w-4 h-4 icon-spinner" /> : <CheckCircle2 className="w-4 h-4" />}
                          {placeholderRecorded ? 'Placeholder recorded' : 'Record use placeholder'}
                        </button>
                      )}
                    </div>
                    {claim && (
                      <p className="mt-2 text-caption text-[hsl(var(--muted-foreground))]">
                        Redemption is not verified in this milestone.
                      </p>
                    )}
                  </div>
                )})}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
