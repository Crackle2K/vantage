/**
 * @fileoverview Login page (route `/login`). Provides email/password
 * sign-in and Google OAuth sign-in via @react-oauth/google.
 * Redirects authenticated users to the explore page.
 */

import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, LogIn, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const loginSignals = [
  {
    label: 'Recent movement',
    detail: 'See which rooms are active now, not which ones peaked years ago.'
  },
  {
    label: 'Credible trust',
    detail: 'Weighted reviews and return visits keep noisy rankings in check.'
  },
  {
    label: 'Live updates',
    detail: 'Hours, events, and local momentum stay current across the map.'
  }
]

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signInWithGoogle, isAuthenticated } = useAuth();
  const hasGoogleOAuth = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated) {
    return <Navigate to="/businesses" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: err } = await signIn(email, password);

    if (err) {
      setError(err);
      setLoading(false);
    } else {
      navigate('/businesses');
    }
  };

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) {
      setError('Google sign-in failed. Please try again.');
      return;
    }

    setError('');
    setLoading(true);

    const { error: err } = await signInWithGoogle(credentialResponse.credential);

    if (err) {
      setError(err);
      setLoading(false);
    } else {
      navigate('/businesses');
    }
  };

  const handleGoogleError = () => {
    setError('Google sign-in failed. Please try again.');
  };

  return (
    <div className="auth-editorial">
      <div className="auth-editorial__shell animate-fade-in-up">
        <section className="auth-editorial__story">
          <div className="auth-editorial__media" aria-hidden="true">
            <img
              src="/Images/image3.webp"
              alt=""
            />
            <span className="auth-editorial__wordmark">VANTAGE</span>
          </div>

          <div className="auth-editorial__story-body">
            <p className="min-kicker">Return to the neighborhood</p>
            <h1 className="auth-editorial__headline">
              Fresh local signal, not stale ranking tables.
            </h1>
            <p className="auth-editorial__lede">
              Sign back in to explore businesses ranked by recent activity,
              credibility-weighted reviews, and current owner updates.
            </p>

            <div className="auth-editorial__story-grid">
              {loginSignals.map((signal) => (
                <article key={signal.label} className="auth-editorial__story-card">
                  <span>{signal.label}</span>
                  <strong>{signal.detail}</strong>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="auth-editorial__panel">
          <div className="auth-editorial__panel-badge">
            <LogIn className="h-4 w-4" />
            Member Access
          </div>

          <div className="auth-editorial__panel-copy">
            <h2>Welcome back</h2>
            <p>
              Sign in to keep tracking trusted local movement around you.
            </p>
          </div>

          {error && (
            <div className="auth-editorial__error animate-scale-in">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-editorial__form">
            <div className="auth-editorial__field">
              <Label htmlFor="email" className="auth-editorial__label">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="auth-editorial__input"
                disabled={loading}
              />
            </div>

            <div className="auth-editorial__field">
              <Label htmlFor="password" className="auth-editorial__label">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="auth-editorial__input pr-12"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="auth-editorial__toggle"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !email || !password}
              className="auth-editorial__submit min-primary-button min-primary-button--large"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 icon-spinner" /> Signing in...</>
              ) : (
                <><LogIn className="h-4 w-4" /> Sign In</>
              )}
            </Button>
          </form>

          {hasGoogleOAuth && (
            <>
              <div className="auth-editorial__divider">
                <span>or continue</span>
              </div>

              <div className="google-btn-override flex justify-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  useOneTap
                  theme="outline"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  width="100%"
                />
              </div>
            </>
          )}

          <p className="auth-editorial__switch">
            Don't have an account?{' '}
            <Link to="/signup">
              Create one
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
