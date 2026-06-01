import api from './client'

export async function login(username: string, password: string): Promise<string> {
  const res = await api.post('/api/auth/login', { username, password })
  return res.data.access_token
}

export async function getMe() {
  const res = await api.get('/api/auth/me')
  return res.data
}
