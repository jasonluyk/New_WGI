import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import National from './pages/National'
import LiveHub from './pages/LiveHub'
import Projector from './pages/Projector'
import PastEvents from './pages/PastEvents'
import Standings from './pages/Standings'
import Admin from './pages/Admin'
import './index.css'

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Navbar />
        <Routes>
          <Route path="/" element={<National />} />
          <Route path="/live" element={<LiveHub />} />
          <Route path="/projector" element={<Projector />} />
          <Route path="/past" element={<PastEvents />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}



