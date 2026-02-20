import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../api'
import type { Business } from '../types'
import {
  Store, Search, CheckCircle2, AlertCircle, ArrowRight,
  MapPin, Shield, FileText, Phone, Mail, User
} from 'lucide-react'

export default function ClaimBusinessPage() {
  const { user, isAuthenticated } = useAuth()
  const [searchParams] = useSearchParams()
  const preselectedId = searchParams.get('business')

  const [step, setStep] = useState<'search' | 'claim' | 'success'>(preselectedId ? 'claim' : 'search')
  const [searchQuery, setSearchQuery] = useState('')
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedBiz, setSelectedBiz] = useState<Business | null>(null)

  // Claim form
  const [ownerName, setOwnerName] = useState(() => user?.name || '')
  const [ownerRole, setOwnerRole] = useState('owner')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [ownerEmail, setOwnerEmail] = useState(() => user?.email || '')
  const [proofDescription, setProofDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Load preselected business
  useEffect(() => {
    if (preselectedId) {
      api.getBusiness(preselectedId).then(biz => {
        setSelectedBiz(biz)
        setStep('claim')
      }).catch(() => setStep('search'))
    }
  }, [preselectedId])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const results = await api.getBusinesses(undefined, undefined, searchQuery)
      // Show seed (unclaimed) businesses first
      const sorted = results.sort((a, b) => {
        if (a.is_claimed && !b.is_claimed) return 1
        if (!a.is_claimed && b.is_claimed) return -1
        return 0
      })
      setBusinesses(sorted)
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setSearching(false)
    }
  }

  const handleSelectBusiness = (biz: Business) => {
    setSelectedBiz(biz)
    setStep('claim')
    setError('')
  }

  const handleSubmitClaim = async () => {
    if (!selectedBiz) return
    setError('')

    if (!ownerName.trim()) {
      setError('Please enter your name')
      return
    }

    setSubmitting(true)
    try {
      await api.submitClaim({
        business_id: selectedBiz.id || selectedBiz._id || '',
        owner_name: ownerName,
        owner_role: ownerRole,
        owner_phone: ownerPhone || undefined,
        owner_email: ownerEmail || undefined,
        proof_description: proofDescription || undefined,
      })
      setStep('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit claim')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="glass-card rounded-2xl p-10 max-w-md w-full text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#22c55e]/20">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-2 font-heading">
            Claim Your <span className="font-serif">Business</span>
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] mb-6">
            Sign up as a business owner to claim your listing and unlock premium features.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl gradient-primary text-white font-medium shadow-lg shadow-[#22c55e]/20"
          >
            Sign Up as Business Owner
          </Link>
        </div>
      </div>
    )
  }

  if (user?.role !== 'business_owner') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="glass-card rounded-2xl p-10 max-w-md w-full text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-2 font-heading">
            Business Owner <span className="font-serif">Only</span>
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] mb-6">
            Only business owner accounts can claim listings. 
            Create a new account with the Business Owner role to proceed.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl gradient-primary text-white font-medium shadow-lg shadow-[#22c55e]/20"
          >
            Create Business Account
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-10 animate-fade-in-up">
          {['Find', 'Verify', 'Done'].map((label, i) => {
            const stepIndex = step === 'search' ? 0 : step === 'claim' ? 1 : 2
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  i <= stepIndex
                    ? 'gradient-primary text-white shadow-md shadow-[#22c55e]/25'
                    : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
                }`}>
                  {i < stepIndex ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-sm font-medium ${
                  i <= stepIndex ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'
                }`}>
                  {label}
                </span>
                {i < 2 && (
                  <div className={`w-16 h-0.5 ${
                    i < stepIndex ? 'bg-[#22c55e]' : 'bg-[hsl(var(--secondary))]'
                  }`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Step 1: Search */}
        {step === 'search' && (
          <div className="animate-fade-in-up">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] font-heading">
                Find Your <span className="gradient-text font-serif">Business</span>
              </h1>
              <p className="text-[hsl(var(--muted-foreground))] mt-2">
                Search our directory to find and claim your business listing
              </p>
            </div>

            {/* Search Bar */}
            <div className="flex gap-2 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search by business name..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[#22c55e]/30"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searching}
                className="px-6 py-3 rounded-xl gradient-primary text-white font-medium text-sm shadow-lg shadow-[#22c55e]/25"
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {/* Results */}
            <div className="space-y-3">
              {businesses.map(biz => (
                <div
                  key={biz.id || biz._id}
                  className="glass-card rounded-xl p-4 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => !biz.is_claimed && handleSelectBusiness(biz)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#4ade80] to-[#22c55e] flex items-center justify-center">
                      <span className="text-lg font-bold text-white">{biz.name[0]}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{biz.name}</h3>
                        {biz.is_claimed && (
                          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-3 h-3" />
                            Claimed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-[hsl(var(--muted-foreground))] capitalize">{biz.category}</span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {biz.address}
                        </span>
                      </div>
                    </div>
                  </div>

                  {!biz.is_claimed ? (
                    <button className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-medium gradient-primary text-white shadow-md shadow-[#22c55e]/20">
                      Claim
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  ) : (
                    <span className="text-xs text-[hsl(var(--muted-foreground))] px-3 py-1.5 rounded-lg bg-[hsl(var(--secondary))]">
                      Already claimed
                    </span>
                  )}
                </div>
              ))}

              {businesses.length === 0 && searchQuery && !searching && (
                <div className="text-center py-10">
                  <p className="text-[hsl(var(--muted-foreground))]">No businesses found. Try a different search.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Claim Form */}
        {step === 'claim' && selectedBiz && (
          <div className="animate-fade-in-up">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] font-heading">
                Verify <span className="gradient-text font-serif">Ownership</span>
              </h1>
              <p className="text-[hsl(var(--muted-foreground))] mt-2">
                Tell us about your connection to this business
              </p>
            </div>

            {/* Selected Business Card */}
            <div className="glass-card rounded-xl p-4 mb-6 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#052e16] to-[#22c55e] flex items-center justify-center">
                <Store className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{selectedBiz.name}</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{selectedBiz.address}</p>
              </div>
              <button
                onClick={() => { setStep('search'); setSelectedBiz(null) }}
                className="ml-auto text-xs text-[#22c55e] hover:underline"
              >
                Change
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Form */}
            <div className="glass-card rounded-2xl p-6 space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  <User className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  Your Name *
                </label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[#22c55e]/30"
                  placeholder="Full name"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  <Shield className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  Your Role
                </label>
                <select
                  value={ownerRole}
                  onChange={(e) => setOwnerRole(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] text-sm"
                >
                  <option value="owner">Owner</option>
                  <option value="manager">Manager</option>
                  <option value="employee">Employee</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                    <Phone className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[#22c55e]/30"
                    placeholder="Business phone"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                    <Mail className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                    Email
                  </label>
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[#22c55e]/30"
                    placeholder="Business email"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  <FileText className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  How can you prove ownership?
                </label>
                <textarea
                  value={proofDescription}
                  onChange={(e) => setProofDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[#22c55e]/30 resize-none"
                  placeholder="e.g., I have a business license, I'm listed as the owner on public records, etc."
                />
              </div>

              <button
                onClick={handleSubmitClaim}
                disabled={submitting}
                className="w-full py-3 rounded-xl gradient-primary text-white font-medium text-sm shadow-lg shadow-[#22c55e]/25 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Submit Claim
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 'success' && (
          <div className="text-center animate-fade-in-up">
            <div className="w-20 h-20 rounded-2xl bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] mb-3 font-heading">
              Claim <span className="gradient-text font-serif">Submitted!</span>
            </h1>
            <p className="text-[hsl(var(--muted-foreground))] mb-8 max-w-md mx-auto">
              Your claim for <strong>{selectedBiz?.name}</strong> has been submitted for review. 
              You'll be notified once it's verified. This usually takes 1-2 business days.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl gradient-primary text-white font-medium shadow-lg shadow-[#22c55e]/25"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/businesses"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[hsl(var(--border))] text-[hsl(var(--foreground))] font-medium hover:bg-[hsl(var(--secondary))]"
              >
                Browse Businesses
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
