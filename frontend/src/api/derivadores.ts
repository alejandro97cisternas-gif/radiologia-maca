import api from './client'

export interface Derivador {
  id: number
  nombre: string
  email: string
  telefono?: string
  activo: boolean
  color?: string
  moneda: string
}

export const getDerivadores = () => api.get<Derivador[]>('/api/derivadores').then(r => r.data)
export const crearDerivador = (body: Omit<Derivador, 'id' | 'activo'>) => api.post<Derivador>('/api/derivadores', body).then(r => r.data)
export const actualizarDerivador = (id: number, body: Partial<Derivador>) => api.patch<Derivador>(`/api/derivadores/${id}`, body).then(r => r.data)
export const eliminarDerivador = (id: number) => api.delete(`/api/derivadores/${id}`)
export const activarDerivador = (id: number) => api.post(`/api/derivadores/${id}/activar`)
export const generarMagicLink = (id: number) => api.post(`/api/derivadores/${id}/magic-link`).then(r => r.data)
