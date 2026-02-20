import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api'
import type { TierInfo, Business, Subscription } from '../types'
import { Check, Zap, Crown, Star, ArrowRight, Sparkles } from 'lucide-react'

const tierIcons: Record<string, typeof Star> = {
  free: Star,
  starter: Zap,
  pro: Sparkles,
  premium: Crown,
}

const tierGradients: Record<string, string> = {
  free: 'from-gray-400 to-gray-500',
  starter: 'from-[#22c55e] to-[#4ade80]',
  pro: 'from-[#22c55e] to-[#22c55e]',
  premium: 'from-[#052e16] to-[#22c55e]',
}

export default function PricingPage() {
  const { user, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [tiers, setTiers] = useState<TierInfo[]>([])
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [loading, setLoading] = useState(true)
  const [myBusinesses, setMyBusinesses] = useState<Business[]>([])
  const [mySubscriptions, setMySubscriptions] = useState<Subscription[]>([])
  const [selectedBusiness, setSelectedBusiness] = useState<string>('')
  const [subscribing, setSubscribing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadData()
  }, [isAuthenticated])

  const loadData = async () => {
    try {
      const tierData = await api.getSubscriptionTiers()
      setTiers(tierData)

      if (isAuthenticated && user?.role === 'business_owner') {
        const [businesses, subs] = await Promise.all([
          api.getBusinesses(),
          api.getMySubscriptions(),
        ])
        const owned = businesses.filter(b => b.owner_id === user.id && b.is_claimed)
        setMyBusinesses(owned)
        setMySubscriptions(subs)
        if (owned.length > 0) setSelectedBusiness(owned[0].id || owned[0]._id || '')
      }
    } catch (err) {
      console.error('Failed to load pricing data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubscribe = async (tier: string) => {
    setError('')
    setSuccess('')

    if (!isAuthenticated) {
      navigate('/signup')
      return
    }

    if (user?.role !== 'business_owner') {
      setError('Only business owners can subscribe. Update your role in account settings.')
      return
    }

    if (!selectedBusiness) {
      setError('You need to claim a business first before subscribing.')
      return
    }

    if (tier === 'free') return

    setSubscribing(true)
    try {
      await api.createSubscription({
        business_id: selectedBusiness,
        tier: tier as 'starter' | 'pro' | 'premium',
        billing_cycle: billingCycle,
      })
      setSuccess(`Successfully subscribed to ${tier.charAt(0).toUpperCase() + tier.slice(1)} plan!`)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to subscribe')
    } finally {
      setSubscribing(false)
    }
  }

  const getCurrentTier = (): string => {
    if (!selectedBusiness || mySubscriptions.length === 0) return 'free'
    const sub = mySubscriptions.find(s => s.business_id === selectedBusiness && s.status === 'active')
    return sub?.tier || 'free'
  }

  const currentTier = getCurrentTier()

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in-up">
          <h1 className="text-4xl md:text-5xl font-bold text-[hsl(var(--foreground))] mb-4 font-heading">
            Grow Your <span className="gradient-text font-serif">Business</span>
          </h1>
          <p className="text-lg text-[hsl(var(--muted-foreground))] max-w-2xl mx-auto">
            Free for community members. Business owners pay only for the tools they need to grow locally.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3 mt-8">
            <span className={`text-sm font-medium ${billingCycle === 'monthly' ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
              Monthly
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
                billingCycle === 'yearly' ? 'bg-[#22c55e]' : 'bg-[hsl(var(--secondary))]'
              }`}
            >
              <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 ${
                billingCycle === 'yearly' ? 'translate-x-7.5' : 'translate-x-0.5'
              }`} />
            </button>
            <span className={`text-sm font-medium ${billingCycle === 'yearly' ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
              Yearly
            </span>
            {billingCycle === 'yearly' && (
              <span className="text-xs font-semibold text-[#22c55e] bg-[#22c55e]/10 px-2.5 py-1 rounded-full">
                Save ~20%
              </span>
            )}
          </div>
        </div>

        {/* Business selector for owners */}
        {isAuthenticated && user?.role === 'business_owner' && myBusinesses.length > 0 && (
          <div className="max-w-md mx-auto mb-8">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
              Select your business
            </label>
            <select
              value={selectedBusiness}
              onChange={(e) => setSelectedBusiness(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] text-sm"
            >
              {myBusinesses.map(b => (
                <option key={b.id || b._id} value={b.id || b._id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div className="max-w-md mx-auto mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm text-center">
            {error}
          </div>
        )}
        {success && (
          <div className="max-w-md mx-auto mb-6 p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm text-center">
            {success}
          </div>
        )}

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier, index) => {
            const Icon = tierIcons[tier.tier] || Star
            const gradient = tierGradients[tier.tier] || 'from-gray-400 to-gray-500'
            const isHighlighted = tier.highlighted
            const isCurrent = currentTier === tier.tier
            const price = billingCycle === 'monthly' ? tier.monthly_price : tier.yearly_price

            return (
              <div
                key={tier.tier}
                className={`relative glass-card rounded-2xl p-6 flex flex-col animate-fade-in-up ${
                  isHighlighted ? 'ring-2 ring-[#22c55e] shadow-xl shadow-[#22c55e]/10' : ''
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {isHighlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1 rounded-full text-xs font-bold text-white gradient-primary shadow-lg shadow-[#22c55e]/25">
                      Most Popular
                    </span>
                  </div>
                )}

                {isCurrent && (
                  <div className="absolute -top-3 right-4">
                    <span className="px-3 py-1 rounded-full text-xs font-bold text-white bg-green-500">
                      Current
                    </span>
                  </div>
                )}

                {/* Tier Icon */}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>

                {/* Tier Info */}
                <h3 className="text-xl font-bold text-[hsl(var(--foreground))] font-heading">{tier.name}</h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 mb-4">{tier.description}</p>

                {/* Price */}
                <div className="mb-6">
                  <span className="text-4xl font-bold text-[hsl(var(--foreground))]">
                    ${billingCycle === 'yearly' ? Math.round(price / 12) : price}
                  </span>
                  {tier.monthly_price > 0 && (
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">/mo</span>
                  )}
                  {billingCycle === 'yearly' && tier.yearly_price > 0 && (
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                      ${price}/year billed annually
                    </p>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-[#22c55e] mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-[hsl(var(--foreground))]">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => handleSubscribe(tier.tier)}
                  disabled={subscribing || isCurrent}
                  className={`w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all duration-200 ${
                    isHighlighted
                      ? 'gradient-primary text-white shadow-lg shadow-[#22c55e]/25 hover:shadow-xl hover:shadow-[#22c55e]/30'
                      : isCurrent
                        ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 cursor-default'
                        : tier.monthly_price === 0
                          ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]/80'
                          : 'border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]'
                  }`}
                >
                  {isCurrent ? 'Current Plan' : tier.monthly_price === 0 ? 'Get Started Free' : 'Subscribe'}
                  {!isCurrent && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            )
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <p className="text-[hsl(var(--muted-foreground))] text-sm mb-2">
            Community members always browse for free. Subscriptions are for business owners only.
          </p>
          <p className="text-[hsl(var(--muted-foreground))] text-xs">
            Cancel anytime. No contracts. No hidden fees.
          </p>
        </div>
      </div>
    </div>
  )
}
