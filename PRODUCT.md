# Product

## Register

product

## Product Purpose

Vantage is a local intent platform. It helps customers decide where to go and
helps local businesses turn nearby interest into measurable visits,
redemptions, bookings, events, and repeat customers.

The business rule is:

Free to be discovered. Paid to bring people in.

Vantage must not become a paid directory. Businesses can be discovered
organically for free. Businesses pay for conversion tools, not for organic rank.
Paid status, claimed status, and sponsorship must never improve Live Visibility
Score.

## Core Problem

Customers often want to go somewhere but do not know where to go. Search pages,
maps, social feeds, and review lists create more browsing when the user needs a
decision.

Businesses often want real nearby customers, but they do not want to waste money
on broad, vague advertising. They need tools that convert warm local intent into
trackable action.

Vantage connects those two needs:

- Customers choose intent, mood, budget, values, location, and timing.
- Vantage matches them with local places that fit.
- Businesses later pay to convert that interest into visits, offer claims,
  redemptions, bookings, check-ins, events, and repeat visits.

## Positioning

Customer promise:

Find places that match you.

Business promise:

Turn nearby intent into real visits.

Overall positioning:

Vantage connects local intent with local businesses. Customers get better
decisions. Businesses get measurable demand.

Do not position Vantage as only "Tinder for businesses." Swiping can be an
interaction pattern, but the product is decision-making and conversion, not a
dating-app clone.

## Core Loop

The first product loop is customer-side:

1. Choose mood or intent.
2. See match cards.
3. Swipe, save, or match.
4. Open a business profile.
5. Claim an offer or get directions.
6. Track the action.

The MVP loop is:

User intent -> matched places -> save, claim, or go action.

Search and Explore stay in the product, but they become secondary to the
decision loop. Do not delete the existing Explore experience. Preserve it and
use it as a supporting browsing mode.

## Milestone Order

Milestone 1: Customer intent and action loop.

The first milestone must prove that Vantage can create customer interest and
move it toward action. It should center on `/decide`, match cards, match
reasons, save/match actions, profile opens, offer claims, direction clicks, and
placeholder check-in/redemption tracking.

Milestone 2: Business conversion dashboard.

Once customer-side events exist, the business dashboard can summarize real
signals: impressions, matches, saves, profile opens, offer claims, direction
clicks, check-ins, and redemptions.

Milestone 3: Campaign and offer tools.

Businesses can create slow-hour campaigns, first-visit offers, event pushes,
limited perks, and retention prompts. These tools should use the customer event
stream from milestone 1.

Milestone 4: Paid conversion products.

Add pay-per-action, richer subscriptions, campaign analytics, onboarding/setup
packages, and verification review workflows.

Milestone 5: Sponsored match cards.

Sponsored cards are explicitly excluded from the MVP. They should only launch
after offer claiming and redemption/check-in tracking can answer whether paid
exposure created real action.

## MVP Scope

Customer MVP:

- Mood and intent selection.
- Match card interface for local places.
- Swipe or binary match actions.
- Save or match action.
- Business profile view.
- Clear match reasons.
- Basic value and vibe filters.
- Offer claim.
- Directions action.
- Open-now and distance context.
- Simple check-in or redemption placeholder.
- Event tracking for each meaningful action.

Business MVP:

- Claim profile.
- Edit basic profile.
- Add photos and tags.
- Create one offer.
- Create one event or campaign.
- View basic customer action stats once the customer event stream exists.

Admin MVP:

- Approve business claims.
- Edit business data.
- Review reported tags.
- Manage offers.
- Manage verification status manually.
- Remove spam or fraud.

## Non-MVP Features

Do not build these until the customer loop and conversion tracking are working:

- Sponsored match cards.
- Group matching.
- AI planning concierge.
- Full loyalty program.
- Advanced A/B testing.
- POS integrations.
- Reservation integrations.
- Ticketing.
- Full verification marketplace.
- Customer paid subscription.
- Complex retargeting automation.
- Broad national rollout.

## Monetization Logic

Customers use Vantage for free.

Businesses are discoverable organically for free. The paid surface begins when a
business wants to bring interested people in.

Revenue streams:

- Business subscriptions for profile control, offers, events, campaign tools,
  analytics, retention tools, and customer insights.
- Pay-per-action pricing for redemptions, bookings, RSVPs, check-ins,
  first-time customer visits, waitlist signups, appointment requests, and other
  measurable outcomes.
