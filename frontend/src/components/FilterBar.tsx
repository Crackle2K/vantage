import type { Category } from '../types'

interface FilterBarProps {
  categories: Category[]
  selectedCategory: string
  sortBy: string
  searchTerm: string
  onCategoryChange: (category: string) => void
  onSortChange: (sort: string) => void
  onSearchChange: (search: string) => void
}

export default function FilterBar({
  categories,
  selectedCategory,
  sortBy,
  searchTerm,
  onCategoryChange,
  onSortChange,
  onSearchChange,
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="search-container">
        <input
          type="text"
          placeholder="Search businesses..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="filters">
        <select
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="filter-select"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className="filter-select"
        >
          <option value="name">Name (A-Z)</option>
          <option value="rating">Highest Rated</option>
          <option value="reviews">Most Reviews</option>
        </select>
      </div>
    </div>
  )
}
