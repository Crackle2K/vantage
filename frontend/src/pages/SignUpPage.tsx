import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, UserPlus, Eye, EyeOff, User, Store } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export default function SignUpPage() {
  const navigate = useNavigate();
  const { signUp, isAuthenticated } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'customer' | 'business_owner'>('customer');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated) {
    navigate('/businesses');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    const { error: err } = await signUp(name, email, password, role);

    if (err) {
      setError(err);
      setLoading(false);
    } else {
      navigate('/businesses');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 gradient-mesh">
<div className="absolute top-32 right-20 w-72 h-72 bg-[#4ade80]/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 left-10 w-72 h-72 bg-[#4ade80]/10 rounded-full blur-3xl animate-float animation-delay-2000" />

      <div className="w-full max-w-md relative animate-fade-in-up">
        <div className="glass-card rounded-2xl p-8 shadow-xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#22c55e]/25">
              <UserPlus className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-1 font-heading">Create <span className="font-serif">account</span></h1>
            <p className="text-[hsl(var(--muted-foreground))] text-sm font-sub">Join Vantage to discover local businesses</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 flex items-start gap-3 animate-scale-in">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Role Selector */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[hsl(var(--foreground))]">Account type</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('customer')}
                  className={cn(
                    "flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all duration-200 text-left",
                    role === 'customer'
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5"
                      : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/40"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center",
                    role === 'customer' ? "gradient-primary text-white" : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
                  )}>
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Customer</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">Discover & review</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('business_owner')}
                  className={cn(
                    "flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all duration-200 text-left",
                    role === 'business_owner'
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5"
                      : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/40"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center",
                    role === 'business_owner' ? "gradient-primary text-white" : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
                  )}>
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Business</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">List & manage</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm font-medium text-[hsl(var(--foreground))]">Full Name</Label>
              <Input id="name" type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="John Doe" required autoComplete="name" className="h-11 rounded-xl bg-[hsl(var(--background))]" disabled={loading} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-[hsl(var(--foreground))]">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required autoComplete="email" className="h-11 rounded-xl bg-[hsl(var(--background))]" disabled={loading} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-[hsl(var(--foreground))]">Password</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" required
                  autoComplete="new-password" className="h-11 rounded-xl pr-10 bg-[hsl(var(--background))]" disabled={loading} minLength={6} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-[hsl(var(--foreground))]">Confirm Password</Label>
              <Input id="confirmPassword" type="password" value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password" required
                autoComplete="new-password" className="h-11 rounded-xl bg-[hsl(var(--background))]" disabled={loading} minLength={6} />
            </div>

            <Button
              type="submit"
              disabled={loading || !name || !email || !password || !confirmPassword}
              className="w-full h-11 gradient-primary text-white border-0 rounded-xl shadow-md shadow-[#22c55e]/20 hover:shadow-lg transition-all font-medium"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account...</>
              ) : (
                <><UserPlus className="w-4 h-4 mr-2" /> Create Account</>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-[hsl(var(--primary))] hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
