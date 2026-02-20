import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import { User, Mail, Shield, Calendar, LogOut, Edit3, Save, X, ArrowLeft, Store, Heart } from 'lucide-react'

export default function AccountPage() {
  const { user, isAuthenticated, signOut } = useAuth()
  const navigate = useNavigate()
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(() => user?.name || '')
  const [email, setEmail] = useState(() => user?.email || '')

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="glass-card rounded-2xl p-10 max-w-md w-full text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#22c55e]/20">
            <User className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-2 font-heading">Sign in <span className="font-serif">required</span></h2>
          <p className="text-[hsl(var(--muted-foreground))] mb-6">Please sign in to access your account settings</p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl gradient-primary text-white font-medium shadow-lg shadow-[#22c55e]/20"
          >
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
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
        <Link to="/businesses" className="inline-flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Explore
        </Link>

        <div className="animate-fade-in-up">
          {/* Profile Header */}
          <div className="glass-card rounded-2xl p-8 mb-6">
            <div className="flex items-start gap-5">
              {/* Avatar */}
              <div className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center text-3xl font-bold text-white shadow-lg shadow-[#22c55e]/20 flex-shrink-0">
                {(user.name || user.email)[0].toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-[hsl(var(--foreground))] font-heading">{user.name}</h1>
                <p className="text-[hsl(var(--muted-foreground))]">{user.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                    <RoleIcon className="w-3 h-3" />
                    {roleLabels[user.role] || user.role}
                  </span>
                  {user.created_at && (
                    <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                      <Calendar className="w-3 h-3" />
                      Joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setIsEditing(!isEditing)}
                className="w-10 h-10 rounded-xl flex items-center justify-center border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
              >
                {isEditing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Edit Form */}
          {isEditing && (
            <div className="glass-card rounded-2xl p-6 mb-6 animate-fade-in">
              <h3 className="font-semibold text-[hsl(var(--foreground))] mb-4">Edit Profile</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-[hsl(var(--foreground))] mb-1.5 block">Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 focus:border-[hsl(var(--primary))]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-[hsl(var(--foreground))] mb-1.5 block">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 focus:border-[hsl(var(--primary))]"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={() => setIsEditing(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] transition-colors">
                    Cancel
                  </button>
                  <button className="px-5 py-2.5 rounded-xl text-sm font-medium gradient-primary text-white flex items-center gap-2 shadow-lg shadow-[#22c55e]/20">
                    <Save className="w-4 h-4" />
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div className="glass-card rounded-2xl p-6 mb-6">
            <h3 className="font-semibold text-[hsl(var(--foreground))] mb-4">Quick Links</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link to="/businesses" className="flex items-center gap-3 p-4 rounded-xl border border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))] transition-colors">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Store className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-sm text-[hsl(var(--foreground))]">Explore Businesses</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Discover local gems</p>
                </div>
              </Link>
              <Link to="/businesses" className="flex items-center gap-3 p-4 rounded-xl border border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))] transition-colors">
                <div className="w-10 h-10 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                  <Heart className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <p className="font-medium text-sm text-[hsl(var(--foreground))]">My Favorites</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Your saved businesses</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="font-semibold text-[hsl(var(--foreground))] mb-4">Session</h3>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors font-medium text-sm"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
