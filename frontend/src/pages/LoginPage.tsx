import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, LogIn, Eye, EyeOff, Store } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signInWithGoogle, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already logged in
  if (isAuthenticated) {
    navigate('/businesses');
    return null;
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
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 gradient-mesh">
      {/* Decorative blobs */}
      <div className="absolute top-32 left-10 w-72 h-72 bg-brand-light/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-brand-light/10 rounded-full blur-3xl animate-float animation-delay-2000" />

      <div className="w-full max-w-md relative animate-fade-in-up">
        <div className="glass-card rounded-2xl p-8 shadow-xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand/25">
              <Store className="w-7 h-7 text-brand-on-primary" />
            </div>
            <h1 className="text-subheading font-bold text-[hsl(var(--foreground))] mb-1 font-heading">Welcome <span className="font-serif">back</span></h1>
            <p className="text-[hsl(var(--muted-foreground))] text-ui font-sub">Sign in to your Vantage account</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-3.5 rounded-xl bg-error dark:bg-error/30 border border-error dark:border-error/50 flex items-start gap-3 animate-scale-in">
              <AlertCircle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
              <p className="text-ui text-error dark:text-error">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-ui font-medium text-[hsl(var(--foreground))]">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="h-11 rounded-xl bg-[hsl(var(--background))]"
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-ui font-medium text-[hsl(var(--foreground))]">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="h-11 rounded-xl pr-10 bg-[hsl(var(--background))]"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full h-11 gradient-primary text-on-primary border-0 rounded-xl shadow-md shadow-brand/20 hover:shadow-lg transition-all font-medium"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in...</>
              ) : (
                <><LogIn className="w-4 h-4 mr-2" /> Sign In</>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-[hsl(var(--border))]"></div>
            <span className="text-ui text-[hsl(var(--muted-foreground))]">or</span>
            <div className="flex-1 h-px bg-[hsl(var(--border))]"></div>
          </div>

          {/* Google Sign In */}
          <div className="flex justify-center">
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

          {/* Sign Up Link */}
          <div className="mt-6 text-center">
            <p className="text-ui text-[hsl(var(--muted-foreground))]">
              Don't have an account?{' '}
              <Link to="/signup" className="font-medium text-[hsl(var(--primary))] hover:underline">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
