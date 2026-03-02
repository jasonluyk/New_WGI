import { useState, useEffect } from 'react'
import { getStandings } from '../api/client'
import DataTable from '../components/DataTable'

export default function National() {
  const [data, setData] = useState([])
  const [classes, setClasses] = useState([])
  const [activeClass, setActiveClass] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    getStandings().then(res => {
      const rows = res.data.data
      setData(rows)
      const cls = [...new Set(rows.map(r => r.Class))].sort()
      setClasses(cls)
      if (cls.length) setActiveClass(cls[0])
      const status = res.data.updated
      if (status) setLastUpdated(status)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = data
    .filter(r => r.Class === activeClass)
    .filter(r => r.Guard?.toLowerCase().includes(search.toLowerCase()))

  const columns = [
    { key: 'Rank', label: '#', width: 50 },
    { key: 'Guard', label: 'Guard' },
    { key: 'Location', label: 'Location' },
    {
      key: 'Latest_Score', label: 'Latest Score',
      render: v => <strong style={{ color: 'var(--accent)' }}>{v?.toFixed(3)}</strong>
    },
    { key: 'Week', label: 'Week', width: 70 },
    {
      key: 'Seeding_Score', label: 'Seeding Score',
      render: v => v?.toFixed(3)
    },
  ]

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">National Rankings</h1>
          <p className="page-subtitle">
            Official WGI Group Standings — updated every Tuesday by noon Eastern
            {lastUpdated && ` · Last scraped: ${new Date(lastUpdated).toLocaleDateString()}`}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <div className="stat-card">
          <div className="stat-value">{classes.length}</div>
          <div className="stat-label">Classes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{filtered.length}</div>
          <div className="stat-label">Guards in Class</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{filtered[0]?.Seeding_Score?.toFixed(3) || '—'}</div>
          <div className="stat-label">Top Seeding Score</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Search</label>
          <input className="input" placeholder="Search guard..." value={search} onChange={e => setSearch(e.target.value)} />
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
              <button key={cls} className={`tab ${activeClass === cls ? 'active' : ''}`} onClick={() => setActiveClass(cls)}>
                {cls}
              </button>
            ))}
          </div>
          <DataTable columns={columns} data={filtered} />
        </>
      )}
    </div>
  )
}