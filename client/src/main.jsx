import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import RecordsPage from './components/RecordsPage.jsx'
import TetrisGame from './components/TetrisGame.jsx'
// import SnakeGame from './components/SnakeGame.jsx'

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {/* {normalizedPath === '/snake' ? <SnakeGame /> : normalizedPath === '/tetris' ? <TetrisGame /> : <App />} */}
      {normalizedPath === '/tetris' ? (
        <TetrisGame />
      ) : normalizedPath === '/records' ? (
        <RecordsPage />
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </StrictMode>,
)
