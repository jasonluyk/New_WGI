// Pure presentational component — NO hooks, accepts props from Projector
const CLASS_ORDER = [
  'Scholastic A', 'Scholastic Open', 'Scholastic World',
  'Independent A', 'Independent Open', 'Independent World'
]

function parseTime(timeStr) {
  if (!timeStr) return 9999
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return 9999
  let h = parseInt(m[1]), min = parseInt(m[2]), period = m[3].toUpperCase()
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return h * 60 + min
}

export default function WorldsProjection({ sessions, status, selectedClass, selectedVenue, onClassChange, onVenueChange }) {
  if (status !== 'complete' || !sessions || sessions.length === 0) return (
    <div className="alert alert-info">
      No Worlds projection yet. Use Admin → World Championships → 🔮 Build Worlds Projection.
    </div>
  )

  const allClasses = [...new Set(
    sessions.flatMap(s => (s.guards || []).map(g => g.Class))
  )].filter(Boolean).sort((a, b) => {
    const ai = CLASS_ORDER.indexOf(a), bi = CLASS_ORDER.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  const activeClass = (selectedClass && allClasses.includes(selectedClass))
    ? selectedClass : allClasses[0] || null

  if (!activeClass) return null

  const classSessions = sessions.filter(s =>
    (s.guards || []).some(g => g.Class === activeClass)
  )
  const venues = [...new Set(classSessions.map(s => s.venue).filter(Boolean))]
  const isPerVenue = classSessions.some(s => s.advancement_type === 'per_venue')
  const activeVenue = (selectedVenue && venues.includes(selectedVenue)) ? selectedVenue : venues[0] || null

  const getGuardsForVenue = (venue) => {
    const session = classSessions.find(s => s.venue === venue)
    return (session?.guards || []).filter(g => g.Class === activeClass)
  }

  const allClassGuards = classSessions.flatMap(s =>
    (s.guards || []).filter(g => g.Class === activeClass).map(g => ({ ...g, Venue: s.venue }))
  )

  const viewGuards = isPerVenue && activeVenue
    ? getGuardsForVenue(activeVenue).map(g => ({ ...g, Venue: activeVenue }))
    : allClassGuards

  const getSpots = (venue) => {
    const s = classSessions.find(x => x.venue === venue)
    return s?.spots?.[activeClass] || 0
  }

  const totalSpots = isPerVenue
    ? getSpots(activeVenue)
    : classSessions.reduce((sum, s) => sum + (s.spots?.[activeClass] || 0), 0)

  const sorted = [...viewGuards].sort((a, b) => {
    if (a.Has_Data && b.Has_Data) return (b.Season_High || 0) - (a.Season_High || 0)
    if (a.Has_Data) return -1
    if (b.Has_Data) return 1
    return parseTime(a.Prelims_Time) - parseTime(b.Prelims_Time)
  }).map((g, i, arr) => {
    const rank = g.Has_Data ? arr.slice(0, i).filter(x => x.Has_Data).length + 1 : null
    return { ...g, Rank: rank, Advances: g.Has_Data && totalSpots > 0 && rank !== null && rank <= totalSpots }
  })

  const withData = sorted.filter(g => g.Has_Data).length
  const projected = sorted.filter(g => g.Advances).length

  return (
    <div>
      <div className="tab-list" style={{ marginBottom: 0 }}>
        {allClasses.map(cls => (
          <button key={cls} className={`tab ${activeClass === cls ? 'active' : ''}`}
            onClick={() => onClassChange(cls)}>
            {cls}
          </button>
        ))}
      </div>

      {isPerVenue && venues.length > 1 && (
        <div style={{ display: 'flex', gap: 6, padding: '10px 0 16px', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {venues.map(v => (
            <button key={v} onClick={() => onVenueChange(v)} style={{
              padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 600,
              border: '1px solid ' + (activeVenue === v ? 'var(--accent)' : 'var(--border)'),
              background: activeVenue === v ? 'var(--accent-dim)' : 'var(--bg-card)',
              color: activeVenue === v ? 'var(--accent)' : 'var(--text-secondary)',
            }}>
              📍 {v.split(' ').slice(-2).join(' ')}
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>top {getSpots(v)} advance</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20, marginTop: 16 }}>
        <div className="stat-card"><div className="stat-value">{viewGuards.length}</div><div className="stat-label">Guards</div></div>
        <div className="stat-card"><div className="stat-value">{withData}</div><div className="stat-label">With Season Data</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--green)' }}>{projected}</div><div className="stat-label">Proj. Advancing</div></div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{totalSpots || '—'}</div>
          <div className="stat-label">{isPerVenue ? 'Semis Spots (Venue)' : 'Total Semis Spots'}</div>
        </div>
      </div>

      {totalSpots > 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          🟢 Green = projected to advance · Ranked by season high · No season data shown at bottom
        </p>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 50 }}>#</th>
            <th>Guard</th>
            {!isPerVenue && <th style={{ width: 180 }}>Venue</th>}
            <th style={{ width: 110 }}>Season High</th>
            <th style={{ width: 60 }}>Shows</th>
            <th style={{ width: 150 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((g, i) => (
            <tr key={i} className={g.Advances ? 'advances' : g.Has_Data ? 'below-cut' : 'no-data'}>
              <td style={{ color: 'var(--text-muted)' }}>{g.Rank ?? '—'}</td>
              <td style={{ fontWeight: 600 }}>{g.Guard}</td>
              {!isPerVenue && <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.Venue?.split(' ').slice(-2).join(' ')}</td>}
              <td>{g.Has_Data ? <strong style={{ color: 'var(--accent)' }}>{g.Season_High.toFixed(3)}</strong> : <span style={{ color: 'var(--text-muted)' }}>No Data</span>}</td>
              <td style={{ color: 'var(--text-muted)' }}>{g.Shows || '—'}</td>
              <td>
                {!g.Has_Data
                  ? <span className="badge badge-gray">No Season Data</span>
                  : g.Advances
                    ? <span className="badge badge-green">Proj. Advances</span>
                    : <span className="badge badge-red">Proj. Eliminated</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

