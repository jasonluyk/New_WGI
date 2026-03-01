import { useState, useEffect } from 'react'
import { getLive } from '../api/client'
import DataTable from '../components/DataTable'

const STATUS_CLASS = {
  '✅ Advanced': 'advances',
  '✅ Pod 1 Adv': 'advances',
  '✅ Pod 2 Adv': 'advances',
  '🌟 Wildcard': 'advances',
  '❌ Below Cutline': 'below-cut',
  '⏳ Pending Score': '',
}

export default function LiveHub() {
  const [liveData, setLiveData] = useState([])
  const [spots, setSpots] = useState({})
  const [showName, setShowName] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeClass, setActiveClass] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchLive = () => {
    getLive().then(res => {
      setLiveData(res.data.data || [])
      setSpots(res.data.spots || {})
      setShowName(res.data.show_name)
      setLastUpdated(new Date())
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchLive()
    const interval = setInterval(fetchLive, 180000) // 3 min refresh
    return () => clearInterval(interval)
  }, [])

  const classes = [...new Set(liveData.map(r => r.Class?.split(' - ')[0]))].filter(Boolean).sort()

  useEffect(() => {
    if (classes.length && !activeClass) setActiveClass(classes[0])
  }, [classes])

  const classData = liveData.filter(r => r.Class?.startsWith(activeClass || ''))
    .sort((a, b) => (b['Prelims Score'] || 0) - (a['Prelims Score'] || 0))

  const scored = classData.filter(r => r['Prelims Score'] > 0)
  const pending = classData.filter(r => r['Prelims Score'] === 0)

  const columns = [
    { key: 'Prelims Time', label: 'Time', width: 80 },
    { key: 'Guard', label: 'Guard' },
    { key: 'Class', label: 'Round', width: 120 },
    {
      key: 'Prelims Score', label: 'Prelims', width: 100,
      render: v => v > 0 ? <strong style={{ color: 'var(--accent)' }}>{v.toFixed(3)}</strong> : <span style={{ color: 'var(--text-muted)' }}>—</span>
    },
    {
      key: 'Finals Score', label: 'Finals', width: 100,
      render: v => v > 0 ? <strong style={{ color: 'var(--green)' }}>{v.toFixed(3)}</strong> : <span style={{ color: 'var(--text-muted)' }}>—</span>
    },
    {
      key: 'Status', label: 'Status', width: 140,
      render: v => {
        if (!v || v === '⏳ Pending Score') return <span style={{ color: 'var(--text-muted)' }}>Pending</span>
        const isAdv = v.includes('Adv') || v.includes('Advanced') || v.includes('Wildcard')
        const isCut = v.includes('Below')
        return (
          <span className={`badge ${isAdv ? 'badge-green' : isCut ? 'badge-red' : 'badge-gray'}`}>
            {v.replace(/[✅❌🌟⏳]/g, '').trim()}
          </span>
        )
      }
    },
  ]

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div className="spinner" />
    </div>
  )

  if (!showName || liveData.length === 0) return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      <div className="page-header">
        <h1 className="page-title">Live Hub</h1>
      </div>
      <div className="alert alert-info">No active show. Use the Admin panel to latch onto a live event.</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div className="live-dot" />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--red)' }}>Live</span>
          </div>
          <h1 className="page-title">{showName}</h1>
          {lastUpdated && (
            <p className="page-subtitle">Last updated: {lastUpdated.toLocaleTimeString()}</p>
          )}
        </div>
        <button className="btn btn-secondary" onClick={fetchLive}>↻ Refresh</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <div className="stat-card">
          <div className="stat-value">{liveData.length}</div>
          <div className="stat-label">Total Guards</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{scored.length}</div>
          <div className="stat-label">Scored</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{pending.length}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{spots[activeClass] || '—'}</div>
          <div className="stat-label">Finals Spots</div>
        </div>
      </div>

      {/* Class tabs */}
      <div className="tab-list">
        {classes.map(cls => (
          <button key={cls} className={`tab ${activeClass === cls ? 'active' : ''}`} onClick={() => setActiveClass(cls)}>
            {cls}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={classData}
        rowClass={row => STATUS_CLASS[row.Status] || ''}
      />
    </div>
  )
}
