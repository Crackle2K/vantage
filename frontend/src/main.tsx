import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import RootLayout from './layout.tsx'
import HomePage from './page.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootLayout>
      <HomePage />
    </RootLayout>
  </StrictMode>,
)
