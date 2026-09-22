import api from './client'

export async function login(username: string, password: string): Promise<string> {
  const res = await api.post('/api/auth/login', { username, password })
  return res.data.access_token
}

export async function getMe() {
  const res = await api.get('/api/auth/me')
  return res.data as { id: number; username: string; nombre_display: string; slug: string; en_vacaciones: boolean; fecha_retorno: string | null }
}

export async function updateVacaciones(en_vacaciones: boolean, fecha_retorno: string | null) {
  const res = await api.patch('/api/auth/me/vacaciones', { en_vacaciones, fecha_retorno })
  return res.data as { en_vacaciones: boolean; fecha_retorno: string | null }
}
