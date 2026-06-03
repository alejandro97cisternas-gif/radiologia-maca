import api from './client'

export interface Examen {
  id: number
  caso_id: string | null
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

export interface Caso {
  caso_id: string
  paciente: string
  rut: string | null
  paciente_id: number
  derivador: string
  derivador_id: number
  derivador_color: string
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO'
  creado_en: string
  completado_en: string | null
  examenes: Examen[]
  imagenes_count: number
  tiene_informe: boolean
  incidencia_estado: 'ABIERTA' | 'RESUELTA' | null
}

export function agruparEnCasos(examenes: Examen[]): Caso[] {
  // Deduplicate by exam ID in case backend returns duplicates
  const seenIds = new Set<number>()
  const unique = examenes.filter(e => {
    if (seenIds.has(e.id)) return false
    seenIds.add(e.id)
    return true
  })
  const map = new Map<string, Examen[]>()
  for (const e of unique) {
    const key = e.caso_id || `solo_${e.id}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return Array.from(map.entries()).map(([caso_id, exs]) => {
    const estados = new Set(exs.map(e => e.estado))
    const estado: Caso['estado'] =
      estados.size === 1 && estados.has('COMPLETADO') ? 'COMPLETADO'
      : estados.has('EN_PROCESO') || estados.has('COMPLETADO') ? 'EN_PROCESO'
      : 'PENDIENTE'
    return {
      caso_id,
      paciente: exs[0].paciente,
      rut: exs[0].rut,
      paciente_id: exs[0].paciente_id,
      derivador: exs[0].derivador,
      derivador_id: exs[0].derivador_id,
      derivador_color: exs[0].derivador_color,
      estado,
      creado_en: exs.reduce((min, e) => e.creado_en < min ? e.creado_en : min, exs[0].creado_en),
      completado_en: estado === 'COMPLETADO'
        ? exs.reduce((max, e) => e.completado_en && (!max || e.completado_en > max) ? e.completado_en : max, null as string | null)
        : null,
      examenes: exs,
      imagenes_count: exs.reduce((s, e) => s + e.imagenes_count, 0),
      tiene_informe: exs.every(e => e.tiene_informe),
      incidencia_estado: exs.find(e => e.incidencia_estado === 'ABIERTA')?.incidencia_estado
        ?? exs.find(e => e.incidencia_estado)?.incidencia_estado ?? null,
    }
  })
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

const LIMITE_HORAS = 48

export function isVencido(caso: Caso): boolean {
  if (caso.estado === 'COMPLETADO') return false
  return Date.now() - new Date(caso.creado_en).getTime() > LIMITE_HORAS * 3_600_000
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

export const getCasoDetalle = (casoId: string) =>
  api.get<{ examenes: (Examen & { imagenes: ImagenExamen[] })[] }>(
    `/api/examenes/caso/${encodeURIComponent(casoId)}`
  ).then(r => r.data)

export const patchEstadoCaso = (casoId: string, estado: string) =>
  api.patch(`/api/examenes/caso/${encodeURIComponent(casoId)}/estado`, { estado }).then(r => r.data)

export const descargarCaso = async (caso: Caso): Promise<void> => {
  const res = await api.get(`/api/examenes/caso/${encodeURIComponent(caso.caso_id)}/descargar`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `${caso.rut ?? 'paciente'}-${caso.examenes.length > 1 ? 'caso' : caso.examenes[0]?.tipo_examen ?? 'imagenes'}.zip`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const subirInforme = (examenId: number, file: File) => {
  const form = new FormData()
  form.append('archivo', file)
  return api.post(`/api/examenes/${examenId}/informe`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}
