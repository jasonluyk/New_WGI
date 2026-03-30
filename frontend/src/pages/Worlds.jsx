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

// Build a map of guardKey -> set of rounds they appear in (for advancement tracking)
function buildAdvancementMap(allSessions) {
  const map = {}
  for (const session of allSessions) {
    for (const g of (session.data || [])) {
      const key = `${g.Guard}||${g.Class?.split(' - ')[0] || g.Class}`
      if (!map[key]) map[key] = new Set()
      map[key].add(session.round)
    }
  }
  return map
}

function getStatus(guard, cls, round, advMap) {
  const key = `${guard}||${cls}`
  const rounds = advMap[key] || new Set()
  if (round === 'prelims') {
    if (rounds.has('semis') || rounds.has('finals')) return '✅ To Semis'
    return null // determine from score cutline
  }
  if (round === 'semis') {
    if (rounds.has('finals')) return '✅ To Finals'
    return null
  }
  return null
}

function sortGuards(guards) {
  const anyScored = guards.some(g => g['Prelims Score'] > 0)
  return [...guards].sort((a, b) => {
    if (!anyScored) return parseTime(a['Prelims Time']) - parseTime(b['Prelims Time'])
    if (a['Prelims Score'] > 0 && b['Prelims Score'] > 0) return b['Prelims Score'] - a['Prelims Score']
    if (a['Prelims Score'] > 0) return -1
    if (b['Prelims Score'] > 0) return 1
    return parseTime(a['Prelims Time']) - parseTime(b['Prelims Time'])
  })
}

// For prelims: assign advancement status per venue based on spots
function assignPrelimsStatus(guards, spotsPerVenue, advMap) {
  // Group by venue
  const byVenue = {}
  for (const g of guards) {
    const v = g.Venue || 'Unknown'
    if (!byVenue[v]) byVenue[v] = []
    byVenue[v].push(g)
  }

  const result = []
  for (const [venue, vGuards] of Object.entries(byVenue)) {
    const spots = spotsPerVenue[venue] || 0
    const scored = vGuards.filter(g => g['Prelims Score'] > 0)
      .sort((a, b) => b['Prelims Score'] - a['Prelims Score'])
    const advSet = new Set(scored.slice(0, spots).map(g => g.Guard))

    for (const g of vGuards) {
      // Check if we know from advancement map (semis roster already synced)
      const knownStatus = getStatus(g.Guard, g.Class?.split(' - ')[0] || g.Class, 'prelims', advMap)
      let status = '⏳ Pending'
      if (knownStatus) {
        status = knownStatus
      } else if (g['Prelims Score'] > 0) {
        status = advSet.has(g.Guard) ? '✅ To Semis' : '❌ Eliminated'
      }
      result.push({ ...g, Status: status })
    }
  }
  return result
}

// For semis/finals: assign status from advancement map or score cutline
function assignRoundStatus(guards, spots, advMap, round) {
  const scored = guards.filter(g => g['Prelims Score'] > 0)
    .sort((a, b) => b['Prelims Score'] - a['Prelims Score'])
  const advSet = new Set(scored.slice(0, spots).map(g => g.Guard))

  return guards.map(g => {
    const cls = g.Class?.split(' - ')[0] || g.Class
    const knownStatus = getStatus(g.Guard, cls, round, advMap)
    let status = '⏳ Pending'
    if (knownStatus) {
      status = knownStatus
    } else if (g['Prelims Score'] > 0 && spots > 0) {
      status = advSet.has(g.Guard)
        ? (round === 'semis' ? '✅ To Finals' : '🏆 Finalist')
        : '❌ Eliminated'
    } else if (g['Prelims Score'] > 0 && round === 'finals') {
      status = '🏆 Finalist'
    }
    return { ...g, Status: status }
  })
}

