# Design System: Vantage

## 1. Visual Theme And Atmosphere

Vantage should keep its current premium local editorial mood. The interface
should feel like a trusted neighborhood guide with product-grade conversion
tools layered in carefully: warm, credible, restrained, and useful.

The redesign direction is evolution, not replacement. Preserve the current pages
as much as possible. Enhance `/decide` into the first-class customer loop while
keeping `/businesses`, profiles, saved places, deals, events, claims, pricing,
and the owner dashboard visually compatible with the existing app.

Do not make Vantage look like a dating app clone. Matching and swiping should be
tasteful decision mechanics, not the brand personality. The interface should
remain local, premium, trustworthy, and conversion-aware.

Atmosphere scale:

- Density: Daily App Balanced, 5 out of 10.
- Variance: Offset Product Editorial, 5 out of 10.
- Motion: Purposeful Product Motion, 4 out of 10.

## 2. Color Palette And Roles

Preserve the current light-mode HSL token system in `frontend/src/index.css`.
Do not replace the palette without a clear product reason.

- **Soft Local Canvas** (`hsl(48 20% 98%)`) - primary app background.
- **Warm Secondary Surface** (`hsl(40 18% 95%)`) - secondary page bands and app
  backgrounds.
- **Clean Card Surface** (`hsl(0 0% 100%)`) - cards, modals, panels, and product
  containers.
- **Muted Card Surface** (`hsl(44 18% 96%)`) - subtle grouped controls and empty
  regions.
- **Ink Text** (`hsl(0 0% 7%)`) - primary text and primary action fill.
- **Quiet Secondary Text** (`hsl(48 2% 46%)`) - body support copy, captions, and
  metadata.
- **Local Green Accent** (`hsl(120 31% 30%)`) - success, verified activity, and
  trusted local signals.
- **Warm Signal Accent** (`hsl(40 100% 29%)`) - warnings, time-sensitive offers,
  slow-hour prompts, and campaign urgency.
- **Subtle Border** (`hsl(0 0% 92%)`) - 1px structural boundaries.

Rules:

- Keep the product light-mode first.
- Use color to communicate state, not decoration.
- Keep accent use restrained. Local green and warm signal tones should support
  trust and conversion moments.
- Do not introduce purple-blue neon gradients, generic SaaS blue, or loud dating
  app colors.
- Do not make the app monochrome if conversion actions need hierarchy.
- Body text must maintain WCAG AA contrast against its surface.

## 3. Typography Rules

Preserve the current font direction unless there is a strong reason to change
it.

- **Body/UI:** `"SF Pro Display", "Geist Sans", "Helvetica Neue", "Switzer",
  sans-serif`.
- **Headings:** `"Lyon Text", "Newsreader", "Playfair Display",
  "Instrument Serif", Georgia, serif`.
- **Mono:** `"Geist Mono", "SF Mono", "JetBrains Mono", monospace`.

Rules:

- Preserve the serif heading personality on editorial and high-level product
  pages.
- Keep product UI compact, legible, and task-focused.
- Keep headings balanced with `text-wrap: balance`.
- Keep long copy readable with `text-wrap: pretty` and a 65-75ch line length.
- Do not make `/decide` headings oversized or theatrical.
- Do not use all-caps body copy.
- Do not use tiny uppercase labels everywhere. Use them only when they already
  fit the current system.
- Do not switch to Inter or a generic dashboard font reset.

## 4. Component Stylings

Preserve existing components where possible:

- `frontend/src/components/business-card.tsx`
- `frontend/src/components/BusinessModal.tsx`
- `frontend/src/components/explore/*`
- `frontend/src/components/ui/button.tsx`
- `frontend/src/components/ui/input.tsx`
- `frontend/src/components/ui/badge.tsx`

Buttons:

- Use clear verb labels such as "Save place", "Claim offer", "Get directions",
  "Check in", and "Show another match".
- Add tactile active feedback on press using subtle transform only.
- Keep primary actions high-contrast.
- Do not use neon shadows or excessive gradient fills.

Cards:

- Keep current card surfaces and restrained borders.
- Use cards for business match cards, profile surfaces, repeated offers, and
  dashboard data groups.
- Do not nest cards inside cards.
- Do not over-round new cards beyond the established product radius.
- Match cards should feel like premium decision cards, not dating profiles.

Inputs and controls:

- Preserve label-above-input structure.
- Keep focus rings visible and calm.
- Use sliders for distance/radius, segmented controls for intent, toggles for
  constraints, and icon buttons where the action is familiar.

Loading states:

- Use skeletons matching the final layout dimensions.
- Avoid generic circular spinners except where already used for route fallback.

Empty states:

- Make empty states action-oriented: "Choose an intent", "Save a match", "Claim
  your first offer".
- Do not add long helper copy or instructional sidebars.

## 5. Layout Principles

Preserve the existing app structure:

- Shared header and footer.
- Product pages inside `RootLayout`.
- `/businesses` as the immersive Explore route.
- `/decide` as the primary customer intent route.
- `/dashboard` as the later owner conversion hub.

