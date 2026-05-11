/**
 * @fileoverview Activity feed page (route `/activity`). Shows a real-time
 * community feed with check-ins, reviews, deals, and user posts.
 * Authenticated users can create posts, like items, and view/add
 * comments. The sidebar displays the user's credibility score and
 * community trust tiers. Implements infinite scroll via
 * IntersectionObserver.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api'
import type { ActivityFeedItem, UserCredibility, CredibilityTier, ActivityComment } from '../types'
import {
  MapPin, Star, Tag, Calendar, Award, TrendingUp,
  ThumbsUp, MessageCircle, Clock, Shield, CheckCircle2,
  ChevronUp, Send, PenLine
} from 'lucide-react'

const activityIcons: Record<string, typeof MapPin> = {
  checkin: MapPin,
  review: Star,
  deal_posted: Tag,
  event_created: Calendar,
  business_claimed: Award,
  milestone: TrendingUp,
  user_post: PenLine,
}

const activityColors: Record<string, string> = {
  checkin: 'bg-info',
  review: 'bg-warning',
  deal_posted: 'bg-brand',
  event_created: 'bg-brand-tertiary',
  business_claimed: 'bg-success',
  milestone: 'bg-warning',
  user_post: 'bg-brand',
}

const credibilityBadges: Record<CredibilityTier, {
  label: string; color: string; abbr: string; bg: string; ringColor: string;
}> = {
  new:         { label: 'Newcomer',    color: 'bg-surface-elevated text-muted',                    abbr: 'N', bg: 'bg-slate-500/20',   ringColor: '#94a3b8' },
  regular:     { label: 'Regular',     color: 'bg-info text-info',                                           abbr: 'R', bg: 'bg-blue-500/20',    ringColor: '#22d3ee' },
  trusted:     { label: 'Trusted',     color: 'bg-success text-success',                              abbr: 'T', bg: 'bg-emerald-500/20', ringColor: '#34d399' },
  local_guide: { label: 'Local Guide', color: 'bg-brand-tertiary text-brand-tertiary',   abbr: 'LG', bg: 'bg-violet-500/20',  ringColor: '#a78bfa' },
  ambassador:  { label: 'Ambassador',  color: 'bg-warning text-warning',                              abbr: 'A', bg: 'bg-amber-500/20',   ringColor: '#fbbf24' },
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
  if (!badge) return null
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-medium ${badge.color}`}>
      <span className="text-[11px] leading-none">{badge.abbr}</span>
      {badge.label}
    </span>
  )
}

export default function ActivityFeedPage() {
  const { isAuthenticated, user } = useAuth()
  const [feedItems, setFeedItems] = useState<ActivityFeedItem[]>([])
  const [myCredibility, setMyCredibility] = useState<UserCredibility | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [likedItems, setLikedItems] = useState<Set<string>>(new Set())
  const [commentsByItem, setCommentsByItem] = useState<Record<string, ActivityComment[]>>({})
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [pendingLikes, setPendingLikes] = useState<Set<string>>(new Set())
  const [pendingComments, setPendingComments] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [postDraft, setPostDraft] = useState('')
  const [postPending, setPostPending] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadFeed = useCallback(async (pageNum: number, append: boolean = false) => {
    try {
      if (pageNum === 1) { setLoading(true); setError(null); }
      else setLoadingMore(true)

      const result = await api.getActivityFeed(pageNum, 15)
      const items = result.items

      setHasMore(result.has_more)
      setFeedItems(prev => append ? [...prev, ...items] : items)
      if (user?.id) {
        const liked = items
          .filter(item => item.liked_by?.includes(user.id))
          .map(item => item.id)
        setLikedItems(prev => {
          const next = new Set(prev)
          if (!append) next.clear()
          liked.forEach(id => next.add(id))
          return next
        })
      }
      setPage(pageNum)
    } catch (err) {
      console.error('Failed to load feed:', err)
      if (pageNum === 1) {
        setError('Unable to load activity feed. The server may be unavailable.')
        setFeedItems([])
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [user])

  useEffect(() => {
    loadFeed(1)
  }, [loadFeed])

  const loadComments = useCallback(async (activityId: string) => {
    try {
      const comments = await api.getActivityComments(activityId)
      setCommentsByItem(prev => ({ ...prev, [activityId]: comments }))
    } catch (err) {
      console.error('Failed to load comments:', err)
      setActionError('Could not load comments right now.')
    }
  }, [])

  const toggleLike = useCallback(async (activityId: string) => {
    if (!isAuthenticated) {
      setActionError('Please sign in to like posts.')
      return
    }
    if (pendingLikes.has(activityId)) return

    setPendingLikes(prev => new Set(prev).add(activityId))
    setActionError(null)
    try {
      const result = await api.toggleActivityLike(activityId)
      setLikedItems(prev => {
        const next = new Set(prev)
        if (result.liked) next.add(activityId)
        else next.delete(activityId)
        return next
      })
      setFeedItems(prev => prev.map(item => (
        item.id === activityId
          ? { ...item, likes: result.likes, comments: result.comments }
          : item
      )))
    } catch (err) {
      console.error('Failed to toggle like:', err)
      setActionError(err instanceof Error ? err.message : 'Could not update like.')
    } finally {
      setPendingLikes(prev => {
        const next = new Set(prev)
        next.delete(activityId)
        return next
      })
    }
  }, [isAuthenticated, pendingLikes])

  const toggleComments = useCallback(async (activityId: string) => {
    const isOpen = expandedComments.has(activityId)
    if (isOpen) {
      setExpandedComments(prev => {
        const next = new Set(prev)
        next.delete(activityId)
        return next
      })
      return
    }

    setExpandedComments(prev => new Set(prev).add(activityId))
    
    await loadComments(activityId)
  }, [expandedComments, loadComments])

  const submitComment = useCallback(async (activityId: string) => {
    const content = (commentDrafts[activityId] || '').trim()
    if (!content) return
    if (!isAuthenticated) {
      setActionError('Please sign in to comment.')
      return
    }
    if (pendingComments.has(activityId)) return

    setPendingComments(prev => new Set(prev).add(activityId))
    setActionError(null)
    try {
      const result = await api.addActivityComment(activityId, content)
      setCommentsByItem(prev => {
        const current = prev[activityId] || []
        return { ...prev, [activityId]: [...current, result.comment] }
      })
      setCommentDrafts(prev => ({ ...prev, [activityId]: '' }))
      setFeedItems(prev => prev.map(item => (
        item.id === activityId
          ? { ...item, comments: result.comments }
          : item
      )))
    } catch (err) {
      console.error('Failed to add comment:', err)
      setActionError(err instanceof Error ? err.message : 'Could not post comment.')
    } finally {
      setPendingComments(prev => {
        const next = new Set(prev)
        next.delete(activityId)
        return next
      })
    }
  }, [commentDrafts, isAuthenticated, pendingComments])

  const submitPost = useCallback(async () => {
    const content = postDraft.trim()
    if (!content || !isAuthenticated || postPending) return
    setPostPending(true)
    setActionError(null)
    try {
      const newItem = await api.createPost(content)
      setFeedItems(prev => [newItem, ...prev])
      if (user?.id && newItem.liked_by?.includes(user.id)) {
        setLikedItems(prev => new Set(prev).add(newItem.id))
      }
      setPostDraft('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not create post.')
    } finally {
      setPostPending(false)
    }
  }, [postDraft, isAuthenticated, postPending, user])

  useEffect(() => {
    if (isAuthenticated) {
      api.getMyCredibility().then(setMyCredibility).catch(() => {})
    }
  }, [isAuthenticated])

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
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 animate-fade-in-up">
          <div>
            <h1 className="text-heading font-bold text-[hsl(var(--foreground))] font-heading">
              Local <span className="gradient-text">Activity</span>
            </h1>
            <p className="text-[hsl(var(--muted-foreground))] mt-1">
              Real-time activity from your local community
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full card-surface">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-ui font-medium text-[hsl(var(--foreground))]">Live Feed</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {isAuthenticated && (
              <div className="card-surface rounded-2xl p-4 animate-fade-in-up">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
                    <PenLine className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <textarea
                      value={postDraft}
                      onChange={(e) => setPostDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault()
                          submitPost()
                        }
                      }}
                      placeholder="Share something with your community..."
                      disabled={postPending}
                      maxLength={500}
                      rows={2}
                      className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] resize-none disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                        {postDraft.length}/500 · Ctrl+Enter to post
                      </span>
                      <button
                        onClick={submitPost}
                        disabled={postPending || !postDraft.trim()}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg gradient-primary text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {postPending ? 'Posting…' : 'Post'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {actionError && (
              <div className="card-surface rounded-2xl p-3 border border-red-300/40 bg-red-500/5">
                <p className="text-caption text-red-600">{actionError}</p>
              </div>
            )}
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card-surface rounded-2xl p-5 animate-pulse">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[hsl(var(--secondary))]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-[hsl(var(--secondary))] rounded w-3/4" />
                      <div className="h-3 bg-[hsl(var(--secondary))] rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))
            ) : error ? (
              <div className="card-surface rounded-2xl p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-2 font-heading">Something went wrong</h3>
                <p className="text-[hsl(var(--muted-foreground))] text-sm mb-4">
                  {error}
                </p>
                <button
                  onClick={() => loadFeed(1)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-white font-medium text-sm shadow-lg shadow-brand/25"
                >
                  Try Again
                </button>
              </div>
            ) : feedItems.length === 0 ? (
              <div className="card-surface rounded-2xl p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--secondary))] flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
                </div>
                <h3 className="text-body font-semibold text-[hsl(var(--foreground))] mb-2 font-heading">No activity yet</h3>
                <p className="text-[hsl(var(--muted-foreground))] text-ui">
                  Be the first to check in at a local business and start the community feed!
                </p>
              </div>
            ) : (
              feedItems.map((item, index) => {
                const Icon = activityIcons[item.activity_type] || TrendingUp
                const color = activityColors[item.activity_type] || 'bg-surface-elevated'
                const isLiked = likedItems.has(item.id)
                const isCommentsOpen = expandedComments.has(item.id)
                const itemComments = commentsByItem[item.id] || item.comments_list || []
                const isLikePending = pendingLikes.has(item.id)
                const isCommentPending = pendingComments.has(item.id)

                return (
                  <div
                    key={item.id}
                    className="card-surface rounded-2xl p-5 hover:shadow-md transition-shadow duration-200 animate-fade-in-up"
                    style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-5 h-5 text-brand-on-primary" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-ui font-medium text-[hsl(var(--foreground))] leading-snug">
                              {item.title}
                            </p>
                            {item.user_credibility_tier && (
                              <div className="mt-1">
                                <CredibilityBadge tier={item.user_credibility_tier} />
                              </div>
                            )}
                          </div>
                          <span className="text-caption text-[hsl(var(--muted-foreground))] whitespace-nowrap flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {timeAgo(item.created_at)}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-ui text-[hsl(var(--muted-foreground))] mt-2 line-clamp-2">
                            {item.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-3">
                          <span className="text-caption font-medium px-2.5 py-1 rounded-lg bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]">
                            {item.business_name}
                          </span>
                          {item.business_category && (
                            <span className="text-caption text-[hsl(var(--muted-foreground))] capitalize">
                              {item.business_category}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-3">
                          <button
                            onClick={() => toggleLike(item.id)}
                            disabled={isLikePending}
                            className={`flex items-center gap-1.5 text-caption transition-colors ${isLiked ? 'text-brand font-medium' : 'text-[hsl(var(--muted-foreground))] hover:text-brand'} ${isLikePending ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={isLiked ? 'Unlike' : 'Like'}
                          >
                            <ThumbsUp className={`w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}`} />
                            <span>{item.likes > 0 ? item.likes : (isLiked ? 1 : 'Like')}</span>
                          </button>
                          <button
                            onClick={() => toggleComments(item.id)}
                            className={`flex items-center gap-1.5 text-caption transition-colors ${isCommentsOpen ? 'text-brand' : 'text-[hsl(var(--muted-foreground))] hover:text-brand'}`}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>{item.comments > 0 ? item.comments : 'Comment'}</span>
                          </button>
                        </div>

                        {isCommentsOpen && (
                          <div className="mt-3 pt-3 border-t border-[hsl(var(--border))] space-y-2.5">
                            {itemComments.length === 0 ? (
                              <p className="text-caption text-[hsl(var(--muted-foreground))]">No comments yet.</p>
                            ) : (
                              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                {itemComments.map((comment) => (
                                  <div key={comment.id} className="rounded-lg bg-[hsl(var(--secondary))]/50 px-2.5 py-2">
                                    <div className="flex items-start gap-2">
                                      <div className="w-6 h-6 rounded-full flex-shrink-0 overflow-hidden">
                                        {comment.profile_picture ? (
                                          <img 
                                            src={comment.profile_picture} 
                                            alt={comment.user_name || 'User'}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-full gradient-primary flex items-center justify-center text-[10px] font-bold text-on-primary">
                                            {(comment.user_name || 'A')[0].toUpperCase()}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-caption font-medium text-[hsl(var(--foreground))]">{comment.user_name || 'Anonymous'}</p>
                                        <p className="text-ui text-[hsl(var(--muted-foreground))] break-words">{comment.content}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={commentDrafts[item.id] || ''}
                                onChange={(e) => setCommentDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    submitComment(item.id)
                                  }
                                }}
                                placeholder={isAuthenticated ? 'Write a comment...' : 'Sign in to comment'}
                                disabled={!isAuthenticated || isCommentPending}
                                maxLength={500}
                                className="flex-1 h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] disabled:opacity-60"
                              />
                              <button
                                onClick={() => submitComment(item.id)}
                                disabled={!isAuthenticated || isCommentPending || !(commentDrafts[item.id] || '').trim()}
                                className="h-9 w-9 rounded-lg bg-brand text-brand-on-primary flex items-center justify-center disabled:opacity-50"
                                aria-label="Post comment"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
            {hasMore && <div ref={sentinelRef} className="h-4" />}
            {loadingMore && (
              <div className="flex justify-center py-4">
                <div className="loading-spinner loading-spinner--sm" aria-label="Loading more activity" />
              </div>
            )}
          </div>
          <div className="space-y-6">
            {isAuthenticated && myCredibility && (() => {
              const currentBadge = credibilityBadges[myCredibility.tier]
              const score = Math.round(myCredibility.credibility_score)
              // r=44, circumference ≈ 276.46
              const filled = (score / 100) * 276.46
              const gap = 276.46 - filled
              return (
                <div className="card-surface rounded-2xl overflow-hidden animate-fade-in-up">
                  <div className="relative p-5 pb-4">
                    <h3 className="relative text-ui font-semibold text-[hsl(var(--foreground))] mb-5 font-sub flex items-center gap-2">
                      <Shield className="w-4 h-4 text-brand" />
                      Your Credibility
                    </h3>

                    {/* Score ring – centered */}
                    <div className="flex flex-col items-center mb-5">
                      <div className="relative w-32 h-32">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                          {/* Track */}
                          <circle cx="50" cy="50" r="44" fill="none"
                            stroke="hsl(var(--secondary))" strokeWidth="7" />
                          {/* Score arc */}
                          <circle cx="50" cy="50" r="44" fill="none"
                            stroke={currentBadge.ringColor}
                            strokeWidth="7"
                            strokeLinecap="round"
                            strokeDasharray={`${filled} ${gap}`}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-bold text-[hsl(var(--foreground))] leading-none">{score}</span>
                          <span className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-widest mt-0.5">pts</span>
                        </div>
                      </div>

                      {/* Badge + subtitle */}
                      <div className="mt-3 flex flex-col items-center gap-1">
                        <CredibilityBadge tier={myCredibility.tier} />
                        <p className="text-caption text-[hsl(var(--muted-foreground))]">Keep engaging to level up!</p>
                      </div>
                    </div>
                  </div>

                  {/* Stat grid */}
                  <div className="px-5 pb-5 grid grid-cols-2 gap-2.5">
                    {[
                      { label: 'Check-ins',     value: myCredibility.total_checkins,          icon: MapPin,       color: 'text-sky-400',      bg: 'bg-sky-400/10'     },
                      { label: 'Reviews',        value: myCredibility.total_reviews,           icon: Star,         color: 'text-amber-400',    bg: 'bg-amber-400/10'   },
                      { label: 'Verified',       value: myCredibility.verified_checkins,       icon: CheckCircle2, color: 'text-emerald-400',  bg: 'bg-emerald-400/10' },
                      { label: 'Confirms',       value: myCredibility.confirmations_received,  icon: ChevronUp,    color: 'text-violet-400',   bg: 'bg-violet-400/10'  },
                    ].map(stat => (
                      <div key={stat.label}
                        className="flex items-center gap-2.5 p-3 rounded-xl bg-[hsl(var(--secondary))]/40 border border-[hsl(var(--border))]/50">
                        <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                          <stat.icon className={`w-4 h-4 ${stat.color}`} />
                        </div>
                        <div>
                          <p className="text-body font-bold text-[hsl(var(--foreground))]">{stat.value}</p>
                          <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-tight">{stat.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
            <div className="card-surface rounded-2xl p-5 animate-fade-in-up motion-delay-100">
              <h3 className="text-ui font-semibold text-[hsl(var(--foreground))] mb-4 font-sub">
                Community Trust Tiers
              </h3>
              <div className="space-y-1">
                {(Object.entries(credibilityBadges) as [CredibilityTier, typeof credibilityBadges[CredibilityTier]][]).map(([tier, badge]) => {
                  const isCurrentTier = myCredibility?.tier === tier
                  return (
                    <div key={tier} className="relative">
                      <div className={`flex items-center gap-3 px-2 py-2 rounded-xl transition-all duration-200 ${
                        isCurrentTier
                          ? 'bg-[hsl(var(--secondary))]/70 ring-1 ring-brand/25'
                          : 'hover:bg-[hsl(var(--secondary))]/30'
                      }`}>
                        {/* Current-tier dot */}
                        {isCurrentTier && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                        )}
                        {!isCurrentTier && <span className="w-2 h-2 flex-shrink-0" />}

                        <span className={`flex-1 text-caption font-semibold ${
                          isCurrentTier ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'
                        }`}>
                          {badge.label}
                        </span>

                        {isCurrentTier && (
                          <span className="text-[10px] font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded-full">
                            You
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
