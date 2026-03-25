import { useState, useEffect } from 'react'
import DataTable from '../components/DataTable'

const CLASS_ORDER = [
  'Scholastic A', 'Scholastic Open', 'Scholastic World',
  'Independent A', 'Independent Open', 'Independent World'
]

const ROUND_ORDER = ['prelims', 'semis', 'finals']
const ROUND_LABELS = { prelims: 'Prelims', semis: 'Semi-Finals', finals: 'Finals' }

function parseTime(timeStr) {
  if (!timeStr || timeStr === '✅' || timeStr === 'Finished') return 9999
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return 9999
  let h = parseInt(m[1]), min = parseInt(m[2]), period = m[3].toUpperCase()
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return h * 60 + min
}

function buildAdvancement(sessions) {
  // Build lookup: guardName+class -> set of rounds they appear in
  const guardRounds = {}
  for (const session of sessions) {
    const round = session.round
    for (const g of (session.data || [])) {
      const key = `${g.Guard}||${g.Class}`
      if (!guardRounds[key]) guardRounds[key] = new Set()
      guardRounds[key].add(round)
    }
  }
  return guardRounds
}

function getAdvancementStatus(guard, cls, round, guardRounds, spots, sessionData) {
  const key = `${guard}||${cls}`
  const rounds = guardRounds[key] || new Set()
  const score = sessionData?.['Prelims Score'] || 0

  if (round === 'prelims') {
    if (rounds.has('semis') || rounds.has('finals')) return '✅ To Semis'
    if (score > 0) return '❌ Eliminated'
    return '⏳ Pending'
  }
  if (round === 'semis') {
    if (rounds.has('finals')) return '✅ To Finals'
    if (score > 0) return '❌ Eliminated'
    return '⏳ Pending'
  }
  if (round === 'finals') {
    if (score > 0) return '🏆 Finalist'
    return '⏳ Pending'
  }
  return '⏳ Pending'
}

