import { useState, useEffect } from 'react'
import { getStandings } from '../api/client'
import DataTable from '../components/DataTable'

export default function Standings() {
  const [data, setData] = useState([])
  const [classes, setClasses] = useState([])
  const [activeClass, setActiveClass] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStandings().then(res => {
      const rows = res.data.data
      setData(rows)
      const cls = [...new Set(rows.map(r => r.Class))].sort()
      setClasses(cls)
      if (cls.length) setActiveClass(cls[0])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = data
    .filter(r => r.Class === activeClass)
    .filter(r => r.Guard?.toLowerCase().includes(search.toLowerCase()))
    .map((r, i) => ({ ...r, Rank: i + 1 }))

  const columns = [
    { key: 'Rank', label: '#', width: 50 },
    { key: 'Guard', label: 'Guard' },
    {
      key: 'Season_High', label: 'Season High',
      render: v => <strong style={{ color: 'var(--accent)' }}>{v?.toFixed(3)}</strong>
    },
    { key: 'Average_Score', label: 'Average', render: v => v?.toFixed(3) },
    { key: 'Shows_Attended', label: 'Shows' },
  ]

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      <div className="page-header">
        <h1 className="page-title">Group Standings</h1>
        <p className="page-subtitle">2026 season standings ranked by season high score</p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <input
          className="input"
          style={{ maxWidth: 300 }}
          placeholder="Search guard..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          <div className="tab-list">
            {classes.map(cls => (
              <button
                key={cls}
                className={`tab ${activeClass === cls ? 'active' : ''}`}
                onClick={() => setActiveClass(cls)}
              >
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
