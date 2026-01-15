import { useState, useEffect } from 'react'
import type { Business, Category, Deal } from './types'
import { api } from './api'
import BusinessCard from './components/BusinessCard'
import FilterBar from './components/FilterBar'
import DealsSection from './components/DealsSection'
import BusinessModal from './components/BusinessModal'

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [searchTerm, setSearchTerm] = useState('')
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set())
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false)

  // Load theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('vantage-theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.setAttribute('data-theme', savedTheme)
    }

    const savedBookmarks = localStorage.getItem('vantage-bookmarks')
    if (savedBookmarks) {
      setBookmarkedIds(new Set(JSON.parse(savedBookmarks)))
    }
  }, [])

  // Fetch initial data
  useEffect(() => {
    loadData()
  }, [])

  // Fetch businesses when filters change
  useEffect(() => {
    loadBusinesses()
  }, [selectedCategory, sortBy, searchTerm])

  const loadData = async () => {
    try {
      const [categoriesData, dealsData] = await Promise.all([
        api.getCategories(),
        api.getDeals(),
      ])
      setCategories(categoriesData)
      setDeals(dealsData)
    } catch (err) {
      setError('Failed to load data')
      console.error(err)
    }
  }

  const loadBusinesses = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getBusinesses(
        selectedCategory || undefined,
        sortBy,
        searchTerm || undefined
      )
      setBusinesses(data)
    } catch (err) {
      setError('Failed to load businesses')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('vantage-theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  const toggleBookmark = (id: number) => {
    const newBookmarks = new Set(bookmarkedIds)
    if (newBookmarks.has(id)) {
      newBookmarks.delete(id)
    } else {
      newBookmarks.add(id)
    }
    setBookmarkedIds(newBookmarks)
    localStorage.setItem('vantage-bookmarks', JSON.stringify(Array.from(newBookmarks)))
  }

  const displayedBusinesses = showBookmarksOnly
    ? businesses.filter(b => bookmarkedIds.has(b.id))
    : businesses

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>Vantage</h1>
          <p className="tagline">Discover & Support Local Businesses</p>
        </div>
        <div className="header-actions">
          <button
            className={`bookmarks-toggle ${showBookmarksOnly ? 'active' : ''}`}
            onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
          >
            ★ Bookmarks ({bookmarkedIds.size})
          </button>
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      <main className="app-main">
        <DealsSection deals={deals} businesses={businesses} />

        <FilterBar
          categories={categories}
          selectedCategory={selectedCategory}
          sortBy={sortBy}
          searchTerm={searchTerm}
          onCategoryChange={setSelectedCategory}
          onSortChange={setSortBy}
          onSearchChange={setSearchTerm}
        />

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading">Loading businesses...</div>
        ) : displayedBusinesses.length === 0 ? (
          <div className="no-results">
            {showBookmarksOnly
              ? 'No bookmarked businesses yet. Start exploring and bookmark your favorites!'
              : 'No businesses found. Try adjusting your filters.'}
          </div>
        ) : (
          <div className="businesses-grid">
            {displayedBusinesses.map((business) => (
              <BusinessCard
                key={business.id}
                business={business}
                isBookmarked={bookmarkedIds.has(business.id)}
                onToggleBookmark={toggleBookmark}
                onViewDetails={setSelectedBusiness}
              />
            ))}
          </div>
        )}
      </main>

      {selectedBusiness && (
        <BusinessModal
          business={selectedBusiness}
          onClose={() => setSelectedBusiness(null)}
        />
      )}

      <footer className="app-footer">
        <p>© 2026 Vantage - Supporting Local Communities</p>
      </footer>
    </div>
  )
}

export default App
