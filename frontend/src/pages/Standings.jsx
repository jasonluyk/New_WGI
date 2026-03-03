import { useState, useEffect } from 'react'
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/all-guards')
      .then(r => r.json())
      .then(res => {
        const rows = res.data || []
        setData(rows)
        const cls = [...new Set(rows.map(r => r.Class))]
          .sort((a, b) => {
            const ai = CLASS_ORDER.indexOf(a), bi = CLASS_ORDER.indexOf(b)
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
          })
        setClasses(cls)
        if (cls.length) setActiveClass(cls[0])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = data
    .filter(r => r.Class === activeClass)
    .filter(r => !search || r.Guard?.toLowerCase().includes(search.toLowerCase()))

  const guard = selectedGuard
  const seasonHigh = guard ? guard.Season_High : null
  const seasonAvg = guard && guard.All_Scores?.length
    ? (guard.All_Scores.reduce((s, r) => s + r.Score, 0) / guard.All_Scores.length).toFixed(3)
    : null

  const columns = [
    { key: 'Rank', label: '#', width: 48 },
    {
      key: 'Guard', label: 'Guard',
      render: (v, row) => (
        <button onClick={() => setSelectedGuard(row)} style={{
          background: 'none', border: 'none', color: 'var(--accent)',
          cursor: 'pointer', fontWeight: 600, textAlign: 'left',
          padding: 0, fontSize: 'inherit'
        }}>{v}</button>
      )
    },
    {
      key: 'Latest_Score', label: 'Latest Score',
      render: (v, row) => (
        <span>
          <strong style={{ color: 'var(--accent)' }}>{Number(v).toFixed(3)}</strong>
          {row.Made_Finals && (
            <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--accent)', color: '#000', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>F</span>
          )}
        </span>
      )
    },
    {
      key: 'Latest_Show', label: 'At Show',
      render: v => <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{v}</span>
    },
    { key: 'Shows', label: 'Shows', width: 60 },
    {
      key: 'Season_High', label: 'Season High',
      render: v => Number(v).toFixed(3)
    },
  ]

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title">Season Standings</h1>
        <p className="page-subtitle">Ranked by most recent score · Finals score used when available · Click any guard for full history</p>
      </div>

      {/* Guard Detail Modal */}
      {guard && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
        }} onClick={() => setSelectedGuard(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: 16, padding: 32,
            width: '100%', maxWidth: 600, maxHeight: '80vh', overflowY: 'auto',
            border: '1px solid var(--border)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 28, fontWeight: 800, margin: 0 }}>
                  {guard.Guard}
                </h2>
                <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  {guard.Class} · #{guard.Rank} in class
                </p>
              </div>
              <button onClick={() => setSelectedGuard(null)} style={{
                background: 'var(--bg-secondary)', border: 'none', borderRadius: 8,
                color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 12px', fontSize: 18
              }}>✕</button>
            </div>

            {/* Season summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--accent)' }}>
                  {Number(guard.Latest_Score).toFixed(3)}
                </div>
                <div className="stat-label">Latest Score</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{Number(seasonHigh).toFixed(3)}</div>
                <div className="stat-label">Season High</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{seasonAvg}</div>
                <div className="stat-label">Season Avg</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{guard.Shows}</div>
                <div className="stat-label">Shows</div>
              </div>
            </div>

            {/* Score trend bars */}
            {guard.All_Scores?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Score Trend</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 64 }}>
                  {guard.All_Scores.map((r, i) => {
                    const pct = seasonHigh > 0 ? (r.Score / seasonHigh) * 100 : 0
                    const isHigh = r.Score === seasonHigh
                    const isFinals = r.Show.toLowerCase().includes('final')
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{r.Score.toFixed(1)}</div>
                        <div
                          title={`${r.Show}: ${r.Score}`}
                          style={{
                            width: '100%', height: `${pct}%`, minHeight: 4, borderRadius: 3,
                            background: isHigh ? 'var(--accent)' : isFinals ? '#4ade80' : 'var(--accent-dim, #c49a2055)',
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                  <span><span style={{ color: 'var(--accent)' }}>■</span> Season High</span>
                  <span><span style={{ color: '#4ade80' }}>■</span> Finals</span>
                  <span><span style={{ color: '#c49a2055' }}>■</span> Prelims</span>
                </div>
              </div>
            )}

            {/* Show-by-show table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Show</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Score</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>vs Avg</th>
                </tr>
              </thead>
              <tbody>
                {[...guard.All_Scores].sort((a, b) => b.Score - a.Score).map((r, i) => {
                  const diff = (r.Score - parseFloat(seasonAvg)).toFixed(3)
                  const isHigh = r.Score === seasonHigh
                  const isFinals = r.Show.toLowerCase().includes('final')
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isHigh && <span style={{ color: 'var(--accent)', fontSize: 11 }}>★</span>}
                        {r.Show}
                        {isFinals && (
                          <span style={{ fontSize: 10, background: 'var(--accent)', color: '#000', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>F</span>
                        )}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: isHigh ? 'var(--accent)' : 'var(--text-primary)' }}>
                        {r.Score.toFixed(3)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: 12, color: parseFloat(diff) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {parseFloat(diff) >= 0 ? '+' : ''}{diff}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input
          className="input"
          placeholder="Search guard name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : data.length === 0 ? (
        <div className="alert alert-info">No data yet. Run a national sync to populate scores.</div>
      ) : (
        <>
          <div className="tab-list">
            {classes.map(cls => (
              <button key={cls} className={`tab ${activeClass === cls ? 'active' : ''}`}
                onClick={() => { setActiveClass(cls); setSearch('') }}>
                {cls}
              </button>
            ))}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
            {filtered.length} guards · Click a name for full season history
          </p>
          <DataTable columns={columns} data={filtered} />
        </>
      )}
    </div>
  )
}