import { useState, useEffect } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000'

interface Item {
  id: number
  name: string
  description: string
}

function App() {
  const [message, setMessage] = useState<string>('')
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')

  const fetchHello = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch(`${API_URL}/api/hello`)
      const data = await response.json()
      setMessage(data.message)
    } catch (err) {
      setError('Failed to connect to backend')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchItems = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch(`${API_URL}/api/items`)
      const data = await response.json()
      setItems(data.items)
    } catch (err) {
      setError('Failed to fetch items')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHello()
  }, [])

  return (
    <div className="App">
      <h1>Vantage - FastAPI + React</h1>
      
      <div className="card">
        <h2>Backend Connection</h2>
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {message && <p style={{ color: 'green' }}>{message}</p>}
        <button onClick={fetchHello}>Test Backend Connection</button>
      </div>

      <div className="card">
        <h2>Items from API</h2>
        <button onClick={fetchItems}>Fetch Items</button>
        {items.length > 0 && (
          <ul style={{ textAlign: 'left', marginTop: '1rem' }}>
            {items.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>: {item.description}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default App
