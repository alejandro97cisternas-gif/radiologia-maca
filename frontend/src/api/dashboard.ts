import api from './client'

export const getCalendario = (mes: string) =>
  api.get(`/api/dashboard/calendario?mes=${mes}`).then(r => r.data)

export const getCarpetas = () => api.get('/api/dashboard/carpetas').then(r => r.data)
export const getCarpetasDerivador = (id: number) =>
  api.get(`/api/dashboard/carpetas/${id}`).then(r => r.data)

export const getExamenesPendientes = () => api.get('/api/examenes/pendientes').then(r => r.data)

export const subirInforme = (examenId: number, file: File) => {
  const form = new FormData()
  form.append('archivo', file)
  return api.post(`/api/examenes/${examenId}/informe`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}
