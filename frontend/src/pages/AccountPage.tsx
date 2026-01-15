import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function AccountPage() {
  const { user, signOut, updateProfile } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (user) {
      setName(user.user_metadata?.name || '')
      setEmail(user.email || '')
    }
  }, [user])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setLoading(true)

    const updates: { name?: string; email?: string } = {}
    
    if (name !== user?.user_metadata?.name) {
      updates.name = name
    }
    
    if (email !== user?.email) {
      updates.email = email
    }

    if (Object.keys(updates).length === 0) {
      setError('No changes to save')
      setLoading(false)
      return
    }

    const { error } = await updateProfile(updates)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
      setIsEditing(false)
      setTimeout(() => setSuccess(false), 3000)
    }

    setLoading(false)
  }

  const handleSignOut = async () => {
    await signOut()
  }

  if (!user) return null

  return (
    <div className="account-page">
      <div className="account-container">
        <div className="account-card">
          <div className="account-header">
            <div className="account-avatar">
              {(name || email)?.[0]?.toUpperCase()}
            </div>
            <h2>Account Settings</h2>
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">Profile updated successfully!</div>}

          <form onSubmit={handleUpdate}>
            <div className="account-section">
              <h3>Profile Information</h3>
              
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isEditing}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!isEditing}
                  required
                />
                {isEditing && (
                  <small className="form-hint">
                    Changing your email will require verification
                  </small>
                )}
              </div>
            </div>

            <div className="account-section">
              <h3>Account Details</h3>
              <div className="account-info">
                <div className="info-row">
                  <span className="info-label">Account Created</span>
                  <span className="info-value">
                    {new Date(user.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Last Sign In</span>
                  <span className="info-value">
                    {user.last_sign_in_at 
                      ? new Date(user.last_sign_in_at).toLocaleDateString()
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            <div className="account-actions">
              {!isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="btn-secondary"
                  >
                    Edit Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="btn-danger"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false)
                      setName(user.user_metadata?.name || '')
                      setEmail(user.email || '')
                      setError('')
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary"
                  >
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
