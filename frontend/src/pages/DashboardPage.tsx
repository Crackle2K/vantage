/**
 * @fileoverview Business owner dashboard page (route `/dashboard`).
 * Shows claimed businesses with stats (rating, check-ins, trending
 * score), recent reviews, subscription status, event creation form,
 * active deals, and activity signals. Only accessible to
 * business_owner users.
 */

import { useState, useEffect, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { logger } from '@/lib/logger'
import { formatReasonCode } from '../lib/conversionAnalytics'
import type {
  Business,
  Deal,
  Review,
  Subscription,
  BusinessActivityStatus,
  BusinessClaim,
  OwnerEvent,
  BusinessConversionSummary,
  BusinessConversionTimeseries,
  ConversionRange,
  Campaign,
  CampaignTemplate,
  CampaignPerformance,
  CampaignCreate,
  CampaignType,
  CampaignOfferKind,
  CampaignTargeting
} from '../types'
import {
  Store, Star, Tag, TrendingUp, Plus,
  MapPin, Phone, Clock, Eye, CheckCircle2, Crown,
  ArrowUpRight, ChevronRight, Shield,
  BarChart3, Bookmark, MousePointerClick, Ticket, Navigation,
  Megaphone
} from 'lucide-react'

const tierDisplayNames: Record<string, string> = {
  free: 'Free',
  starter: 'Basic',
  pro: 'Standard',
  premium: 'Premium',
}

const rangeOptions: Array<{ value: ConversionRange; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' }
]

const defaultCampaignForm = () => {
  const start = new Date()
  const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  return {
    templateId: '',
    title: '',
    description: '',
    campaignType: 'slow_hour' as CampaignType,
    offerKind: 'perk' as CampaignOfferKind,
    perkDescription: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: '',
    startsAt: toLocalDateTimeValue(start),
    endsAt: toLocalDateTimeValue(end),
    audience: 'all_visitors' as CampaignTargeting['audience'],
    linkedEventId: ''
  }
}

type CampaignFormState = ReturnType<typeof defaultCampaignForm>

export default function DashboardPage() {
  const { user, isAuthenticated } = useAuth()
  const [myBusinesses, setMyBusinesses] = useState<Business[]>([])
  const [selectedBiz, setSelectedBiz] = useState<Business | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [ownerEvents, setOwnerEvents] = useState<OwnerEvent[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [activityStatus, setActivityStatus] = useState<BusinessActivityStatus | null>(null)
  const [myClaims, setMyClaims] = useState<BusinessClaim[]>([])
  const [conversionRange, setConversionRange] = useState<ConversionRange>('30d')
  const [conversionSummary, setConversionSummary] = useState<BusinessConversionSummary | null>(null)
  const [conversionTimeseries, setConversionTimeseries] = useState<BusinessConversionTimeseries | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState('')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignTemplates, setCampaignTemplates] = useState<CampaignTemplate[]>([])
  const [campaignPerformance, setCampaignPerformance] = useState<CampaignPerformance | null>(null)
  const [campaignForm, setCampaignForm] = useState(defaultCampaignForm)
  const [campaignError, setCampaignError] = useState('')
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false)
  const [eventTitle, setEventTitle] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [eventStart, setEventStart] = useState('')
  const [eventEnd, setEventEnd] = useState('')
  const [eventImage, setEventImage] = useState('')
  const [eventError, setEventError] = useState('')
  const [isCreatingEvent, setIsCreatingEvent] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadBusinessDetails = useCallback(async (biz: Business, range: ConversionRange) => {
    const bizId = biz.id || biz._id || ''
    try {
      const [bizReviews, bizDeals, bizEvents, bizSub, bizActivity] = await Promise.all([
        api.getBusinessReviews(bizId),
        api.getBusinessDeals(bizId),
        api.getOwnerEvents({ businessId: bizId, includePast: true, limit: 12 }),
        api.getBusinessSubscription(bizId),
        api.getBusinessActivity(bizId).catch(() => null),
      ])
      setReviews(bizReviews)
      setDeals(bizDeals)
      setOwnerEvents(bizEvents)
      setSubscription(bizSub)
      setActivityStatus(bizActivity)
    } catch (err) {
      logger.error('Failed to load business data:', err)
    }

    try {
      setAnalyticsLoading(true)
      setAnalyticsError('')
      const [summary, timeseries] = await Promise.all([
        api.getBusinessConversionSummary(bizId, range),
        api.getBusinessConversionTimeseries(bizId, range)
      ])
      setConversionSummary(summary)
      setConversionTimeseries(timeseries)
    } catch (err) {
      logger.error('Failed to load conversion analytics:', err)
      setConversionSummary(null)
      setConversionTimeseries(null)
      setAnalyticsError(err instanceof Error ? err.message : 'Failed to load conversion analytics')
    } finally {
      setAnalyticsLoading(false)
    }

    try {
      const [bizCampaigns, templates, performance] = await Promise.all([
        api.getBusinessCampaigns(bizId, 'all'),
        api.getCampaignTemplates(),
        api.getCampaignPerformance(bizId, range).catch(() => null)
      ])
      setCampaigns(bizCampaigns)
      setCampaignTemplates(templates)
      setCampaignPerformance(performance)
    } catch (err) {
      logger.error('Failed to load campaign data:', err)
      setCampaigns([])
      setCampaignPerformance(null)
    }
  }, [])

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true)
      const [businesses, claims] = await Promise.all([
        api.getBusinesses(undefined, undefined, undefined, user?.id),
        api.getMyClaims(),
      ])

      const owned = businesses.filter(b => b.owner_id === user?.id)
      setMyBusinesses(owned)
      setMyClaims(claims)

      if (owned.length > 0) {
        setSelectedBiz(owned[0])
      }
    } catch (err) {
      logger.error('Dashboard load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'business_owner') return
    loadDashboard()
  }, [isAuthenticated, user, loadDashboard])

  useEffect(() => {
    if (!selectedBiz) return
    loadBusinessDetails(selectedBiz, conversionRange)
  }, [selectedBiz, conversionRange, loadBusinessDetails])

  const handleCreateEvent = async () => {
    if (!selectedBiz) return
    setEventError('')

    if (!eventTitle.trim() || !eventDescription.trim() || !eventStart || !eventEnd) {
      setEventError('Add a title, description, start time, and end time.')
      return
    }

    const startDate = new Date(eventStart)
    const endDate = new Date(eventEnd)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setEventError('Add valid start and end times.')
      return
    }
    const startIso = startDate.toISOString()
    const endIso = endDate.toISOString()
    if (endDate <= startDate) {
      setEventError('End time must be after start time.')
      return
    }

    try {
      setIsCreatingEvent(true)
      const created = await api.createOwnerEvent({
        business_id: selectedBiz.id || selectedBiz._id || '',
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        start_time: startIso,
        end_time: endIso,
        image_url: eventImage.trim() || undefined,
      })
      setOwnerEvents((current) => [created, ...current])
      setEventTitle('')
      setEventDescription('')
      setEventStart('')
      setEventEnd('')
      setEventImage('')
    } catch (err) {
      setEventError(err instanceof Error ? err.message : 'Failed to create event')
    } finally {
      setIsCreatingEvent(false)
    }
  }

  const applyCampaignTemplate = (templateId: string) => {
    const template = campaignTemplates.find(item => item.id === templateId)
    if (!template) {
      setCampaignForm(current => ({ ...current, templateId }))
      return
    }

    const start = new Date()
    const end = new Date(Date.now() + template.recommended_duration_days * 24 * 60 * 60 * 1000)
    setCampaignForm({
      templateId,
      title: template.title,
      description: template.description,
      campaignType: template.campaign_type,
      offerKind: template.offer_kind,
      perkDescription: template.perk_description || '',
      discountType: 'percentage',
      discountValue: '',
      startsAt: toLocalDateTimeValue(start),
      endsAt: toLocalDateTimeValue(end),
      audience: template.targeting.audience,
      linkedEventId: ''
    })
    setCampaignError('')
  }

  const handleCreateCampaign = async () => {
    if (!selectedBiz) return
    setCampaignError('')

    if (!campaignForm.title.trim() || !campaignForm.description.trim() || !campaignForm.endsAt) {
      setCampaignError('Add a title, description, and end time.')
      return
    }

    const startsAt = new Date(campaignForm.startsAt)
    const endsAt = new Date(campaignForm.endsAt)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      setCampaignError('Add valid start and end times.')
      return
    }
    if (endsAt <= startsAt) {
      setCampaignError('End time must be after start time.')
      return
    }

    const payload: CampaignCreate = {
      title: campaignForm.title.trim(),
      description: campaignForm.description.trim(),
      campaign_type: campaignForm.campaignType,
      offer_kind: campaignForm.offerKind,
      perk_description: campaignForm.perkDescription.trim() || undefined,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      targeting: { audience: campaignForm.audience },
      template_id: campaignForm.templateId || undefined,
      linked_event_id: campaignForm.linkedEventId || undefined
    }

    if (campaignForm.offerKind === 'discount') {
      if (!campaignForm.discountValue.trim()) {
        setCampaignError('Add a discount value.')
        return
      }
      const discountValue = Number(campaignForm.discountValue)
      if (!Number.isFinite(discountValue) || discountValue < 0) {
        setCampaignError('Add a valid discount value.')
        return
      }
      payload.discount_type = campaignForm.discountType
      payload.discount_value = discountValue
    }

    try {
      setIsCreatingCampaign(true)
      const created = await api.createCampaign(selectedBiz.id || selectedBiz._id || '', payload)
      setCampaigns(current => [created, ...current])
      setCampaignForm(defaultCampaignForm())
    } catch (err) {
      setCampaignError(err instanceof Error ? err.message : 'Failed to create campaign')
    } finally {
      setIsCreatingCampaign(false)
    }
  }

  if (!isAuthenticated || user?.role !== 'business_owner') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="card-surface rounded-2xl p-10 max-w-md w-full text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand/20">
            <Store className="w-8 h-8 text-brand-on-primary" />
          </div>
          <h2 className="text-subheading font-bold text-[hsl(var(--foreground))] mb-2 font-heading">
            Business <span className="font-serif">Dashboard</span>
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] mb-6">
            {!isAuthenticated
              ? 'Sign in as a business owner to access your dashboard.'
              : 'Switch your role to Business Owner to access the dashboard.'}
          </p>
          <Link
            to={isAuthenticated ? '/account' : '/login'}
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl gradient-primary text-on-primary font-medium shadow-lg shadow-brand/20"
          >
            {isAuthenticated ? 'Go to Account' : 'Sign In'}
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="loading-spinner" aria-label="Loading dashboard" />
      </div>
    )
  }

  const bizId = selectedBiz?.id || selectedBiz?._id || ''

  return (
    <div className="min-h-[60vh] py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 animate-fade-in-up">
          <div>
            <h1 className="text-heading font-bold text-[hsl(var(--foreground))] font-heading">
              Business <span className="gradient-text font-serif">Dashboard</span>
            </h1>
            <p className="text-[hsl(var(--muted-foreground))] mt-1">
              Manage your business, track performance, engage your community
            </p>
          </div>

          {myBusinesses.length === 0 && (
            <Link
              to="/businesses"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-on-primary font-medium text-ui shadow-lg shadow-brand/25"
            >
              <Plus className="w-4 h-4" />
              Claim a Business
            </Link>
          )}
        </div>
        {myBusinesses.length === 0 ? (
          <div className="space-y-6">
            {myClaims.length > 0 && (
              <div className="card-surface rounded-2xl p-6 animate-fade-in-up">
                <h3 className="text-body font-semibold text-[hsl(var(--foreground))] mb-4 font-heading flex items-center gap-2">
                  <Clock className="w-5 h-5 text-warning" />
                  Pending Claims
                </h3>
                <div className="space-y-3">
                  {myClaims.map(claim => (
                    <div
                      key={claim.id}
                      className="flex items-center justify-between p-4 rounded-xl bg-[hsl(var(--secondary))]/50"
                    >
                      <div>
                        <p className="text-ui font-medium text-[hsl(var(--foreground))]">
                          Business ID: {claim.business_id}
                        </p>
                        <p className="text-caption text-[hsl(var(--muted-foreground))]">
                          Submitted {new Date(claim.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-caption font-medium ${
                        claim.status === 'pending' ? 'bg-warning text-warning' :
                        claim.status === 'verified' ? 'bg-success text-success' :
                        'bg-error text-error'
                      }`}>
                        {claim.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="card-surface rounded-2xl p-10 text-center animate-fade-in-up">
              <div className="w-20 h-20 rounded-2xl bg-[hsl(var(--secondary))] flex items-center justify-center mx-auto mb-6">
                <Store className="w-10 h-10 text-[hsl(var(--muted-foreground))]" />
              </div>
              <h3 className="text-subheading font-semibold text-[hsl(var(--foreground))] mb-2 font-heading">
                No claimed businesses yet
              </h3>
              <p className="text-[hsl(var(--muted-foreground))] mb-6 max-w-md mx-auto">
                Find your business in our directory and claim it to unlock analytics, deal posting, event creation, and more.
              </p>
              <Link
                to="/businesses"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl gradient-primary text-on-primary font-medium shadow-lg shadow-brand/25"
              >
                Browse & Claim
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              {myBusinesses.length > 1 ? (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {myBusinesses.map(biz => {
                    const id = biz.id || biz._id || ''
                    return (
                      <button
                        key={id}
                        onClick={() => setSelectedBiz(biz)}
                        className={`flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-ui font-medium whitespace-nowrap transition-all ${
                          id === bizId
                            ? 'gradient-primary text-on-primary shadow-md shadow-brand/25'
                            : 'card-surface text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]'
                        }`}
                      >
                        <Store className="w-4 h-4" />
                        {biz.name}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="text-ui font-medium text-[hsl(var(--foreground))]">
                  {selectedBiz?.name}
                </div>
              )}

              <div className="inline-flex min-h-11 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/50 p-1">
                {rangeOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setConversionRange(option.value)}
                    className={`min-h-9 rounded-lg px-4 text-ui font-medium transition-colors ${
                      conversionRange === option.value
                        ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm'
                        : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {selectedBiz && (
              <ConversionSection
                summary={conversionSummary}
                timeseries={conversionTimeseries}
                loading={analyticsLoading}
                error={analyticsError}
              />
            )}
            {selectedBiz && (
              <CampaignToolsPanel
                campaigns={campaigns}
                templates={campaignTemplates}
                ownerEvents={ownerEvents}
                performance={campaignPerformance}
                form={campaignForm}
                error={campaignError}
                isCreating={isCreatingCampaign}
                onFormChange={setCampaignForm}
                onTemplateChange={applyCampaignTemplate}
                onCreate={() => void handleCreateCampaign()}
              />
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {selectedBiz && (
                  <div className="card-surface rounded-2xl p-6 animate-fade-in-up">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-subheading font-bold text-[hsl(var(--foreground))] font-heading flex items-center gap-2">
                          {selectedBiz.name}
                          {selectedBiz.is_claimed && (
                            <CheckCircle2 className="w-5 h-5 text-success" />
                          )}
                        </h3>
                        <p className="text-ui text-[hsl(var(--muted-foreground))] capitalize">{selectedBiz.category}</p>
                      </div>
                      {subscription && subscription.tier !== 'free' && (
                        <span className="flex items-center gap-1 px-3 py-1 rounded-full text-caption font-bold gradient-primary text-brand-on-primary">
                          <Crown className="w-3 h-3" />
                          {(tierDisplayNames[subscription.tier] || subscription.tier).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-ui">
                      <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
                        <MapPin className="w-4 h-4" />
                        {selectedBiz.address}
                      </div>
                      {selectedBiz.phone && (
                        <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
                          <Phone className="w-4 h-4" />
                          {selectedBiz.phone}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[hsl(var(--border))]">
                      <Link
                        to="/pricing"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-medium bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]/80 transition-colors"
                      >
                        <Crown className="w-3 h-3" />
                        {subscription?.tier === 'free' || !subscription ? 'Upgrade Plan' : 'Manage Plan'}
                      </Link>
                      <Link
                        to="/activity"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-medium bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]/80 transition-colors"
                      >
                        <TrendingUp className="w-3 h-3" />
                        Activity Feed
                      </Link>
                    </div>
                  </div>
                )}
                <div className="card-surface rounded-2xl p-6 animate-fade-in-up motion-delay-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-body font-semibold text-[hsl(var(--foreground))] font-heading flex items-center gap-2">
                      <Star className="w-5 h-5 text-warning" />
                      Recent Reviews
                    </h3>
                    <span className="text-caption text-[hsl(var(--muted-foreground))]">{reviews.length} total</span>
                  </div>

                  {reviews.length === 0 ? (
                    <p className="text-ui text-[hsl(var(--muted-foreground))] text-center py-6">
                      No reviews yet. Share your business to get feedback!
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {reviews.slice(0, 5).map(review => (
                        <div key={review.id} className="p-3 rounded-xl bg-[hsl(var(--secondary))]/50">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-ui font-medium text-[hsl(var(--foreground))]">
                              {review.user_name}
                            </span>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-3 h-3 ${i < review.rating ? 'text-warning fill-amber-500' : 'text-muted'}`}
                                />
                              ))}
                            </div>
                          </div>
                          <p className="text-caption text-[hsl(var(--muted-foreground))] line-clamp-2">{review.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-6">
                <div className="card-surface rounded-2xl p-5 animate-fade-in-up motion-delay-150">
                  <h3 className="text-ui font-semibold text-[hsl(var(--foreground))] mb-3 font-sub flex items-center gap-2">
                    <Shield className="w-4 h-4 text-brand" />
                    Subscription
                  </h3>

                  {subscription && subscription.tier !== 'free' ? (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Crown className="w-5 h-5 text-brand" />
                        <span className="font-bold text-[hsl(var(--foreground))]">
                          {tierDisplayNames[subscription.tier] || subscription.tier}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-caption ${
                          subscription.status === 'active' ? 'bg-success text-success' : 'bg-error text-error'
                        }`}>
                          {subscription.status}
                        </span>
                      </div>
                      <p className="text-caption text-[hsl(var(--muted-foreground))]">
                        {subscription.billing_cycle} billing
                      </p>
                      <p className="text-caption text-[hsl(var(--muted-foreground))]">
                        Renews {new Date(subscription.current_period_end).toLocaleDateString()}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-ui text-[hsl(var(--muted-foreground))] mb-3">
                        Free plan - upgrade to unlock analytics, more deals, events & boosts.
                      </p>
                      <Link
                        to="/pricing"
                        className="inline-flex items-center gap-1.5 text-caption font-medium text-brand hover:underline"
                      >
                        View Plans
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  )}
                </div>
                <div className="card-surface rounded-2xl p-5 animate-fade-in-up motion-delay-175">
                  <h3 className="text-ui font-semibold text-[hsl(var(--foreground))] mb-3 font-sub flex items-center gap-2">
                    <Plus className="w-4 h-4 text-brand" />
                    Create Event
                  </h3>

                  {eventError && (
                    <div className="mb-3 rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-caption text-error">
                      {eventError}
                    </div>
                  )}

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      placeholder="Wine tasting, seasonal promo..."
                      className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-ui focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                    />
                    <textarea
                      value={eventDescription}
                      onChange={(e) => setEventDescription(e.target.value)}
                      placeholder="Tell nearby customers what is happening."
                      rows={3}
                      className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-ui focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 resize-none"
                    />
                    <div className="grid grid-cols-1 gap-3">
                      <input
                        type="datetime-local"
                        value={eventStart}
                        onChange={(e) => setEventStart(e.target.value)}
                        className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-ui focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                      />
                      <input
                        type="datetime-local"
                        value={eventEnd}
                        onChange={(e) => setEventEnd(e.target.value)}
                        className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-ui focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                      />
                    </div>
                    <input
                      type="url"
                      value={eventImage}
                      onChange={(e) => setEventImage(e.target.value)}
                      placeholder="Optional image URL"
                      className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-ui focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                    />
                    <button
                      onClick={handleCreateEvent}
                      disabled={isCreatingEvent || !selectedBiz}
                      className="w-full rounded-xl gradient-primary px-4 py-2.5 text-ui font-medium text-on-primary shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreatingEvent ? 'Posting...' : 'Post event'}
                    </button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {ownerEvents.length === 0 ? (
                      <p className="text-caption text-[hsl(var(--muted-foreground))]">
                        No events yet. Add one to bring fresh activity into Explore.
                      </p>
                    ) : (
                      ownerEvents.slice(0, 4).map(event => (
                        <div key={event.id} className="rounded-xl bg-[hsl(var(--secondary))]/50 p-3">
                          <p className="text-ui font-medium text-[hsl(var(--foreground))] line-clamp-1">{event.title}</p>
                          <p className="text-caption text-[hsl(var(--muted-foreground))]">
                            {new Date(event.start_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="card-surface rounded-2xl p-5 animate-fade-in-up motion-delay-200">
                  <h3 className="text-ui font-semibold text-[hsl(var(--foreground))] mb-3 font-sub flex items-center gap-2">
                    <Tag className="w-4 h-4 text-brand" />
                    Active Deals
                  </h3>

                  {deals.filter(d => d.is_active).length === 0 ? (
                    <p className="text-ui text-[hsl(var(--muted-foreground))]">
                      No active deals. Post a deal to attract customers!
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {deals.filter(d => d.is_active).map(deal => (
                        <div key={deal.id} className="p-3 rounded-lg bg-[hsl(var(--secondary))]/50">
                          <p className="text-ui font-medium text-[hsl(var(--foreground))]">{deal.title}</p>
                          <p className="text-caption text-[hsl(var(--muted-foreground))]">
                            {deal.discount_value}% off - Expires {new Date(deal.valid_until).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {activityStatus && (
                  <div className="card-surface rounded-2xl p-5 animate-fade-in-up motion-delay-250">
                    <h3 className="text-ui font-semibold text-[hsl(var(--foreground))] mb-3 font-sub flex items-center gap-2">
                      <Eye className="w-4 h-4 text-brand" />
                      Activity Signal
                    </h3>

                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-3 h-3 rounded-full ${activityStatus.is_active_today ? 'bg-success animate-pulse' : 'bg-surface-elevated'}`} />
                      <span className="text-ui font-medium text-[hsl(var(--foreground))]">
                        {activityStatus.is_active_today ? 'Active Today' : 'Not Active'}
                      </span>
                    </div>

                    <div className="space-y-2 text-caption text-[hsl(var(--muted-foreground))]">
                      <div className="flex justify-between">
                        <span>Check-ins today</span>
                        <span className="font-medium text-[hsl(var(--foreground))]">{activityStatus.checkins_today}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>This week</span>
                        <span className="font-medium text-[hsl(var(--foreground))]">{activityStatus.checkins_this_week}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Trending score</span>
                        <span className="font-medium text-[hsl(var(--foreground))]">{activityStatus.trending_score.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CampaignToolsPanel({
  campaigns,
  templates,
  ownerEvents,
  performance,
  form,
  error,
  isCreating,
  onFormChange,
  onTemplateChange,
  onCreate
}: {
  campaigns: Campaign[]
  templates: CampaignTemplate[]
  ownerEvents: OwnerEvent[]
  performance: CampaignPerformance | null
  form: CampaignFormState
  error: string
  isCreating: boolean
  onFormChange: Dispatch<SetStateAction<CampaignFormState>>
  onTemplateChange: (templateId: string) => void
  onCreate: () => void
}) {
  const visibleCampaigns = campaigns.filter(campaign => campaign.status !== 'cancelled').slice(0, 5)
  const activeCount = campaigns.filter(campaign => campaign.status === 'active').length

  return (
    <div className="card-surface mb-8 rounded-2xl p-6 animate-fade-in-up">
      <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-subheading font-bold text-[hsl(var(--foreground))] font-heading flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-brand" />
            Campaigns
          </h3>
          <p className="text-ui text-[hsl(var(--muted-foreground))]">
            Create timely offers for existing surfaces. Campaigns never affect ranking.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <MiniMetric label="Active" value={activeCount} />
          <MiniMetric label="Claims" value={performance?.totals.claims ?? 0} />
          <MiniMetric label="Actions" value={
            (performance?.totals.claims ?? 0) +
            (performance?.totals.directions_clicks ?? 0) +
            (performance?.totals.check_ins ?? 0) +
            (performance?.totals.redemption_placeholders ?? 0)
          } />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {error && (
            <div className="mb-3 rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-caption text-error">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-caption font-medium text-[hsl(var(--muted-foreground))]">
                Template
              </span>
              <select
                value={form.templateId}
                onChange={event => onTemplateChange(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-ui text-[hsl(var(--foreground))]"
              >
                <option value="">Start from scratch</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-caption font-medium text-[hsl(var(--muted-foreground))]">
                Audience
              </span>
              <select
                value={form.audience}
                onChange={event => onFormChange(current => ({
                  ...current,
                  audience: event.target.value as CampaignTargeting['audience']
                }))}
                className="min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-ui text-[hsl(var(--foreground))]"
              >
                <option value="all_visitors">All visitors</option>
                <option value="first_time_visitors">First-time visitors</option>
                <option value="saved_business_users">Saved-business users</option>
                <option value="slow_hour">Slow-hour window</option>
                <option value="event_interested">Event-interested visitors</option>
                <option value="intent_match">Intent match</option>
                <option value="category_match">Category match</option>
              </select>
            </label>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-caption font-medium text-[hsl(var(--muted-foreground))]">
                Title
              </span>
              <input
                value={form.title}
                onChange={event => onFormChange(current => ({ ...current, title: event.target.value }))}
                placeholder="Slow-hour local perk"
                className="min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-ui text-[hsl(var(--foreground))]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-caption font-medium text-[hsl(var(--muted-foreground))]">
                Type
              </span>
              <select
                value={form.campaignType}
                onChange={event => onFormChange(current => ({
                  ...current,
                  campaignType: event.target.value as CampaignType,
                  linkedEventId: event.target.value === 'event_promotion' ? current.linkedEventId : ''
                }))}
                className="min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-ui text-[hsl(var(--foreground))]"
              >
                <option value="slow_hour">Slow-hour campaign</option>
                <option value="first_time_visitor">First-time visitor offer</option>
                <option value="event_promotion">Event promotion</option>
                <option value="limited_time_perk">Limited-time perk</option>
                <option value="non_discount">Non-discount offer</option>
                <option value="custom_template">Custom template</option>
              </select>
            </label>
            {form.campaignType === 'event_promotion' && (
              <label className="block">
                <span className="mb-1.5 block text-caption font-medium text-[hsl(var(--muted-foreground))]">
                  Linked event
                </span>
                <select
                  value={form.linkedEventId}
                  onChange={event => onFormChange(current => ({
                    ...current,
                    linkedEventId: event.target.value
                  }))}
                  className="min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-ui text-[hsl(var(--foreground))]"
                >
                  <option value="">No linked event</option>
                  {ownerEvents.map(event => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label className="mt-3 block">
            <span className="mb-1.5 block text-caption font-medium text-[hsl(var(--muted-foreground))]">
              Description
            </span>
            <textarea
              value={form.description}
              onChange={event => onFormChange(current => ({ ...current, description: event.target.value }))}
              placeholder="Tell customers why this is worth acting on now."
              rows={3}
              className="w-full resize-none rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-ui text-[hsl(var(--foreground))]"
            />
          </label>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-caption font-medium text-[hsl(var(--muted-foreground))]">
                Offer kind
              </span>
              <select
                value={form.offerKind}
                onChange={event => onFormChange(current => ({
                  ...current,
                  offerKind: event.target.value as CampaignOfferKind
                }))}
                className="min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-ui text-[hsl(var(--foreground))]"
              >
                <option value="perk">Perk</option>
                <option value="non_discount">Non-discount</option>
                <option value="event">Event</option>
                <option value="discount">Discount</option>
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-caption font-medium text-[hsl(var(--muted-foreground))]">
                Perk copy
              </span>
              <input
                value={form.perkDescription}
                onChange={event => onFormChange(current => ({ ...current, perkDescription: event.target.value }))}
                placeholder="Free add-on during selected hours"
                className="min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-ui text-[hsl(var(--foreground))]"
              />
            </label>
          </div>

          {form.offerKind === 'discount' && (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                value={form.discountType}
                onChange={event => onFormChange(current => ({
                  ...current,
                  discountType: event.target.value as 'percentage' | 'fixed'
                }))}
                className="min-h-11 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-ui"
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
              <input
                value={form.discountValue}
                onChange={event => onFormChange(current => ({ ...current, discountValue: event.target.value }))}
                inputMode="decimal"
                placeholder="Value"
                className="min-h-11 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-ui"
              />
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-caption font-medium text-[hsl(var(--muted-foreground))]">
                Starts
              </span>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={event => onFormChange(current => ({ ...current, startsAt: event.target.value }))}
                className="min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-ui"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-caption font-medium text-[hsl(var(--muted-foreground))]">
                Ends
              </span>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={event => onFormChange(current => ({ ...current, endsAt: event.target.value }))}
                className="min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-ui"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={onCreate}
            disabled={isCreating}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl gradient-primary px-4 text-ui font-medium text-on-primary shadow-lg shadow-brand/20 disabled:opacity-60 md:w-auto"
          >
            {isCreating ? 'Publishing...' : 'Publish campaign'}
          </button>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/35 p-4">
              <div className="mb-2 flex items-center gap-2 text-caption text-[hsl(var(--muted-foreground))]">
                <MousePointerClick className="h-4 w-4 text-brand" />
                Open rate
              </div>
              <p className="text-subheading font-bold text-[hsl(var(--foreground))]">
                {formatPercent(performance?.rates.open_rate ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/35 p-4">
              <div className="mb-2 flex items-center gap-2 text-caption text-[hsl(var(--muted-foreground))]">
                <Ticket className="h-4 w-4 text-brand" />
                Claim rate
              </div>
              <p className="text-subheading font-bold text-[hsl(var(--foreground))]">
                {formatPercent(performance?.rates.claim_rate ?? 0)}
              </p>
            </div>
          </div>

          <h4 className="mb-3 text-ui font-semibold text-[hsl(var(--foreground))] font-sub">
            Recent campaigns
          </h4>
          {visibleCampaigns.length === 0 ? (
            <p className="rounded-xl bg-[hsl(var(--secondary))]/40 p-4 text-ui text-[hsl(var(--muted-foreground))]">
              No campaigns yet. Start from a template to create one.
            </p>
          ) : (
            <div className="space-y-3">
              {visibleCampaigns.map(campaign => (
                <div
                  key={campaign.id || campaign._id}
                  className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-ui font-semibold text-[hsl(var(--foreground))]">
                        {campaign.title}
                      </p>
                      <p className="text-caption text-[hsl(var(--muted-foreground))]">
                        {campaignTypeLabel(campaign.campaign_type)} - {campaign.status}
                      </p>
                    </div>
                    <span className="rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-caption font-medium text-[hsl(var(--foreground))]">
                      {new Date(campaign.ends_at).toLocaleDateString()}
                    </span>
                  </div>
                  {campaign.perk_description && (
                    <p className="mt-2 text-caption text-[hsl(var(--muted-foreground))]">
                      {campaign.perk_description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {performance?.top_campaigns?.length ? (
            <div className="mt-4">
              <h4 className="mb-3 text-ui font-semibold text-[hsl(var(--foreground))] font-sub">
                Top campaigns
              </h4>
              <div className="space-y-2">
                {performance.top_campaigns.map(item => (
                  <div key={item.campaign_id} className="flex items-center justify-between gap-3 text-ui">
                    <span className="truncate text-[hsl(var(--foreground))]">{item.title}</span>
                    <span className="text-caption font-semibold text-[hsl(var(--muted-foreground))]">
                      {item.actions} actions
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/35 px-4 py-3">
      <p className="text-caption text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className="text-body font-bold text-[hsl(var(--foreground))]">{formatNumber(value)}</p>
    </div>
  )
}

function ConversionSection({
  summary,
  timeseries,
  loading,
  error
}: {
  summary: BusinessConversionSummary | null
  timeseries: BusinessConversionTimeseries | null
  loading: boolean
  error: string
}) {
  if (loading) {
    return (
      <div className="mb-8 space-y-6 animate-fade-in-up" aria-busy="true">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="card-surface rounded-2xl p-5">
              <div className="mb-3 h-4 w-24 rounded bg-[hsl(var(--secondary))]" />
              <div className="mb-2 h-8 w-16 rounded bg-[hsl(var(--secondary))]" />
              <div className="h-3 w-28 rounded bg-[hsl(var(--secondary))]" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="card-surface rounded-2xl p-6 lg:col-span-2">
            <div className="mb-5 h-5 w-44 rounded bg-[hsl(var(--secondary))]" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-24 rounded-xl bg-[hsl(var(--secondary))]" />
              ))}
            </div>
          </div>
          <div className="card-surface rounded-2xl p-6">
            <div className="mb-5 h-5 w-32 rounded bg-[hsl(var(--secondary))]" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-9 rounded bg-[hsl(var(--secondary))]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card-surface mb-8 rounded-2xl border border-error/30 p-6 text-ui text-error">
        {error}
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="card-surface mb-8 rounded-2xl p-6 text-ui text-[hsl(var(--muted-foreground))]">
        Conversion analytics appear after match cards record customer actions.
      </div>
    )
  }

  const actions = summary.totals.offer_claims + summary.totals.directions_clicks + summary.totals.check_ins
  const positiveIntent = summary.totals.saves + summary.totals.matches
  const headline = [
    {
      icon: Eye,
      label: 'Impressions',
      value: summary.totals.impressions,
      sub: 'Seen in match cards',
      color: 'text-brand'
    },
    {
      icon: Bookmark,
      label: 'Saves + Matches',
      value: positiveIntent,
      sub: `${formatPercent(summary.rates.save_rate + summary.rates.match_rate)} of impressions`,
      color: 'text-success'
    },
    {
      icon: MousePointerClick,
      label: 'Profile opens',
      value: summary.totals.profile_opens,
      sub: `${formatPercent(summary.rates.profile_open_rate)} open rate`,
      color: 'text-info'
    },
    {
      icon: BarChart3,
      label: 'Actions taken',
      value: actions,
      sub: `${formatPercent(summary.rates.action_rate)} action rate`,
      color: 'text-warning'
    }
  ]

  return (
    <div className="mb-8 space-y-6 animate-fade-in-up">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {headline.map(item => (
          <MetricCard
            key={item.label}
            icon={item.icon}
            label={item.label}
            value={formatNumber(item.value)}
            sub={item.sub}
            color={item.color}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card-surface rounded-2xl p-6 lg:col-span-2">
          <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-body font-semibold text-[hsl(var(--foreground))] font-heading">
                Conversion funnel
              </h3>
              <p className="text-caption text-[hsl(var(--muted-foreground))]">
                Counts are actions recorded, not unique customers.
              </p>
            </div>
            <span className="text-caption text-[hsl(var(--muted-foreground))]">
              Last {summary.range.replace('d', '')} days
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {summary.funnel.map((step, index) => {
              const previous = index > 0 ? summary.funnel[index - 1].count : 0
              const dropOff = previous > 0 ? Math.max(0, 1 - step.count / previous) : 0
              return (
                <div
                  key={step.id}
                  className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/35 p-4"
                >
                  <p className="min-h-10 text-caption font-medium text-[hsl(var(--muted-foreground))]">
                    {step.label}
                  </p>
                  <p className="mt-3 text-subheading font-bold text-[hsl(var(--foreground))]">
                    {formatNumber(step.count)}
                  </p>
                  <p className="mt-1 text-caption text-[hsl(var(--muted-foreground))]">
                    {index === 0 ? 'Starting point' : `${formatPercent(dropOff)} drop-off`}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        <ActionBreakdown summary={summary} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ReasonsPanel
          title="Top match reasons"
          empty="Reason data appears after match cards record reason codes."
          reasons={summary.top_match_reasons}
        />
        <ReasonsPanel
          title="Skipped with these match reasons"
          empty="Reason data appears after skipped match cards include reason codes."
          reasons={summary.top_skipped_reasons}
        />
      </div>

      <TrendPanel timeseries={timeseries} />
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Star
  label: string
  value: string
  sub: string
  color: string
}) {
  return (
    <div className="card-surface rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="text-caption text-[hsl(var(--muted-foreground))] font-medium">{label}</span>
      </div>
      <p className="text-subheading font-bold text-[hsl(var(--foreground))]">{value}</p>
      <p className="text-caption text-[hsl(var(--muted-foreground))] mt-0.5">{sub}</p>
    </div>
  )
}

function ActionBreakdown({ summary }: { summary: BusinessConversionSummary }) {
  const rows = [
    {
      icon: Ticket,
      label: 'Offer claims',
      count: summary.totals.offer_claims,
      rate: summary.rates.claim_rate,
      rateLabel: 'of profile opens'
    },
    {
      icon: Navigation,
      label: 'Directions clicks',
      count: summary.totals.directions_clicks,
      rate: rateFromImpressions(summary.totals.directions_clicks, summary.totals.impressions),
      rateLabel: 'of impressions'
    },
    {
      icon: MapPin,
      label: 'Check-ins',
      count: summary.totals.check_ins,
      rate: rateFromImpressions(summary.totals.check_ins, summary.totals.impressions),
      rateLabel: 'of impressions'
    },
    {
      icon: CheckCircle2,
      label: 'Use placeholders',
      count: summary.totals.redemption_placeholders,
      rate: summary.rates.redemption_placeholder_rate,
      rateLabel: 'of claims'
    }
  ]

  return (
    <div className="card-surface rounded-2xl p-6">
      <h3 className="mb-4 text-body font-semibold text-[hsl(var(--foreground))] font-heading">
        Intent actions
      </h3>
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--secondary))]">
                <row.icon className="h-4 w-4 text-brand" />
              </div>
              <div className="min-w-0">
                <p className="text-ui font-medium text-[hsl(var(--foreground))]">{row.label}</p>
                <p className="text-caption text-[hsl(var(--muted-foreground))]">
                  {formatPercent(row.rate)} {row.rateLabel}
                </p>
              </div>
            </div>
            <span className="text-body font-bold text-[hsl(var(--foreground))]">
              {formatNumber(row.count)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReasonsPanel({
  title,
  empty,
  reasons
}: {
  title: string
  empty: string
  reasons: BusinessConversionSummary['top_match_reasons']
}) {
  return (
    <div className="card-surface rounded-2xl p-6">
      <h3 className="mb-4 text-body font-semibold text-[hsl(var(--foreground))] font-heading">
        {title}
      </h3>
      {reasons.length === 0 ? (
        <p className="py-4 text-ui text-[hsl(var(--muted-foreground))]">{empty}</p>
      ) : (
        <div className="space-y-3">
          {reasons.map(reason => (
            <div key={reason.reason_code} className="flex items-center justify-between gap-3">
              <span className="text-ui text-[hsl(var(--foreground))]">
                {reason.label || formatReasonCode(reason.reason_code)}
              </span>
              <span className="rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1 text-caption font-semibold text-[hsl(var(--foreground))]">
                {formatNumber(reason.count)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TrendPanel({ timeseries }: { timeseries: BusinessConversionTimeseries | null }) {
  const buckets = timeseries?.buckets ?? []
  const totals = buckets.map(bucket => (
    bucket.impressions +
    bucket.saves +
    bucket.matches +
    bucket.profile_opens +
    bucket.offer_claims +
    bucket.directions_clicks +
    bucket.check_ins +
    bucket.redemption_placeholders
  ))
  const maxTotal = Math.max(1, ...totals)

  return (
    <div className="card-surface rounded-2xl p-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-body font-semibold text-[hsl(var(--foreground))] font-heading">
            Daily trend
          </h3>
          <p className="text-caption text-[hsl(var(--muted-foreground))]">
            Combined recorded conversion actions by day.
          </p>
        </div>
        {buckets.length > 0 && (
          <span className="text-caption text-[hsl(var(--muted-foreground))]">
            {new Date(buckets[0].date).toLocaleDateString()} - {new Date(buckets[buckets.length - 1].date).toLocaleDateString()}
          </span>
        )}
      </div>

      {buckets.length === 0 ? (
        <p className="py-4 text-ui text-[hsl(var(--muted-foreground))]">
          Trend data appears after daily customer actions are recorded.
        </p>
      ) : (
        <div
          className="grid h-32 items-end gap-1"
          style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(3px, 1fr))` }}
          role="img"
          aria-label="Daily conversion action trend"
        >
          {buckets.map((bucket, index) => {
            const height = Math.max(8, Math.round((totals[index] / maxTotal) * 100))
            return (
              <div
                key={bucket.date}
                title={`${bucket.date}: ${totals[index]} actions`}
                className="rounded-t bg-[hsl(var(--primary))]/70"
                style={{ height: `${height}%` }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value)
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function toLocalDateTimeValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function campaignTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    slow_hour: 'Slow-hour',
    first_time_visitor: 'First-time visitor',
    event_promotion: 'Event promotion',
    limited_time_perk: 'Limited-time perk',
    non_discount: 'Non-discount',
    custom_template: 'Custom'
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

function rateFromImpressions(count: number, impressions: number): number {
  return impressions > 0 ? count / impressions : 0
}
