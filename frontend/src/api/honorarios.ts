import api from './client'

export const getHonorariosGlobal = () => api.get('/api/honorarios').then(r => r.data)
export const getHonorariosDerivador = (id: number, periodo: string) =>
  api.get(`/api/honorarios/${id}?periodo=${periodo}`).then(r => r.data)
export const generarHonorarios = (id: number, periodo: string) =>
  api.post(`/api/honorarios/${id}/generar?periodo=${periodo}`).then(r => r.data)
export const enviarHonorarios = (id: number, periodo: string) =>
  api.post(`/api/honorarios/${id}/enviar?periodo=${periodo}`).then(r => r.data)

export const previewHonorarios = (id: number, periodo: string) =>
  api.get(`/api/honorarios/${id}/preview?periodo=${periodo}`, { responseType: 'blob' }).then(r => r.data as Blob)

export const getTiposExamen = () =>
  api.get('/api/examenes/tipos').then(r => r.data as { nombre: string; dimension: '2D' | '3D'; custom: boolean; id?: number }[])

export const getAllTiposExamenCustom = () =>
  api.get('/api/honorarios/tipos-examen').then(r => r.data as { id: number; nombre: string; dimension: '2D' | '3D'; activo: boolean }[])

export const crearTipoExamen = (body: { nombre: string; dimension: '2D' | '3D' }) =>
  api.post('/api/honorarios/tipos-examen', body).then(r => r.data)

export const toggleTipoExamen = (id: number) =>
  api.patch(`/api/honorarios/tipos-examen/${id}`).then(r => r.data)


export const getTarifas = (derivadorId: number) =>
  api.get(`/api/honorarios/${derivadorId}/tarifas`).then(r => r.data as { tipo_examen: string; precio: number }[])

export const crearTarifaItem = (derivadorId: number, body: { tipo_examen: string; precio: number; dimension: string }) =>
  api.post(`/api/honorarios/${derivadorId}/tarifas/item`, body).then(r => r.data)

export const eliminarTarifaItem = (derivadorId: number, tipoExamen: string) =>
  api.delete(`/api/honorarios/${derivadorId}/tarifas/${encodeURIComponent(tipoExamen)}`)
