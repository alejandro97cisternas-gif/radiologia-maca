import axios from 'axios'
import adminApi from './adminClient'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const adminLogin = (username: string, password: string) =>
  axios.post(`${BASE}/api/auth/admin/login`, { username, password }).then(r => r.data)

export const adminMe = () => adminApi.get('/api/auth/admin/me').then(r => r.data)

export const adminListarRadiologos = () =>
  adminApi.get('/api/admin/radiologos').then(r => r.data)

export const adminCrearRadiologo = (body: {
  username: string; password: string; slug: string; nombre_display: string; email: string
}) => adminApi.post('/api/admin/radiologos', body).then(r => r.data)

export const adminActualizarRadiologo = (id: number, body: {
  nombre_display?: string; email?: string; slug?: string; activo?: boolean
}) => adminApi.patch(`/api/admin/radiologos/${id}`, body).then(r => r.data)

export const adminResetPassword = (id: number, password: string) =>
  adminApi.post(`/api/admin/radiologos/${id}/reset-password`, { password }).then(r => r.data)
