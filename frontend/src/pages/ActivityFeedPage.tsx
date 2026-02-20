import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api'
import type { ActivityFeedItem, UserCredibility, CredibilityTier } from '../types'
import {
  MapPin, Star, Tag, Calendar, Award, TrendingUp,
  ThumbsUp, MessageCircle, Clock, Shield, CheckCircle2,
  Users, Flame, ChevronUp
} from 'lucide-react'

const activityIcons: Record<string, typeof MapPin> = {
  checkin: MapPin,
  review: Star,
  deal_posted: Tag,
  event_created: Calendar,
  business_claimed: Award,
  milestone: TrendingUp,
}

const activityColors: Record<string, string> = {
  checkin: 'bg-blue-500',
  review: 'bg-amber-500',
  deal_posted: 'bg-[#22c55e]',
  event_created: 'bg-purple-500',
  business_claimed: 'bg-green-500',
  milestone: 'bg-orange-500',
}

const credibilityBadges: Record<CredibilityTier, { label: string; color: string; icon: typeof Shield }> = {
  new: { label: 'Newcomer', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400', icon: Users },
  regular: { label: 'Regular', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400', icon: CheckCircle2 },
  trusted: { label: 'Trusted', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', icon: Shield },
  local_guide: { label: 'Local Guide', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', icon: Award },
  ambassador: { label: 'Ambassador', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', icon: Flame },
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString()
}

function CredibilityBadge({ tier }: { tier: CredibilityTier }) {
  const badge = credibilityBadges[tier]
  const Icon = badge.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
      <Icon className="w-3 h-3" />
      {badge.label}
    </span>
  )
}

export default function ActivityFeedPage() {
  const { isAuthenticated } = useAuth()
  const [feedItems, setFeedItems] = useState<ActivityFeedItem[]>([])
  const [myCredibility, setMyCredibility] = useState<UserCredibility | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadFeed = useCallback(async (pageNum: number, append: boolean = false) => {
    try {
      if (pageNum === 1) setLoading(true)
      else setLoadingMore(true)

      const items = await api.getActivityFeed(pageNum, 15)

      if (items.length < 15) setHasMore(false)

      setFeedItems(prev => append ? [...prev, ...items] : items)
      setPage(pageNum)
    } catch (err) {
      console.error('Failed to load feed:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    loadFeed(1)
  }, [loadFeed])

  useEffect(() => {
    if (isAuthenticated) {
      api.getMyCredibility().then(setMyCredibility).catch(() => {})
    }
  }, [isAuthenticated])

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && hasMore) {
          loadFeed(page + 1, true)
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [page, hasMore, loadingMore, loadFeed])

  return (
    <div className="min-h-[60vh] py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 animate-fade-in-up">
          <div>
            <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] font-heading">
              Local <span className="gradient-text font-serif">Activity</span>
            </h1>
            <p className="text-[hsl(var(--muted-foreground))] mt-1">
              Real-time activity from your local community
            </p>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-card">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-[hsl(var(--foreground))]">Live Feed</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Feed */}
          <div className="lg:col-span-2 space-y-4">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="glass-card rounded-2xl p-5 animate-pulse">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[hsl(var(--secondary))]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-[hsl(var(--secondary))] rounded w-3/4" />
                      <div className="h-3 bg-[hsl(var(--secondary))] rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))
            ) : feedItems.length === 0 ? (
              <div className="glass-card rounded-2xl p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--secondary))] flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
                </div>
                <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-2 font-heading">No activity yet</h3>
                <p className="text-[hsl(var(--muted-foreground))] text-sm">
                  Be the first to check in at a local business and start the community feed!
                </p>
              </div>
            ) : (
              feedItems.map((item, index) => {
                const Icon = activityIcons[item.activity_type] || TrendingUp
                const color = activityColors[item.activity_type] || 'bg-gray-500'

                return (
                  <div
                    key={item.id}
                    className="glass-card rounded-2xl p-5 hover:shadow-md transition-shadow duration-200 animate-fade-in-up"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Activity Icon */}
                      <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Title & Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-[hsl(var(--foreground))] leading-snug">
                              {item.title}
                            </p>
                            {item.user_credibility_tier && (
                              <div className="mt-1">
                                <CredibilityBadge tier={item.user_credibility_tier} />
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {timeAgo(item.created_at)}
                          </span>
                        </div>

                        {/* Description */}
                        {item.description && (
                          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 line-clamp-2">
                            {item.description}
                          </p>
                        )}

                        {/* Business tag */}
                        <div className="flex items-center gap-2 mt-3">
                          <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]">
                            {item.business_name}
                          </span>
                          {item.business_category && (
                            <span className="text-xs text-[hsl(var(--muted-foreground))] capitalize">
                              {item.business_category}
                            </span>
                          )}
                        </div>

                        {/* Engagement */}
                        <div className="flex items-center gap-4 mt-3">
                          <button className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[#22c55e] transition-colors">
                            <ThumbsUp className="w-3.5 h-3.5" />
                            {item.likes > 0 && item.likes}
                          </button>
                          <button className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[#22c55e] transition-colors">
                            <MessageCircle className="w-3.5 h-3.5" />
                            {item.comments > 0 && item.comments}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}

            {/* Infinite scroll sentinel */}
            {hasMore && <div ref={sentinelRef} className="h-4" />}
            {loadingMore && (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* My Credibility Card */}
            {isAuthenticated && myCredibility && (
              <div className="glass-card rounded-2xl p-5 animate-fade-in-up">
                <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4 font-sub flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#22c55e]" />
                  Your Credibility
                </h3>

                {/* Score Ring */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative w-16 h-16">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="16" fill="none" className="stroke-[hsl(var(--secondary))]" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="16" fill="none"
                        className="stroke-[#22c55e]"
                        strokeWidth="3"
                        strokeDasharray={`${myCredibility.credibility_score} ${100 - myCredibility.credibility_score}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold text-[hsl(var(--foreground))]">
                        {Math.round(myCredibility.credibility_score)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <CredibilityBadge tier={myCredibility.tier} />
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                      Keep engaging to level up!
                    </p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Check-ins', value: myCredibility.total_checkins, icon: MapPin },
                    { label: 'Reviews', value: myCredibility.total_reviews, icon: Star },
                    { label: 'Verified', value: myCredibility.verified_checkins, icon: CheckCircle2 },
                    { label: 'Confirmations', value: myCredibility.confirmations_received, icon: ChevronUp },
                  ].map(stat => (
                    <div key={stat.label} className="flex items-center gap-2 p-2 rounded-lg bg-[hsl(var(--secondary))]/50">
                      <stat.icon className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                      <div>
                        <p className="text-sm font-bold text-[hsl(var(--foreground))]">{stat.value}</p>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{stat.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How Credibility Works */}
            <div className="glass-card rounded-2xl p-5 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3 font-sub">
                Community Trust Tiers
              </h3>
              <div className="space-y-2.5">
                {(Object.entries(credibilityBadges) as [CredibilityTier, typeof credibilityBadges[CredibilityTier]][]).map(([tier, badge]) => {
                  const Icon = badge.icon
                  return (
                    <div key={tier} className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${badge.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs text-[hsl(var(--foreground))] font-medium">{badge.label}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-3 leading-relaxed">
                Check in at businesses, leave reviews, and confirm others' visits to build your community credibility score.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
