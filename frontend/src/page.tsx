/**
 * @fileoverview Vantage landing page (`/`) rebuilt as a scroll-driven editorial
 * experience with GSAP motion systems.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react"
import { Link } from "react-router-dom"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useAuth } from "./contexts/AuthContext"

gsap.registerPlugin(ScrollTrigger)

interface TickerItem {
  actorName: string
  activityText: string
}

interface CategoryCard {
  categoryName: string
  placeCount: number
  imageSource: string
}

interface LoopingCategoryCard extends CategoryCard {
  baseIndex: number
  loopKey: string
}

interface PhotoTile {
  imageSource: string
  businessName: string
  neighbourhoodName: string
  checkInsText: string
}

interface Testimonial {
  quote: string
  reviewerName: string
  reviewerDescriptor: "Regular" | "Local Explorer"
}

const liveTickerItems: TickerItem[] = [
  { actorName: "Roy", activityText: "checked in at Sisters Coffee House" },
  { actorName: "Ari", activityText: "left a review for The Elm Table" },
  { actorName: "Nadia", activityText: "found a hidden gem in Unionville" },
  { actorName: "Marco", activityText: "rated Grain & Ground Bakehouse 5 stars" },
  { actorName: "Elena", activityText: "checked in at The Amber Root" },
  { actorName: "Priya", activityText: "left a review for Lantern House" },
  { actorName: "Daniel", activityText: "checked in at Street Oven" },
  { actorName: "Jules", activityText: "found a hidden gem near Old Thornhill" },
]

const categoryCards: CategoryCard[] = [
  {
    categoryName: "Cafés",
    placeCount: 214,
    imageSource:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80",
  },
  {
    categoryName: "Restaurants",
    placeCount: 386,
    imageSource:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80",
  },
  {
    categoryName: "Bars",
    placeCount: 143,
    imageSource:
      "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=900&q=80",
  },
  {
    categoryName: "Bakeries",
    placeCount: 98,
    imageSource:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80",
  },
  {
    categoryName: "Hidden Gems",
    placeCount: 167,
    imageSource:
      "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80",
  },
]

const CATEGORY_CAROUSEL_LOOP_SET_COUNT = 3
const CATEGORY_CARD_ORNAMENT_SOURCE = "/Images/golden_ornament.svg"

function buildLoopingCategoryCards(cards: CategoryCard[]): LoopingCategoryCard[] {
  return Array.from({ length: CATEGORY_CAROUSEL_LOOP_SET_COUNT }, (_, loopSetIndex) =>
    cards.map((categoryCard, baseIndex) => ({
      ...categoryCard,
      baseIndex,
      loopKey: `${categoryCard.categoryName}-${loopSetIndex}`,
    })),
  ).flat()
}

const photoTiles: PhotoTile[] = [
  {
    imageSource:
      "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=900&q=80",
    businessName: "Street Oven",
    neighbourhoodName: "Markham Village",
    checkInsText: "127 check-ins",
  },
  {
    imageSource:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
    businessName: "Lantern House",
    neighbourhoodName: "Unionville",
    checkInsText: "93 check-ins",
  },
  {
    imageSource:
      "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80",
    businessName: "Night Counter",
    neighbourhoodName: "Old Thornhill",
    checkInsText: "74 check-ins",
  },
  {
    imageSource:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80",
    businessName: "Morning Kettle",
    neighbourhoodName: "Unionville",
    checkInsText: "51 check-ins",
  },
  {
    imageSource:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80",
    businessName: "Bakery Row",
    neighbourhoodName: "Markham Village",
    checkInsText: "44 check-ins",
  },
  {
    imageSource:
      "https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?auto=format&fit=crop&w=900&q=80",
    businessName: "Harbor Light",
    neighbourhoodName: "Downtown",
    checkInsText: "39 check-ins",
  },
]

const testimonials: Testimonial[] = [
  {
    quote:
      "I found the coffee shop my whole block now meets at because the check-ins were real and current.",
    reviewerName: "Nadia K.",
    reviewerDescriptor: "Regular",
  },
  {
    quote: "Vantage feels like getting recommendations from neighbors who actually live here.",
    reviewerName: "Marco T.",
    reviewerDescriptor: "Local Explorer",
  },
  {
    quote:
      "Trust scores make it easy to skip hype and go straight to places people truly return to.",
    reviewerName: "Elena R.",
    reviewerDescriptor: "Regular",
  },
]

function isTouchDevice(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0
}

function buildUnsplashVariant(url: string, width: number): string {
  return url.replace(/([?&])w=\d+/i, `$1w=${width}`)
}

function buildUnsplashSrcSet(url: string, widths: number[] = [480, 900, 1400, 2000]): string {
  return widths.map((width) => `${buildUnsplashVariant(url, width)} ${width}w`).join(", ")
}

function populatePhotoTileOverlaysFromDataAttributes(rootElement: HTMLElement): void {
  const photoTileElements = rootElement.querySelectorAll<HTMLElement>(".photo-tile")
  photoTileElements.forEach((photoTileElement) => {
    const businessName = photoTileElement.dataset.name ?? ""
    const neighbourhoodName = photoTileElement.dataset.area ?? ""
    const checkInsText = photoTileElement.dataset.checkins ?? ""

    const nameElement = photoTileElement.querySelector<HTMLElement>(".overlay-name")
    const areaElement = photoTileElement.querySelector<HTMLElement>(".overlay-meta")
    const checkInsElement = photoTileElement.querySelector<HTMLElement>(".overlay-checkins")

    if (nameElement) nameElement.textContent = businessName
    if (areaElement) areaElement.textContent = neighbourhoodName
    if (checkInsElement) checkInsElement.textContent = checkInsText
  })
}

function animateCountersOnScroll(rootElement: HTMLElement): void {
  const counterElements = rootElement.querySelectorAll<HTMLElement>("[data-count]")

  counterElements.forEach((counterElement) => {
    const targetCount = Number(counterElement.dataset.count ?? "0")
    const hasPercentSuffix = counterElement.dataset.suffix === "percent"
    const counterState = { val: 0 }

    gsap.to(counterState, {
      val: targetCount,
      duration: 2.5,
      ease: "power2.out",
      scrollTrigger: {
        trigger: counterElement,
        start: "top 85%",
        once: true,
        invalidateOnRefresh: true,
      },
      onUpdate: () => {
        const roundedValue = Math.round(counterState.val)
        const formattedValue = roundedValue.toLocaleString("en-US")
        counterElement.textContent = hasPercentSuffix ? `${formattedValue}` : formattedValue
      },
    })
  })
}

function initializeCustomCursor(rootElement: HTMLElement): () => void {
  if (isTouchDevice()) {
    document.body.style.cursor = "auto"
    return () => {
      document.body.style.cursor = ""
    }
  }

  document.body.style.cursor = "none"

  const cursorDotElement = document.createElement("div")
  cursorDotElement.id = "cursor-dot"

  const cursorRingElement = document.createElement("div")
  cursorRingElement.id = "cursor-ring"

  const cursorRingLabelElement = document.createElement("span")
  cursorRingLabelElement.id = "cursor-ring-label"
  cursorRingLabelElement.textContent = "EXPLORE"
  cursorRingElement.appendChild(cursorRingLabelElement)

  document.body.appendChild(cursorDotElement)
  document.body.appendChild(cursorRingElement)

  let mouseX = 0
  let mouseY = 0
  let ringX = 0
  let ringY = 0

  const handleMouseMove = (mouseEvent: MouseEvent): void => {
    mouseX = mouseEvent.clientX
    mouseY = mouseEvent.clientY

    gsap.set(cursorDotElement, {
      x: mouseX,
      y: mouseY,
    })
  }

  const tickerFunction = (): void => {
    ringX += (mouseX - ringX) * 0.12
    ringY += (mouseY - ringY) * 0.12
    gsap.set(cursorRingElement, { x: ringX, y: ringY })
  }

  const interactiveElements = rootElement.querySelectorAll<HTMLElement>(
    "a, button, .category-card, .photo-tile",
  )

  const cleanupFunctions: Array<() => void> = []

  interactiveElements.forEach((interactiveElement) => {
    const handleMouseEnter = (): void => {
      gsap.to(cursorRingElement, {
        scale: 2.5,
        borderColor: "rgba(58,125,68,0.9)",
        duration: 0.3,
        ease: "power2.out",
      })

      if (interactiveElement.classList.contains("photo-tile")) {
        cursorRingElement.classList.add("cursor-ring--show-label")
      }
    }

    const handleMouseLeave = (): void => {
      gsap.to(cursorRingElement, {
        scale: 1,
        borderColor: "rgba(58,125,68,0.6)",
        duration: 0.3,
        ease: "power2.out",
      })

      cursorRingElement.classList.remove("cursor-ring--show-label")
    }

    interactiveElement.addEventListener("mouseenter", handleMouseEnter)
    interactiveElement.addEventListener("mouseleave", handleMouseLeave)

    cleanupFunctions.push(() => {
      interactiveElement.removeEventListener("mouseenter", handleMouseEnter)
      interactiveElement.removeEventListener("mouseleave", handleMouseLeave)
    })
  })

  window.addEventListener("mousemove", handleMouseMove)
  gsap.ticker.add(tickerFunction)

  return () => {
    cleanupFunctions.forEach((cleanupFunction) => cleanupFunction())
    window.removeEventListener("mousemove", handleMouseMove)
    gsap.ticker.remove(tickerFunction)
    cursorDotElement.remove()
    cursorRingElement.remove()
    document.body.style.cursor = ""
  }
}

function initializeCategoryCarousel(rootElement: HTMLElement): () => void {
  const carouselElement = rootElement.querySelector<HTMLElement>(".category-panel__row")
  if (!carouselElement) return () => {}

  const cardElements = Array.from(
    carouselElement.querySelectorAll<HTMLElement>(".category-card"),
  )
  const baseCardCount = Number(carouselElement.dataset.baseCardCount ?? "0")
  if (cardElements.length === 0 || baseCardCount <= 0) return () => {}

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const wheelScrollMultiplier = prefersReducedMotion ? 1 : 0.7
  const smoothingFactor = prefersReducedMotion ? 1 : 0.14
  const focusSwitchHysteresis = prefersReducedMotion ? 0 : 22
  const settleDistanceThreshold = prefersReducedMotion ? 0.01 : 0.35

  let loopWidth = 0
  let targetScrollLeft = 0
  let motionAnimationFrameId = 0
  let focusedCardIndex = -1
  let isDragging = false
  let activePointerId: number | null = null
  let lastDragClientX = 0
  let suppressCardClick = false
  let suppressCardClickTimeoutId: ReturnType<typeof window.setTimeout> | null = null
  let hasDraggedSincePointerDown = false
  let cardCenterOffsets: number[] = []

  const removeCardOrnaments = (): void => {
    carouselElement.querySelectorAll<HTMLElement>(".card-ornament").forEach((ornamentElement) => {
      ornamentElement.remove()
    })
  }

  const injectOrnamentIntoCard = (cardElement: HTMLElement): void => {
    removeCardOrnaments()

    const ornamentElement = document.createElement("img")
    ornamentElement.className = "card-ornament"
    ornamentElement.src = CATEGORY_CARD_ORNAMENT_SOURCE
    ornamentElement.alt = ""
    ornamentElement.setAttribute("aria-hidden", "true")
    ornamentElement.draggable = false

    const imageWrapElement = cardElement.querySelector<HTMLElement>(".card-image-wrap")
    cardElement.insertBefore(ornamentElement, imageWrapElement ?? cardElement.firstChild)
  }

  const getCardCenteredScrollLeft = (cardElement: HTMLElement): number => {
    return cardElement.offsetLeft - (carouselElement.clientWidth - cardElement.offsetWidth) / 2
  }

  const updateLoopWidth = (): void => {
    if (!cardElements[baseCardCount]) {
      loopWidth = 0
      return
    }

    loopWidth = cardElements[baseCardCount].offsetLeft - cardElements[0].offsetLeft
  }

  const updateCardCenterOffsets = (): void => {
    cardCenterOffsets = cardElements.map(
      (cardElement) => cardElement.offsetLeft + cardElement.offsetWidth / 2,
    )
  }

  const centerMiddleSetCard = (baseIndex: number): void => {
    const normalizedBaseIndex = ((baseIndex % baseCardCount) + baseCardCount) % baseCardCount
    const middleSetCard =
      cardElements[baseCardCount + normalizedBaseIndex] ?? cardElements[baseCardCount]
    if (!middleSetCard) return

    const centeredScrollLeft = getCardCenteredScrollLeft(middleSetCard)
    carouselElement.scrollLeft = centeredScrollLeft
    targetScrollLeft = centeredScrollLeft
  }

  const normalizeLoopPosition = (): void => {
    if (loopWidth <= 0) return

    const leftLoopBoundary = loopWidth * 0.5
    const rightLoopBoundary = loopWidth * 1.5
    let appliedShift = 0

    if (carouselElement.scrollLeft < leftLoopBoundary) {
      appliedShift = loopWidth
    }

    if (carouselElement.scrollLeft > rightLoopBoundary) {
      appliedShift = -loopWidth
    }

    if (appliedShift !== 0) {
      carouselElement.scrollLeft += appliedShift
      targetScrollLeft += appliedShift
    }
  }

  const updateFocusedCard = (): void => {
    if (cardCenterOffsets.length !== cardElements.length) updateCardCenterOffsets()
    const carouselCenterX = carouselElement.scrollLeft + carouselElement.clientWidth / 2

    let nextFocusedCardIndex = -1
    let closestDistanceFromCenter = Number.POSITIVE_INFINITY

    cardCenterOffsets.forEach((cardCenterX, cardIndex) => {
      const distanceFromCenter = Math.abs(carouselCenterX - cardCenterX)

      if (distanceFromCenter < closestDistanceFromCenter) {
        closestDistanceFromCenter = distanceFromCenter
        nextFocusedCardIndex = cardIndex
      }
    })

    if (nextFocusedCardIndex < 0) return

    if (nextFocusedCardIndex === focusedCardIndex) {
      const activeCardElement = cardElements[nextFocusedCardIndex]
      if (activeCardElement && !activeCardElement.querySelector(".card-ornament")) {
        injectOrnamentIntoCard(activeCardElement)
      }
      return
    }

    if (focusedCardIndex >= 0 && focusSwitchHysteresis > 0) {
      const currentFocusedCardCenterX = cardCenterOffsets[focusedCardIndex]
      if (currentFocusedCardCenterX !== undefined) {
        const currentFocusedDistanceFromCenter = Math.abs(
          carouselCenterX - currentFocusedCardCenterX,
        )
        const distanceImprovement =
          currentFocusedDistanceFromCenter - closestDistanceFromCenter
        if (distanceImprovement < focusSwitchHysteresis) return
      }
    }

    if (focusedCardIndex >= 0) {
      cardElements[focusedCardIndex]?.classList.remove("category-card--focused")
      cardElements[focusedCardIndex]?.classList.remove("active")
    }
    if (nextFocusedCardIndex >= 0) {
      cardElements[nextFocusedCardIndex]?.classList.add("category-card--focused")
      cardElements[nextFocusedCardIndex]?.classList.add("active")
      injectOrnamentIntoCard(cardElements[nextFocusedCardIndex])
    }
    focusedCardIndex = nextFocusedCardIndex
  }

  const animateMotion = (): void => {
    if (prefersReducedMotion) {
      carouselElement.scrollLeft = targetScrollLeft
      normalizeLoopPosition()
      updateFocusedCard()
      motionAnimationFrameId = 0
      return
    }

    const distanceToTarget = targetScrollLeft - carouselElement.scrollLeft
    if (Math.abs(distanceToTarget) <= settleDistanceThreshold) {
      carouselElement.scrollLeft = targetScrollLeft
      normalizeLoopPosition()
      updateFocusedCard()
      motionAnimationFrameId = 0
      return
    }

    carouselElement.scrollLeft += distanceToTarget * smoothingFactor
    normalizeLoopPosition()

    if (Math.abs(distanceToTarget) <= 10) {
      updateFocusedCard()
    }

    motionAnimationFrameId = window.requestAnimationFrame(animateMotion)
  }

  const requestMotion = (): void => {
    if (isDragging) return
    if (motionAnimationFrameId !== 0) return
    motionAnimationFrameId = window.requestAnimationFrame(animateMotion)
  }

  const handleCarouselWheel = (wheelEvent: WheelEvent): void => {
    const dominantAxisDelta =
      Math.abs(wheelEvent.deltaY) > Math.abs(wheelEvent.deltaX)
        ? wheelEvent.deltaY
        : wheelEvent.deltaX
    if (dominantAxisDelta === 0) return

    let normalizedWheelDelta = dominantAxisDelta
    if (wheelEvent.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      normalizedWheelDelta *= 16
    }
    if (wheelEvent.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      normalizedWheelDelta *= carouselElement.clientWidth
    }
    if (Math.abs(normalizedWheelDelta) < 0.5) return

    wheelEvent.preventDefault()
    const cappedDelta = Math.max(-96, Math.min(96, normalizedWheelDelta))
    targetScrollLeft += cappedDelta * wheelScrollMultiplier
    requestMotion()
  }

  const handleCarouselDragStart = (dragEvent: DragEvent): void => {
    dragEvent.preventDefault()
  }

  const handlePointerDown = (pointerEvent: PointerEvent): void => {
    if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return

    isDragging = true
    hasDraggedSincePointerDown = false
    activePointerId = pointerEvent.pointerId
    lastDragClientX = pointerEvent.clientX
    targetScrollLeft = carouselElement.scrollLeft

    if (motionAnimationFrameId !== 0) {
      window.cancelAnimationFrame(motionAnimationFrameId)
      motionAnimationFrameId = 0
    }

    carouselElement.classList.add("category-panel__row--dragging")
    carouselElement.setPointerCapture(pointerEvent.pointerId)
  }

  const handlePointerMove = (pointerEvent: PointerEvent): void => {
    if (!isDragging || pointerEvent.pointerId !== activePointerId) return

    const deltaX = pointerEvent.clientX - lastDragClientX
    if (deltaX === 0) return

    if (Math.abs(deltaX) > 0.5) {
      hasDraggedSincePointerDown = true
    }

    targetScrollLeft -= deltaX
    carouselElement.scrollLeft = targetScrollLeft
    normalizeLoopPosition()
    lastDragClientX = pointerEvent.clientX
  }

  const endPointerDrag = (pointerEvent: PointerEvent): void => {
    if (!isDragging || pointerEvent.pointerId !== activePointerId) return

    isDragging = false
    activePointerId = null
    carouselElement.classList.remove("category-panel__row--dragging")

    if (carouselElement.hasPointerCapture(pointerEvent.pointerId)) {
      carouselElement.releasePointerCapture(pointerEvent.pointerId)
    }

    if (hasDraggedSincePointerDown) {
      suppressCardClick = true
      if (suppressCardClickTimeoutId !== null) {
        window.clearTimeout(suppressCardClickTimeoutId)
      }
      suppressCardClickTimeoutId = window.setTimeout(() => {
        suppressCardClick = false
        suppressCardClickTimeoutId = null
      }, 0)
    }

    targetScrollLeft = carouselElement.scrollLeft
    updateFocusedCard()
  }

  const handleWindowResize = (): void => {
    updateLoopWidth()
    targetScrollLeft = carouselElement.scrollLeft
    updateCardCenterOffsets()
    normalizeLoopPosition()
    updateFocusedCard()
  }

  const cleanupFunctions: Array<() => void> = []

  cardElements.forEach((cardElement) => {
    const handleCardClick = (): void => {
      if (suppressCardClick) return

      const baseIndex = Number(cardElement.dataset.baseIndex ?? "0")
      const middleSetCard =
        cardElements[baseCardCount + baseIndex] ?? cardElements[baseIndex] ?? cardElement

      targetScrollLeft = getCardCenteredScrollLeft(middleSetCard)
      requestMotion()
    }

    cardElement.addEventListener("click", handleCardClick)
    cleanupFunctions.push(() => {
      cardElement.removeEventListener("click", handleCardClick)
    })
  })

  carouselElement.addEventListener("wheel", handleCarouselWheel, { passive: false })
  carouselElement.addEventListener("dragstart", handleCarouselDragStart)
  carouselElement.addEventListener("pointerdown", handlePointerDown)
  carouselElement.addEventListener("pointermove", handlePointerMove)
  carouselElement.addEventListener("pointerup", endPointerDrag)
  carouselElement.addEventListener("pointercancel", endPointerDrag)
  window.addEventListener("resize", handleWindowResize)

  updateLoopWidth()
  updateCardCenterOffsets()
  centerMiddleSetCard(0)
  updateFocusedCard()

  return () => {
    if (motionAnimationFrameId !== 0) {
      window.cancelAnimationFrame(motionAnimationFrameId)
    }

    if (suppressCardClickTimeoutId !== null) {
      window.clearTimeout(suppressCardClickTimeoutId)
    }

    carouselElement.removeEventListener("wheel", handleCarouselWheel)
    carouselElement.removeEventListener("dragstart", handleCarouselDragStart)
    carouselElement.removeEventListener("pointerdown", handlePointerDown)
    carouselElement.removeEventListener("pointermove", handlePointerMove)
    carouselElement.removeEventListener("pointerup", endPointerDrag)
    carouselElement.removeEventListener("pointercancel", endPointerDrag)
    window.removeEventListener("resize", handleWindowResize)
    cleanupFunctions.forEach((cleanupFunction) => cleanupFunction())
    removeCardOrnaments()

    cardElements.forEach((cardElement) => {
      cardElement.classList.remove("category-card--focused")
      cardElement.classList.remove("active")
    })
  }
}

/**
 * Renders the complete landing page.
 *
 * @returns {JSX.Element} Landing page UI.
 */
