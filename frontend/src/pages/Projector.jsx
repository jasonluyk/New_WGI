import { useState, useEffect } from 'react'
import { getProjection } from '../api/client'
import DataTable from '../components/DataTable'
import WorldsProjection from './WorldsProjection'

export default function Projector() {
  // Regional projection state
  const [projData, setProjData] = useState([])
  const [spots, setSpots] = useState({})
  const [showName, setShowName] = useState(null)
  const [status, setStatus] = useState('none')
  const [activeClass, setActiveClass] = useState(null)
  const [loading, setLoading] = useState(true)

  // Worlds projection state
  const [worldsSessions, setWorldsSessions] = useState([])
  const [worldsStatus, setWorldsStatus] = useState('none')
  const [worldsClass, setWorldsClass] = useState(null)
  const [worldsVenue, setWorldsVenue] = useState(null)

  // All hooks at top
  useEffect(() => {
    const fetch_ = () => {
      getProjection().then(res => {
        setProjData(res.data.data || [])
        setSpots(res.data.spots || {})
        setShowName(res.data.show_name)
        setStatus(res.data.status)
        setLoading(false)
      }).catch(() => setLoading(false))
    }
    fetch_()
    const interval = setInterval(fetch_, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetch('/api/worlds/projection')
      .then(r => r.json())
      .then(res => {
        setWorldsSessions(res.data || [])
        setWorldsStatus(res.status || 'none')
      })
      .catch(() => {})
  }, [])

  const classes = [...new Set(projData.map(r => r.Class?.split(' - ')[0]))].filter(Boolean).sort()
  const classKey = classes.join(',')

  useEffect(() => {
    if (classes.length && !activeClass) setActiveClass(classes[0])
  }, [classKey])

  const saClasses = classes.filter(c => c.includes('Scholastic A'))

  const DEFAULT_SPOTS = {
    'Scholastic A': 10, 'Scholastic Open': 10, 'Scholastic World': 10,
    'Independent A': 10, 'Independent Open': 10, 'Independent World': 10,
  }

  const getClassData = (cls) => projData
    .filter(r => r.Class?.startsWith(cls))
    .sort((a, b) => (b['Prelims Score'] || 0) - (a['Prelims Score'] || 0))
    .map((r, i) => ({ ...r, Rank: r['Prelims Score'] > 0 ? i + 1 : '—' }))

  const getAllSAData = () => projData
    .filter(r => r.Class?.includes('Scholastic A'))
    .sort((a, b) => (b['Prelims Score'] || 0) - (a['Prelims Score'] || 0))
    .map((r, i) => ({ ...r, Rank: r['Prelims Score'] > 0 ? i + 1 : '—' }))

  const classSpots = spots[activeClass] || DEFAULT_SPOTS[activeClass] || 10
  const allTabs = saClasses.length > 1 ? [...classes, '📊 All Scholastic A'] : classes
  const currentData = activeClass === '📊 All Scholastic A' ? getAllSAData() : getClassData(activeClass || '')

  const columns = [
    { key: 'Rank', label: '#', width: 50 },
    { key: 'Guard', label: 'Guard' },
    { key: 'Class', label: 'Round', width: 140 },
    {
      key: 'Prelims Score', label: 'Highest Score', width: 120,
      render: v => v > 0
        ? <strong style={{ color: 'var(--accent)' }}>{v.toFixed(3)}</strong>
        : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No Data</span>
    },
    {
      key: 'Status', label: 'Projection', width: 140,
      render: v => {
        if (!v || v === '⏳ Pending Score') return <span className="badge badge-gray">No Data</span>
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

  const allSAColumns = [
    { key: 'Rank', label: '#', width: 50 },
    { key: 'Guard', label: 'Guard' },
    { key: 'Class', label: 'Round', width: 160 },
    {
      key: 'Prelims Score', label: 'Highest Score', width: 120,
      render: v => v > 0
        ? <strong style={{ color: 'var(--accent)' }}>{v.toFixed(3)}</strong>
        : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No Data</span>
    },
  ]

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

      {/* Regional Projection */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Future Show Projector</h1>
          {showName && <p className="page-subtitle">📍 {showName} — based on season high scores</p>}
        </div>
        {showName && <span className="badge badge-gold">Projected</span>}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : status === 'loading' ? (
        <div className="alert alert-warning" style={{ gap: 12 }}>
          <div className="spinner" style={{ width: 16, height: 16 }} />
          Building projection...
        </div>
      ) : status === 'failed' ? (
        <div className="alert alert-error">Projection failed. Check the Admin panel.</div>
      ) : !showName || projData.length === 0 ? (
        <div className="alert alert-info">No projection loaded. Use the Admin panel to build a projection for an upcoming show.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
            <div className="stat-card"><div className="stat-value">{projData.length}</div><div className="stat-label">Teams Registered</div></div>
            <div className="stat-card"><div className="stat-value">{projData.filter(r => r['Prelims Score'] > 0).length}</div><div className="stat-label">Teams With Data</div></div>
            <div className="stat-card"><div className="stat-value">{classSpots}</div><div className="stat-label">Finals Spots ({activeClass})</div></div>
          </div>
          <div className="tab-list">
            {allTabs.map(cls => (
              <button key={cls} className={`tab ${activeClass === cls ? 'active' : ''}`} onClick={() => setActiveClass(cls)}>{cls}</button>
            ))}
          </div>
          <DataTable
            columns={activeClass === '📊 All Scholastic A' ? allSAColumns : columns}
            data={currentData}
            rowClass={row => {
              if (!row['Prelims Score'] || row['Prelims Score'] === 0) return 'no-data'
              const rank = row.Rank
              if (typeof rank === 'number' && rank <= classSpots) return 'advances'
              if (typeof rank === 'number') return 'below-cut'
              return ''
            }}
          />
        </>
      )}

      {/* Worlds Projection — no hooks, data passed as props */}
      <div style={{ marginTop: 56, borderTop: '1px solid var(--border)', paddingTop: 36 }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 32, fontWeight: 800, margin: 0 }}>🏆 Worlds Projection</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>Projected advancement for WGI World Championships based on season high scores</p>
        </div>
        <WorldsProjection
          sessions={worldsSessions}
          status={worldsStatus}
          selectedClass={worldsClass}
          selectedVenue={worldsVenue}
          onClassChange={(cls) => { setWorldsClass(cls); setWorldsVenue(null) }}
          onVenueChange={setWorldsVenue}
        />
      </div>

    </div>
  )
}