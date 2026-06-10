import axios from 'axios'
import portalApi from './portalClient'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const portalAcceder = (slug: string, t: string) =>
  axios.get(`${BASE}/api/portal/acceder/${encodeURIComponent(slug)}?t=${encodeURIComponent(t)}`).then(r => r.data)

export const portalSolicitarAcceso = (email: string) =>
  axios.post(`${BASE}/api/portal/solicitar-acceso`, { email }).then(r => r.data)

export const portalTenantInfo = () =>
  axios.get(`${BASE}/api/portal/tenant-info`).then(r => r.data as { nombre_display: string })

export const portalMe = () => portalApi.get('/api/portal/me').then(r => r.data)

// Pacientes
export const portalGetPacientes = () => portalApi.get('/api/portal/pacientes').then(r => r.data)
export const portalBuscarPaciente = (rut: string) =>
  portalApi.get(`/api/portal/pacientes/buscar?rut=${encodeURIComponent(rut)}`).then(r => r.data)
export const portalCrearPaciente = (body: { nombre_completo: string; rut?: string; fecha_nacimiento: string }) =>
  portalApi.post('/api/portal/pacientes', body).then(r => r.data)

// Exámenes
export const portalGetExamenes = () => portalApi.get('/api/portal/examenes').then(r => r.data)
export const portalCrearExamen = (body: { paciente_id: number; tipo_examen: string; caso_id?: string }) =>
  portalApi.post('/api/portal/examenes', body).then(r => r.data)

// Tipos de examen disponibles (base + custom)
export const portalGetTipos = () =>
  portalApi.get('/api/portal/tipos-disponibles').then(r => r.data as { nombre: string; dimension: '2D' | '3D' | 'AMBOS'; categoria?: string; custom: boolean }[])

// Examen detalle (portal)
export const portalGetExamen = (examenId: number) =>
  portalApi.get(`/api/portal/examenes/${examenId}`).then(r => r.data)

// Imágenes — subtipo: "dicom" | "preview" | "imagen"; ubicacion: "inferior"|"superior"|""
export const portalSubirImagen = (
  examenId: number,
  subtipo: 'dicom' | 'preview' | 'imagen',
  file: File,
  onProgress?: (pct: number) => void,
  ubicacion: string = '',
  dimOverride?: '2D' | '3D',
) => {
  const form = new FormData()
  form.append('subtipo', subtipo)
  form.append('archivo', file)
  form.append('ubicacion', ubicacion)
  if (dimOverride) form.append('dim_override', dimOverride)
  return portalApi.post(`/api/portal/examenes/${examenId}/imagenes`, form, {
    onUploadProgress: e => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
    },
  }).then(r => r.data)
}

// ── Upload chunkeado (para archivos DICOM grandes) ────────────────────────────

const CHUNK_SIZE = 4 * 1024 * 1024 // 4 MB
const UPLOAD_CONCURRENCY = 3       // chunks en paralelo

const portalIniciarSubida = (
  examenId: number,
  body: { nombre: string; total_chunks: number; subtipo: string; ubicacion?: string; dim_override?: string },
) => portalApi.post(`/api/portal/examenes/${examenId}/imagenes/iniciar-subida`, body).then(r => r.data as { upload_id: string })

const portalSubirChunk = (
  examenId: number, uploadId: string, chunkIndex: number, chunk: Blob,
  onChunkProgress?: (loaded: number, total: number) => void,
) => {
  const form = new FormData()
  form.append('upload_id', uploadId)
  form.append('chunk_index', String(chunkIndex))
  form.append('chunk_data', chunk, 'chunk')
  return portalApi.post(`/api/portal/examenes/${examenId}/imagenes/chunk`, form, {
    onUploadProgress: e => { if (onChunkProgress && e.total) onChunkProgress(e.loaded, e.total) },
    timeout: 10 * 60 * 1000, // 10 min por chunk
  }).then(r => r.data)
}

const portalFinalizarSubida = (examenId: number, uploadId: string) =>
  portalApi.post(
    `/api/portal/examenes/${examenId}/imagenes/finalizar-subida`,
    { upload_id: uploadId },
    { timeout: 30 * 60 * 1000 }, // 30 min para ensamblar + subir a R2
  ).then(r => r.data)

