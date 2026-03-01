import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// National Rankings
export const getNational = () => api.get('/national')
export const getNationalByClass = (cls) => api.get(`/national/${encodeURIComponent(cls)}`)
export const getClasses = () => api.get('/national/classes')

// Live Hub
export const getLive = () => api.get('/live')

// Projector
export const getProjection = () => api.get('/projection')

// Events
export const getEvents = () => api.get('/events')
export const getArchive = (showId) => api.get(`/events/${showId}/archive`)

// Standings
export const getStandings = () => api.get('/standings')

// Admin (basic auth injected per call)
const adminApi = (user, pass) => axios.create({
  baseURL: '/api/admin',
  timeout: 30000,
  auth: { username: user, password: pass }
})

export const adminDiscover = (u, p) => adminApi(u, p).post('/discover')
export const adminSeed = (u, p) => adminApi(u, p).post('/seed')
export const adminSyncLive = (u, p, payload) => adminApi(u, p).post('/sync-live', payload)
export const adminSyncProjection = (u, p, payload) => adminApi(u, p).post('/sync-projection', payload)
export const adminSyncArchive = (u, p, payload) => adminApi(u, p).post('/sync-archive', payload)
export const adminStatus = (u, p) => adminApi(u, p).get('/status')
export const adminClearLive = (u, p) => adminApi(u, p).delete('/clear-live')
export const adminClearProjection = (u, p) => adminApi(u, p).delete('/clear-projection')
