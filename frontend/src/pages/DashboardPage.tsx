import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Business, Deal, Review, Subscription, BusinessActivityStatus, BusinessClaim } from '../types'
import {
  Store, Star, Tag, TrendingUp, Plus,
  MapPin, Phone, Clock, Eye, CheckCircle2, Crown,
  ArrowUpRight, Flame, ChevronRight, Shield
} from 'lucide-react'

const tierDisplayNames: Record<string, string> = {
  free: 'Free',
  starter: 'Basic',
  pro: 'Standard',
  premium: 'Premium',
}

export default function DashboardPage() {
  const { user, isAuthenticated } = useAuth()
  const [myBusinesses, setMyBusinesses] = useState<Business[]>([])
  const [selectedBiz, setSelectedBiz] = useState<Business | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [activityStatus, setActivityStatus] = useState<BusinessActivityStatus | null>(null)
  const [myClaims, setMyClaims] = useState<BusinessClaim[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'business_owner') return
    loadDashboard()
  }, [isAuthenticated, user])

  const loadDashboard = async () => {
    try {
      setLoading(true)
      const [businesses, claims] = await Promise.all([
        api.getBusinesses(),
        api.getMyClaims(),
      ])

      const owned = businesses.filter(b => b.owner_id === user?.id && b.is_claimed)
      setMyBusinesses(owned)
      setMyClaims(claims)

      if (owned.length > 0) {
        selectBusiness(owned[0])
      }
    } catch (err) {
      console.error('Dashboard load failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const selectBusiness = async (biz: Business) => {
    setSelectedBiz(biz)
    const bizId = biz.id || biz._id || ''
    try {
      const [bizReviews, bizDeals, bizSub, bizActivity] = await Promise.all([
        api.getBusinessReviews(bizId),
        api.getBusinessDeals(bizId),
        api.getBusinessSubscription(bizId),
        api.getBusinessActivity(bizId).catch(() => null),
      ])
      setReviews(bizReviews)
      setDeals(bizDeals)
      setSubscription(bizSub)
      setActivityStatus(bizActivity)
    } catch (err) {
      console.error('Failed to load business data:', err)
    }
  }

  if (!isAuthenticated || user?.role !== 'business_owner') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="glass-card rounded-2xl p-10 max-w-md w-full text-center animate-fade-in-up">
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
        <div className="w-8 h-8 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const bizId = selectedBiz?.id || selectedBiz?._id || ''

  return (
    <div className="min-h-[60vh] py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
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

        {/* No businesses yet */}
        {myBusinesses.length === 0 ? (
          <div className="space-y-6">
            {/* Pending Claims */}
            {myClaims.length > 0 && (
              <div className="glass-card rounded-2xl p-6 animate-fade-in-up">
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
                        claim.status === 'pending' ? 'bg-warning dark:bg-warning/20 text-warning dark:text-warning' :
                        claim.status === 'verified' ? 'bg-success dark:bg-success/20 text-success dark:text-success' :
                        'bg-error dark:bg-error/20 text-error dark:text-error'
                      }`}>
                        {claim.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA to claim */}
            <div className="glass-card rounded-2xl p-10 text-center animate-fade-in-up">
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
            {/* Business Selector */}
            {myBusinesses.length > 1 && (
              <div className="mb-6">
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {myBusinesses.map(biz => (
                    <button
                      key={biz.id || biz._id}
                      onClick={() => selectBusiness(biz)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-ui font-medium whitespace-nowrap transition-all ${
                        (biz.id || biz._id) === bizId
                          ? 'gradient-primary text-on-primary shadow-md shadow-brand/25'
                          : 'glass-card text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]'
                      }`}
                    >
                      <Store className="w-4 h-4" />
                      {biz.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Stats Grid */}
            {selectedBiz && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 animate-fade-in-up">
                <StatCard
                  icon={Star}
                  label="Rating"
                  value={selectedBiz.rating?.toFixed(1) || '0.0'}
                  sub={`${selectedBiz.review_count || 0} reviews`}
                  color="text-warning"
                />
                <StatCard
                  icon={Tag}
                  label="Active Deals"
                  value={String(deals.filter(d => d.is_active).length)}
                  sub={`${deals.length} total`}
                  color="text-brand"
                />
                <StatCard
                  icon={MapPin}
                  label="Check-ins Today"
                  value={String(activityStatus?.checkins_today || 0)}
                  sub={`${activityStatus?.checkins_this_week || 0} this week`}
                  color="text-info"
                />
                <StatCard
                  icon={Flame}
                  label="Trending Score"
                  value={String(activityStatus?.trending_score?.toFixed(1) || '0.0')}
                  sub={activityStatus?.is_active_today ? 'Active Today' : 'Not active'}
                  color="text-warning"
                />
              </div>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Business Overview + Recent Reviews */}
              <div className="lg:col-span-2 space-y-6">
                {/* Business Overview */}
                {selectedBiz && (
                  <div className="glass-card rounded-2xl p-6 animate-fade-in-up">
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

                    {/* Quick Actions */}
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

                {/* Recent Reviews */}
                <div className="glass-card rounded-2xl p-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
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

              {/* Right Sidebar */}
              <div className="space-y-6">
                {/* Subscription Status */}
                <div className="glass-card rounded-2xl p-5 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
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
                          subscription.status === 'active' ? 'bg-success dark:bg-success/20 text-success dark:text-success' : 'bg-error dark:bg-error/20 text-error dark:text-error'
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

                {/* Active Deals */}
                <div className="glass-card rounded-2xl p-5 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
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

                {/* Activity Signal */}
                {activityStatus && (
                  <div className="glass-card rounded-2xl p-5 animate-fade-in-up" style={{ animationDelay: '250ms' }}>
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

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Star
  label: string
  value: string
  sub: string
  color: string
}) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="text-caption text-[hsl(var(--muted-foreground))] font-medium">{label}</span>
      </div>
      <p className="text-subheading font-bold text-[hsl(var(--foreground))]">{value}</p>
      <p className="text-caption text-[hsl(var(--muted-foreground))] mt-0.5">{sub}</p>
    </div>
  )
}