export default function HomePage() {
  const [newsletterEmailValue, setNewsletterEmailValue] = useState("")
  const { isAuthenticated } = useAuth()

  const landingRootReference = useRef<HTMLDivElement | null>(null)

  const duplicatedTickerItems = useMemo(
    () => [...liveTickerItems, ...liveTickerItems],
    [],
  )

  const heroHeadlineWords = useMemo(
    () => ["Find", "the", "places", "your", "city", "actually", "loves."],
    [],
  )

  const loopingCategoryCards = useMemo(
    () => buildLoopingCategoryCards(categoryCards),
    [],
  )

  const handleNewsletterFormSubmit = (formEvent: FormEvent<HTMLFormElement>): void => {
    formEvent.preventDefault()
    setNewsletterEmailValue("")
  }

  const handleNewsletterEmailInputChange = (inputChangeEvent: ChangeEvent<HTMLInputElement>): void => {
    setNewsletterEmailValue(inputChangeEvent.target.value)
  }

  useEffect(() => {
    const landingRootElement = landingRootReference.current
    if (!landingRootElement) return

    populatePhotoTileOverlaysFromDataAttributes(landingRootElement)
    animateCountersOnScroll(landingRootElement)
    const categoryCarouselCleanupFunction = initializeCategoryCarousel(landingRootElement)
    const customCursorCleanupFunction = initializeCustomCursor(landingRootElement)

    const gsapContext = gsap.context(() => {
      const heroWordElements = gsap.utils.toArray<HTMLElement>(".hero-headline .word")
      gsap.set(heroWordElements, { yPercent: 110, willChange: "transform" })

      gsap.to(heroWordElements, {
        yPercent: 0,
        duration: 1.1,
        ease: "power4.out",
        stagger: 0.09,
        delay: 0.3,
        onComplete: () => {
          heroWordElements.forEach((wordElement) => {
            wordElement.style.willChange = "auto"
          })
        },
      })

      gsap.fromTo(".hero-subtext",
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 1.0,
          ease: "power3.out",
          delay: 1.4,
        },
      )

      gsap.fromTo(".hero-ctas",
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 1.0,
          ease: "power3.out",
          delay: 1.65,
        },
      )

      gsap.fromTo(".hero-stat-bar",
        { opacity: 0, y: 16 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: "power3.out",
          delay: 1.9,
        },
      )

      gsap.fromTo(
        ".stats-moment__line",
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1.0,
          ease: "power3.out",
          stagger: 0.15,
          scrollTrigger: {
            trigger: ".stats-moment",
            start: "top 88%",
            end: "top 55%",
            toggleActions: "play none none none",
            once: true,
            invalidateOnRefresh: true,
          },
        },
      )

      gsap.to(".neighbourhood-spotlight__photo", {
        yPercent: -20,
        ease: "none",
        scrollTrigger: {
          trigger: ".neighbourhood-spotlight",
          start: "top bottom",
          end: "bottom top",
          scrub: 1.5,
          invalidateOnRefresh: true,
        },
      })

    }, landingRootElement)

    const handleWindowResize = (): void => {
      ScrollTrigger.refresh()
    }
    window.addEventListener("resize", handleWindowResize)

    return () => {
      window.removeEventListener("resize", handleWindowResize)
      gsapContext.revert()
      categoryCarouselCleanupFunction()
      customCursorCleanupFunction()
    }
  }, [])

  return (
    <div className="vantage-landing" ref={landingRootReference}>
      <header className="landing-nav">
        <div className="vantage-landing__container landing-nav__content">
          <Link to="/" className="landing-nav__brand" aria-label="Vantage homepage">
            <img src="/Images/Vantage.svg" alt="Vantage logo" className="landing-nav__brand-logo" />
            <span className="landing-nav__brand-wordmark">Vantage</span>
          </Link>

          <nav className="landing-nav__center-links" aria-label="Primary">
            {isAuthenticated && (
              <>
                <a href="#app-download-strip" className="landing-nav__link">
                  For Business
                </a>
                <a href="#landing-footer" className="landing-nav__link">
                  About
                </a>
              </>
            )}
          </nav>

          <div className="landing-nav__actions">
            <Link to="/login" className="landing-nav__sign-in-link">
              Sign In
            </Link>
            <Link to="/signup" className="landing-nav__cta-button">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <section className="hero-section">
        <img
          src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=2000&q=80"
          srcSet={buildUnsplashSrcSet("https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=2000&q=80")}
          sizes="100vw"
          alt="Busy neighborhood restaurant street scene"
          className="hero-section__background-image"
          loading="eager"
          fetchPriority="high"
        />
        <div className="hero-section__background-scrim" aria-hidden="true" />

        <div className="vantage-landing__container hero-section__content">
          <p className="vantage-landing__section-label hero-section__label">COMMUNITY DISCOVERY</p>
          <h1 className="hero-headline hero-section__headline">
            {heroHeadlineWords.map((heroHeadlineWord) => (
              <span key={heroHeadlineWord} className="word-wrap">
                <span className="word">{heroHeadlineWord}</span>
              </span>
            ))}
          </h1>
          <p className="hero-subtext hero-section__subtext">
            Verified check-ins. Real trust scores. No paid placements.
          </p>
          <div className="hero-ctas hero-section__cta-row">
            <Link to="/businesses" className="hero-section__primary-cta">
              Explore Places
            </Link>
            <a href="#panel-category" className="hero-section__secondary-cta">
              How it works
            </a>
          </div>
          <p className="hero-stat-bar hero-section__stat-bar">
            <span data-count="14200">14,200</span>
            <span aria-hidden="true">·</span>
            <span data-count="3800">3,800</span>
            <span aria-hidden="true">·</span>
            <span data-count="98" data-suffix="percent">
              98
            </span>
            <span>% verified</span>
          </p>
        </div>
      </section>

      <section className="live-ticker">
        <div className="live-ticker__track">
          {duplicatedTickerItems.map((tickerItem, tickerItemIndex) => (
            <span className="live-ticker__item" key={`${tickerItem.actorName}-${tickerItemIndex}`}>
              <span className="live-ticker__dot" />
              <span className="live-ticker__name">{tickerItem.actorName}</span> {tickerItem.activityText}
              <span className="live-ticker__separator">·</span>
            </span>
          ))}
        </div>
      </section>

      <section className="panel--category" id="panel-category">
        <div className="category-panel__content">
          <p className="vantage-landing__section-label">BROWSE BY TYPE</p>
          <div className="category-carousel">
            <div className="category-carousel__hints" aria-hidden="true">
              <span className="category-carousel__hint category-carousel__hint--left">‹</span>
              <span className="category-carousel__hint category-carousel__hint--right">›</span>
            </div>
            <div className="category-panel__row" data-base-card-count={categoryCards.length}>
              {loopingCategoryCards.map((categoryCard) => (
                <article key={categoryCard.loopKey} className="category-card" data-base-index={categoryCard.baseIndex}>
                  <div className="card-image-wrap">
                    <img
                      src={categoryCard.imageSource}
                      srcSet={buildUnsplashSrcSet(categoryCard.imageSource)}
                      sizes="(max-width: 767px) 90vw, (max-width: 1100px) 50vw, 320px"
                      alt={categoryCard.categoryName}
                      loading="lazy"
                      draggable={false}
                    />
                  </div>
                  <div className="card-overlay" />
                  <div className="card-bottom">
                    <span className="card-count">{categoryCard.placeCount} places</span>
                    <h3 className="card-name">{categoryCard.categoryName}</h3>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="photo-grid-section" id="photo-grid">
        <div className="vantage-landing__container">
          <p className="vantage-landing__section-label">FROM THE COMMUNITY</p>
          <h2 className="photo-grid__heading">What people are finding right now.</h2>
          <div className="photo-grid">
            {photoTiles.map((photoTile) => (
              <article
                key={`${photoTile.businessName}-${photoTile.neighbourhoodName}`}
                className="photo-tile"
                data-name={photoTile.businessName}
                data-area={photoTile.neighbourhoodName}
                data-checkins={photoTile.checkInsText}
              >
                <img
                  src={photoTile.imageSource}
                  srcSet={buildUnsplashSrcSet(photoTile.imageSource)}
                  sizes="(max-width: 767px) 100vw, (max-width: 1100px) 50vw, 33vw"
                  alt={`${photoTile.businessName} in ${photoTile.neighbourhoodName}`}
                  loading="lazy"
                />
                <div className="photo-overlay">
                  <p className="overlay-name" />
                  <p className="overlay-meta" />
                  <p className="overlay-checkins" />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="stats-moment">
        <div className="vantage-landing__container">
          <div className="stats-moment__line">
            <span className="stats-moment__number" data-count="14200">
              0
            </span>
            <span className="stats-moment__label">check-ins and counting</span>
          </div>
          <div className="stats-moment__divider" />
          <div className="stats-moment__line">
            <span className="stats-moment__number" data-count="3800">
              0
            </span>
            <span className="stats-moment__label">businesses trusted by locals</span>
          </div>
          <div className="stats-moment__divider" />
          <div className="stats-moment__line">
            <span className="stats-moment__number" data-count="98" data-suffix="percent">
              0
            </span>
            <span className="stats-moment__suffix">%</span>
            <span className="stats-moment__label">of check-ins independently verified</span>
          </div>
        </div>
      </section>

      <section className="neighbourhood-spotlight">
        <div className="neighbourhood-spotlight__left">
          <p className="vantage-landing__section-label">THIS WEEK'S SPOTLIGHT</p>
          <h2>Unionville, Markham</h2>
          <div className="neighbourhood-spotlight__rule" />
          <p className="neighbourhood-spotlight__meta">23 places · 847 check-ins this week</p>
          <p className="neighbourhood-spotlight__description">
            Historic storefronts, candlelit patios, and late-night coffee counters make this pocket
            one of the most trusted local circuits right now.
          </p>
          <a href="#panel-category" className="neighbourhood-spotlight__cta">
            Explore Unionville, Markham <span>→</span>
          </a>
        </div>
        <div className="neighbourhood-spotlight__right">
          <img
            src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80"
            srcSet={buildUnsplashSrcSet("https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80")}
            sizes="(max-width: 767px) 100vw, 55vw"
            alt="Evening street in Unionville"
            className="neighbourhood-spotlight__photo"
            loading="lazy"
          />
        </div>
      </section>

      <section className="testimonials-section">
        <div className="vantage-landing__container">
          <p className="vantage-landing__section-label">FROM THE COMMUNITY</p>
          <h2 className="testimonials-section__heading">Voices shaping local discovery.</h2>
          <div className="testimonials-section__card-grid">
            {testimonials.map((testimonial) => (
              <article key={testimonial.reviewerName} className="testimonials-section__card">
                <p className="testimonials-section__quote-mark" aria-hidden="true">
                  “
                </p>
                <p className="testimonials-section__quote-text">{testimonial.quote}</p>
                <div className="testimonials-section__reviewer">
                  <p className="testimonials-section__reviewer-name">{testimonial.reviewerName}</p>
                  <p className="testimonials-section__reviewer-descriptor">{testimonial.reviewerDescriptor}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="app-download-strip" id="app-download-strip">
        <div className="vantage-landing__container app-download-strip__layout">
          <div className="app-download-strip__content">
            <h2 className="app-download-strip__heading">Take Vantage with you.</h2>
            <p className="app-download-strip__subtext">
              Check in, discover, and trust — from your pocket.
            </p>
            <div className="app-download-strip__store-buttons">
              <a href="#" className="app-download-strip__store-button" aria-label="Download on the App Store">
                App Store
              </a>
              <a href="#" className="app-download-strip__store-button" aria-label="Download on Google Play">
                Google Play
              </a>
            </div>
          </div>

          <div className="app-download-strip__mockup-wrapper" aria-hidden="true">
            <div className="app-download-strip__phone-shell">
              <div className="app-download-strip__phone-notch" />
              <div className="app-download-strip__phone-screen">
                <img src="/Images/Vantage.svg" alt="" loading="lazy" />
                <p>Vantage</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="newsletter-section">
        <div className="vantage-landing__container newsletter-section__content">
          <h2 className="newsletter-section__heading">The local edge, in your inbox.</h2>
          <p className="newsletter-section__subtext">
            Weekly drops of the best new places, community picks, and local deals.
          </p>
          <form className="newsletter-section__form" onSubmit={handleNewsletterFormSubmit}>
            <input
              type="email"
              value={newsletterEmailValue}
              onChange={handleNewsletterEmailInputChange}
              placeholder="Enter your email"
              className="newsletter-section__input"
              required
            />
            <button type="submit" className="newsletter-section__button">
              Subscribe
            </button>
          </form>
          <p className="newsletter-section__meta">No spam · Weekly · Unsubscribe anytime</p>
        </div>
      </section>

      <footer className="landing-footer" id="landing-footer">
        <div className="vantage-landing__container landing-footer__grid">
          <div className="landing-footer__brand-column">
            <Link to="/" className="landing-footer__brand">
              <img src="/Images/Vantage.svg" alt="Vantage logo" className="landing-footer__brand-logo" />
              <span className="landing-footer__brand-wordmark">Vantage</span>
            </Link>
            <p className="landing-footer__tagline">
              Discover and support local businesses your community trusts.
            </p>
          </div>

          <div className="landing-footer__link-column">
            <h3 className="landing-footer__column-title">Explore</h3>
            <Link to="/businesses" className="landing-footer__link">
              Places
            </Link>
            <a href="#panel-category" className="landing-footer__link">
              Categories
            </a>
            <a href="#photo-grid" className="landing-footer__link">
              Community Feed
            </a>
          </div>

          <div className="landing-footer__link-column">
            <h3 className="landing-footer__column-title">For Business</h3>
            <Link to="/claim" className="landing-footer__link">
              Claim Your Business
            </Link>
            <Link to="/pricing" className="landing-footer__link">
              Pricing
            </Link>
            <Link to="/dashboard" className="landing-footer__link">
              Dashboard
            </Link>
          </div>

          <div className="landing-footer__link-column">
            <h3 className="landing-footer__column-title">Company</h3>
            <a href="#landing-footer" className="landing-footer__link">
              About
            </a>
            <a href="#" className="landing-footer__link">
              Privacy
            </a>
            <a href="#" className="landing-footer__link">
              Terms
            </a>
          </div>
        </div>

        <div className="vantage-landing__container landing-footer__bottom-bar">
          <p className="landing-footer__copyright">
            © {new Date().getFullYear()} Vantage. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

