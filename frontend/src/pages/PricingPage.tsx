/**
 * @fileoverview Pricing page (route `/pricing`). Displays subscription
 * tiers for business owners (Free, Basic, Standard, Premium) with
 * monthly/yearly toggle, feature lists, and Stripe checkout. Community
 * members always browse for free.
 */

import { useState, useEffect, useCallback } from 'react'
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
  starter: 'from-brand to-brand-light',
  pro: 'from-brand to-brand',
  premium: 'from-brand-dark to-brand',
}

const tierLabels: Record<string, string> = {
  free: 'Free',
  starter: 'Basic',
  pro: 'Standard',
  premium: 'Premium',
}

const formatPrice = (value: number): string => (value === 0 ? '0' : value.toFixed(2))

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

  const loadData = useCallback(async () => {
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
  }, [isAuthenticated, user])

  useEffect(() => {
    loadData()
  }, [loadData])

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
      const result = await api.createSubscription({
        business_id: selectedBusiness,
        tier: tier as 'starter' | 'pro' | 'premium',
        billing_cycle: billingCycle,
      })

      if (result && typeof result === 'object' && 'checkout_url' in result && result.checkout_url) {
        window.location.assign(result.checkout_url)
        return
      }

      setSuccess(`Successfully subscribed to ${tierLabels[tier] || tier} plan!`)
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
        {}
        <div className="text-center mb-12 animate-fade-in-up">
          <h1 className="text-heading md:text-display font-bold text-[hsl(var(--foreground))] mb-4 font-heading">
            Grow Your <span className="gradient-text font-serif">Business</span>
          </h1>
          <p className="text-body text-[hsl(var(--muted-foreground))] max-w-2xl mx-auto">
            Free for community members. Business owners pay only for the tools they need to grow locally.
          </p>

          {}
          <div className="mt-8 flex justify-center">
            <div className="relative inline-flex items-center">
              <div className="flex items-center gap-3">
                <span className={`text-ui font-medium ${billingCycle === 'monthly' ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                  Monthly
                </span>
                <button
                  onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
                  className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
                    billingCycle === 'yearly' ? 'bg-brand' : 'bg-[hsl(var(--secondary))]'
                  }`}
                >
                  <div className={`absolute left-0 top-0.5 w-6 h-6 rounded-full bg-surface shadow-md transition-transform duration-300 ${
                    billingCycle === 'yearly' ? 'translate-x-7' : 'translate-x-0.5'
                  }`} />
                </button>
                <span className={`text-ui font-medium ${billingCycle === 'yearly' ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                  Yearly
                </span>
              </div>
              <span
                className={`absolute left-full ml-3 text-caption font-semibold text-brand bg-brand/10 px-2.5 py-1 rounded-full whitespace-nowrap transition-opacity duration-200 ${
                  billingCycle === 'yearly' ? 'opacity-100' : 'opacity-0'
                }`}
                aria-hidden={billingCycle !== 'yearly'}
              >
                Save ~20%
              </span>
            </div>
          </div>
        </div>

        {}
        {isAuthenticated && user?.role === 'business_owner' && myBusinesses.length > 0 && (
          <div className="max-w-md mx-auto mb-8">
            <label className="block text-ui font-medium text-[hsl(var(--foreground))] mb-2">
              Select your business
            </label>
            <select
              value={selectedBusiness}
              onChange={(e) => setSelectedBusiness(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] text-ui"
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
          <div className="max-w-md mx-auto mb-6 p-4 rounded-xl bg-error dark:bg-error/20 border border-error text-error dark:text-error text-ui text-center">
            {error}
          </div>
        )}
        {success && (
          <div className="max-w-md mx-auto mb-6 p-4 rounded-xl bg-success dark:bg-success/20 border border-success dark:border-success text-success dark:text-success text-ui text-center">
            {success}
          </div>
        )}

        {}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier, index) => {
            const Icon = tierIcons[tier.tier] || Star
            const gradient = tierGradients[tier.tier] || 'from-gray-400 to-gray-500'
            const isHighlighted = tier.highlighted
            const isCurrent = currentTier === tier.tier
            const price = billingCycle === 'monthly' ? tier.monthly_price : tier.yearly_price
            const monthlyEquivalent = billingCycle === 'yearly' ? price / 12 : price

            return (
              <div
                key={tier.tier}
                className={`relative card-surface rounded-2xl p-6 flex flex-col animate-fade-in-up ${
                  isHighlighted ? 'ring-2 ring-brand shadow-xl shadow-brand/10' : ''
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {isHighlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1 rounded-full text-caption font-bold text-brand-on-primary gradient-primary shadow-lg shadow-brand/25">
                      Most Popular
                    </span>
                  </div>
                )}

                {isCurrent && (
                  <div className="absolute -top-3 right-4">
                    <span className="px-3 py-1 rounded-full text-caption font-bold text-on-primary bg-success">
                      Current
                    </span>
                  </div>
                )}

                {}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-lg`}>
                  <Icon className="w-6 h-6 text-brand-on-primary" />
                </div>

                {}
                <h3 className="text-subheading font-bold text-[hsl(var(--foreground))] font-heading">{tier.name}</h3>
                <p className="text-ui text-[hsl(var(--muted-foreground))] mt-1 mb-4">{tier.description}</p>

                {}
                <div className="mb-6">
                  <span className="text-heading font-bold text-[hsl(var(--foreground))]">
                    ${formatPrice(monthlyEquivalent)}
                  </span>
                  {tier.monthly_price > 0 && (
                    <span className="text-ui text-[hsl(var(--muted-foreground))]">/mo</span>
                  )}
                  {billingCycle === 'yearly' && tier.yearly_price > 0 && (
                    <p className="text-caption text-[hsl(var(--muted-foreground))] mt-1">
                      ${formatPrice(price)}/year billed annually
                    </p>
                  )}
                </div>

                {}
                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-brand mt-0.5 flex-shrink-0" />
                      <span className="text-ui text-[hsl(var(--foreground))]">{feature}</span>
                    </li>
                  ))}
                </ul>

                {}
                <button
                  onClick={() => handleSubscribe(tier.tier)}
                  disabled={subscribing || isCurrent}
                  className={`w-full py-3 rounded-xl font-medium text-ui flex items-center justify-center gap-2 transition-all duration-200 ${
                    isHighlighted
                      ? 'gradient-primary text-on-primary shadow-lg shadow-brand/25 hover:shadow-xl hover:shadow-brand/30'
                      : isCurrent
                        ? 'bg-success dark:bg-success/20 text-success dark:text-success cursor-default'
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

        {}
        <div className="mt-16 text-center">
          <p className="text-[hsl(var(--muted-foreground))] text-ui mb-2">
            Community members always browse for free. Subscriptions are for business owners only.
          </p>
          <p className="text-[hsl(var(--muted-foreground))] text-caption">
            Cancel anytime. No contracts. No hidden fees.
          </p>
        </div>
      </div>
    </div>
  )
}
