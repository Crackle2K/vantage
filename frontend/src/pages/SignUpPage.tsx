/**
 * @fileoverview Sign-up page (route `/signup`). Registration form with
 * email/password fields, role selection (Customer or Business Owner),
 * Google OAuth sign-up, and reCAPTCHA Enterprise verification.
 * Redirects authenticated users to the explore page.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, UserPlus, Eye, EyeOff, User, Store } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
const RECAPTCHA_SIGNUP_ACTION = 'SIGNUP';
const signUpSignals = [
  {
    label: 'Earned visibility',
    detail: 'Ranking comes from recent local activity, never from claiming a listing.'
  },
  {
    label: 'Trust first',
    detail: 'Credibility-weighted reviews and return behavior surface durable local picks.'
  },
  {
    label: 'Live operator rhythm',
    detail: 'Owners can publish current events and availability without buying placement.'
  }
]

function getPasswordValidationError(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters long'
  }

  if (password.length > 128) {
    return 'Password must be less than 128 characters'
  }

  const checks = [
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)
  ]

  if (checks.filter(Boolean).length < 3) {
    return 'Password must include at least 3 of: uppercase, lowercase, digits, special characters'
  }

  return null
}

type RecaptchaEnterprise = {
  ready: (cb: () => void) => void;
  render: (container: string | HTMLElement, params: {
    sitekey: string;
    action?: string;
    callback?: (token: string) => void;
    'expired-callback'?: () => void;
  }) => number;
  getResponse: (widgetId?: number) => string;
  reset: (widgetId?: number) => void;
};

declare global {
  interface Window {
    grecaptcha?: {
      enterprise: RecaptchaEnterprise;
    };
  }
}

export default function SignUpPage() {
  const navigate = useNavigate();
  const { signUp, signInWithGoogle, isAuthenticated } = useAuth();
  const hasGoogleOAuth = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const recaptchaEnabled = Boolean(RECAPTCHA_SITE_KEY);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'customer' | 'business_owner'>('customer');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [widgetId, setWidgetId] = useState<number | null>(null);
  const [recaptchaToken, setRecaptchaToken] = useState('');
  const recaptchaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!recaptchaEnabled || widgetId !== null) return;

    let pollId: number | null = null;
    const tryRender = () => {
      const recaptcha = window.grecaptcha?.enterprise;
      if (!recaptcha || !recaptchaRef.current) return false;

      recaptcha.ready(() => {
        if (!recaptchaRef.current || widgetId !== null) return;
        const id = recaptcha.render(recaptchaRef.current, {
          sitekey: RECAPTCHA_SITE_KEY,
          action: RECAPTCHA_SIGNUP_ACTION,
          callback: (token: string) => setRecaptchaToken(token),
          'expired-callback': () => setRecaptchaToken(''),
        });
        setWidgetId(id);
      });
      return true;
    };

    if (!tryRender()) {
      pollId = window.setInterval(() => {
        if (tryRender() && pollId !== null) {
          window.clearInterval(pollId);
          pollId = null;
        }
      }, 300);
    }

    return () => {
      if (pollId !== null) window.clearInterval(pollId);
    };
  }, [recaptchaEnabled, widgetId]);

  if (isAuthenticated) {
    return <Navigate to="/businesses" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    const passwordError = getPasswordValidationError(password)
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (recaptchaEnabled && !recaptchaToken) {
      setError('Please complete the CAPTCHA verification');
      return;
    }

    setLoading(true);
    const { error: err } = await signUp(
      name,
      email,
      password,
      role,
      recaptchaEnabled ? recaptchaToken : 'recaptcha-not-configured',
      RECAPTCHA_SIGNUP_ACTION
    );

    if (err) {
      setError(err);
      setLoading(false);
      if (widgetId !== null) {
        window.grecaptcha?.enterprise.reset(widgetId);
        setRecaptchaToken('');
      }
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
              src="/Images/image4.webp"
              alt=""
            />
            <span className="auth-editorial__wordmark">VANTAGE</span>
          </div>

          <div className="auth-editorial__story-body">
            <p className="min-kicker">Trust-ranked discovery</p>
            <h1 className="auth-editorial__headline">
              Build local presence without buying rank.
            </h1>
            <p className="auth-editorial__lede">
              Create an account to save places, leave trusted reviews, or
              manage business updates while Vantage keeps ranking earned
              through real neighborhood activity.
            </p>

            <div className="auth-editorial__story-grid">
              {signUpSignals.map((signal) => (
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
            <UserPlus className="h-4 w-4" />
            New Account
          </div>

          <div className="auth-editorial__panel-copy">
            <h2>Create account</h2>
            <p>
              Join as a customer or business owner and keep your local signal
              current from day one.
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
              <Label className="auth-editorial__label">Account type</Label>
              <div className="auth-editorial__role-grid">
                <button
                  type="button"
                  onClick={() => setRole('customer')}
                  className={cn(
                    'auth-editorial__role-card',
                    role === 'customer' && 'auth-editorial__role-card--active'
                  )}
                >
                  <div className="auth-editorial__role-icon">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="auth-editorial__role-title">Customer</div>
                    <div className="auth-editorial__role-detail">
                      Discover, save, and review places with credible local context.
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('business_owner')}
                  className={cn(
                    'auth-editorial__role-card',
                    role === 'business_owner' && 'auth-editorial__role-card--active'
                  )}
                >
                  <div className="auth-editorial__role-icon">
                    <Store className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="auth-editorial__role-title">Business Owner</div>
                    <div className="auth-editorial__role-detail">
                      Manage listing details, events, and live updates without a rank boost.
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="auth-editorial__field">
              <Label htmlFor="name" className="auth-editorial__label">
                Full Name
              </Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="John Doe"
                required
                autoComplete="name"
                className="auth-editorial__input"
                disabled={loading}
              />
            </div>

            <div className="auth-editorial__field">
              <Label htmlFor="email" className="auth-editorial__label">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
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
                  onChange={e => setPassword(e.target.value)}
                  placeholder="8+ chars, 3 of upper/lower/number/symbol"
                  required
                  autoComplete="new-password"
                  className="auth-editorial__input pr-12"
                  disabled={loading}
                  minLength={8}
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

            <div className="auth-editorial__field">
              <Label htmlFor="confirmPassword" className="auth-editorial__label">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                required
                autoComplete="new-password"
                className="auth-editorial__input"
                disabled={loading}
                minLength={8}
              />
            </div>

            {recaptchaEnabled && (
              <div
                ref={recaptchaRef}
                className="g-recaptcha min-h-20"
                data-sitekey={RECAPTCHA_SITE_KEY}
                data-action={RECAPTCHA_SIGNUP_ACTION}
              />
            )}

            <Button
              type="submit"
              disabled={
                loading ||
                !name ||
                !email ||
                !password ||
                !confirmPassword ||
                (recaptchaEnabled && !recaptchaToken)
              }
              className="auth-editorial__submit min-primary-button min-primary-button--large"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 icon-spinner" /> Creating account...</>
              ) : (
                <><UserPlus className="h-4 w-4" /> Create Account</>
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
                  theme="outline"
                  size="large"
                  text="signup_with"
                  shape="rectangular"
                  width="100%"
                />
              </div>
            </>
          )}

          <p className="auth-editorial__switch">
            Already have an account?{' '}
            <Link to="/login">
              Sign in
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
