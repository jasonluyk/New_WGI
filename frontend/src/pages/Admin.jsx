import { useState, useEffect } from 'react'
import {
  adminStatus, adminDiscover, adminSeed,
  adminSyncLive, adminSyncProjection, adminSyncArchive,
  adminClearLive, adminClearProjection, adminSyncStandings, getEvents
} from '../api/client'

export default function Admin() {
  const [authed, setAuthed] = useState(() => !!sessionStorage.getItem('admin_authed'))
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState(null)
  const [events, setEvents] = useState([])
  const [selectedLiveEvent, setSelectedLiveEvent] = useState('')
  const [selectedProjEvent, setSelectedProjEvent] = useState('')
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState({})

  const user = 'admin'

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const setLoad = (key, val) => setLoading(l => ({ ...l, [key]: val }))

  const login = async () => {
    try {
      await adminStatus(user, password)
      sessionStorage.setItem('admin_authed', '1')
      sessionStorage.setItem('admin_pass', password)
      setAuthed(true)
      setError('')
    } catch {
      setError('Invalid password')
    }
  }

  const pass = sessionStorage.getItem('admin_pass') || password

  const fetchStatus = () => {
    adminStatus(user, pass).then(res => setStatus(res.data))
  }

  useEffect(() => {
    if (authed) {
      fetchStatus()
      getEvents().then(res => setEvents(res.data.events))
      const interval = setInterval(fetchStatus, 5000)
      return () => clearInterval(interval)
    }
  }, [authed])

  const handle = async (key, fn) => {
    setLoad(key, true)
    try {
      await fn()
      showToast('Command sent successfully')
      fetchStatus()
    } catch (e) {
      showToast('Error: ' + (e.response?.data?.detail || e.message))
    }
    setLoad(key, false)
  }

  const selectedLive = events.find(e => e.name === selectedLiveEvent)
  const selectedProj = events.find(e => e.name === selectedProjEvent)

  if (!authed) return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 24px' }}>
      <div className="card" style={{ padding: 32 }}>
        <h1 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Admin Panel</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>Enter your password to continue</p>
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          style={{ marginBottom: 12 }}
        />
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={login}>Login</button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 999,
          background: 'var(--bg-card)', border: '1px solid var(--accent)',
          borderRadius: 8, padding: '12px 20px', color: 'var(--text-primary)',
          fontFamily: 'Barlow Condensed, sans-serif', fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}>
          {toast}
        </div>
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Admin Control Deck</h1>
          <p className="page-subtitle">System controls and scraper management</p>
        </div>
        <button className="btn btn-secondary" onClick={() => { sessionStorage.clear(); setAuthed(false) }}>Logout</button>
      </div>

      {/* Status cards */}
      {status && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          <div className="stat-card card-accent">
            <div className="stat-value" style={{ fontSize: 22 }}>{status.national_records}</div>
            <div className="stat-label">DB Records</div>
          </div>
          <div className="stat-card card-accent">
            <div className="stat-value" style={{ fontSize: 22 }}>{status.discovery_count || 0}</div>
            <div className="stat-label">Events Discovered</div>
          </div>
          <div className="stat-card card-accent">
            <div className="stat-value" style={{ fontSize: 16, paddingTop: 4 }}>{status.active_show || 'None'}</div>
            <div className="stat-label">Active Show</div>
          </div>
          <div className="stat-card card-accent">
            <div className="stat-value" style={{ fontSize: 16, paddingTop: 4 }}>{status.projection_show || 'None'}</div>
            <div className="stat-label">Projection</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* System Discovery */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>1. System Discovery</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Scrapes WGI calendar and scores page to find all events and ShowIDs.</p>
          {status?.discovery_status === 'running' && (
            <div className="alert alert-warning" style={{ marginBottom: 12, gap: 8 }}>
              <div className="spinner" style={{ width: 14, height: 14 }} /> Running...
            </div>
          )}
          {status?.discovery_status === 'complete' && (
            <div className="alert alert-success" style={{ marginBottom: 12 }}>✅ {status.discovery_count} events found</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => handle('discover', () => adminDiscover(user, pass))} disabled={loading.discover}>
              {loading.discover ? 'Sending...' : '🚀 Auto-Discover'}
            </button>
            <button className="btn btn-secondary" onClick={() => handle('seed', () => adminSeed(user, pass))} disabled={loading.seed}>
              {loading.seed ? 'Seeding...' : '🌱 Seed Database'}
            </button>
          </div>
        </div>

        {/* Live Event */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>2. Live Event</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Latch onto a live competition to start tracking scores.</p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Select Event</label>
            <select className="select" value={selectedLiveEvent} onChange={e => setSelectedLiveEvent(e.target.value)}>
              <option value="">— Choose Event —</option>
              {events.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
            </select>
          </div>
          {selectedLive && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              <div>ShowID: <code style={{ color: 'var(--accent)' }}>{selectedLive.show_id || 'Not posted yet'}</code></div>
              <div>Prelims: <code>{selectedLive.p_url || 'Not set'}</code></div>
              <div>Finals: <code>{selectedLive.f_url || 'Not set'}</code></div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              disabled={!selectedLive?.p_url || loading.live}
              onClick={() => handle('live', () => adminSyncLive(user, pass, {
                show_name: selectedLive.name,
                show_id: selectedLive.show_id,
                prelims_url: selectedLive.p_url,
                finals_url: selectedLive.f_url,
              }))}
            >
              {loading.live ? 'Syncing...' : '📡 Latch & Sync'}
            </button>
            <button className="btn btn-danger" onClick={() => handle('clearLive', () => adminClearLive(user, pass))}>
              🗑️ Clear
            </button>
          </div>
        </div>

        {/* Projector */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>3. Future Show Projector</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Build a projected standings for an upcoming show using season averages.</p>
          {status?.projection_status === 'loading' && (
            <div className="alert alert-warning" style={{ marginBottom: 12, gap: 8 }}>
              <div className="spinner" style={{ width: 14, height: 14 }} /> Building projection...
            </div>
          )}
          {status?.projection_status === 'complete' && (
            <div className="alert alert-success" style={{ marginBottom: 12 }}>✅ {status.projection_show}</div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Select Future Show</label>
            <select className="select" value={selectedProjEvent} onChange={e => setSelectedProjEvent(e.target.value)}>
              <option value="">— Choose Event —</option>
              {events.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              disabled={!selectedProj?.p_url || loading.proj}
              onClick={() => handle('proj', () => adminSyncProjection(user, pass, {
                show_name: selectedProj.name,
                prelims_url: selectedProj.p_url,
                finals_url: selectedProj.f_url,
              }))}
            >
              {loading.proj ? 'Building...' : '🔮 Build Projection'}
            </button>
            <button className="btn btn-danger" onClick={() => handle('clearProj', () => adminClearProjection(user, pass))}>
              🗑️ Clear
            </button>
          </div>
        </div>

        {/* Archive */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>4. Past Events Archive</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Fetch finalized scores for completed events.</p>
          {status?.archive_status === 'loading' && (
            <div className="alert alert-warning" style={{ marginBottom: 12, gap: 8 }}>
              <div className="spinner" style={{ width: 14, height: 14 }} /> Fetching archive...
            </div>
          )}
          {status?.archive_status === 'complete' && (
            <div className="alert alert-success" style={{ marginBottom: 12 }}>✅ {status.archive_event}</div>
          )}
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>Individual archive requests are triggered from the Past Events page. Use the button below to sync all discovered events at once.</p>
          <button
            className="btn btn-primary"
            disabled={loading.syncAllFinals}
            onClick={() => handle('syncAllFinals', () =>
              fetch('/api/admin/sync-all-finals', {
                method: 'POST',
                headers: { 'Authorization': 'Basic ' + btoa('admin:' + pass) }
              })
            )}
          >
            {loading.syncAllFinals ? 'Queuing...' : '📥 Sync All Finals Events'}
          </button>
        </div>


        {/* Group Standings */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>5. Group Standings</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Scrapes the official WGI Group Standings page for all 6 classes. Run every Tuesday after noon Eastern.
          </p>
          {status?.standings_status === 'complete' && (
            <div className="alert alert-success" style={{ marginBottom: 12 }}>
              ✅ {status.standings_count} guards loaded
            </div>
          )}
          <button
            className="btn btn-primary"
            disabled={loading.standings}
            onClick={() => handle('standings', () => adminSyncStandings(user, pass))}
          >
            {loading.standings ? 'Syncing...' : '📊 Sync Standings'}
          </button>
        </div>    
      </div>
    </div>
  )
}