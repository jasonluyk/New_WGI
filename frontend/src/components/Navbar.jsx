import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'

const navItems = [
  { path: '/', label: 'National' },
  { path: '/live', label: 'Live Hub' },
  { path: '/worlds', label: '🏆 Worlds' },
  { path: '/projector', label: 'Projector' },
  { path: '/past', label: 'Past Events' },
  { path: '/standings', label: 'Standings' },
]

export default function Navbar() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return (
    <nav style={{
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
      }}>
        {/* Logo */}
        <NavLink to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '0.05em',
            color: 'var(--accent)',
          }}>WGI</span>
          <span style={{
            fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: 22,
            fontWeight: 400,
            letterSpacing: '0.05em',
            color: 'var(--text-primary)',
          }}>ANALYTICS</span>
        </NavLink>

        {/* Desktop Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="desktop-nav">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              style={({ isActive }) => ({
                padding: '6px 14px',
                borderRadius: 6,
                textDecoration: 'none',
                fontFamily: 'Barlow Condensed, sans-serif',
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '0.05em',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                transition: 'all 0.2s ease',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: 16,
              transition: 'all 0.2s ease',
            }}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          {/* Admin link */}
          <NavLink
            to="/admin"
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              textDecoration: 'none',
              fontFamily: 'Barlow Condensed, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              transition: 'all 0.2s ease',
            }}
          >
            Admin
          </NavLink>
        </div>
      </div>
    </nav>
  )
}