import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  User, Mail, Calendar, LogOut, Save, X, ArrowLeft,
  ImageIcon, FileText, Moon, Sun, Lock, Palette, Star,
  Shield, Eye, EyeOff, Check,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { api } from '../api'
import { PreferenceOnboardingModal } from '@/components/preferences/PreferenceOnboardingModal'
import type { UserUpdate } from '@/types'

type SettingsTab = 'profile' | 'appearance' | 'preferences' | 'security'

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'preferences', label: 'Discovery', icon: Star },
  { id: 'security', label: 'Security', icon: Lock },
]

function buildProfileUpdates(
  user: ReturnType<typeof useAuth>['user'],
  name: string,
  profilePicture: string,
  aboutMe: string
): UserUpdate {
  const updates: UserUpdate = {}
  if (name !== user?.name) updates.name = name
  if (profilePicture !== (user?.profile_picture ?? '')) updates.profile_picture = profilePicture
  if (aboutMe !== (user?.about_me ?? '')) updates.about_me = aboutMe
  return updates
}

export default function SettingsPage() {
  const { user, isAuthenticated, signOut, setUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')

  // Profile
  const [name, setName] = useState(() => user?.name || '')
  const [profilePicture, setProfilePicture] = useState(() => user?.profile_picture || '')
  const [aboutMe, setAboutMe] = useState(() => user?.about_me || '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState(false)

  // Security
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  // Preferences modal
  const [showPreferenceEditor, setShowPreferenceEditor] = useState(false)

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="glass-card rounded-2xl p-10 max-w-md w-full text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand/20">
            <User className="w-8 h-8 text-brand-on-primary" />
          </div>
          <h2 className="text-subheading font-bold text-[hsl(var(--foreground))] mb-2 font-heading">
            Sign in <span className="font-serif">required</span>
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] mb-6">
            Please sign in to access your settings
          </p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl gradient-primary text-on-primary font-medium shadow-lg shadow-brand/20"
          >
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  const isGoogleUser = user.auth_provider === 'google' || !!user.google_id

  const handleSaveProfile = async () => {
    setProfileError('')
    setProfileSuccess(false)
    setProfileSaving(true)
    try {
      const updates = buildProfileUpdates(user, name, profilePicture, aboutMe)
      if (Object.keys(updates).length === 0) {
        setProfileSuccess(true)
        return
      }
      const updatedUser = await api.updateMyProfile(updates)
      setUser(updatedUser)
      setProfileSuccess(true)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleResetProfile = () => {
    setName(user.name || '')
    setProfilePicture(user.profile_picture || '')
    setAboutMe(user.about_me || '')
    setProfileError('')
    setProfileSuccess(false)
  }

  const handleChangePassword = async () => {
    setPasswordError('')
    setPasswordSuccess('')
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters')
      return
    }
    setPasswordSaving(true)
    try {
      await api.changePassword(currentPassword, newPassword)
      setPasswordSuccess('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setPasswordSaving(false)
    }
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

  const preferenceSummary = [
    ...(user.preferred_categories || []).slice(0, 3),
    ...(user.preferred_vibes || []).slice(0, 2),
  ].slice(0, 5)

  return (
    <div className="min-h-[60vh] py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <Link
          to="/businesses"
          className="inline-flex items-center gap-1 text-ui text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Explore
        </Link>

        <div className="mb-6">
          <h1 className="text-heading font-bold text-[hsl(var(--foreground))] font-heading">Settings</h1>
          <p className="text-ui text-[hsl(var(--muted-foreground))] mt-1">
            Manage your account, appearance, and preferences
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 animate-fade-in-up">
          {/* Sidebar */}
          <aside className="md:w-52 flex-shrink-0">
            {/* User summary */}
            <div className="glass-card rounded-2xl p-4 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden shadow-md shadow-brand/20">
                {user.profile_picture ? (
                  <img src={user.profile_picture} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full gradient-primary flex items-center justify-center font-bold text-on-primary">
                    {(user.name || user.email)[0].toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ui text-[hsl(var(--foreground))] truncate">{user.name}</p>
                <p className="text-caption text-[hsl(var(--muted-foreground))] truncate">{roleLabels[user.role] || user.role}</p>
              </div>
            </div>

            {/* Tab nav */}
            <nav className="glass-card rounded-2xl overflow-hidden">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 text-left text-ui font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                        : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {tab.label}
                  </button>
                )
              })}
              <div className="border-t border-[hsl(var(--border))] p-2">
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-ui font-medium text-error hover:bg-error/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </nav>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Mobile tab strip */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1 md:hidden">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-caption font-medium whitespace-nowrap transition-colors ${
                      activeTab === tab.id
                        ? 'gradient-primary text-on-primary shadow-sm'
                        : 'glass-card text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Profile tab */}
            {activeTab === 'profile' && (
              <div className="glass-card rounded-2xl p-6 space-y-5">
                <div>
                  <h2 className="font-semibold text-[hsl(var(--foreground))] mb-1">Profile Information</h2>
                  <p className="text-caption text-[hsl(var(--muted-foreground))]">Update your public name, photo, and bio</p>
                </div>

                {profileError && (
                  <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-ui">
                    {profileError}
                  </div>
                )}
                {profileSuccess && (
                  <div className="p-3 rounded-lg bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] text-ui flex items-center gap-2">
                    <Check className="w-4 h-4" /> Profile saved
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="text-ui font-medium text-[hsl(var(--foreground))] mb-1.5 block">Display Name</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => { setName(e.target.value); setProfileSuccess(false) }}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-ui focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 focus:border-[hsl(var(--primary))]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-ui font-medium text-[hsl(var(--foreground))] mb-1.5 block">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                      <input
                        type="email"
                        value={user.email}
                        disabled
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-ui opacity-60 cursor-not-allowed"
                      />
                    </div>
                    <p className="text-caption text-[hsl(var(--muted-foreground))] mt-1">Email cannot be changed</p>
                  </div>

                  <div>
                    <label className="text-ui font-medium text-[hsl(var(--foreground))] mb-1.5 block">Profile Picture URL</label>
                    <div className="relative">
                      <ImageIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                      <input
                        type="url"
                        value={profilePicture}
                        onChange={(e) => { setProfilePicture(e.target.value); setProfileSuccess(false) }}
                        placeholder="https://example.com/photo.jpg"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-ui focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 focus:border-[hsl(var(--primary))]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-ui font-medium text-[hsl(var(--foreground))] mb-1.5 block">About Me</label>
                    <div className="relative">
                      <FileText className="absolute left-3.5 top-3 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                      <textarea
                        value={aboutMe}
                        onChange={(e) => { setAboutMe(e.target.value); setProfileSuccess(false) }}
                        placeholder="Tell others about yourself..."
                        maxLength={500}
                        rows={4}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-ui focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 focus:border-[hsl(var(--primary))] resize-none"
                      />
                    </div>
                    <p className="text-caption text-[hsl(var(--muted-foreground))] mt-1">{aboutMe.length}/500</p>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <button
                    onClick={handleResetProfile}
                    disabled={profileSaving}
                    className="px-4 py-2.5 rounded-xl text-ui font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
                  >
                    <X className="w-4 h-4 inline mr-1" />
                    Reset
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                    className="px-5 py-2.5 rounded-xl text-ui font-medium gradient-primary text-on-primary flex items-center gap-2 shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    {profileSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>

                {/* Account info strip */}
                <div className="border-t border-[hsl(var(--border))] pt-4 flex flex-wrap gap-4">
                  <div className="flex items-center gap-1.5 text-caption text-[hsl(var(--muted-foreground))]">
                    <Shield className="w-3.5 h-3.5" />
                    {roleLabels[user.role] || user.role}
                  </div>
                  {user.created_at && (
                    <div className="flex items-center gap-1.5 text-caption text-[hsl(var(--muted-foreground))]">
                      <Calendar className="w-3.5 h-3.5" />
                      Joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                  )}
                  {isGoogleUser && (
                    <div className="flex items-center gap-1.5 text-caption text-[hsl(var(--muted-foreground))]">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748z" />
                      </svg>
                      Google account
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Appearance tab */}
            {activeTab === 'appearance' && (
              <div className="glass-card rounded-2xl p-6 space-y-5">
                <div>
                  <h2 className="font-semibold text-[hsl(var(--foreground))] mb-1">Appearance</h2>
                  <p className="text-caption text-[hsl(var(--muted-foreground))]">Choose how Vantage looks for you</p>
                </div>

                <div className="space-y-3">
                  <p className="text-ui font-medium text-[hsl(var(--foreground))]">Theme</p>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { value: 'light', label: 'Light', Icon: Sun },
                      { value: 'dark', label: 'Dark', Icon: Moon },
                    ] as const).map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        onClick={() => setTheme(value)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          theme === value
                            ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                            : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/40 hover:bg-[hsl(var(--secondary))]'
                        }`}
                      >
                        <Icon
                          className={`w-5 h-5 ${theme === value ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}
                        />
                        <span className={`text-caption font-medium ${theme === value ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                          {label}
                        </span>
                        {theme === value && (
                          <Check className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="text-caption text-[hsl(var(--muted-foreground))]">
                    Your preference is saved automatically and will be remembered next time.
                  </p>
                </div>
              </div>
            )}

            {/* Preferences tab */}
            {activeTab === 'preferences' && (
              <div className="glass-card rounded-2xl p-6 space-y-5">
                <div>
                  <h2 className="font-semibold text-[hsl(var(--foreground))] mb-1">Discovery Preferences</h2>
                  <p className="text-caption text-[hsl(var(--muted-foreground))]">
                    Tune your For You lane. Trust-first ranking still decides the final order.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {preferenceSummary.length > 0 ? (
                      preferenceSummary.map((item) => (
                        <span
                          key={item}
                          className="px-3 py-1 rounded-full text-caption border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
                        >
                          {item}
                        </span>
                      ))
                    ) : (
                      <p className="text-caption text-[hsl(var(--muted-foreground))]">No preferences saved yet</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1 text-caption text-[hsl(var(--muted-foreground))]">
                    {user.price_pref && (
                      <div className="flex items-center gap-2 p-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]">
                        <span className="font-semibold text-[hsl(var(--foreground))]">{user.price_pref}</span>
                        <span>Price preference</span>
                      </div>
                    )}
                    {user.discovery_mode && (
                      <div className="flex items-center gap-2 p-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]">
                        <Star className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                        <span className="capitalize">{user.discovery_mode.replace('_', ' ')}</span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setShowPreferenceEditor(true)}
                  className="px-5 py-2.5 rounded-xl text-ui font-medium gradient-primary text-on-primary shadow-lg shadow-brand/20"
                >
                  Edit Preferences
                </button>
              </div>
            )}

            {/* Security tab */}
            {activeTab === 'security' && (
              <div className="glass-card rounded-2xl p-6 space-y-5">
                <div>
                  <h2 className="font-semibold text-[hsl(var(--foreground))] mb-1">Security</h2>
                  <p className="text-caption text-[hsl(var(--muted-foreground))]">Manage your password and account security</p>
                </div>

                {isGoogleUser ? (
                  <div className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] flex items-start gap-3">
                    <Shield className="w-5 h-5 text-[hsl(var(--muted-foreground))] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-ui font-medium text-[hsl(var(--foreground))]">Google account</p>
                      <p className="text-caption text-[hsl(var(--muted-foreground))] mt-0.5">
                        Your account is secured through Google. Password management is handled by Google.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-ui font-medium text-[hsl(var(--foreground))]">Change Password</p>

                    {passwordError && (
                      <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-ui">
                        {passwordError}
                      </div>
                    )}
                    {passwordSuccess && (
                      <div className="p-3 rounded-lg bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] text-ui flex items-center gap-2">
                        <Check className="w-4 h-4" /> {passwordSuccess}
                      </div>
                    )}

                    <div>
                      <label className="text-ui font-medium text-[hsl(var(--foreground))] mb-1.5 block">Current Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                        <input
                          type={showCurrentPw ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); setPasswordSuccess('') }}
                          className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-ui focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 focus:border-[hsl(var(--primary))]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPw((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                        >
                          {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-ui font-medium text-[hsl(var(--foreground))] mb-1.5 block">New Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                        <input
                          type={showNewPw ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); setPasswordSuccess('') }}
                          className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-ui focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 focus:border-[hsl(var(--primary))]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPw((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                        >
                          {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-caption text-[hsl(var(--muted-foreground))] mt-1">Minimum 6 characters</p>
                    </div>

                    <div>
                      <label className="text-ui font-medium text-[hsl(var(--foreground))] mb-1.5 block">Confirm New Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); setPasswordSuccess('') }}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-ui focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 focus:border-[hsl(var(--primary))]"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleChangePassword}
                        disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                        className="px-5 py-2.5 rounded-xl text-ui font-medium gradient-primary text-on-primary flex items-center gap-2 shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save className="w-4 h-4" />
                        {passwordSaving ? 'Updating…' : 'Update Password'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <PreferenceOnboardingModal
        open={showPreferenceEditor}
        user={user}
        title="Edit your discovery preferences"
        subtitle="Adjust category, vibe, and discovery style preferences whenever your taste changes."
        allowSkip={false}
        onClose={() => setShowPreferenceEditor(false)}
        onSaved={(updatedUser) => {
          setUser(updatedUser)
          setShowPreferenceEditor(false)
        }}
      />
    </div>
  )
}
