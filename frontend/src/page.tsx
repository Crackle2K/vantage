/**
 * @fileoverview Vantage landing page (`/`) in a quiet editorial style.
 * The page uses warm monochrome surfaces, flat bento sections, and
 * IntersectionObserver reveals instead of heavy scroll choreography.
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Link } from 'react-router-dom';

gsap.registerPlugin(ScrollTrigger);

interface CategoryCard {
  categoryName: string;
  placeCount: number;
  description: string;
  tone: 'green' | 'blue' | 'yellow' | 'red';
  image: string;
  pace: string;
  cues: [string, string];
  layout: 'photo' | 'flat';
}

interface SignalCard {
  eyebrow: string;
  title: string;
  detail: string;
  meta: string;
  image: string;
  accent: 'forest' | 'gold' | 'ink';
  size: 'wide' | 'standard';
  bullets: [string, string];
}

interface FaqItem {
  question: string;
  answer: string;
}

interface MarqueeItem {
  label: string;
  meta: string;
  image: string;
}

const categoryCards: CategoryCard[] = [
  {
    categoryName: 'Cafes',
    placeCount: 214,
    description: 'Morning counters, quiet work tables, and neighborhood regulars.',
    tone: 'green',
    image: '/Images/image1.webp',
    pace: 'Slow mornings, quick resets',
    cues: ['Laptop corners', 'Regular traffic'],
    layout: 'flat',
  },
  {
    categoryName: 'Restaurants',
    placeCount: 386,
    description: 'Dinner rooms with recent visits, return traffic, and owner updates.',
    tone: 'yellow',
    image: '/Images/image2.webp',
    pace: 'High-turn evenings',
    cues: ['Booked tables', 'Late reservations'],
    layout: 'photo',
  },
  {
    categoryName: 'Bars',
    placeCount: 143,
    description: 'Late-night rooms ranked by actual activity, not paid placement.',
    tone: 'blue',
    image: '/Images/image3.webp',
    pace: 'After-hours energy',
    cues: ['Repeat crowds', 'Weekend spikes'],
    layout: 'flat',
  },
  {
    categoryName: 'Bakeries',
    placeCount: 98,
    description: 'Small shops that locals keep saving, reviewing, and revisiting.',
    tone: 'red',
    image: '/Images/image4.webp',
    pace: 'Early rush, quick sellouts',
    cues: ['Morning lines', 'Return orders'],
    layout: 'flat',
  },
  {
    categoryName: 'Hidden gems',
    placeCount: 167,
    description: 'Lower-volume places with credible signals from nearby people.',
    tone: 'green',
    image: '/Images/image5.webp',
    pace: 'Quiet but rising',
    cues: ['Local saves', 'Word-of-mouth'],
    layout: 'photo',
  },
  {
    categoryName: 'Wellness',
    placeCount: 121,
    description: 'Studios, salons, clinics, and appointment-based local services.',
    tone: 'blue',
    image: '/Images/image1.webp',
    pace: 'Booked calendars',
    cues: ['Owner updates', 'Repeat bookings'],
    layout: 'flat',
  },
];

const signalCards: SignalCard[] = [
  {
    eyebrow: 'Verified visits',
    title: 'Recent visits',
    detail: 'Fresh check-ins carry more weight than old review volume.',
    meta: '14,837 verified visits',
    image: 'https://picsum.photos/seed/vantage-visits/1200/900',
    accent: 'forest',
    size: 'wide',
    bullets: ['Weighted for recency', 'Anchored to neighborhood behavior'],
  },
  {
    eyebrow: 'Return pattern',
    title: 'Return behavior',
    detail: 'Places people revisit are separated from one-time hype.',
    meta: '4,216 ranked places',
    image: 'https://picsum.photos/seed/vantage-returns/1200/900',
    accent: 'ink',
    size: 'wide',
    bullets: ['Repeat visits outrank one-off spikes', 'Stable demand surfaces faster'],
  },
  {
    eyebrow: 'Operator rhythm',
    title: 'Owner activity',
    detail: 'Claimed businesses can publish events, deals, and availability updates.',
    meta: '923 owner notes',
    image: 'https://picsum.photos/seed/vantage-owners/1200/900',
    accent: 'gold',
    size: 'standard',
    bullets: ['Events and hours stay current', 'No paid boost inside ranking'],
  },
  {
    eyebrow: 'Credibility filter',
    title: 'Community trust',
    detail: 'Credibility tiers help filter noisy ratings from durable local signal.',
    meta: '91% recent-backed picks',
    image: 'https://picsum.photos/seed/vantage-trust/1200/900',
    accent: 'forest',
    size: 'standard',
    bullets: ['Signal beats stale volume', 'Credible locals influence more'],
  },
  {
    eyebrow: 'Save velocity',
    title: 'Shortlist momentum',
    detail: 'Saves and return intent show which places are earning consideration right now.',
    meta: '5,402 active shortlists',
    image: 'https://picsum.photos/seed/vantage-saves/1200/900',
    accent: 'ink',
    size: 'standard',
    bullets: ['Tracks intent before reviews land', 'Flags breakout places earlier'],
  },
  {
    eyebrow: 'Block-level movement',
    title: 'Neighborhood clustering',
    detail: 'Vantage spots when a street or district starts pulling more local attention.',
    meta: '18 live districts',
    image: 'https://picsum.photos/seed/vantage-neighborhoods/1200/900',
    accent: 'gold',
    size: 'standard',
    bullets: ['Useful for where to go next', 'Built from real nearby activity'],
  },
];

const faqItems: FaqItem[] = [
  {
    question: 'How is Vantage different from a review site?',
    answer:
      'Vantage prioritizes recent local behavior: check-ins, return visits, saved places, owner updates, and trust-weighted activity. Reviews still matter, but they are not the whole ranking.',
  },
  {
    question: 'Can business owners control their listing?',
    answer:
      'Owners can claim a business, keep profile details current, publish events or deals, and see the local signals that affect discovery.',
  },
  {
    question: 'Does Vantage sell top placement?',
    answer:
      'The landing page and ranking model are built around trust signals. Sponsored placement is not mixed into organic trust-ranked recommendations.',
  },
  {
    question: 'What areas does it support first?',
    answer:
      'The product is centered on Toronto-area neighborhoods first, with Markham, Unionville, and nearby local circuits used as the initial discovery model.',
  },
];

const marqueeItems: MarqueeItem[] = [
  {
    label: 'Unionville dinner rooms',
    meta: '154 fresh saves',
    image: '/Images/volosgreekcuisine.webp',
  },
  {
    label: 'Markham coffee counters',
    meta: '127 verified visits',
    image: '/Images/dineencoffeeco.webp',
  },
  {
    label: 'Wellness bookings',
    meta: '18 owner updates',
    image: '/Images/laperlasalon&spa.webp',
  },
  {
    label: 'Late-night returns',
    meta: '42 repeat visits',
    image: '/Images/Activity.png',
  },
  {
    label: 'Neighborhood picks',
    meta: '86 trust score',
    image: '/Images/Explore.png',
  },
  {
    label: 'Claimed listings',
    meta: '31% discovery lift',
    image: '/Images/Pricing.png',
  },
];

const localSignalRows = [
  {
    label: 'Unionville dinner rooms',
    value: '+23%',
  },
  {
    label: 'Markham coffee counters',
    value: '127',
  },
  {
    label: 'Old Thornhill saved places',
    value: '74',
  },
  {
    label: 'Owner events this week',
    value: '18',
  },
];

const heroImageUrl = 'https://picsum.photos/seed/vantage-neighborhood-restaurant-night/1920/1280';

function HomePage() {
  const [newsletterEmailValue, setNewsletterEmailValue] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const landingRootRef = useRef<HTMLDivElement | null>(null);
  const marqueeTrackRef = useRef<HTMLDivElement | null>(null);
  const heroSectionRef = useRef<HTMLElement | null>(null);
  const signalStageRef = useRef<HTMLDivElement | null>(null);
  const signalPinRef = useRef<HTMLDivElement | null>(null);
  const panelStageRef = useRef<HTMLDivElement | null>(null);
  const panelCardRefs = useRef<Array<HTMLElement | null>>([]);
  const signalCardRefs = useRef<Array<HTMLElement | null>>([]);
  const categoryCardRefs = useRef<Array<HTMLElement | null>>([]);
  const cardMediaRefs = useRef<Array<HTMLElement | null>>([]);
  const ledgerRowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const ledgerValueRefs = useRef<Array<HTMLElement | null>>([]);

  const marqueeLoopItems = useMemo(() => [...marqueeItems, ...marqueeItems], []);

  useEffect(() => {
    const root = landingRootRef.current;
    if (!root) return;

    const revealElements = Array.from(root.querySelectorAll<HTMLElement>('.min-reveal'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
    );

    revealElements.forEach((element, index) => {
      element.style.setProperty('--index', String(index % 8));
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let marqueeTween: gsap.core.Tween | null = null;
    const media = gsap.matchMedia();

    const syncMarquee = (): void => {
      marqueeTween?.kill();

      if (!marqueeTrackRef.current) return;

      const distance = marqueeTrackRef.current.scrollWidth / 2;
      if (!distance) return;

      gsap.set(marqueeTrackRef.current, { x: 0 });
      marqueeTween = gsap.to(marqueeTrackRef.current, {
        x: -distance,
        duration: 28,
        ease: 'none',
        repeat: -1,
      });
    };

    const context = gsap.context(() => {
      syncMarquee();
      window.addEventListener('resize', syncMarquee);

      media.add('(min-width: 901px)', () => {
        const panelCards = panelCardRefs.current.filter((card): card is HTMLElement => card !== null);
        const panelStage = panelStageRef.current;
        const signalStage = signalStageRef.current;
        const signalPin = signalPinRef.current;
        const initialHold = 0.55;
        const revealGap = 1.45;
        const revealDuration = 0.9;
        const finalHold = 1.15;

        if (signalStage && signalPin) {
          ScrollTrigger.create({
            trigger: signalStage,
            start: 'top top+=96',
            end: 'bottom bottom-=120',
            pin: signalPin,
            pinSpacing: false,
          });
        }

        if (!panelStage || panelCards.length === 0) return;

        gsap.set(panelCards, {
          zIndex: (index) => index + 1,
          yPercent: (index) => (index === 0 ? 0 : 100),
        });

        const panelsTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: panelStage,
            start: 'top top',
            end: `+=${window.innerHeight * (initialHold + finalHold + (panelCards.length - 1) * revealGap)}`,
            pin: true,
            scrub: true,
            anticipatePin: 1,
          },
        });

        panelCards.slice(1).forEach((card, index) => {
          panelsTimeline.to(
            card,
            {
              yPercent: 0,
              ease: 'none',
              duration: revealDuration,
            },
            initialHold + index * revealGap
          );
        });
      });

      media.add('(max-width: 900px)', () => {
        const panelCards = panelCardRefs.current.filter((card): card is HTMLElement => card !== null);
        if (panelCards.length === 0) return;

        gsap.set(panelCards, {
          clearProps: 'transform',
        });
      });

      const animatedCards = [...signalCardRefs.current, ...categoryCardRefs.current].filter(
        (card): card is HTMLElement => card !== null
      );
      const animatedMedia = cardMediaRefs.current.filter((mediaNode): mediaNode is HTMLElement => mediaNode !== null);
      const ledgerRows = ledgerRowRefs.current.filter((row): row is HTMLDivElement => row !== null);
      const ledgerValues = ledgerValueRefs.current.filter((valueNode): valueNode is HTMLElement => valueNode !== null);

      animatedCards.forEach((card, index) => {
        gsap.fromTo(
          card,
          {
            opacity: 0.22,
            y: 64,
            scale: 0.92,
          },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 1.1,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: card,
              start: 'top bottom-=90',
              once: true,
            },
            delay: index * 0.04,
          }
        );
      });

      animatedMedia.forEach((mediaNode) => {
        gsap.fromTo(
          mediaNode,
          {
            scale: 0.82,
            opacity: 0.32,
          },
          {
            scale: 1,
            opacity: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: mediaNode,
              start: 'top bottom-=80',
              end: 'bottom top+=120',
              scrub: true,
            },
          }
        );
      });

      if (ledgerRows.length > 0) {
        gsap.set(ledgerRows, {
          '--row-rule-scale': 0,
          opacity: 0.45,
        });

        gsap.to(ledgerRows, {
          '--row-rule-scale': 1,
          opacity: 1,
          duration: 0.8,
          ease: 'power2.out',
          stagger: 0.08,
          scrollTrigger: {
            trigger: ledgerRows[0],
            start: 'top bottom-=120',
            once: true,
          },
        });
      }

      ledgerValues.forEach((valueNode) => {
        const rawValue = valueNode.dataset.value ?? valueNode.textContent ?? '';
        const prefix = rawValue.startsWith('+') ? '+' : '';
        const suffix = rawValue.endsWith('%') ? '%' : '';
        const target = Number(rawValue.replace(/[^\d.-]/g, ''));
        if (Number.isNaN(target)) return;

        const counter = { value: 0 };
        gsap.to(counter, {
          value: target,
          duration: 1.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: valueNode,
            start: 'top bottom-=120',
            once: true,
          },
          onUpdate: () => {
            valueNode.textContent = `${prefix}${Math.round(counter.value)}${suffix}`;
          },
        });
      });
    }, landingRootRef);

    return () => {
      window.removeEventListener('resize', syncMarquee);
      marqueeTween?.kill();
      media.revert();
      context.revert();
    };
  }, [marqueeLoopItems.length]);

  const handleNewsletterFormSubmit = (formEvent: FormEvent<HTMLFormElement>): void => {
    formEvent.preventDefault();
    setNewsletterEmailValue('');
  };

  const handleNewsletterEmailInputChange = (inputChangeEvent: ChangeEvent<HTMLInputElement>): void => {
    setNewsletterEmailValue(inputChangeEvent.target.value);
  };

  return (
    <div className="min-landing" ref={landingRootRef}>
      <section className="min-hero min-hero--image" ref={heroSectionRef}>
        <div className="min-hero-shell">
          <div className="min-hero-visual min-reveal" aria-label="Neighborhood restaurant at night">
            <img
              className="min-hero-visual__image"
              src={heroImageUrl}
              alt="Neighborhood restaurant frontage at night with warm local street activity."
            />
            <div className="min-hero-visual__scrim" aria-hidden="true" />
            <span className="min-hero-visual__wordmark">VANTAGE</span>
          </div>
        </div>
      </section>

      <section className="min-marquee-section" aria-label="Live local movement">
        <div className="min-container">
          <div className="min-marquee__intro min-reveal">
            <div>
              <p className="min-kicker">City motion</p>
              <h2>
                Watch
                {' '}
                <span
                  className="min-inline-pill"
                  aria-hidden="true"
                  style={{ backgroundImage: "url('/Images/volosgreekcuisine.webp')" }}
                />
                {' '}
                the local signal move in real time.
              </h2>
            </div>
            <p>
              The strip loops continuously so the page starts moving before the user scrolls:
              neighborhoods, saves, repeat visits, and active listings all passing through one lane.
            </p>
          </div>
        </div>

        <div className="min-marquee">
          <div className="min-marquee__track" ref={marqueeTrackRef}>
            {marqueeLoopItems.map((item, index) => (
              <article className="min-marquee__item" key={`${item.label}-${index}`}>
                <img src={item.image} alt="" aria-hidden="true" />
                <div>
                  <span>{item.label}</span>
                  <strong>{item.meta}</strong>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="min-section min-section--tight min-section--signal-story" id="signals">
        <div className="min-container">
          <div className="min-signal-story" ref={signalStageRef}>
            <div className="min-signal-story__headline min-reveal" ref={signalPinRef}>
              <p className="min-kicker">The ranking model</p>
              <h2>
                Discovery should answer what changed
                {' '}
                <span
                  className="min-inline-pill min-inline-pill--large"
                  aria-hidden="true"
                  style={{ backgroundImage: "url('/Images/Explore.png')" }}
                />
                {' '}
                recently.
              </h2>
              <p>
                Vantage combines live behavior with durable trust markers, so a great new place can
                surface without waiting years to collect review volume.
              </p>
            </div>

            <div className="min-signal-rail" aria-label="Live Visibility Score inputs">
              {signalCards.map((card, index) => (
                <article
                  key={card.title}
                  className={`min-signal-row min-signal-row--${card.accent} min-reveal`}
                  ref={(node) => {
                    signalCardRefs.current[index] = node;
                  }}
                >
                  <div className="min-signal-row__index">{String(index + 1).padStart(2, '0')}</div>
                  <div>
                    <span className="min-mono">{card.eyebrow}</span>
                    <h3>{card.title}</h3>
                    <p>{card.detail}</p>
                    <div className="min-signal-row__bullets">
                      {card.bullets.map((bullet) => (
                        <span key={bullet}>{bullet}</span>
                      ))}
                    </div>
                  </div>
                  <div className="min-signal-row__stat">
                    <span>{card.meta}</span>
                    <div
                      className="min-signal-row__image"
                      ref={(node) => {
                        cardMediaRefs.current[index] = node;
                      }}
                      style={{ backgroundImage: `url('${card.image}')` }}
                      aria-hidden="true"
                    />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="min-section" id="browse">
        <div className="min-container">
          <div className="min-split-header min-reveal">
            <div>
              <p className="min-kicker">Browse by type</p>
              <h2>Start with the kind of place you need.</h2>
            </div>
            <p>
              Categories stay intentionally simple. Each one is filtered by recent activity,
              independent signals, and places people nearby keep returning to.
            </p>
          </div>

          <div className="min-category-grid">
            {categoryCards.map((category, index) => (
              <Link
                key={category.categoryName}
                to="/businesses"
                className={`min-category-card min-category-card--${category.tone} min-category-card--${category.layout} min-reveal`}
                aria-label={`Browse ${category.categoryName}`}
                ref={(node) => {
                  categoryCardRefs.current[index] = node;
                }}
              >
                <div
                  className="min-category-card__media"
                  style={{ backgroundImage: `url('${category.image}')` }}
                  aria-hidden="true"
                />
                <div className="min-category-card__topline">
                  <span className={`min-tag min-tag--${category.tone}`}>{category.placeCount} places</span>
                  <span className="min-category-card__arrow" aria-hidden="true">/</span>
                </div>
                <h3>{category.categoryName}</h3>
                <p>{category.description}</p>
                <div className="min-category-card__footer">
                  <strong>{category.pace}</strong>
                  <div className="min-category-card__cues">
                    {category.cues.map((cue) => (
                      <span key={cue}>{cue}</span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="min-panel-story" aria-label="How Vantage sequences discovery">
        <div className="min-container">
          <div className="min-panel-story__intro">
            <div>
              <p className="min-kicker">Cover sequence</p>
              <h2>Three full panels carrying the rest of the story in one continuous scroll.</h2>
            </div>
            <div className="min-panel-story__aside">
              <p>
                Each layer stays open until the next one fully covers it. The final panel lingers
                before release so the sequence reads like a chapter, not a transition.
              </p>
              <div className="min-panel-diagram" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>

        <div className="min-panel-stage-wrap">
          <div className="min-panel-stage" ref={panelStageRef}>
            <div
              className="min-panel-stage__layer"
              ref={(node) => {
                panelCardRefs.current[0] = node;
              }}
            >
              <article className="min-panel-card min-panel-card--stack min-panel-card--locals">
                <div className="min-panel-block">
                  <p className="min-kicker">For locals</p>
                  <h3>
                    Save the places
                    {' '}
                    <span
                      className="min-inline-pill"
                      aria-hidden="true"
                      style={{ backgroundImage: "url('/Images/dineencoffeeco.webp')" }}
                    />
                    {' '}
                    you would actually recommend.
                  </h3>
                  <p>
                    Keep a cleaner shortlist, follow neighborhoods, and use recent check-ins to avoid
                    places that only look active in old photos.
                  </p>
                </div>
                <div className="min-panel-ledger">
                  {localSignalRows.map((row, index) => (
                    <div
                      className="min-panel-ledger__row"
                      key={row.label}
                      ref={(node) => {
                        ledgerRowRefs.current[index] = node;
                      }}
                    >
                      <span>{row.label}</span>
                      <strong
                        data-value={row.value}
                        ref={(node) => {
                          ledgerValueRefs.current[index] = node;
                        }}
                      >
                        {row.value}
                      </strong>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <div
              className="min-panel-stage__layer"
              ref={(node) => {
                panelCardRefs.current[1] = node;
              }}
            >
              <article className="min-panel-card min-panel-card--stack min-panel-card--owners">
                <div className="min-panel-window">
                  <div className="min-panel-window__bar">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="min-panel-window__body">
                    <div className="min-panel-window__headline">
                      <span className="min-tag min-tag--yellow">Owner console</span>
                      <h4>Volos Greek Cuisine</h4>
                      <p>Publish a patio event, update hours, and see what helped people find you.</p>
                    </div>
                    <div className="min-panel-window__stats">
                      <div className="min-panel-window__stat">
                        <span>Discovery lift</span>
                        <strong>31%</strong>
                      </div>
                      <div className="min-panel-window__stat">
                        <span>Saved this week</span>
                        <strong>58</strong>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="min-panel-block">
                  <p className="min-kicker">For business owners</p>
                  <h3>Keep your listing accurate without turning it into an ad.</h3>
                  <p>
                    Claimed businesses can post events, publish deals, update profile details, and understand
                    how community behavior is shaping discovery.
                  </p>
                  <Link to="/claim" className="min-secondary-button min-secondary-button--inline">
                    Start a claim
                  </Link>
                </div>
              </article>
            </div>

            <div
              className="min-panel-stage__layer"
              ref={(node) => {
                panelCardRefs.current[2] = node;
              }}
            >
              <article className="min-panel-card min-panel-card--stack min-panel-card--journal">
                <div className="min-panel-poster" aria-label="Vantage brand mark poster">
                  <img src="/Images/Vantage.png" alt="Vantage logo" />
                  <span className="min-panel-poster__wordmark">Vantage</span>
                  <span className="min-panel-poster__rule" aria-hidden="true" />
                  <p>Verified local movement</p>
                </div>
                <div className="min-panel-block">
                  <p className="min-kicker">Neighborhood notes</p>
                  <h3>Unionville is gaining dinner traffic again.</h3>
                  <p>
                    The latest signal mix shows more evening saves, higher return visits, and a cluster
                    of owner-posted events around Main Street. Vantage turns those small movements into
                    something you can act on.
                  </p>
                  <Link to="/activity" className="min-text-link">Read the activity feed</Link>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="min-section" id="questions">
        <div className="min-container min-faq">
          <div className="min-section__header min-reveal">
            <p className="min-kicker">Questions</p>
            <h2>Plain answers before you browse.</h2>
          </div>

          <div className="min-faq__list min-reveal">
            {faqItems.map((item, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div className="min-faq__item" key={item.question}>
                  <button type="button" onClick={() => setOpenFaqIndex(isOpen ? -1 : index)}>
                    <span>{item.question}</span>
                    <span aria-hidden="true">{isOpen ? '-' : '+'}</span>
                  </button>
                  {isOpen && <p>{item.answer}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="min-cta">
        <div className="min-container min-cta__inner min-reveal">
          <div>
            <p className="min-kicker">Start close to home</p>
            <h2>Use Vantage the next time you need a real local answer.</h2>
          </div>
          <div className="min-cta__actions">
            <Link to="/businesses" className="min-primary-button min-primary-button--large">
              Browse places
            </Link>
            <Link to="/pricing" className="min-secondary-button">
              Owner pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="min-newsletter">
        <div className="min-container min-newsletter__grid">
          <div className="min-reveal">
            <h2>A weekly read on local movement.</h2>
            <p>Rising places, recent owner updates, and credible neighborhood picks.</p>
          </div>
          <form className="min-newsletter__form min-reveal" onSubmit={handleNewsletterFormSubmit}>
            <label htmlFor="landing-email">Email</label>
            <div>
              <input
                id="landing-email"
                type="email"
                value={newsletterEmailValue}
                onChange={handleNewsletterEmailInputChange}
                placeholder="you@example.com"
                required
              />
              <button type="submit">Subscribe</button>
            </div>
          </form>
        </div>
      </section>

    </div>
  );
}

export default HomePage;
