import { useEffect, useRef, useState } from 'react'
import {
  Drawer, Descriptions, Tag, Image, Button, message,
  Spin, Empty, Tabs, Badge, Typography, Divider,
} from 'antd'
import { UploadOutlined, DownloadOutlined, FilePdfOutlined, CheckCircleOutlined, DeleteOutlined } from '@ant-design/icons'
import { filterDocFiles, extractDocsFromZip } from '../utils/dicomUpload'
import type { Caso, ImagenExamen, InformeExamen } from '../api/examenes'
import { getCasoDetalle, subirInforme, eliminarInforme, patchEstadoCaso, descargarCaso, notificarDerivador } from '../api/examenes'
import IncidenciaSection from './IncidenciaSection'

type ExamenConImagenes = {
  id: number
  tipo_examen: string
  estado: string
  tiene_informe: boolean
  notificacion_derivador_enviada: boolean
  version: number
  imagenes: ImagenExamen[]
  informes: InformeExamen[]
  notas: { id: number; comentario: string; creado_en: string }[]
}

const ESTADO_COLOR: Record<string, string> = {
  PENDIENTE: 'orange', EN_PROCESO: 'processing', COMPLETADO: 'success',
}

function InformeDropZone({ onFiles, loading, label }: {
  onFiles: (files: File[]) => void
  loading: boolean
  label: string
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const items = Array.from(e.dataTransfer.files)
    const zips = items.filter(f => f.name.toLowerCase().endsWith('.zip'))
    const rest = filterDocFiles(items.filter(f => !f.name.toLowerCase().endsWith('.zip')))
    if (!zips.length) { if (rest.length) onFiles(rest); return }
    setProcesando(true)
    try {
      const extracted: File[] = []
      for (const z of zips) { const r = await extractDocsFromZip(z); extracted.push(...r.files) }
      onFiles([...rest, ...extracted])
    } finally { setProcesando(false) }
  }

  const handleZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setProcesando(true)
    try {
      const extracted: File[] = []
      for (const z of files) { const r = await extractDocsFromZip(z); extracted.push(...r.files) }
      onFiles(extracted)
    } finally { setProcesando(false) }
  }

  const busy = loading || procesando
  return (
    <div style={{ marginTop: 10 }}>
      <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.ppt,.pptx" style={{ display: 'none' }}
        onChange={e => { const f = filterDocFiles(Array.from(e.target.files ?? [])); e.target.value = ''; if (f.length) onFiles(f) }} />
      <input ref={folderRef} type="file" style={{ display: 'none' }}
        {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
        onChange={e => { const f = filterDocFiles(Array.from(e.target.files ?? [])); e.target.value = ''; if (f.length) onFiles(f) }} />
      <input ref={zipRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={handleZip} />
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragging ? '#2563EB' : '#d1d5db'}`,
          borderRadius: 8, padding: '14px 12px',
          background: isDragging ? '#eff6ff' : '#fafafa',
          textAlign: 'center', transition: 'all 0.2s',
        }}
      >
        {busy ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Spin size="small" />
            <Typography.Text style={{ fontSize: 12, color: '#6b7280' }}>
              {procesando ? 'Procesando ZIP…' : 'Subiendo…'}
            </Typography.Text>
          </div>
        ) : (
          <>
            <Typography.Text style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 8 }}>
              {label} · Arrastra archivos o un ZIP aquí
            </Typography.Text>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button size="small" icon={<UploadOutlined />} onClick={() => fileRef.current?.click()}>
                Seleccionar archivos
              </Button>
              <Button size="small" onClick={() => folderRef.current?.click()}>📂 Carpeta</Button>
              <Button size="small" onClick={() => zipRef.current?.click()}>🗜 ZIP</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface Props {
  caso: Caso | null
  onClose: () => void
  onUpdate: () => void
}

export default function ExamenDrawer({ caso, onClose, onUpdate }: Props) {
  const [examenes, setExamenes] = useState<ExamenConImagenes[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState<number | null>(null)
  const [uploadLabel, setUploadLabel] = useState('')
  const [deletingInforme, setDeletingInforme] = useState<number | null>(null)
  const [downloadMb, setDownloadMb] = useState<number | null>(null)
  const [enviando, setEnviando] = useState(false)
  const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const resolveUrl = (url: string) => url.startsWith('http') ? url : `${BASE}${url}`

  useEffect(() => {
    if (!caso) { setExamenes([]); return }
    setLoading(true)
    getCasoDetalle(caso.caso_id)
      .then(async data => {
        const seenIds = new Set<number>()
        const unique = (data.examenes as ExamenConImagenes[]).filter(e => {
          if (seenIds.has(e.id)) return false
          seenIds.add(e.id)
          return true
        })
        setExamenes(unique)
        if (caso.estado === 'PENDIENTE') {
          await patchEstadoCaso(caso.caso_id, 'EN_PROCESO')
          onUpdate()
        }
      })
      .finally(() => setLoading(false))
  }, [caso?.caso_id])

  const handleDescargar = async () => {
    if (!caso) return
    setDownloadMb(0)
    try { await descargarCaso(caso, mb => setDownloadMb(mb)) }
    catch { message.error('Error al descargar imágenes') }
    finally { setDownloadMb(null) }
  }

  const recargar = async () => {
    if (!caso) return
    const data = await getCasoDetalle(caso.caso_id)
    setExamenes(data.examenes as ExamenConImagenes[])
  }

  const handleSubirArchivos = async (examenId: number, files: File[]) => {
    if (!files.length) return
    setUploading(examenId)
    let ok = 0
    for (let i = 0; i < files.length; i++) {
      setUploadLabel(files.length > 1 ? `Subiendo ${i + 1}/${files.length}…` : 'Subiendo…')
      try {
        await subirInforme(examenId, files[i])
        ok++
      } catch {
        message.error(`Error al subir ${files[i].name}`)
      }
    }
    await recargar()
    if (ok > 0) message.success(ok === 1 ? 'Informe subido' : `${ok} archivos subidos`)
    setUploading(null)
    setUploadLabel('')
  }

  const handleEliminarInforme = async (examenId: number, informeId: number) => {
    setDeletingInforme(informeId)
    try {
      await eliminarInforme(examenId, informeId)
      await recargar()
    } catch {
      message.error('Error al eliminar el informe')
    } finally {
      setDeletingInforme(null)
    }
  }

  const handleClose = () => {
    onUpdate()
    onClose()
  }

  const todosConInforme = examenes.length > 0 && examenes.every(e => e.tiene_informe)
  const yaNotificado = examenes.some(e => e.notificacion_derivador_enviada)

  const handleEnviarDerivador = async () => {
    if (!caso) return
    setEnviando(true)
    try {
      const res = await notificarDerivador(caso.caso_id)
      if (!res.enviado) {
        message.error(`Error al enviar: ${res.mensaje}`)
      } else if (res.reenvio) {
        message.warning('Reenvío: el derivador ya había sido notificado anteriormente')
      } else {
        message.success('Informes enviados al derivador')
      }
      const data = await getCasoDetalle(caso.caso_id)
      setExamenes(data.examenes as ExamenConImagenes[])
    } catch {
      message.error('Error al enviar al derivador')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Drawer
      open={!!caso}
      onClose={handleClose}
      width={720}
      extra={
        caso ? (
          downloadMb !== null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
              <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                Descargando {downloadMb.toFixed(1)} MB...
              </span>
              <div style={{ flex: 1, height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#3b82f6', borderRadius: 2, animation: 'pulse 1.5s ease-in-out infinite', width: '100%' }} />
              </div>
            </div>
          ) : (
            <Button icon={<DownloadOutlined />} onClick={handleDescargar}
              disabled={(caso.imagenes_count ?? 0) === 0}>
              Descargar imágenes
            </Button>
          )
        ) : null
      }
      title={
        caso ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 4, height: 32, borderRadius: 2, background: caso.derivador_color || '#e2e8f0', flexShrink: 0 }} />
            <span>{caso.paciente}</span>
            <Tag color={ESTADO_COLOR[caso.estado]}>{caso.estado}</Tag>
          </div>
        ) : null
      }
      footer={
        examenes.length > 0 ? (
          <Button
            block
            disabled={!todosConInforme}
            loading={enviando}
            onClick={handleEnviarDerivador}
            style={
              !todosConInforme
                ? undefined
                : yaNotificado
                ? { background: '#d97706', borderColor: '#d97706', color: '#fff' }
                : { background: '#1e3a5f', borderColor: '#1e3a5f', color: '#fff' }
            }
          >
            {!todosConInforme
              ? 'Sube todos los informes para enviar'
              : yaNotificado
              ? '⚠ Ya enviado · Reenviar al derivador'
              : 'Enviar informes al derivador'}
          </Button>
        ) : null
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 60 }}><Spin size="large" /></div>
      ) : caso && examenes.length > 0 ? (
        <>
          <Descriptions size="small" column={2} style={{ marginBottom: 20 }}>
            <Descriptions.Item label="Clínica">{caso.derivador}</Descriptions.Item>
            <Descriptions.Item label="RUT">{caso.rut || '—'}</Descriptions.Item>
            <Descriptions.Item label="Ingresado">{new Date(caso.creado_en).toLocaleDateString('es-CL')}</Descriptions.Item>
            <Descriptions.Item label="Exámenes">{examenes.length}</Descriptions.Item>
          </Descriptions>

          {examenes.map((examen, idx) => {
            const imgs2D = examen.imagenes.filter(i => i.tipo === '2D')
            const imgsDicom = examen.imagenes.filter(i => i.tipo === 'DICOM')
            const imgsPreview = examen.imagenes.filter(i => i.tipo === 'PREVIEW')
            return (
              <div key={examen.id}>
                {idx > 0 && <Divider style={{ margin: '20px 0' }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Tag color="blue" style={{ fontWeight: 600 }}>{examen.tipo_examen}</Tag>
                  <Tag color={ESTADO_COLOR[examen.estado]}>{examen.estado}</Tag>
                  {(examen.version ?? 0) > 0 && <Tag color="orange">v{examen.version}</Tag>}
                  {examen.tiene_informe && (
                    <Tag color="success" icon={<CheckCircleOutlined />}>Informe subido</Tag>
                  )}
                </div>

                <Tabs items={[
                  ...(imgs2D.length > 0 ? [{
                    key: `2d-${examen.id}`,
                    label: <span>Imágenes 2D <Badge count={imgs2D.length} color="#2563EB" /></span>,
                    children: (
                      <Image.PreviewGroup>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                          {imgs2D.map(img => (
                            <div key={img.id}>
                              <Image src={resolveUrl(img.url)} alt={img.nombre}
                                style={{ width: '100%', height: 120, objectFit: 'cover' }} />
                              <Typography.Text style={{ fontSize: 10, color: '#9ca3af', display: 'block', textAlign: 'center', marginTop: 2 }}>
                                {img.nombre}
                              </Typography.Text>
                            </div>
                          ))}
                        </div>
                      </Image.PreviewGroup>
                    ),
                  }] : []),
                  ...(imgsPreview.length > 0 ? [{
                    key: `preview-${examen.id}`,
                    label: <span>Preview 3D <Badge count={imgsPreview.length} color="#059669" /></span>,
                    children: (
                      <Image.PreviewGroup>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                          {imgsPreview.map(img => (
                            <div key={img.id}>
                              <Image src={resolveUrl(img.url)} alt={img.nombre}
                                style={{ width: '100%', height: 120, objectFit: 'cover' }} />
                              <Typography.Text style={{ fontSize: 10, color: '#9ca3af', display: 'block', textAlign: 'center', marginTop: 2 }}>
                                {img.nombre}
                              </Typography.Text>
                            </div>
                          ))}
                        </div>
                      </Image.PreviewGroup>
                    ),
                  }] : []),
                  {
                    key: `dicom-${examen.id}`,
                    label: <span>DICOM <Badge count={imgsDicom.length} color="#7c3aed" /></span>,
                    children: imgsDicom.length === 0
                      ? <Empty description="Sin archivos DICOM" imageStyle={{ height: 48 }} />
                      : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {imgsDicom.map(img => (
                            <div key={img.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                              <FilePdfOutlined style={{ color: '#7c3aed', fontSize: 18 }} />
                              <Typography.Text style={{ fontSize: 13, flex: 1 }}>{img.nombre}</Typography.Text>
                              <Tag color="purple" style={{ margin: 0 }}>DICOM</Tag>
                            </div>
                          ))}
                        </div>
                      ),
                  },
                ]} />

                {examen.informes?.length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {examen.informes.map(inf => (
                      <div key={inf.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
                        <FilePdfOutlined style={{ color: '#16a34a', fontSize: 16 }} />
                        <a href={inf.url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 13, color: '#15803d' }}>{inf.nombre}</a>
                        <Button
                          size="small" type="text" danger icon={<DeleteOutlined />}
                          loading={deletingInforme === inf.id}
                          onClick={() => handleEliminarInforme(examen.id, inf.id)}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <InformeDropZone
                  loading={uploading === examen.id}
                  label={uploading === examen.id ? uploadLabel : (examen.tiene_informe ? 'Agregar informe' : `Subir informe — ${examen.tipo_examen}`)}
                  onFiles={files => handleSubirArchivos(examen.id, files)}
                />

                {examen.notas?.length > 0 && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6 }}>
                    <Typography.Text strong style={{ fontSize: 12, color: '#92400e', display: 'block', marginBottom: 6 }}>
                      Comentario del centro
                    </Typography.Text>
                    {examen.notas.map(n => (
                      <div key={n.id} style={{ fontSize: 13, color: '#78350f', whiteSpace: 'pre-wrap' }}>{n.comentario}</div>
                    ))}
                  </div>
                )}

                <IncidenciaSection examenId={examen.id} />
              </div>
            )
          })}
        </>
      ) : null}
    </Drawer>
  )
}
