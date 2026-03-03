import { useState, useEffect } from 'react'
import { getStandings } from '../api/client'
import DataTable from '../components/DataTable'

const CLASS_ORDER = [
  'Scholastic A', 'Scholastic Open', 'Scholastic World',
  'Independent A', 'Independent Open', 'Independent World'
]

export default function Standings() {
  const [data, setData] = useState([])
  const [classes, setClasses] = useState([])
  const [activeClass, setActiveClass] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedGuard, setSelectedGuard] = useState(null)
  const [guardHistory, setGuardHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStandings().then(res => {
      const rows = res.data.data || []
      setData(rows)
      const cls = [...new Set(rows.map(r => r.Class))]
        .sort((a, b) => CLASS_ORDER.indexOf(a) - CLASS_ORDER.indexOf(b))
      setClasses(cls)
      if (cls.length) setActiveClass(cls[0])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // When a guard is selected, fetch their full season history from wgi_analytics
  const handleGuardClick = async (guard) => {
    setSelectedGuard(guard)
    try {
      const res = await fetch(`/api/guard-history?name=${encodeURIComponent(guard.Guard)}&cls=${encodeURIComponent(guard.Class)}`)
      const json = await res.json()
      setGuardHistory(json.data || [])
    } catch {
      setGuardHistory([])
    }
  }

  const filtered = data
    .filter(r => r.Class === activeClass)
    .filter(r => !search || r.Guard?.toLowerCase().includes(search.toLowerCase()))

  const seasonHigh = guardHistory.length > 0 ? Math.max(...guardHistory.map(r => r.Score)) : null
  const seasonAvg = guardHistory.length > 0
    ? (guardHistory.reduce((s, r) => s + r.Score, 0) / guardHistory.length).toFixed(3)
    : null

  const columns = [
    { key: 'Rank', label: '#', width: 50 },
    {
      key: 'Guard', label: 'Guard',
      render: (v, row) => (
        <button
          onClick={() => handleGuardClick(row)}
          style={{
            background: 'none', border: 'none', color: 'var(--accent)',
            cursor: 'pointer', fontWeight: 600, textAlign: 'left',
            padding: 0, fontSize: 'inherit'
          }}
        >
          {v}
        </button>
      )
    },
    { key: 'Location', label: 'Location' },
    {
      key: 'Latest_Score', label: 'Latest Score',
      render: v => <strong style={{ color: 'var(--accent)' }}>{Number(v).toFixed(3)}</strong>
    },
    { key: 'Week', label: 'Wk', width: 50 },
    {
      key: 'Seeding_Score', label: 'Seeding Score',
      render: v => Number(v).toFixed(3)
    },
  ]

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title">Group Standings</h1>
        <p className="page-subtitle">Official WGI seeding standings — click any guard to view their full season history</p>
      </div>

      {/* Guard Detail Modal */}
      {selectedGuard && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24
        }} onClick={() => setSelectedGuard(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: 16, padding: 32,
              width: '100%', maxWidth: 600, maxHeight: '80vh', overflowY: 'auto',
              border: '1px solid var(--border)'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 28, fontWeight: 800, margin: 0 }}>
                  {selectedGuard.Guard}
                </h2>
                <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  {selectedGuard.Class} · {selectedGuard.Location}
                </p>
              </div>
              <button
                onClick={() => setSelectedGuard(null)}
                style={{
                  background: 'var(--bg-secondary)', border: 'none', borderRadius: 8,
                  color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 12px', fontSize: 18
                }}
              >✕</button>
            </div>

            {/* WGI Official Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              <div className="stat-card">
                <div className="stat-value">#{selectedGuard.Rank}</div>
                <div className="stat-label">Current Rank</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--accent)' }}>
                  {Number(selectedGuard.Latest_Score).toFixed(3)}
                </div>
                <div className="stat-label">Latest Score</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{Number(selectedGuard.Seeding_Score).toFixed(3)}</div>
                <div className="stat-label">Seeding Score</div>
              </div>
            </div>

            {/* Season History from wgi_analytics */}
            <h3 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
              Season History
            </h3>

            {guardHistory.length === 0 ? (
              <div className="alert alert-info">No season scores found in database for this guard.</div>
            ) : (
              <>
                {/* Season summary stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  <div className="stat-card">
                    <div className="stat-value" style={{ color: 'var(--green)' }}>{seasonHigh?.toFixed(3)}</div>
                    <div className="stat-label">Season High</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{seasonAvg}</div>
                    <div className="stat-label">Season Avg</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{guardHistory.length}</div>
                    <div className="stat-label">Shows Attended</div>
                  </div>
                </div>

                {/* Score trend bar chart */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Score Trend</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
                    {guardHistory.map((r, i) => {
                      const pct = seasonHigh > 0 ? (r.Score / seasonHigh) * 100 : 0
                      const isHigh = r.Score === seasonHigh
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{r.Score.toFixed(1)}</div>
                          <div style={{
                            width: '100%', height: `${pct}%`, minHeight: 4, borderRadius: 3,
                            background: isHigh ? 'var(--accent)' : 'var(--accent-dim, #c49a2055)',
                            transition: 'height 0.3s'
                          }} title={`${r.Show}: ${r.Score}`} />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Score by show table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Show</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Score</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>vs Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...guardHistory].sort((a, b) => b.Score - a.Score).map((r, i) => {
                      const diff = (r.Score - parseFloat(seasonAvg)).toFixed(3)
                      const isHigh = r.Score === seasonHigh
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: 0.9 }}>
                          <td style={{ padding: '8px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isHigh && <span style={{ color: 'var(--accent)', fontSize: 11 }}>★</span>}
                            {r.Show}
                          </td>
                          <td style={{
                            padding: '8px 8px', textAlign: 'right', fontWeight: 700,
                            color: isHigh ? 'var(--accent)' : 'var(--text-primary)'
                          }}>
                            {r.Score.toFixed(3)}
                          </td>
                          <td style={{
                            padding: '8px 8px', textAlign: 'right', fontSize: 12,
                            color: parseFloat(diff) >= 0 ? 'var(--green)' : 'var(--red)'
                          }}>
                            {parseFloat(diff) >= 0 ? '+' : ''}{diff}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            Search Guard
          </label>
          <input
            className="input"
            placeholder="Search by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : data.length === 0 ? (
        <div className="alert alert-info">No standings data yet. Use the Admin panel to sync group standings.</div>
      ) : (
        <>
          <div className="tab-list">
            {classes.map(cls => (
              <button
                key={cls}
                className={`tab ${activeClass === cls ? 'active' : ''}`}
                onClick={() => { setActiveClass(cls); setSearch('') }}
              >
                {cls}
              </button>
            ))}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
            {filtered.length} guards · Click a name to view season history
          </p>
          <DataTable columns={columns} data={filtered} />
        </>
      )}
    </div>
  )
}