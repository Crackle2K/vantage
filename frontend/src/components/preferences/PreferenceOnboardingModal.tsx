/**
 * @fileoverview Multi-step onboarding modal for setting user discovery
 * preferences (categories, independent vs. chain, price tier, vibes,
 * discovery mode). Also used as an editor from the account/settings
 * pages. Saves preferences via the API on completion or skip.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Coffee,
  Compass,
  DollarSign,
  Flame,
  Gem,
  Leaf,
  MoonStar,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  UtensilsCrossed,
  Wine,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/api';
import type { DiscoveryMode, User, UserPreferencesUpdate, UserPricePreference } from '@/types';

const CATEGORY_OPTIONS = [
  { label: 'Restaurants', icon: UtensilsCrossed },
  { label: 'Cafes & Coffee', icon: Coffee },
  { label: 'Bars & Nightlife', icon: Wine },
  { label: 'Shopping', icon: ShoppingBag },
  { label: 'Fitness & Wellness', icon: Sparkles },
  { label: 'Beauty & Spas', icon: Gem },
  { label: 'Entertainment', icon: Compass },
  { label: 'Grocery', icon: Leaf },
] as const;

const VIBE_OPTIONS = ['cozy', 'trendy', 'quiet', 'premium', 'family', 'nightlife', 'creative', 'casual', 'romantic', 'social'];
const PRICE_OPTIONS: Array<{ value: UserPricePreference; label: string; hint: string }> = [
  { value: '$', label: '$', hint: 'Budget-first' },
  { value: '$$', label: '$$', hint: 'Balanced' },
  { value: '$$$', label: '$$$', hint: 'Premium' },
];
const DISCOVERY_OPTIONS: Array<{ value: DiscoveryMode; label: string; description: string; icon: typeof Sparkles }> = [
  { value: 'new_places', label: 'New places', description: 'Fresh openings and rising spots.', icon: Sparkles },
  { value: 'trending', label: "What's trending", description: 'Momentum and active buzz.', icon: Flame },
  { value: 'trusted', label: 'Trusted picks', description: 'Reliable, credibility-first picks.', icon: ShieldCheck },
];

interface PreferenceOnboardingModalProps {
  open: boolean;
  user: User | null;
  title?: string;
  subtitle?: string;
  allowSkip?: boolean;
  onClose: () => void;
  onSaved: (user: User) => void;
}

/**
 * Renders a 5-step preference onboarding modal. Steps are: category
 * selection (min 5), independent/chain slider, price tier, vibe tags,
 * and discovery style. Saves preferences to the backend on completion.
 *
 * @param {boolean} open - Whether the modal is visible.
 * @param {User | null} user - Current user, used to pre-fill existing preferences.
 * @param {string} [title] - Override for the modal heading.
 * @param {string} [subtitle] - Override for the modal subtitle.
 * @param {boolean} [allowSkip=true] - Whether the "Skip for now" button is shown.
 * @param {() => void} onClose - Callback to close the modal.
 * @param {(user: User) => void} onSaved - Callback with the updated user after save.
 * @returns {JSX.Element | null} The modal, or null when closed/no user.
 */
