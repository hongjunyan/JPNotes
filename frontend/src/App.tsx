import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import NotesListPage from './features/notes/NotesListPage'
import NoteViewPage from './features/notes/NoteViewPage'
import NoteEditPage from './features/notes/NoteEditPage'
import CardsListPage from './features/cards/CardsListPage'
import ReviewPage from './features/review/ReviewPage'
import ExamPage from './features/exam/ExamPage'
import DashboardPage from './features/dashboard/DashboardPage'

type Theme = 'light' | 'dark'

function initTheme(): Theme {
  const saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          JP<span>Notes</span>
        </NavLink>
        <nav>
          <NavLink to="/" end>
            儀表板
          </NavLink>
          <NavLink to="/notes">筆記</NavLink>
          <NavLink to="/cards">卡片</NavLink>
          <NavLink to="/review">複習</NavLink>
          <NavLink to="/exam">考試</NavLink>
        </nav>
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="切換深/淺色"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/notes" element={<NotesListPage />} />
          <Route path="/notes/new" element={<NoteEditPage />} />
          <Route path="/notes/:id" element={<NoteViewPage />} />
          <Route path="/notes/:id/edit" element={<NoteEditPage />} />
          <Route path="/cards" element={<CardsListPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/exam" element={<ExamPage />} />
        </Routes>
      </main>
    </div>
  )
}
