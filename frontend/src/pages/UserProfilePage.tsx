import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { User, Shield, Calendar, ArrowLeft, Store } from 'lucide-react'
import { api } from '../api'
import type { User as UserType } from '../types'

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const [user, setUser] = useState<UserType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!userId) {
        setError('User ID is required')
        setLoading(false)
        return
      }

      try {
        const userData = await api.getUserProfile(userId)
        setUser(userData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load user profile')
      } finally {
        setLoading(false)
      }
    }

    fetchUserProfile()
  }, [userId])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[hsl(var(--muted-foreground))]">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="glass-card rounded-2xl p-10 max-w-md w-full text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl bg-error/10 flex items-center justify-center mx-auto mb-6">
            <User className="w-8 h-8 text-error" />
          </div>
          <h2 className="text-subheading font-bold text-[hsl(var(--foreground))] mb-2 font-heading">Profile not found</h2>
          <p className="text-[hsl(var(--muted-foreground))] mb-6">{error || 'This user profile could not be found'}</p>
          <Link
            to="/businesses"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl gradient-primary text-on-primary font-medium shadow-lg shadow-brand/20"
          >
            Back to Explore
          </Link>
        </div>
      </div>
    )
  }

  const roleLabels: Record<string, string> = {
    customer: 'Customer',
    business_owner: 'Business Owner',
    admin: 'Administrator',
  }
  const roleIcons: Record<string, typeof User> = {
    customer: User,
    business_owner: Store,
    admin: Shield,
  }
  const RoleIcon = roleIcons[user.role] || User

  return (
    <div className="min-h-[60vh] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Back */}
        <Link to="/businesses" className="inline-flex items-center gap-1 text-ui text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Explore
        </Link>

        <div className="animate-fade-in-up">
          {/* Profile Header */}
          <div className="glass-card rounded-2xl p-8 mb-6">
            <div className="flex items-start gap-5">
              {/* Avatar */}
              <div className="w-24 h-24 rounded-2xl flex-shrink-0 overflow-hidden shadow-lg shadow-brand/20">
                {user.profile_picture ? (
                  <img 
                    src={user.profile_picture} 
                    alt={user.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full gradient-primary flex items-center justify-center text-heading-xl font-bold text-on-primary">
                    {(user.name || user.email)[0].toUpperCase()}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h1 className="text-heading font-bold text-[hsl(var(--foreground))] font-heading">{user.name}</h1>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-medium bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                    <RoleIcon className="w-3 h-3" />
                    {roleLabels[user.role] || user.role}
                  </span>
                  {user.created_at && (
                    <span className="inline-flex items-center gap-1 text-caption text-[hsl(var(--muted-foreground))]">
                      <Calendar className="w-3 h-3" />
                      Joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* About Section */}
          {user.about_me && (
            <div className="glass-card rounded-2xl p-6 mb-6">
              <h3 className="font-semibold text-[hsl(var(--foreground))] mb-3">About</h3>
              <p className="text-ui text-[hsl(var(--foreground))] leading-relaxed whitespace-pre-wrap">
                {user.about_me}
              </p>
            </div>
          )}

          {/* Additional Info */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="font-semibold text-[hsl(var(--foreground))] mb-4">Member Information</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-[hsl(var(--border))]">
                <span className="text-ui text-[hsl(var(--muted-foreground))]">Account Type</span>
                <span className="text-ui font-medium text-[hsl(var(--foreground))]">{roleLabels[user.role] || user.role}</span>
              </div>
              {user.created_at && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-ui text-[hsl(var(--muted-foreground))]">Member Since</span>
                  <span className="text-ui font-medium text-[hsl(var(--foreground))]">
                    {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
