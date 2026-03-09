import { useState, useEffect } from 'react'
import { getLive } from '../api/client'
import DataTable from '../components/DataTable'

// ─── Plus Event Scoring Logic ────────────────────────────────────────────────
// For shows with '+' in the name, Scholastic A uses a pod system:
//   Pod 1 = Rounds 1 & 3 (odd) → top 5 advance
//   Pod 2 = Rounds 2 & 4 (even) → top 5 advance
//   Wildcard = next top 5 across all rounds not already advanced
// All other classes use standard spot-count advancement

function getRoundNumber(classStr) {
  const m = classStr?.match(/Round\s*(\d+)/i)
  return m ? parseInt(m[1]) : null
}

function assignStatuses(guards, spots, isPlusEvent, baseClass) {
  const isScholasticA = baseClass === 'Scholastic A'

  if (isPlusEvent && isScholasticA) {
    // Only score guards who have actually performed
    const scored = guards.filter(g => g['Prelims Score'] > 0)

    const pod1 = scored.filter(g => {
      const r = getRoundNumber(g.Class); return r === 1 || r === 3
    }).sort((a, b) => b['Prelims Score'] - a['Prelims Score'])

    const pod2 = scored.filter(g => {
      const r = getRoundNumber(g.Class); return r === 2 || r === 4
    }).sort((a, b) => b['Prelims Score'] - a['Prelims Score'])

    const pod1Adv = new Set(pod1.slice(0, 5).map(g => g.Guard))
    const pod2Adv = new Set(pod2.slice(0, 5).map(g => g.Guard))

    // Wildcard pool: scored guards not already advancing, sorted by score
    const wildcardPool = scored
      .filter(g => !pod1Adv.has(g.Guard) && !pod2Adv.has(g.Guard))
      .sort((a, b) => b['Prelims Score'] - a['Prelims Score'])
    const wildcardAdv = new Set(wildcardPool.slice(0, 5).map(g => g.Guard))

    return guards.map(g => {
      let status = '⏳ Pending Score'
      if (g['Prelims Score'] > 0) {
        if (pod1Adv.has(g.Guard)) status = '✅ Pod 1 Adv'
        else if (pod2Adv.has(g.Guard)) status = '✅ Pod 2 Adv'
        else if (wildcardAdv.has(g.Guard)) status = '🌟 Wildcard'
        else status = '❌ Below Cutline'
      }
      return { ...g, Status: status }
    })
  } else {
    // Standard advancement: top N by prelims score advance
    const spotsCount = spots[baseClass] || 0
    const scored = guards
      .filter(g => g['Prelims Score'] > 0)
      .sort((a, b) => b['Prelims Score'] - a['Prelims Score'])
    const advSet = new Set(scored.slice(0, spotsCount).map(g => g.Guard))

    return guards.map(g => {
      let status = '⏳ Pending Score'
      if (g['Prelims Score'] > 0) {
        status = advSet.has(g.Guard) ? '✅ Advanced' : '❌ Below Cutline'
      }
      return { ...g, Status: status }
    })
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LiveHub() {
  const [liveData, setLiveData] = useState([])
  const [spots, setSpots] = useState({})
  const [showName, setShowName] = useState(null)
  const [liveStatus, setLiveStatus] = useState('none')
  const [loading, setLoading] = useState(true)
  const [activeClass, setActiveClass] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchLive = () => {
    getLive().then(res => {
      setLiveData(res.data.data || [])
      setSpots(res.data.spots || {})
      setShowName(res.data.show_name)
      setLiveStatus(res.data.status || 'none')
      setLastUpdated(new Date())
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchLive()
    const interval = setInterval(fetchLive, 180000)
    return () => clearInterval(interval)
  }, [])

  const isPlusEvent = showName?.includes('+') || false

  // Base class tabs (strip " - Round N")
  const classes = [...new Set(liveData.map(r => r.Class?.split(' - ')[0]))].filter(Boolean)
    .sort((a, b) => {
      const order = ['Scholastic A', 'Scholastic Open', 'Scholastic World', 'Independent A', 'Independent Open', 'Independent World']
      return (order.indexOf(a) ?? 99) - (order.indexOf(b) ?? 99)
    })

  useEffect(() => {
    if (classes.length && !activeClass) setActiveClass(classes[0])
  }, [classes.join()])

  // Get all guards for active class, assign statuses
  const rawClassData = liveData.filter(r => r.Class?.startsWith(activeClass || ''))
  const classData = assignStatuses(rawClassData, spots, isPlusEvent, activeClass)
    .sort((a, b) => {
      // Sort: scored guards by score desc, then pending by time
      if (a['Prelims Score'] > 0 && b['Prelims Score'] > 0)
        return b['Prelims Score'] - a['Prelims Score']
      if (a['Prelims Score'] > 0) return -1
      if (b['Prelims Score'] > 0) return 1
      return (a['Prelims Time'] || '').localeCompare(b['Prelims Time'] || '')
    })

  const scored = classData.filter(r => r['Prelims Score'] > 0)
  const advancing = classData.filter(r => r.Status?.includes('Adv') || r.Status?.includes('Advanced') || r.Status?.includes('Wildcard'))

  // Pod counts for stats bar on plus events
  const pod1Count = isPlusEvent && activeClass === 'Scholastic A'
    ? classData.filter(r => r.Status === '✅ Pod 1 Adv').length : 0
  const pod2Count = isPlusEvent && activeClass === 'Scholastic A'
    ? classData.filter(r => r.Status === '✅ Pod 2 Adv').length : 0
  const wildcardCount = isPlusEvent && activeClass === 'Scholastic A'
    ? classData.filter(r => r.Status === '🌟 Wildcard').length : 0

  const columns = [
    {
      key: 'Prelims Time', label: 'Time', width: 80,
      render: (v, row) => {
        const roundNum = getRoundNumber(row.Class)
        const podColor = isPlusEvent && activeClass === 'Scholastic A'
          ? (roundNum === 1 || roundNum === 3 ? '#a78bfa' : '#60a5fa')
          : null
        return (
          <span>
            {podColor && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: podColor, marginRight: 6 }} />}
            {v}
          </span>
        )
      }
    },
    { key: 'Guard', label: 'Guard' },
    {
      key: 'Class', label: 'Round', width: 130,
      render: v => {
        const r = getRoundNumber(v)
        if (!r) return v
        const isPod1 = r === 1 || r === 3
        return (
          <span style={{ fontSize: 12, color: isPlusEvent && activeClass === 'Scholastic A' ? (isPod1 ? '#a78bfa' : '#60a5fa') : 'var(--text-muted)' }}>
            {isPlusEvent && activeClass === 'Scholastic A' ? `Pod ${isPod1 ? 1 : 2} · Rd ${r}` : `Round ${r}`}
          </span>
        )
      }
    },
    {
      key: 'Prelims Score', label: 'Score', width: 100,
      render: v => v > 0
        ? <strong style={{ color: 'var(--accent)' }}>{v.toFixed(3)}</strong>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>
    },
    {
      key: 'Finals Score', label: 'Finals', width: 100,
      render: v => v > 0
        ? <strong style={{ color: 'var(--green)' }}>{v.toFixed(3)}</strong>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>
    },
    {
      key: 'Status', label: 'Status', width: 150,
      render: v => {
        if (!v || v === '⏳ Pending Score') return <span style={{ color: 'var(--text-muted)' }}>Pending</span>
        const isAdv = v.includes('Adv') || v.includes('Advanced') || v.includes('Wildcard')
        const isCut = v.includes('Below')
        const isWild = v.includes('Wildcard')
        return (
          <span className={`badge ${isWild ? 'badge-yellow' : isAdv ? 'badge-green' : isCut ? 'badge-red' : 'badge-gray'}`}>
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
      <h1 className="page-title">Live Hub</h1>
      <div className="alert alert-info">No active show. Use the Admin panel to latch onto a live event.</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div className="live-dot" />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--red)' }}>Live</span>
            {isPlusEvent && (
              <span style={{ fontSize: 11, fontWeight: 700, background: '#7c3aed22', color: '#a78bfa', border: '1px solid #a78bfa44', borderRadius: 4, padding: '2px 8px' }}>
                + FORMAT
              </span>
            )}
            {liveStatus === 'roster_only' && (
              <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--bg-secondary)', color: 'var(--text-muted)', borderRadius: 4, padding: '2px 8px' }}>
                📋 Roster Only — Scores Pending
              </span>
            )}
          </div>
          <h1 className="page-title">{showName}</h1>
          {lastUpdated && <p className="page-subtitle">Last updated: {lastUpdated.toLocaleTimeString()}</p>}
        </div>
        <button className="btn btn-secondary" onClick={fetchLive}>↻ Refresh</button>
      </div>

      {/* Stats */}
      {isPlusEvent && activeClass === 'Scholastic A' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 28 }}>
          <div className="stat-card"><div className="stat-value">{rawClassData.length}</div><div className="stat-label">Total Guards</div></div>
          <div className="stat-card"><div className="stat-value">{scored.length}</div><div className="stat-label">Scored</div></div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#a78bfa' }}>{pod1Count}<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/5</span></div>
            <div className="stat-label">Pod 1 Adv</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#60a5fa' }}>{pod2Count}<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/5</span></div>
            <div className="stat-label">Pod 2 Adv</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{wildcardCount}<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/5</span></div>
            <div className="stat-label">Wildcard</div>
          </div>
          <div className="stat-card"><div className="stat-value">{advancing.length}</div><div className="stat-label">Total Advancing</div></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          <div className="stat-card"><div className="stat-value">{rawClassData.length}</div><div className="stat-label">Total Guards</div></div>
          <div className="stat-card"><div className="stat-value">{scored.length}</div><div className="stat-label">Scored</div></div>
          <div className="stat-card"><div className="stat-value">{advancing.length}</div><div className="stat-label">Advancing</div></div>
          <div className="stat-card"><div className="stat-value">{spots[activeClass] || '—'}</div><div className="stat-label">Finals Spots</div></div>
        </div>
      )}

      {/* Pod legend for plus events */}
      {isPlusEvent && activeClass === 'Scholastic A' && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 12, color: 'var(--text-muted)', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Legend:</span>
          <span><span style={{ color: '#a78bfa' }}>●</span> Pod 1 (Rounds 1 & 3) — top 5 advance</span>
          <span><span style={{ color: '#60a5fa' }}>●</span> Pod 2 (Rounds 2 & 4) — top 5 advance</span>
          <span><span style={{ color: 'var(--accent)' }}>🌟</span> Wildcard — next top 5 overall</span>
        </div>
      )}

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
        rowClass={row => {
          if (row.Status?.includes('Pod 1')) return 'pod1-adv'
          if (row.Status?.includes('Pod 2')) return 'pod2-adv'
          if (row.Status?.includes('Wildcard')) return 'advances'
          if (row.Status?.includes('Advanced')) return 'advances'
          if (row.Status?.includes('Below')) return 'below-cut'
          return ''
        }}
      />
    </div>
  )
}