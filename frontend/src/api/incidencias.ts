import api from './client'
import portalApi from './portalClient'

export interface Incidencia {
  id: number
  examen_id: number
  comentario_doctora: string
  comentario_derivador: string | null
  estado: 'ABIERTA' | 'RESUELTA'
  creado_en: string
  resuelto_en: string | null
}

// Doctora
export const crearIncidencia = (examenId: number, comentario_doctora: string) =>
  api.post<Incidencia>(`/api/examenes/${examenId}/incidencia`, { comentario_doctora }).then(r => r.data)

export const getIncidencia = (examenId: number) =>
  api.get<Incidencia | null>(`/api/examenes/${examenId}/incidencia`).then(r => r.data)

export const actualizarIncidencia = (incId: number, body: { comentario_doctora?: string; estado?: string }) =>
  api.patch<Incidencia>(`/api/incidencias/${incId}`, body).then(r => r.data)

// Portal derivador
export const portalGetIncidencia = (examenId: number) =>
  portalApi.get<Incidencia | null>(`/api/portal/examenes/${examenId}/incidencia`).then(r => r.data)

export const portalResolverIncidencia = (incId: number, comentario_derivador?: string) =>
  portalApi.post<Incidencia>(`/api/portal/incidencias/${incId}/resolver`, { comentario_derivador }).then(r => r.data)
