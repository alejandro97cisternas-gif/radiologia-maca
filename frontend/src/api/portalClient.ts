import axios from 'axios'
import { getTenantSlug } from './tenant'

const portalApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

portalApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('portal_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  const slug = getTenantSlug()
  if (slug) config.headers['X-Tenant-Slug'] = slug
  return config
})

portalApi.interceptors.response.use(
  r => {
    const refreshed = r.headers['x-token-refresh']
    if (refreshed) localStorage.setItem('portal_token', refreshed)
    return r
  },
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('portal_token')
      window.location.href = '/portal/acceder'
    }
    return Promise.reject(err)
  }
)

export default portalApi