export default function Worlds() {
  const [sessions, setSessions] = useState([])
  const [stateData, setStateData] = useState([])
  const [activeRound, setActiveRound] = useState('prelims')
  const [activeClass, setActiveClass] = useState(null)
  const [activeVenue, setActiveVenue] = useState(null)
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

  const advMap = buildAdvancementMap(stateData)

  // Sessions for active round
  const roundSessions = stateData.filter(s => s.round === activeRound)

  // All classes present in this round
  const classes = [...new Set(
    roundSessions.flatMap(s => (s.data || []).map(g => g.Class?.split(' - ')[0] || g.Class))
  )].sort((a, b) => {
    const ai = CLASS_ORDER.indexOf(a), bi = CLASS_ORDER.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  useEffect(() => {
    if (classes.length && (!activeClass || !classes.includes(activeClass))) {
      setActiveClass(classes[0])
      setActiveVenue(null)
    }
  }, [activeRound, classes.join(',')])

  // Get all guards for active class in this round, tagged with venue
  const classGuardsRaw = roundSessions.flatMap(s =>
    (s.data || [])
      .filter(g => (g.Class?.split(' - ')[0] || g.Class) === activeClass)
      .map(g => ({ ...g, Class: activeClass, Venue: s.venue, SessionName: s.session_name }))
  )

  // Venues for this class in this round
  const venues = [...new Set(classGuardsRaw.map(g => g.Venue))].filter(Boolean)

  useEffect(() => {
    if (venues.length && (!activeVenue || !venues.includes(activeVenue))) {
      setActiveVenue(activeRound === 'prelims' ? venues[0] : 'all')
    }
  }, [activeClass, activeRound, venues.join(',')])

  // Build spots per venue for prelims
  // spots on session is a dict like {"Scholastic A": 28} or {"Scholastic Open": 36, "Independent Open": 24}
  const spotsPerVenue = {}
  const advancementTypes = {}
  if (activeRound === 'prelims') {
    for (const s of roundSessions) {
      const hasClass = (s.data || []).some(g => (g.Class?.split(' - ')[0] || g.Class) === activeClass)
        || (s.classes || []).includes(activeClass)
      if (hasClass) {
        const vs = s.spots?.[activeClass] || 0
        spotsPerVenue[s.venue] = (spotsPerVenue[s.venue] || 0) + vs
        advancementTypes[s.venue] = s.advancement_type || 'overall'
      }
    }
  }

  // For SA: advancement is per_venue. For all others: overall across all rounds/venues
  const isPerVenue = Object.values(advancementTypes).some(t => t === 'per_venue')
  const totalPrelimsSpots = Object.values(spotsPerVenue).reduce((a, b) => a + b, 0)
  const roundSpots = activeRound !== 'prelims'
    ? roundSessions.reduce((sum, s) => sum + (s.spots?.[activeClass] || 0), 0)
    : 0

  // For prelims: determine which guards to show based on venue selection
  // Each venue is completely independent — top N per venue advance regardless of scores elsewhere
  const isViewingVenue = activeRound === 'prelims' && activeVenue && activeVenue !== 'all'
  const guardsToShow = isViewingVenue
    ? classGuardsRaw.filter(g => g.Venue === activeVenue)
    : classGuardsRaw

  // Deduplicate for semis/finals
  const deduped = activeRound !== 'prelims'
    ? Object.values(guardsToShow.reduce((acc, g) => {
        if (!acc[g.Guard] || (g['Prelims Score'] || 0) > (acc[g.Guard]['Prelims Score'] || 0))
          acc[g.Guard] = g
        return acc
      }, {}))
    : guardsToShow

  // Assign advancement status
  let displayGuards
  if (activeRound === 'prelims') {
    if (isPerVenue) {
      // SA: each venue is independent — top N per venue advance
      const venueSpotCount = isViewingVenue ? (spotsPerVenue[activeVenue] || 0) : 0
      displayGuards = sortGuards(deduped.map(g => {
        const cls = g.Class?.split(' - ')[0] || g.Class
        const knownStatus = getStatus(g.Guard, cls, 'prelims', advMap)
        if (knownStatus) return { ...g, Status: knownStatus }
        if (g['Prelims Score'] <= 0) return { ...g, Status: '⏳ Pending' }
        if (isViewingVenue && venueSpotCount > 0) {
          const venueScored = deduped
            .filter(x => x['Prelims Score'] > 0)
            .sort((a, b) => b['Prelims Score'] - a['Prelims Score'])
          const rank = venueScored.findIndex(x => x.Guard === g.Guard) + 1
          return { ...g, Status: rank <= venueSpotCount ? '✅ To Semis' : '❌ Eliminated' }
        }
        return { ...g, Status: '⏳ Pending' }
      }))
    } else {
      // Other classes: top N overall across ALL venues combined
      const totalSpots = totalPrelimsSpots
      // Get all guards for this class across all sessions (not filtered by venue)
      const allClassGuards = roundSessions.flatMap(s =>
        (s.data || [])
          .filter(g => (g.Class?.split(' - ')[0] || g.Class) === activeClass)
          .map(g => ({ ...g, Class: activeClass, Venue: s.venue }))
      )
      const allScored = allClassGuards
        .filter(g => g['Prelims Score'] > 0)
        .sort((a, b) => b['Prelims Score'] - a['Prelims Score'])
      const advSet = new Set(allScored.slice(0, totalSpots).map(g => g.Guard))

      displayGuards = sortGuards(deduped.map(g => {
        const cls = g.Class?.split(' - ')[0] || g.Class
        const knownStatus = getStatus(g.Guard, cls, 'prelims', advMap)
        if (knownStatus) return { ...g, Status: knownStatus }
        if (g['Prelims Score'] <= 0) return { ...g, Status: '⏳ Pending' }
        return { ...g, Status: advSet.has(g.Guard) ? '✅ To Semis' : '❌ Eliminated' }
      }))
    }
  } else {
    const withStatus = assignRoundStatus(deduped, roundSpots, advMap, activeRound)
    displayGuards = sortGuards(withStatus)
  }

  const scored = displayGuards.filter(g => g['Prelims Score'] > 0)
  const advancing = displayGuards.filter(g => g.Status?.includes('To') || g.Status?.includes('Finalist'))

  const venueSpots = activeRound !== 'prelims'
    ? roundSpots
    : isViewingVenue
      ? spotsPerVenue[activeVenue] || 0
      : totalPrelimsSpots

  const columns = [
    {
      key: 'Prelims Time', label: 'Time', width: 80,
      render: v => <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{v}</span>
    },
    { key: 'Guard', label: 'Guard' },
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
        No World Championship data yet. Use Admin → World Championships → Auto-Discover Sessions.
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {(availableRounds.length > 0 ? availableRounds : ROUND_ORDER).map(r => (
          <button key={r} onClick={() => { setActiveRound(r); setActiveVenue(null) }} style={{
            padding: '10px 28px', borderRadius: 8,
            fontFamily: 'Barlow Condensed, sans-serif', fontSize: 16, fontWeight: 700,
            letterSpacing: '0.05em', cursor: 'pointer', border: 'none',
            background: activeRound === r ? 'var(--accent)' : 'var(--bg-card)',
            color: activeRound === r ? '#0a0a0f' : 'var(--text-muted)',
            borderBottom: activeRound === r ? 'none' : '1px solid var(--border)'
          }}>
            {ROUND_LABELS[r]}
          </button>
        ))}
      </div>

      {roundSessions.length === 0 ? (
        <div className="alert alert-info">
          No {ROUND_LABELS[activeRound]} data yet.
          {activeRound !== 'prelims' && ' Sync prelims sessions first — advancement will populate this tab automatically once scores post.'}
        </div>
      ) : (
        <>
          {/* Class tabs */}
          <div className="tab-list" style={{ marginBottom: 0 }}>
            {classes.map(cls => (
              <button key={cls} className={`tab ${activeClass === cls ? 'active' : ''}`}
                onClick={() => { setActiveClass(cls); setActiveVenue(null) }}>
                {cls}
                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                  ({[...new Set(classGuardsRaw.filter(g => (g.Class?.split(' - ')[0] || g.Class) === cls || g.Class === cls).map(g => g.Guard))].length})
                </span>
              </button>
            ))}
          </div>

          {/* Venue tabs — only for SA (per_venue advancement) */}
          {activeRound === 'prelims' && isPerVenue && venues.length > 1 && (
            <div style={{ display: 'flex', gap: 6, padding: '10px 0 16px', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
              {venues.map(v => {
                const vSpots = spotsPerVenue[v] || 0
                const vGuards = classGuardsRaw.filter(g => g.Venue === v)
                const vScored = vGuards.filter(g => g['Prelims Score'] > 0).length
                return (
                  <button key={v} onClick={() => setActiveVenue(v)} style={{
                    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                    fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 600,
                    border: '1px solid ' + (activeVenue === v ? 'var(--accent)' : 'var(--border)'),
                    background: activeVenue === v ? 'var(--accent-dim)' : 'var(--bg-card)',
                    color: activeVenue === v ? 'var(--accent)' : 'var(--text-secondary)',
                  }}>
                    📍 {v.split(' ').slice(-2).join(' ')}
                    <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>
                      {vGuards.length} guards · {vSpots > 0 ? `top ${vSpots} advance` : 'spots TBD'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            <div className="stat-card">
              <div className="stat-value">{displayGuards.length}</div>
              <div className="stat-label">
                {isViewingVenue ? 'At Venue' : 'Total Guards'}
              </div>
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
              <div className="stat-value" style={{ color: 'var(--accent)' }}>{venueSpots || '—'}</div>
              <div className="stat-label">
                {activeRound === 'prelims'
                  ? (isViewingVenue ? 'Semis Spots (This Venue)' : 'Total Semis Spots')
                  : activeRound === 'semis' ? 'Finals Spots'
                  : 'Finalists'}
              </div>
            </div>
          </div>

          <DataTable
            columns={columns}
            data={displayGuards}
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