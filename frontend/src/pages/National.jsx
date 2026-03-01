import { useState, useEffect } from 'react'
import { getNational, getClasses } from '../api/client'
import DataTable from '../components/DataTable'

export default function National() {
  const [data, setData] = useState([])
  const [classes, setClasses] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedShow, setSelectedShow] = useState('All Shows')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([getNational(), getClasses()]).then(([natRes, clsRes]) => {
      setData(natRes.data.data)
      const cls = clsRes.data.classes
      setClasses(cls)
      if (cls.length) setSelectedClass(cls[0])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = data.filter(r => {
    const matchClass = r.Class === selectedClass
    const matchShow = selectedShow === 'All Shows' || r.Show === selectedShow
    const matchSearch = r.Guard?.toLowerCase().includes(search.toLowerCase())
    return matchClass && matchShow && matchSearch
  })

  // Aggregate by guard for selected class
  const aggregated = {}
  filtered.forEach(r => {
    if (!aggregated[r.Guard]) {
      aggregated[r.Guard] = { Guard: r.Guard, Class: r.Class, Season_High: r.Score, scores: [r.Score], shows: new Set([r.Show]) }
    } else {
      aggregated[r.Guard].scores.push(r.Score)
      aggregated[r.Guard].shows.add(r.Show)
      if (r.Score > aggregated[r.Guard].Season_High) aggregated[r.Guard].Season_High = r.Score
    }
  })

  const rows = Object.values(aggregated).map(r => ({
    ...r,
    Average_Score: (r.scores.reduce((a, b) => a + b, 0) / r.scores.length).toFixed(3),
    Season_High: r.Season_High.toFixed(3),
    Shows_Attended: r.shows.size,
  })).sort((a, b) => b.Season_High - a.Season_High)
    .map((r, i) => ({ ...r, Rank: i + 1 }))

  const availableShows = ['All Shows', ...new Set(
    data.filter(r => r.Class === selectedClass).map(r => r.Show)
  )]

  const columns = [
    { key: 'Rank', label: '#', width: 50 },
    { key: 'Guard', label: 'Guard' },
    { key: 'Season_High', label: 'Season High', render: v => <strong style={{ color: 'var(--accent)' }}>{v}</strong> },
    { key: 'Average_Score', label: 'Average' },
    { key: 'Shows_Attended', label: 'Shows' },
  ]

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      <div className="page-header">
        <h1 className="page-title">National Rankings</h1>
        <p className="page-subtitle">Season standings across all WGI regional events</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <div className="stat-card">
          <div className="stat-value">{classes.length}</div>
          <div className="stat-label">Classes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{rows.length}</div>
          <div className="stat-label">Guards in Class</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{availableShows.length - 1}</div>
          <div className="stat-label">Events</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Division</label>
          <select className="select" value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedShow('All Shows') }}>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Event</label>
          <select className="select" value={selectedShow} onChange={e => setSelectedShow(e.target.value)}>
            {availableShows.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Search</label>
          <input className="input" placeholder="Search guard..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : (
        <DataTable columns={columns} data={rows} />
      )}
    </div>
  )
}
