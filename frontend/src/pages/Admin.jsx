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

  // Live event manual overrides
  const [livePrelimsUrl, setLivePrelimsUrl] = useState('')
  const [liveFinalsUrl, setLiveFinalsUrl] = useState('')
  const [liveShowId, setLiveShowId] = useState('')

  // Worlds
  const [worldsSessions, setWorldsSessions] = useState([])
  const [worldsExpanded, setWorldsExpanded] = useState(false)
  const [worldsShowIds, setWorldsShowIds] = useState({})
  const [worldsUrls, setWorldsUrls] = useState({})
  const [worldsProjStatus, setWorldsProjStatus] = useState('none')

  const user = 'admin'
  const pass = sessionStorage.getItem('admin_pass') || password

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

  const fetchStatus = () => {
    adminStatus(user, pass).then(res => setStatus(res.data))
  }

  const fetchWorlds = () => {
    fetch('/api/worlds/sessions').then(r => r.json()).then(res => setWorldsSessions(res.sessions || []))
  }

  useEffect(() => {
    if (authed) {
      fetchStatus()
      getEvents().then(res => setEvents(res.data.events))
      fetchWorlds()
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

  const handleLiveEventSelect = (name) => {
    setSelectedLiveEvent(name)
    const evt = events.find(e => e.name === name)
    setLivePrelimsUrl(evt?.p_url || '')
    setLiveFinalsUrl(evt?.f_url || '')
    setLiveShowId(evt?.show_id || '')
  }

  if (!authed) return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 24px' }}>
      <div className="card" style={{ padding: 32 }}>
        <h1 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Admin Panel</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>Enter your password to continue</p>
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
        <input
          className="input" type="password" placeholder="Password"
          value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()} style={{ marginBottom: 12 }}
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
        }}>{toast}</div>
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

        {/* 1. System Discovery */}
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

        {/* 2. Live Event */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>2. Live Event</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Latch onto a live competition to start tracking scores.</p>
          {status?.active_show && (
            <div className="alert alert-success" style={{ marginBottom: 12 }}>📡 Active: {status.active_show}</div>
          )}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Select Event</label>
            <select className="select" value={selectedLiveEvent} onChange={e => handleLiveEventSelect(e.target.value)}>
              <option value="">— Choose Event —</option>
              {events.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Prelims URL <span style={{ fontWeight: 400, textTransform: 'none' }}>(CompSuite schedule)</span>
            </label>
            <input className="input" placeholder="https://schedules.competitionsuite.com/..." value={livePrelimsUrl} onChange={e => setLivePrelimsUrl(e.target.value)} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Finals URL <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span>
            </label>
            <input className="input" placeholder="https://schedules.competitionsuite.com/..." value={liveFinalsUrl} onChange={e => setLiveFinalsUrl(e.target.value)} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              WGI Show ID <span style={{ fontWeight: 400, textTransform: 'none' }}>(leave blank to auto-detect)</span>
            </label>
            <input className="input" placeholder="e.g. 12345 — find at wgi.org/scores → hover event link" value={liveShowId} onChange={e => setLiveShowId(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              disabled={!selectedLive || (!livePrelimsUrl && !liveShowId) || loading.live}
              onClick={() => handle('live', () => adminSyncLive(user, pass, {
                show_name: selectedLive.name,
                show_id: liveShowId || '',
                prelims_url: livePrelimsUrl,
                finals_url: liveFinalsUrl,
              }))}
            >
              {loading.live ? 'Syncing...' : '📡 Latch & Sync'}
            </button>
            <button className="btn btn-danger" onClick={() => handle('clearLive', () => adminClearLive(user, pass))}>
              🗑️ Clear
            </button>
          </div>
        </div>

        {/* 3. Future Show Projector */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>3. Future Show Projector</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Build a projected standings for an upcoming show using season high scores.</p>
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

        {/* 4. Past Events Archive */}
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
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
            Individual archive requests can be triggered from the Past Events page. Use the button below to sync all discovered events at once.
          </p>
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

        {/* 5. World Championships */}
        <div className="card" style={{ padding: 24, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, fontWeight: 700 }}>5. World Championships</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setWorldsExpanded(e => !e)}>
                {worldsExpanded ? '▲ Collapse' : '▼ Session Status'}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (confirm('Clear all Worlds data and reset?')) {
                    fetch('/api/admin/worlds-clear', {
                      method: 'DELETE',
                      headers: { 'Authorization': 'Basic ' + btoa('admin:' + pass) }
                    }).then(() => { fetchWorlds(); showToast('Worlds data cleared') })
                  }
                }}
              >
                🗑️ Clear
              </button>
            </div>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Automatically sets up all sessions with correct CompSuite URLs and advancement rules, then syncs all prelims rosters at once.
            On competition day, enter ShowIDs per session as WGI posts scores.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              disabled={loading.worldsDiscover}
              onClick={() => handle('worldsDiscover', async () => {
                await fetch('/api/admin/worlds-discover', {
                  method: 'POST',
                  headers: { 'Authorization': 'Basic ' + btoa('admin:' + pass) }
                })
                setTimeout(fetchWorlds, 5000)
              })}
            >
              {loading.worldsDiscover ? 'Setting up...' : '🌍 Setup & Sync All Prelims'}
            </button>
            <button
              className="btn btn-primary"
              disabled={loading.worldsScores}
              onClick={() => handle('worldsScores', async () => {
                await fetch('/api/admin/worlds-sync-scores', {
                  method: 'POST',
                  headers: { 'Authorization': 'Basic ' + btoa('admin:' + pass) }
                })
                setTimeout(fetchWorlds, 4000)
              })}
            >
              {loading.worldsScores ? 'Syncing...' : '📡 Sync All Scores'}
            </button>
            <button
              className="btn btn-secondary"
              disabled={loading.worldsProj}
              onClick={() => handle('worldsProj', async () => {
                await fetch('/api/admin/worlds-projection', {
                  method: 'POST',
                  headers: { 'Authorization': 'Basic ' + btoa('admin:' + pass) }
                })
                setTimeout(() => {
                  fetch('/api/worlds/projection').then(r => r.json()).then(res => setWorldsProjStatus(res.status || 'none'))
                }, 4000)
              })}
            >
              {loading.worldsProj ? 'Building...' : '🔮 Build Worlds Projection'}
            </button>
            {worldsProjStatus === 'complete' && (
              <span className="alert alert-success" style={{ padding: '6px 12px', fontSize: 12 }}>✅ Projection ready</span>
            )}
          </div>

          {worldsExpanded && (
            <div style={{ marginTop: 8 }}>
              {worldsSessions.length === 0 ? (
                <div className="alert alert-info">No sessions yet — click Setup & Sync All Prelims.</div>
              ) : (
                ['prelims', 'semis', 'finals'].map(round => {
                  const roundSessions = worldsSessions.filter(s => s.round === round)
                  if (!roundSessions.length) return null
                  return (
                    <div key={round} style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>
                        {round === 'prelims' ? '📅 Prelims — Thursday April 9' : round === 'semis' ? '📅 Semi-Finals — Friday April 10' : '📅 Finals — Friday/Saturday April 10–11'}
                      </div>
                      {roundSessions.map(s => (
                        <div key={s.session_id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', marginBottom: 8, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {s.venue}
                              {s.show_id && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>ShowID: {s.show_id}</span>}
                            </div>
                            <div style={{ fontSize: 11, marginTop: 2, color: s.status === 'live' ? 'var(--green)' : s.status === 'roster_only' ? 'var(--accent)' : 'var(--text-muted)' }}>
                              {s.status === 'live' ? '🟢 Live Scores' : s.status === 'roster_only' ? '📋 Roster Loaded' : '⏳ Pending'}
                            </div>
                          </div>
                          <input
                            className="input"
                            placeholder="WGI Show ID"
                            style={{ width: 140, fontSize: 12 }}
                            value={worldsShowIds[s.session_id] ?? s.show_id ?? ''}
                            onChange={e => setWorldsShowIds(ids => ({ ...ids, [s.session_id]: e.target.value }))}
                          />
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }}
                            disabled={loading[`worlds_${s.session_id}`]}
                            onClick={() => handle(`worlds_${s.session_id}`, async () => {
                              await fetch('/api/admin/worlds-session', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + btoa('admin:' + pass) },
                                body: JSON.stringify({
                                  session_id: s.session_id,
                                  show_id: worldsShowIds[s.session_id] || s.show_id || '',
                                  schedule_url: s.schedule_url || ''
                                })
                              })
                              setTimeout(fetchWorlds, 2000)
                            })}
                          >
                            {loading[`worlds_${s.session_id}`] ? '...' : '📡 Sync'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* 6. Group Standings */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>6. Group Standings</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Scrapes the official WGI Group Standings page for all 6 classes. Run every Tuesday after noon Eastern.
          </p>
          {status?.standings_status === 'complete' && (
            <div className="alert alert-success" style={{ marginBottom: 12 }}>✅ {status.standings_count} guards loaded</div>
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