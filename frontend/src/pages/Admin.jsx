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
  const [worldsSessions, setWorldsSessions] = useState([])
  const [worldsExpanded, setWorldsExpanded] = useState(false)
  const [worldsShowIds, setWorldsShowIds] = useState({})
  const [worldsUrls, setWorldsUrls] = useState({})

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
      fetch('/api/worlds/sessions').then(r => r.json()).then(res => setWorldsSessions(res.sessions || []))
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
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Fetch finalized scores for a completed event.</p>
          {status?.archive_status === 'loading' && (
            <div className="alert alert-warning" style={{ marginBottom: 12, gap: 8 }}>
              <div className="spinner" style={{ width: 14, height: 14 }} /> Fetching archive...
            </div>
          )}
          {status?.archive_status === 'complete' && (
            <div className="alert alert-success" style={{ marginBottom: 12 }}>✅ {status.archive_event}</div>
          )}
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Archive requests are triggered from the Past Events page directly.</p>
        </div>


        {/* World Championships */}
        <div className="card" style={{ padding: 24, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, fontWeight: 700 }}>5. World Championships</h3>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setWorldsExpanded(e => !e)}>
              {worldsExpanded ? '▲ Collapse' : '▼ Expand Sessions'}
            </button>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Auto-discovers all World Championship sessions from the WGI schedule page. Then scrape each session individually and set ShowIDs as WGI posts them.
          </p>
          <button
            className="btn btn-primary"
            style={{ marginBottom: 16 }}
            disabled={loading.worldsDiscover}
            onClick={() => handle('worldsDiscover', () =>
              fetch('/api/admin/worlds-discover', {
                method: 'POST',
                headers: { 'Authorization': 'Basic ' + btoa('admin:' + pass) }
              })
            )}
          >
            {loading.worldsDiscover ? 'Discovering...' : '🌍 Auto-Discover Sessions'}
          </button>

          {worldsExpanded && worldsSessions.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {['prelims', 'semis', 'finals'].map(round => {
                const roundSessions = worldsSessions.filter(s => s.round === round)
                if (!roundSessions.length) return null
                return (
                  <div key={round} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10 }}>
                      {round === 'prelims' ? 'Prelims' : round === 'semis' ? 'Semi-Finals' : 'Finals'}
                    </div>
                    {roundSessions.map(s => (
                      <div key={s.session_id} style={{ marginBottom: 10, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.venue} · {s.day}</div>
                            {s.show_id && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>ShowID: {s.show_id}</div>}
                            <div style={{ fontSize: 11, color: s.status === 'live' ? 'var(--green)' : 'var(--text-muted)', marginTop: 2 }}>
                              {s.status === 'live' ? '🟢 Live' : s.status === 'roster_only' ? '📋 Roster Only' : '⏳ Pending'}
                            </div>
                          </div>
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }}
                            disabled={loading[`worlds_${s.session_id}`] || (!worldsUrls[s.session_id] && !s.schedule_url && !worldsShowIds[s.session_id] && !s.show_id)}
                            onClick={() => handle(`worlds_${s.session_id}`, () =>
                              fetch('/api/admin/worlds-session', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + btoa('admin:' + pass) },
                                body: JSON.stringify({
                                  session_id: s.session_id,
                                  show_id: worldsShowIds[s.session_id] || s.show_id || '',
                                  schedule_url: worldsUrls[s.session_id] || s.schedule_url || ''
                                })
                              }).then(() =>
                                fetch('/api/worlds/sessions').then(r => r.json()).then(res => setWorldsSessions(res.sessions || []))
                              )
                            )}
                          >
                            {loading[`worlds_${s.session_id}`] ? '...' : '📡 Sync'}
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <input
                            className="input"
                            placeholder="Schedule URL (CompSuite or PDF)"
                            style={{ fontSize: 11 }}
                            value={worldsUrls[s.session_id] ?? s.schedule_url ?? ''}
                            onChange={e => setWorldsUrls(u => ({ ...u, [s.session_id]: e.target.value }))}
                          />
                          <input
                            className="input"
                            placeholder="WGI Show ID (when posted)"
                            style={{ fontSize: 11 }}
                            value={worldsShowIds[s.session_id] ?? s.show_id ?? ''}
                            onChange={e => setWorldsShowIds(ids => ({ ...ids, [s.session_id]: e.target.value }))}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
          {worldsExpanded && worldsSessions.length === 0 && (
            <div className="alert alert-info">No sessions discovered yet. Click Auto-Discover first.</div>
          )}
        </div>

        {/* Group Standings */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>6. Group Standings</h3>
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