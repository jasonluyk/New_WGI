import { useState, useEffect } from 'react'
import { getEvents, getArchive } from '../api/client'
import DataTable from '../components/DataTable'

export default function PastEvents() {
  const [events, setEvents] = useState([])
  const [selected, setSelected] = useState('')
  const [archive, setArchive] = useState([])
  const [archiveStatus, setArchiveStatus] = useState('none')
  const [loading, setLoading] = useState(false)
  const [classFilter, setClassFilter] = useState('All')

  useEffect(() => {
    getEvents().then(res => {
      const completed = res.data.events.filter(e => e.show_id)
      setEvents(completed)
    })
  }, [])

  const handleSelect = (showId) => {
    setSelected(showId)
    setArchive([])
    setArchiveStatus('none')
  }

  const handleRequest = () => {
    if (!selected) return
    setArchiveStatus('loading')
    // Poll until complete
    const poll = setInterval(() => {
      getArchive(selected).then(res => {
        if (res.data.status === 'complete') {
          setArchive(res.data.data || [])
          setArchiveStatus('complete')
          clearInterval(poll)
        } else if (res.data.status === 'empty') {
          setArchiveStatus('empty')
          clearInterval(poll)
        }
      })
    }, 2000)
    // Timeout after 60s
    setTimeout(() => clearInterval(poll), 60000)
  }

  const classes = ['All', ...new Set(archive.map(r => r.Class))].sort()
  const filteredArchive = classFilter === 'All' ? archive : archive.filter(r => r.Class === classFilter)
  const ranked = filteredArchive.map((r, i) => ({ ...r, Rank: i + 1 }))

  const selectedEvent = events.find(e => e.show_id === selected)

  const columns = [
    { key: 'Rank', label: '#', width: 50 },
    { key: 'Guard', label: 'Guard' },
    { key: 'Class', label: 'Class' },
    {
      key: 'Final Score', label: 'Score',
      render: v => <strong style={{ color: 'var(--accent)' }}>{v?.toFixed(3)}</strong>
    },
  ]

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      <div className="page-header">
        <h1 className="page-title">Past Events</h1>
        <p className="page-subtitle">Finalized leaderboards for completed WGI events</p>
      </div>

      {/* Event selector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 28, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Select Event</label>
          <select className="select" value={selected} onChange={e => handleSelect(e.target.value)}>
            <option value="">— Choose an Event —</option>
            {events.map(e => (
              <option key={e.show_id} value={e.show_id}>{e.name}</option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleRequest}
          disabled={!selected || archiveStatus === 'loading'}
        >
          {archiveStatus === 'loading' ? 'Loading...' : '📥 Load Scores'}
        </button>
      </div>

      {archiveStatus === 'loading' && (
        <div className="alert alert-warning" style={{ gap: 12, marginBottom: 20 }}>
          <div className="spinner" style={{ width: 16, height: 16 }} />
          Fetching scores from WGI...
        </div>
      )}

      {archiveStatus === 'empty' && (
        <div className="alert alert-warning">No scores found for this event. Has it finished?</div>
      )}

      {archiveStatus === 'complete' && archive.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="alert alert-success" style={{ flex: 1, marginRight: 12 }}>
              ✅ {selectedEvent?.name} — {archive.length} scores loaded
            </div>
            <div style={{ width: 220 }}>
              <select className="select" value={classFilter} onChange={e => setClassFilter(e.target.value)}>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <DataTable columns={columns} data={ranked} />
        </>
      )}
    </div>
  )
}
