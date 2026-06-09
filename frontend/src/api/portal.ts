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
