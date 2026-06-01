import api from './client'

export interface Notificacion {
  id: number
  mensaje: string
  leida: boolean
  creado_en: string
}

export const getNotificaciones = () =>
  api.get<Notificacion[]>('/api/notificaciones').then(r => r.data)

export const leerTodas = () =>
  api.post('/api/notificaciones/leer-todas')