export default function Worlds() {
  const [sessions, setSessions] = useState([])
  const [stateData, setStateData] = useState([])
  const [activeRound, setActiveRound] = useState('prelims')
  const [activeClass, setActiveClass] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    Promise.all([
      fetch('/api/worlds/sessions').then(r => r.json()),
      fetch('/api/worlds/state').then(r => r.json())
    ]).then(([sessRes, stateRes]) => {
      setSessions(sessRes.sessions || [])
      setStateData(stateRes.data || [])
      setLastUpdated(new Date())
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 180000)
    return () => clearInterval(interval)
  }, [])

  // Get all sessions for active round
  const roundSessions = stateData.filter(s => s.round === activeRound)

  // Merge all guards for active round into one list per class
  const allGuards = {}
  for (const session of roundSessions) {
    for (const g of (session.data || [])) {
      const baseClass = g.Class?.split(' - ')[0] || g.Class
      if (!allGuards[baseClass]) allGuards[baseClass] = {}
      // If guard already exists keep highest score
      const existing = allGuards[baseClass][g.Guard]
      if (!existing || (g['Prelims Score'] || 0) > (existing['Prelims Score'] || 0)) {
        allGuards[baseClass][g.Guard] = { ...g, Class: baseClass, Venue: session.venue }
      }
    }
  }

  const classes = Object.keys(allGuards).sort((a, b) => {
    const ai = CLASS_ORDER.indexOf(a), bi = CLASS_ORDER.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  useEffect(() => {
    if (classes.length && !activeClass) setActiveClass(classes[0])
    else if (classes.length && !classes.includes(activeClass)) setActiveClass(classes[0])
  }, [classes.join(',')])

  // Build advancement lookup across ALL sessions
  const guardRounds = buildAdvancement(stateData)

  // Get spots for active class across all sessions of active round
  const totalSpots = roundSessions.reduce((sum, s) => {
    return sum + (s.spots?.[activeClass] || 0)
  }, 0)

  // Guards for active class
  const classGuards = Object.values(allGuards[activeClass] || {})
  const anyScored = classGuards.some(g => g['Prelims Score'] > 0)

  const sortedGuards = [...classGuards].sort((a, b) => {
    if (!anyScored) return parseTime(a['Prelims Time']) - parseTime(b['Prelims Time'])
    if (a['Prelims Score'] > 0 && b['Prelims Score'] > 0) return b['Prelims Score'] - a['Prelims Score']
    if (a['Prelims Score'] > 0) return -1
    if (b['Prelims Score'] > 0) return 1
    return parseTime(a['Prelims Time']) - parseTime(b['Prelims Time'])
  }).map(g => ({
    ...g,
    Status: getAdvancementStatus(g.Guard, activeClass, activeRound, guardRounds, totalSpots, g)
  }))

  const scored = sortedGuards.filter(g => g['Prelims Score'] > 0)
  const advancing = sortedGuards.filter(g => g.Status.includes('To') || g.Status.includes('Finalist'))

  const columns = [
    {
      key: 'Prelims Time', label: 'Time', width: 80,
      render: v => <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{v}</span>
    },
    { key: 'Guard', label: 'Guard' },
    {
      key: 'Venue', label: 'Venue', width: 160,
      render: v => <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{v}</span>
    },
    {
      key: 'Prelims Score', label: 'Score', width: 100,
      render: v => v > 0
        ? <strong style={{ color: 'var(--accent)' }}>{v.toFixed(3)}</strong>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>
    },
    {
      key: 'Status', label: 'Status', width: 150,
      render: v => {
        if (!v || v === '⏳ Pending') return <span style={{ color: 'var(--text-muted)' }}>Pending</span>
        const isAdv = v.includes('To') || v.includes('Finalist')
        const isElim = v.includes('Eliminated')
        const isFin = v.includes('Finalist')
        return (
          <span className={`badge ${isFin ? 'badge-gold' : isAdv ? 'badge-green' : isElim ? 'badge-red' : 'badge-gray'}`}>
            {v.replace(/[✅❌🏆⏳]/g, '').trim()}
          </span>
        )
      }
    },
  ]

  // Available rounds (only show rounds that have data or are discovered)
  const availableRounds = ROUND_ORDER.filter(r =>
    stateData.some(s => s.round === r) || sessions.some(s => s.round === r)
  )

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div className="spinner" />
    </div>
  )

  if (sessions.length === 0) return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      <h1 className="page-title">World Championships</h1>
      <div className="alert alert-info" style={{ marginTop: 20 }}>
        No World Championship data yet. Use the Admin panel → World Championships → Auto-Discover Sessions to get started.
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 20 }}>🏆</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
              WGI World Championships 2026
            </span>
          </div>
          <h1 className="page-title">World Championships</h1>
          {lastUpdated && <p className="page-subtitle">Last updated: {lastUpdated.toLocaleTimeString()}</p>}
        </div>
        <button className="btn btn-secondary" onClick={fetchData}>↻ Refresh</button>
      </div>

      {/* Round tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(availableRounds.length > 0 ? availableRounds : ROUND_ORDER).map(r => (
          <button
            key={r}
            onClick={() => setActiveRound(r)}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              fontFamily: 'Barlow Condensed, sans-serif',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '0.05em',
              cursor: 'pointer',
              border: 'none',
              background: activeRound === r ? 'var(--accent)' : 'var(--bg-card)',
              color: activeRound === r ? '#0a0a0f' : 'var(--text-muted)',
              borderBottom: activeRound === r ? 'none' : '1px solid var(--border)'
            }}
          >
            {ROUND_LABELS[r]}
          </button>
        ))}
      </div>

      {roundSessions.length === 0 ? (
        <div className="alert alert-info">
          No {ROUND_LABELS[activeRound]} data yet.
          {activeRound !== 'prelims' && ' Advancement from previous round will populate this tab automatically.'}
        </div>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-value">{classGuards.length}</div>
              <div className="stat-label">In Class</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{scored.length}</div>
              <div className="stat-label">Scored</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--green)' }}>{advancing.length}</div>
              <div className="stat-label">Advancing</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{totalSpots || '—'}</div>
              <div className="stat-label">
                {activeRound === 'prelims' ? 'Semis Spots' : activeRound === 'semis' ? 'Finals Spots' : 'Finalists'}
              </div>
            </div>
          </div>

          {/* Class tabs */}
          <div className="tab-list">
            {classes.map(cls => (
              <button key={cls} className={`tab ${activeClass === cls ? 'active' : ''}`}
                onClick={() => setActiveClass(cls)}>
                {cls}
                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                  ({Object.keys(allGuards[cls] || {}).length})
                </span>
              </button>
            ))}
          </div>

          {/* Session info bar */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            {roundSessions
              .filter(s => (s.data || []).some(g => (g.Class?.split(' - ')[0] || g.Class) === activeClass))
              .map(s => (
                <span key={s.session_id} style={{ background: 'var(--bg-card)', borderRadius: 6, padding: '4px 10px', border: '1px solid var(--border)' }}>
                  📍 {s.venue} · {s.status === 'live' ? '🟢 Live' : '📋 Roster'}
                </span>
              ))
            }
          </div>

          <DataTable
            columns={columns}
            data={sortedGuards}
            rowClass={row => {
              if (row.Status?.includes('To') || row.Status?.includes('Finalist')) return 'advances'
              if (row.Status?.includes('Eliminated')) return 'below-cut'
              return ''
            }}
          />
        </>
      )}
    </div>
  )
}