Layout rules:

- Enhance existing pages. Do not replace the whole composition unless a surface
  is blocking the new loop.
- Keep Explore/Search secondary but visible.
- Make `/decide` the clearest path from intent to action.
- Use stable dimensions for match cards so swipe controls, save states, and
  offer actions do not shift the layout.
- Use responsive grids and single-column mobile collapse.
- No horizontal scroll on mobile.
- No overlapping text and images.
- Keep cards at 8-16px radius unless the existing surface already uses a larger
  local radius.
- Avoid marketing-page hero patterns on task pages.

## 6. Motion And Interaction

Motion should support decision-making and confidence.

Allowed motion:

- Subtle card entrance after intent selection.
- Swipe feedback for match cards.
- Button press feedback.
- Small state transitions for save, claim, and check-in actions.
- Smooth profile modal transitions.
- Existing GSAP landing-page motion where it already serves the editorial
  story.

Rules:

- Animate transform and opacity first.
- Keep frequent UI motion under 200ms.
- Use ease-out curves for entrances and press feedback.
- Provide `prefers-reduced-motion` alternatives.
- Never require animation for content to become visible.
- Do not add decorative perpetual motion to task-heavy pages.
- Do not use bounce or elastic movement for core decision actions.

## 7. Image Direction

Preserve current images when they support a premium local feel.

Replace images only if they weaken the new matching/conversion concept, look
generic, are low quality, or fail to represent local places clearly.

Image rules:

- Use real-feeling local business imagery: cafes, restaurants, dessert, bars,
  wellness, retail, events, and neighborhood activity.
- Avoid dark, blurred, vague atmosphere shots when users need to inspect a
  place.
- Match card images should reveal the actual place or a believable business
  context.
- Do not use sketchy SVG illustrations as a fallback.
- Do not over-filter business images so they stop being useful.

## 8. `/decide` Direction

`/decide` is milestone one and should become the primary customer loop.

The page should support:

- Mood or intent selection.
- Constraint toggles.
- Match cards with clear reasons.
- Save/match action.
- Profile open.
- Offer claim.
- Directions click.
- Check-in/redemption placeholder.
- Event tracking for each action.

Design rules for `/decide`:

- Keep the current product styling and page mood.
- Add matching mechanics without making the page feel like a dating app.
- Provide non-swipe buttons for every swipe action.
- Match cards should explain why they appeared.
- Action buttons must be visible without overwhelming the card.
- The next useful action should be obvious after a match.

## 9. Explore And Search Direction

`/businesses` stays important but becomes secondary to the intent loop.

Do not delete:

- Search.
- Filters.
- Lanes.
- Owner event cards.
- Business modal.
- Save actions.
- Activity signals.

Enhance it by:

- Pointing undecided users toward `/decide`.
- Reusing match reasons where relevant.
- Keeping high-quality business imagery.
- Keeping lane content curated and useful.

## 10. Dashboard Direction

The dashboard should not lead milestone one, but it should be prepared for
milestone two.

Later dashboard surfaces should show:

- Match card impressions.
- Saves and matches.
- Profile opens.
- Offer claims.
- Redemptions.
- Check-ins.
- Directions clicks.
- Event interest.
- First-time customer actions.
- Repeat customer actions.
- Top match reasons.
- Top skip reasons.
- Best-performing photos, tags, and offers.

Design rules:

- Keep it operational, not decorative.
- Prefer dense but clear product panels.
- Use tables, compact stats, trend rows, and campaign cards.
- Do not use broad marketing hero sections inside the dashboard.

## 11. Anti-Patterns

Never do these:

- Do not rebuild current pages from scratch when enhancements are enough.
- Do not erase the current Vantage visual identity.
- Do not make Vantage look like a dating app clone.
- Do not use sponsored cards in the MVP.
- Do not sell or imply paid organic ranking.
- Do not make Explore disappear.
- Do not turn offers into spam coupons.
- Do not use generic SaaS-blue or purple neon gradients.
- Do not use gradient text for major headings.
- Do not use emojis in product UI.
- Do not add decorative glassmorphism.
- Do not add nested cards.
- Do not use long instructional helper panels.
- Do not make text overlap or overflow on mobile.
- Do not hardcode API URLs in components. Use `frontend/src/api.ts`.

## 12. Implementation Guardrails

Before changing UI:

- Preserve existing routes and page foundations.
- Reuse existing components before creating new ones.
- Keep changes narrow to the surface being enhanced.
- Verify that text fits on mobile and desktop.
- Verify contrast on new action states.
- Use existing API client patterns.
- Do not touch `backend/src/services/visibility_score.rs` in ways that favor
  claimed, paid, or sponsored businesses.

After changing UI:

- Run `cd frontend && npm run lint`.
- Run `cd frontend && npm run build`.
- Use browser verification for significant frontend changes.

After backend changes:

- Run `cargo check`.
- Add route or unit tests for event tracking, owner authorization, and ranking
  invariants.