- Verification review fees for value-based claims, with no guaranteed approval.
- Onboarding and setup packages for profile setup, offer setup, card
  optimization, and launch campaigns.
- Sponsored match cards later, only when clearly labeled, relevance-filtered,
  capped, and measured against real actions.

Do not sell ranking. Sell conversion.

## Subscription Direction

Free:

- Basic profile.
- Organic search visibility.
- Organic match visibility.
- Basic reviews.
- Basic tags.
- Basic saves and matches.
- Claim ability.

Starter:

- Full profile editing.
- More photos.
- More value and vibe tags.
- Basic match analytics.
- Limited offers.
- Limited events.
- Basic performance insights.

Growth:

- Slow-hour campaigns.
- First-time visitor offers.
- Event promotion.
- Offer redemption tracking.
- Match-to-action analytics.
- Retargeting matched users.
- Customer intent insights.
- Card performance analytics.

Pro:

- Advanced campaigns.
- Card, photo, and offer experiments.
- Advanced analytics.
- Loyalty and retention tools.
- Multi-offer campaigns.
- Better event tools.
- Deeper customer segment insights.
- Priority support.

## Event Tracking Requirements

Milestone 1 must create enough tracking to power later business value. Track
customer events without turning them into organic ranking shortcuts.

Required event types:

- Match card impression.
- Swipe left.
- Swipe right.
- Save.
- Match.
- Business profile open.
- Offer claim.
- Directions click.
- Check-in placeholder.
- Redemption placeholder.

Event records should include:

- User id when authenticated.
- Anonymous session id when not authenticated.
- Business id.
- Intent or mood.
- Match reason codes shown to the user.
- Source surface, such as `decide`, `businesses`, `saved`, or profile modal.
- Timestamp.
- Optional location context when safely available.
- Optional campaign or offer id when relevant.

## Definitions

Match:

A positive customer intent signal created from a match card interaction. A match
does not mean the customer visited.

Save:

A customer adds a business to their saved list for later. A save is intent, not
conversion.

Offer claim:

A customer claims an offer, perk, event prompt, or time-sensitive reason to go.
This is a stronger conversion signal than a save.

Redemption:

A customer uses a claimed offer through a code, QR flow, staff confirmation, or
future POS integration. In milestone 1 this may be a placeholder event.

Check-in:

A customer reports being at the business. Verification can be self-reported,
geo-verified, receipt-verified, or community-confirmed depending on available
evidence.

Directions click:

A customer taps a route or map action. Treat it as a conversion-adjacent signal,
not proof of a visit.

## Trust And Ranking Rules

Live Visibility Score must remain earned by real activity and credibility.

Never modify LVS to favor:

- Claimed businesses.
- Paid businesses.
- Subscription tier.
- Sponsored status.
- Campaign spend.
- Offer spend.

Sponsored cards, when added later, must be separated from organic ranking,
clearly labeled, relevance-filtered, capped, and measurable.

Values-based tags should use trust levels:

- Self-declared.
- Community-confirmed.
- Verified.

Do not present unverified claims as fact.

## Design Principles

Preserve and evolve.

Keep the current Vantage pages and visual identity wherever they work. Add the
matching and conversion layer on top of the existing product instead of tearing
the interface down.

Decision before directory.

The primary product moment is "where should I go right now?" Search and Explore
remain useful, but they should support the intent loop.

Action over exposure.

A business does not pay to be listed. It pays to move interested customers from
intent to action.

Trust is the product.

Every recommendation should explain why it appeared. Paid surfaces must be
clearly labeled and separated from organic trust ranking.

Start narrow.

Launch density matters more than broad coverage. A focused neighborhood with
strong cards is better than a thin directory everywhere.

## Anti-Goals

- Do not rebuild the whole app to chase a new visual concept.
- Do not turn Vantage into a coupon app.
- Do not make the product feel like a dating app clone.
- Do not make sponsored placement the first business product.
- Do not hide paid content inside organic recommendations.
- Do not invent ranking shortcuts for claimed or subscribed businesses.
- Do not remove Explore, Saved, Deals, Events, Claims, or Dashboard foundations
  when they can be adapted.

## Accessibility And Inclusion

Use WCAG AA as the baseline. Preserve reduced-motion handling for animation-heavy
surfaces. Ensure touch targets are at least 44px on mobile, interactive elements
are keyboard accessible, and match cards provide non-swipe controls for users
who cannot or do not want to use gestures.