export function PreferenceOnboardingModal({
  open,
  user,
  title = 'Set your discovery preferences',
  subtitle = 'This takes under a minute and tunes your For You lane without changing trust-first ranking.',
  allowSkip = true,
  onClose,
  onSaved,
}: PreferenceOnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [preferIndependent, setPreferIndependent] = useState(50);
  const [pricePref, setPricePref] = useState<UserPricePreference | null>(null);
  const [preferredVibes, setPreferredVibes] = useState<string[]>([]);
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>('trusted');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setError('');
    setPreferredCategories(user?.preferred_categories ?? []);
    setPreferIndependent(Math.round((user?.prefer_independent ?? 0.5) * 100));
    setPricePref(user?.price_pref ?? null);
    setPreferredVibes(user?.preferred_vibes ?? []);
    setDiscoveryMode(user?.discovery_mode ?? 'trusted');
  }, [open, user]);

  const canContinue = useMemo(() => {
    if (step === 0) return preferredCategories.length >= 5;
    if (step === 4) return !!discoveryMode;
    return true;
  }, [step, preferredCategories.length, discoveryMode]);

  if (!open || !user) {
    return null;
  }

  const toggleValue = (value: string, current: string[], setCurrent: (next: string[]) => void, limit: number) => {
    if (current.includes(value)) {
      setCurrent(current.filter((item) => item !== value));
      return;
    }
    if (current.length >= limit) return;
    setCurrent([...current, value]);
  };

  const savePreferences = async (markCompleted: boolean) => {
    setSaving(true);
    setError('');
    try {
      const payload: UserPreferencesUpdate = {
        preferred_categories: preferredCategories,
        preferred_vibes: preferredVibes,
        prefer_independent: Number((preferIndependent / 100).toFixed(2)),
        price_pref: pricePref,
        discovery_mode: discoveryMode,
        preferences_completed: markCompleted,
      };
      const updatedUser = await api.updateMyPreferences(payload);
      onSaved(updatedUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[hsl(var(--background))/0.72]">
      <div className="absolute inset-0" onClick={() => !saving && onClose()} />
      <div className="relative mx-auto flex min-h-screen max-w-3xl items-center px-3 py-6 sm:px-6">
        <div className="w-full overflow-hidden rounded-[28px] border border-[hsl(var(--border))/0.8] bg-[hsl(var(--card))] shadow-[0_30px_80px_-36px_hsl(var(--shadow-soft)/0.7)]">
          <div className="border-b border-[hsl(var(--border))/0.8] px-5 py-5 sm:px-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-caption font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
                  Discovery onboarding
                </p>
                <h2 className="mt-1 text-heading font-semibold text-[hsl(var(--foreground))]">{title}</h2>
                <p className="mt-1 max-w-2xl text-ui text-[hsl(var(--muted-foreground))]">{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => !saving && onClose()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                aria-label="Close preferences"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className={`h-2 flex-1 rounded-full ${index <= step ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--secondary))]'}`}
                />
              ))}
            </div>
          </div>

          <div className="px-5 py-6 sm:px-8 sm:py-8">
            {error && (
              <div className="mb-5 rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-ui text-error">
                {error}
              </div>
            )}

            {step === 0 && (
              <section className="space-y-4">
                <div>
                  <p className="text-subheading font-semibold text-[hsl(var(--foreground))]">Pick at least 5 categories</p>
                  <p className="mt-1 text-ui text-[hsl(var(--muted-foreground))]">
                    These define the lanes you see more often. Trust ranking still decides the order inside each lane.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {CATEGORY_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const active = preferredCategories.includes(option.label);
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => toggleValue(option.label, preferredCategories, setPreferredCategories, 8)}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                          active
                            ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--foreground))]'
                            : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/35 hover:bg-[hsl(var(--secondary))]/70'
                        }`}
                      >
                        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${active ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="text-ui font-medium">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {step === 1 && (
              <section className="space-y-5">
                <div>
                  <p className="text-subheading font-semibold text-[hsl(var(--foreground))]">Independent vs chain</p>
                  <p className="mt-1 text-ui text-[hsl(var(--muted-foreground))]">
                    Set how strongly your For You lane should lean toward independent businesses.
                  </p>
                </div>
                <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--background))/0.55] p-5">
                  <div className="mb-4 flex items-center justify-between text-ui font-medium text-[hsl(var(--foreground))]">
                    <span className="inline-flex items-center gap-2"><Store className="h-4 w-4" /> Chains</span>
                    <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4" /> Independent</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={preferIndependent}
                    onChange={(event) => setPreferIndependent(Number(event.target.value))}
                    className="w-full accent-[hsl(var(--primary))]"
                  />
                  <div className="mt-3 flex items-center justify-between text-caption text-[hsl(var(--muted-foreground))]">
                    <span>Balanced</span>
                    <span>{preferIndependent}% independent</span>
                  </div>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-4">
                <div>
                  <p className="text-subheading font-semibold text-[hsl(var(--foreground))]">Price preference</p>
                  <p className="mt-1 text-ui text-[hsl(var(--muted-foreground))]">
                    Optional. Use this to tilt relevance, not to remove trusted results.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {PRICE_OPTIONS.map((option) => {
                    const active = pricePref === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPricePref(active ? null : option.value)}
                        className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                          active
                            ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                            : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/35 hover:bg-[hsl(var(--secondary))]/70'
                        }`}
                      >
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">
                          <DollarSign className="h-4 w-4" />
                        </div>
                        <p className="mt-3 text-subheading font-semibold text-[hsl(var(--foreground))]">{option.label}</p>
                        <p className="text-ui text-[hsl(var(--muted-foreground))]">{option.hint}</p>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="space-y-4">
                <div>
                  <p className="text-subheading font-semibold text-[hsl(var(--foreground))]">Pick your vibe</p>
                  <p className="mt-1 text-ui text-[hsl(var(--muted-foreground))]">
                    Choose a few tags to steer relevance within the right lanes.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {VIBE_OPTIONS.map((vibe) => {
                    const active = preferredVibes.includes(vibe);
                    return (
                      <button
                        key={vibe}
                        type="button"
                        onClick={() => toggleValue(vibe, preferredVibes, setPreferredVibes, 10)}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-ui transition-all ${
                          active
                            ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--foreground))]'
                            : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))]/35 hover:text-[hsl(var(--foreground))]'
                        }`}
                      >
                        {vibe === 'cozy' && <MoonStar className="h-3.5 w-3.5" />}
                        {vibe === 'family' && <Users className="h-3.5 w-3.5" />}
                        {vibe === 'premium' && <Gem className="h-3.5 w-3.5" />}
                        {!['cozy', 'family', 'premium'].includes(vibe) && <Sparkles className="h-3.5 w-3.5" />}
                        {vibe}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {step === 4 && (
              <section className="space-y-4">
                <div>
                  <p className="text-subheading font-semibold text-[hsl(var(--foreground))]">Discovery style</p>
                  <p className="mt-1 text-ui text-[hsl(var(--muted-foreground))]">
                    This changes which candidates surface in For You. Live Visibility still ranks the final lane.
                  </p>
                </div>
                <div className="space-y-3">
                  {DISCOVERY_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const active = discoveryMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDiscoveryMode(option.value)}
                        className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-all ${
                          active
                            ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                            : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/35 hover:bg-[hsl(var(--secondary))]/70'
                        }`}
                      >
                        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${active ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span>
                          <span className="block text-ui font-semibold text-[hsl(var(--foreground))]">{option.label}</span>
                          <span className="block text-ui text-[hsl(var(--muted-foreground))]">{option.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-[hsl(var(--border))/0.8] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="text-caption text-[hsl(var(--muted-foreground))]">
              Step {step + 1} of 5
            </div>
            <div className="flex flex-wrap gap-2">
              {allowSkip && (
                <Button type="button" variant="ghost" onClick={() => savePreferences(true)} disabled={saving}>
                  Skip for now
                </Button>
              )}
              {step > 0 && (
                <Button type="button" variant="outline" onClick={() => setStep((current) => current - 1)} disabled={saving}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              {step < 4 ? (
                <Button type="button" onClick={() => setStep((current) => current + 1)} disabled={!canContinue || saving}>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" onClick={() => savePreferences(true)} disabled={!canContinue || saving}>
                  {saving ? 'Saving...' : 'Save preferences'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