export const portalSubirEnChunks = async (
  examenId: number,
  file: File,
  subtipo: 'dicom' | 'preview' | 'imagen',
  onProgress?: (pct: number) => void,
  ubicacion = '',
  dimOverride?: '2D' | '3D',
) => {
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))
  const { upload_id } = await portalIniciarSubida(examenId, {
    nombre: file.name,
    total_chunks: totalChunks,
    subtipo,
    ubicacion,
    dim_override: dimOverride,
  })

  // Progreso por chunk: 0.0–1.0
  const chunkProgress = new Float32Array(totalChunks)

  const uploadOne = async (i: number) => {
    const start = i * CHUNK_SIZE
    await portalSubirChunk(
      examenId, upload_id, i, file.slice(start, start + CHUNK_SIZE),
      (loaded, total) => {
        chunkProgress[i] = loaded / total
        const done = chunkProgress.reduce((s, v) => s + v, 0) / totalChunks
        onProgress?.(Math.round(done * 90))
      },
    )
    chunkProgress[i] = 1
  }

  // Sliding-window: UPLOAD_CONCURRENCY workers consumen la cola en paralelo
  let next = 0
  const worker = async () => {
    while (next < totalChunks) {
      await uploadOne(next++)
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, totalChunks) }, worker))

  const result = await portalFinalizarSubida(examenId, upload_id)
  onProgress?.(100)
  return result
}

export const portalGetImagenes = (examenId: number) =>
  portalApi.get(`/api/portal/examenes/${examenId}/imagenes`).then(r => r.data)

export const portalEliminarImagen = (examenId: number, imagenId: number) =>
  portalApi.delete(`/api/portal/examenes/${examenId}/imagenes/${imagenId}`).then(r => r.data)

export const portalGetRevisiones = (examenId: number) =>
  portalApi.get(`/api/portal/examenes/${examenId}/revisiones`).then(r => r.data)

export const portalConfirmarEdicion = (examenId: number, comentario?: string) =>
  portalApi.post(`/api/portal/examenes/${examenId}/confirmar-edicion`, { comentario: comentario || null }).then(r => r.data)

export const portalGuardarNota = (examenId: number, comentario: string) =>
  portalApi.post(`/api/portal/examenes/${examenId}/nota`, { comentario }).then(r => r.data)

// Eliminar examen
export const portalEliminarExamen = (examenId: number) =>
  portalApi.delete(`/api/portal/examenes/${examenId}`).then(r => r.data)

// Confirmar tareas (BORRADOR → PENDIENTE)
export const portalConfirmarTareas = (examenIds: number[]) =>
  portalApi.post('/api/portal/confirmar-tareas', { examen_ids: examenIds }).then(r => r.data)

// Notificación de caso (un email por todos los exámenes)
export const portalNotificarCaso = (examenIds: number[]) =>
  portalApi.post('/api/portal/notificar-caso', { examen_ids: examenIds }).then(r => r.data)

// Notificación individual (legacy)
export const portalNotificarDoctora = (examenId: number) =>
  portalApi.post(`/api/portal/examenes/${examenId}/notificar`).then(r => r.data)

// Notificaciones
export interface NotificacionPortal {
  id: number
  mensaje: string
  leida: boolean
  examen_id: number | null
  creado_en: string
}

export const portalGetNotificaciones = () =>
  portalApi.get('/api/portal/notificaciones').then(r => r.data as NotificacionPortal[])

export const portalLeerNotificacion = (id: number) =>
  portalApi.post(`/api/portal/notificaciones/${id}/leer`)

export const portalLeerTodas = () =>
  portalApi.post('/api/portal/notificaciones/leer-todas')

// Tarifas (solo lectura)
export const portalGetTarifas = () => portalApi.get('/api/portal/tarifas').then(r => r.data)

export const portalDescargarInformes = (
  examenId: number, rut: string, tipo: string,
  onProgress?: (mb: number) => void,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
    const token = localStorage.getItem('portal_token')
    const slug = (() => {
      const host = window.location.hostname
      const base = import.meta.env.VITE_BASE_DOMAIN || 'localhost'
      if (host.endsWith(`.${base}`)) return host.slice(0, -(base.length + 1))
      return localStorage.getItem('dev_tenant_slug')
    })()
    const xhr = new XMLHttpRequest()
    xhr.open('GET', `${BASE}/api/portal/examenes/${examenId}/informes/descargar`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    if (slug) xhr.setRequestHeader('X-Tenant-Slug', slug)
    xhr.responseType = 'blob'
    xhr.onprogress = e => onProgress?.(e.loaded / (1024 * 1024))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const url = URL.createObjectURL(xhr.response)
        const a = document.createElement('a')
        a.href = url
        a.download = `Informes_${rut}_${tipo}.zip`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        resolve()
      } else {
        reject(new Error(`HTTP ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('Error de red'))
    xhr.send()
  })
}
