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
  archivo_estado: string | null
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
      archivo_estado: exs.some(e => e.archivo_estado === 'archivando') ? 'archivando'
        : exs.some(e => e.archivo_estado === 'desarchivando') ? 'desarchivando'
        : exs.some(e => e.archivo_estado === 'archivado') ? 'archivado'
        : exs.some(e => e.archivo_estado === 'dicom_archivado') ? 'dicom_archivado' : null,
    }
  })
}

export interface ImagenExamen {
  id: number
  tipo: '2D' | 'DICOM'
  nombre: string
  url: string
}

export interface InformeExamen {
  id: number
  nombre: string
  url: string
  token: string
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
  api.get<{ examenes: (Examen & { imagenes: ImagenExamen[], informes: InformeExamen[] })[] }>(
    `/api/examenes/caso/${encodeURIComponent(casoId)}`
  ).then(r => r.data)

export const patchEstadoCaso = (casoId: string, estado: string) =>
  api.patch(`/api/examenes/caso/${encodeURIComponent(casoId)}/estado`, { estado }).then(r => r.data)

const _descargarCasoVPS = (caso: Caso, onProgress?: (pct: number) => void): Promise<void> =>
  new Promise((resolve, reject) => {
    const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
    const token = localStorage.getItem('token')
    const slug = (() => {
      const host = window.location.hostname
      const base = import.meta.env.VITE_BASE_DOMAIN || 'localhost'
      if (host.endsWith(`.${base}`)) return host.slice(0, -(base.length + 1))
      return localStorage.getItem('dev_tenant_slug')
    })()
    const xhr = new XMLHttpRequest()
    xhr.open('GET', `${BASE}/api/examenes/caso/${encodeURIComponent(caso.caso_id)}/descargar`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    if (slug) xhr.setRequestHeader('X-Tenant-Slug', slug)
    xhr.responseType = 'blob'
    xhr.onprogress = e => { if (e.lengthComputable) onProgress?.(Math.round(e.loaded / e.total * 90)) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const url = URL.createObjectURL(xhr.response)
        const a = document.createElement('a')
        a.href = url
        a.download = `${caso.rut ?? 'paciente'}-${caso.examenes.length > 1 ? 'caso' : caso.examenes[0]?.tipo_examen ?? 'imagenes'}.zip`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        resolve()
      } else { reject(new Error(`HTTP ${xhr.status}`)) }
    }
    xhr.onerror = () => reject(new Error('Error de red'))
    xhr.send()
  })

export const descargarCaso = async (caso: Caso, onProgress?: (pct: number) => void): Promise<void> => {
  // Intenta descarga directa desde R2 (presigned URLs)
  let presignData: { archivos: { path: string; url: string }[]; nombre_zip: string } | null = null
  try {
    presignData = await api.get(
      `/api/examenes/caso/${encodeURIComponent(caso.caso_id)}/presign-descarga`
    ).then(r => r.data)
  } catch (err: any) {
    if (err.response?.status !== 501) throw err
    // 501 = storage local, usar VPS
  }

  if (!presignData) return _descargarCasoVPS(caso, onProgress)

  const { archivos, nombre_zip } = presignData
  const CONCURRENT = 6
  const files: Record<string, Uint8Array> = {}
  let done = 0

  let next = 0
  const worker = async () => {
    while (next < archivos.length) {
      const i = next++
      const { path, url } = archivos[i]
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`R2 HTTP ${resp.status} descargando ${path}`)
      files[path] = new Uint8Array(await resp.arrayBuffer())
      done++
      onProgress?.(Math.round(done / archivos.length * 85))
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENT, archivos.length) }, worker))

  onProgress?.(90)
  const { zip } = await import('fflate')
  const zipped = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 0 }, (err, data) => err ? reject(err) : resolve(data))
  )

  onProgress?.(100)
  const blob = new Blob([zipped], { type: 'application/zip' })
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl; a.download = nombre_zip
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}

export const notificarDerivador = (casoId: string) =>
  api.post(`/api/examenes/caso/${encodeURIComponent(casoId)}/notificar-derivador`).then(r => r.data)

export const subirInforme = (examenId: number, file: File) => {
  const form = new FormData()
  form.append('archivo', file)
  return api.post(`/api/examenes/${examenId}/informe`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const eliminarInforme = (examenId: number, informeId: number) =>
  api.delete(`/api/examenes/${examenId}/informes/${informeId}`).then(r => r.data)

export const archivarDicomsCaso = (casoId: string) =>
  api.post(`/api/examenes/caso/${encodeURIComponent(casoId)}/archivar-dicoms`).then(r => r.data)

export const desarchivarCaso = (casoId: string) =>
  api.post(`/api/examenes/caso/${encodeURIComponent(casoId)}/desarchivar`).then(r => r.data)
