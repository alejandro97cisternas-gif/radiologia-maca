import api from './client'

export interface Examen {
  id: number
  paciente: string
  rut: string | null
  paciente_id: number
  derivador: string
  derivador_id: number
  tipo_examen: string
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO'
  creado_en: string
  completado_en: string | null
  imagenes_count: number
  tiene_informe: boolean
  informe_token: string | null
  incidencia_estado: 'ABIERTA' | 'RESUELTA' | null
  version: number
  derivador_color: string
}

export interface ImagenExamen {
  id: number
  tipo: '2D' | 'DICOM'
  nombre: string
  url: string
}

export interface ExamenDetalle extends Examen {
  imagenes: ImagenExamen[]
}

export const getTodosExamenes = () =>
  api.get<Examen[]>('/api/examenes/todos').then(r => r.data)

export const getExamenDetalle = (id: number) =>
  api.get<ExamenDetalle>(`/api/examenes/${id}`).then(r => r.data)

export const patchEstadoExamen = (id: number, estado: string) =>
  api.patch(`/api/examenes/${id}/estado`, { estado }).then(r => r.data)

export const descargarImagenes = async (examen: Examen): Promise<void> => {
  const res = await api.get(`/api/examenes/${examen.id}/descargar-imagenes`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `${examen.rut ?? 'paciente'}-${examen.tipo_examen}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const subirInforme = (examenId: number, file: File) => {
  const form = new FormData()
  form.append('archivo', file)
  return api.post(`/api/examenes/${examenId}/informe`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}
