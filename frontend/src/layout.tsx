/**
 * @fileoverview Root layout component that wraps every page with a shared
 * header, footer, and minimum-height flex container.
 */

import type React from "react"
import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { useLocation } from "react-router-dom"

/**
 * Renders the application shell. Every route receives the shared header,
 * content offset, and footer layout.
 *
 * @param {React.ReactNode} children - The page content to render.
 * @returns {JSX.Element} The full layout with header, content, and footer.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const currentLocation = useLocation()
  const isLandingPageRoute = currentLocation.pathname === "/"
  const isExplorePageRoute = currentLocation.pathname === "/businesses"

  return (
    <div className="app-shell">
      {!isExplorePageRoute && <Header />}
      <main
        className={`app-main ${!isLandingPageRoute ? "app-main--product" : ""} ${isLandingPageRoute || isExplorePageRoute ? "" : "app-main--offset"} ${isExplorePageRoute ? "app-main--explore" : ""}`}
      >
        {children}
      </main>
      <Footer />
    </div>
  )
}
