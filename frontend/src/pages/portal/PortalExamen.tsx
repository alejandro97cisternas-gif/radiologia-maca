import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Row, Col, Image, Tag, Typography, Spin, Empty, Tabs, Button, Modal,
  Alert, Divider, Form, Input, Popconfirm, Timeline, Progress,
} from 'antd'
import {
  ArrowLeftOutlined, WarningOutlined, CheckCircleOutlined,
  DeleteOutlined, UploadOutlined, HistoryOutlined, EditOutlined,
  CheckOutlined, CloseOutlined, SaveOutlined, FilePdfOutlined, DownloadOutlined,
} from '@ant-design/icons'
import {
  portalGetExamen, portalGetImagenes, portalGetRevisiones,
  portalSubirImagen, portalSubirEnChunks, portalEliminarImagen,
  portalConfirmarEdicion, portalGuardarNota, portalDescargarInformes,
} from '../../api/portal'
import { readDropItems, filterDicomFromFiles } from '../../utils/dicomUpload'
import { portalGetIncidencia, portalResolverIncidencia } from '../../api/incidencias'
import type { Incidencia } from '../../api/incidencias'
import { message } from 'antd'
import NovexBadge from '../../components/NovexBadge'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const resolveUrl = (url: string) => url.startsWith('http') ? url : `${BASE}${url}`

interface ImagenItem {
  id: number
  nombre: string
  subtipo: 'imagen' | 'dicom' | 'preview'
  url: string
}

interface Revision {
  id: number
  numero_version: number
  tipo_cambio: string
  nombre_archivo: string | null
  comentario: string | null
  creado_en: string
}

function VersionTag({ version }: { version: number }) {
  return (
    <Tag color={version === 0 ? 'default' : 'orange'} style={{ fontWeight: 600, fontSize: 12 }}>
      v{version}
    </Tag>
  )
}

const TIPO_CAMBIO_LABEL: Record<string, string> = {
  modificacion: 'Modificación confirmada',
  imagen_agregada: 'Imagen agregada',
  imagen_eliminada: 'Imagen eliminada',
  nota: 'Nota',
}

const TIPO_CAMBIO_COLOR: Record<string, string> = {
  modificacion: 'blue',
  imagen_agregada: 'green',
  imagen_eliminada: 'red',
  nota: 'gray',
}

export default function PortalExamen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const examenId = parseInt(id || '0')

  const [examen, setExamen] = useState<any>(null)
  const [imagenes, setImagenes] = useState<ImagenItem[]>([])
  const [revisiones, setRevisiones] = useState<Revision[]>([])
  const [incidencia, setIncidencia] = useState<Incidencia | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [descargando, setDescargando] = useState(false)
  const [descargandoTodos, setDescargandoTodos] = useState(false)
  const [descargaMb, setDescargaMb] = useState(0)

  const handleDescargarInforme = async () => {
    if (!pdfUrl) return
    setDescargando(true)
    try {
      const res = await fetch(resolveUrl(pdfUrl))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const rut = (examen.paciente_rut || 'SIN_RUT').replace(/[^a-zA-Z0-9]/g, '_')
      a.download = `Informe_${rut}_${examen.tipo_examen}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      message.error('Error al descargar el informe')
    } finally {
      setDescargando(false)
    }
  }

  // Modo edición
  const [editMode, setEditMode] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Uploads
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Nota / comentario
  const [nota, setNota] = useState('')
  const [savingNota, setSavingNota] = useState(false)

  // Incidencia
  const [resolviendo, setResolviendo] = useState(false)
  const [form] = Form.useForm()

  const fileInput2dRef = useRef<HTMLInputElement>(null)
  const fileInputDicomRef = useRef<HTMLInputElement>(null)
  const fileInputDicomFolderRef = useRef<HTMLInputElement>(null)
  const fileInputPreviewRef = useRef<HTMLInputElement>(null)

  const cargar = async () => {
    const [ex, imgs, revs] = await Promise.all([
      portalGetExamen(examenId),
      portalGetImagenes(examenId),
      portalGetRevisiones(examenId),
    ])
    setExamen(ex)
    setImagenes(imgs)
    setRevisiones(revs)
  }

  useEffect(() => {
    Promise.all([
      cargar(),
      portalGetIncidencia(examenId).then(setIncidencia).catch(() => setIncidencia(null)),
    ]).finally(() => setLoading(false))
  }, [examenId])

  const puedeEditar = examen && examen.estado !== 'COMPLETADO'

  const handleEliminarImagen = async (imagenId: number, nombre: string) => {
    try {
      await portalEliminarImagen(examenId, imagenId)
      setHasChanges(true)
      message.success(`"${nombre}" eliminada`)
      cargar()
    } catch {
      message.error('Error al eliminar imagen')
    }
  }

  const handleUpload = async (files: File | File[], subtipo: 'imagen' | 'dicom' | 'preview') => {
    const lista = Array.isArray(files) ? files : [files]
    const dim = examen?.dimension
    const dimOverride: '2D' | '3D' | undefined = dim === 'AMBOS' ? (subtipo === 'imagen' ? '2D' : '3D') : undefined
    setUploading(true)
    for (const file of lista) {
      setUploadProgress(0)
      try {
        if (subtipo === 'dicom') {
          await portalSubirEnChunks(examenId, file, subtipo, setUploadProgress, '', dimOverride)
        } else {
          await portalSubirImagen(examenId, subtipo, file, setUploadProgress, '', dimOverride)
        }
        setHasChanges(true)
        message.success(`"${file.name}" subida`)
      } catch {
        message.error(`Error al subir "${file.name}"`)
      }
    }
    setUploading(false)
    setUploadProgress(0)
    cargar()
  }

  const handleDicomFolderDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    if (!editMode) return
    const all = await readDropItems(e.dataTransfer.items)
    const { dicom, skipped } = await filterDicomFromFiles(all)
    if (skipped > 0) message.info(`${skipped} archivo${skipped !== 1 ? 's' : ''} omitido${skipped !== 1 ? 's' : ''} (no son DICOM)`)
    if (dicom.length) handleUpload(dicom, 'dicom')
  }

  const handleDicomFolderInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return
    const { dicom, skipped } = await filterDicomFromFiles(Array.from(e.target.files))
    if (skipped > 0) message.info(`${skipped} archivo${skipped !== 1 ? 's' : ''} omitido${skipped !== 1 ? 's' : ''} (no son DICOM)`)
    if (dicom.length) handleUpload(dicom, 'dicom')
    e.target.value = ''
  }

  const handleConfirmar = async () => {
    if (!hasChanges) { message.info('Sin cambios que confirmar'); return }
    setConfirming(true)
    try {
      const res = await portalConfirmarEdicion(examenId, nota || undefined)
      message.success(`Cambios confirmados — versión v${res.version}`)
      setHasChanges(false)
      setEditMode(false)
      setNota('')
      cargar()
    } catch {
      message.error('Error al confirmar cambios')
    } finally {
      setConfirming(false)
    }
  }

  const handleGuardarNota = async () => {
    if (!nota.trim()) { message.warning('Escribe una nota primero'); return }
    setSavingNota(true)
    try {
      await portalGuardarNota(examenId, nota)
      message.success('Nota guardada')
      setNota('')
      cargar()
    } catch {
      message.error('Error al guardar nota')
    } finally {
      setSavingNota(false)
    }
  }

  const handleResolver = async (values: { comentario?: string }) => {
    if (!incidencia) return
    setResolviendo(true)
    try {
      const updated = await portalResolverIncidencia(incidencia.id, values.comentario)
      setIncidencia(updated)
      form.resetFields()
      message.success('Incidencia marcada como resuelta')
    } catch { message.error('Error al resolver') }
    finally { setResolviendo(false) }
  }

  const imgs2D = imagenes.filter(i => i.subtipo === 'imagen')
  const imgsDicom = imagenes.filter(i => i.subtipo === 'dicom')
  const imgsPreview = imagenes.filter(i => i.subtipo === 'preview')
  const examenDim: string = examen?.dimension ?? '2D'
  const mostrar2D = examenDim !== '3D'
  const mostrar3D = examenDim !== '2D'

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin size="large" />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', display: 'flex', flexDirection: 'column' }}>
    <div style={{ flex: 1, padding: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>Volver</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>Examen #{examenId}</Typography.Title>
        {examen && (
          <>
            <Tag color="blue">{examen.tipo_examen}</Tag>
            {examen.dimension === 'AMBOS'
              ? <><Tag color="cyan" style={{ margin: 0 }}>2D</Tag><Tag color="purple">3D</Tag></>
              : <Tag color={examen.dimension === '3D' ? 'purple' : 'cyan'}>{examen.dimension}</Tag>
            }
            <Tag color={
              ({ BORRADOR: 'default', PENDIENTE: 'orange', EN_PROCESO: 'processing', COMPLETADO: 'success' } as Record<string, string>)[examen.estado] ?? 'default'
            }>
              {examen.estado}
            </Tag>
            <VersionTag version={examen.version} />
          </>
        )}
        {examen?.paciente_nombre && (
          <Typography.Text type="secondary" style={{ marginLeft: 'auto', fontSize: 13 }}>
            {examen.paciente_nombre}{examen.paciente_rut ? ` — ${examen.paciente_rut}` : ''}
          </Typography.Text>
        )}

        {/* Lista de documentos del informe */}
        {examen?.informes?.length > 0 && (
          <div style={{ marginLeft: 'auto', width: '100%', marginTop: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {examen.informes.map((inf: { id: number; nombre: string; url: string }) => {
                const ext = inf.nombre.split('.').pop()?.toLowerCase() ?? ''
                const esPdf = ext === 'pdf'
                const esImagen = ['png', 'jpg', 'jpeg'].includes(ext)
                const icono = esPdf ? '📄' : esImagen ? '🖼' : '📎'
                const absUrl = resolveUrl(inf.url)
                return (
                  <div key={inf.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', background: '#f0fdf4',
                    border: '1px solid #bbf7d0', borderRadius: 6,
                  }}>
                    <span style={{ fontSize: 16 }}>{icono}</span>
                    <Typography.Text style={{ flex: 1, fontSize: 13, color: '#15803d' }} ellipsis>
                      {inf.nombre}
                    </Typography.Text>
                    <Button size="small" type="link" style={{ padding: '0 6px' }}
                      onClick={() => esPdf ? setPdfUrl(inf.url) : window.open(absUrl, '_blank')}>
                      Abrir
                    </Button>
                    <Button size="small" type="link" icon={<DownloadOutlined />} style={{ padding: '0 6px' }}
                      onClick={async () => {
                        try {
                          const res = await fetch(absUrl)
                          const blob = await res.blob()
                          const a = document.createElement('a')
                          a.href = URL.createObjectURL(blob)
                          a.download = inf.nombre
                          a.click()
                          URL.revokeObjectURL(a.href)
                        } catch { message.error('Error al descargar') }
                      }}>
                      Descargar
                    </Button>
                  </div>
                )
              })}
            </div>
            {examen.informes.length > 1 && (
              <Button size="small" icon={<DownloadOutlined />} loading={descargandoTodos}
                style={{ marginTop: 8 }}
                onClick={async () => {
                  setDescargandoTodos(true); setDescargaMb(0)
                  try {
                    await portalDescargarInformes(examen.id, examen.paciente_rut || 'SIN_RUT', examen.tipo_examen, mb => setDescargaMb(mb))
                  } catch { message.error('Error al descargar los informes') }
                  finally { setDescargandoTodos(false) }
                }}>
                {descargandoTodos ? `${descargaMb.toFixed(1)} MB...` : 'Descargar todos'}
              </Button>
            )}
          </div>
        )}

        {/* Botones de modo edición */}
        {puedeEditar && !editMode && (
          <Button
            icon={<EditOutlined />}
            onClick={() => setEditMode(true)}
            style={{ marginLeft: examen?.informes?.length > 0 ? 0 : 'auto' }}
          >
            Modificar
          </Button>
        )}
        {editMode && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {hasChanges && (
              <Tag color="orange" style={{ alignSelf: 'center', fontWeight: 600 }}>
                Cambios sin confirmar
              </Tag>
            )}
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={handleConfirmar}
              loading={confirming}
              disabled={!hasChanges}
            >
              Confirmar cambios
            </Button>
            <Button
              icon={<CloseOutlined />}
              onClick={() => { setEditMode(false); setHasChanges(false) }}
            >
              Cancelar
            </Button>
          </div>
        )}
      </div>

      {/* Incidencia */}
      {incidencia && (
        <div style={{ marginBottom: 20 }}>
          {incidencia.estado === 'ABIERTA' ? (
            <Alert
              type="error"
              icon={<WarningOutlined />}
              message="Incidencia abierta"
              description={
                <div>
                  <p style={{ margin: '4px 0 12px' }}>{incidencia.comentario_doctora}</p>
                  <Form form={form} layout="vertical" onFinish={handleResolver}>
                    <Form.Item name="comentario" label="Respuesta (opcional)" style={{ marginBottom: 8 }}>
                      <Input.TextArea rows={2} placeholder="Puedes añadir una explicación o respuesta…" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={resolviendo} size="small">
                      Marcar como resuelta
                    </Button>
                  </Form>
                </div>
              }
            />
          ) : (
            <Alert
              type="success"
              icon={<CheckCircleOutlined />}
              message="Incidencia resuelta"
              description={
                <div>
                  <p style={{ margin: '4px 0 4px', color: '#374151' }}>{incidencia.comentario_doctora}</p>
                  {incidencia.comentario_derivador && (
                    <p style={{ margin: '8px 0 0', color: '#16a34a' }}>
                      Tu respuesta: {incidencia.comentario_derivador}
                    </p>
                  )}
                </div>
              }
            />
          )}
          <Divider style={{ margin: '16px 0' }} />
        </div>
      )}

      {/* Inputs ocultos */}
      <input ref={fileInput2dRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'imagen'); e.target.value = '' }} />
      <input ref={fileInputDicomRef} type="file" multiple style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.length) handleUpload(Array.from(e.target.files), 'dicom'); e.target.value = '' }} />
      <input ref={fileInputDicomFolderRef} type="file" multiple style={{ display: 'none' }}
        onChange={handleDicomFolderInput} />
      <input ref={fileInputPreviewRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'preview'); e.target.value = '' }} />

      {/* Imágenes */}
      <Tabs items={[
        ...( mostrar2D ? [{
          key: '2d',
          label: `📷 Imágenes 2D (${imgs2D.length})`,
          children: (
            <div>
              {imgs2D.length === 0
                ? <Empty description="Sin imágenes 2D" style={{ marginBottom: 16 }} />
                : (
                  <Image.PreviewGroup>
                    <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
                      {imgs2D.map(img => (
                        <Col key={img.id} xs={12} sm={8} md={6} lg={4}>
                          <div style={{ position: 'relative' }}>
                            <Image src={resolveUrl(img.url)} alt={img.nombre}
                              style={{ objectFit: 'cover', height: 120, width: '100%' }} />
                            {editMode && (
                              <Popconfirm title={`¿Eliminar "${img.nombre}"?`} okText="Eliminar"
                                cancelText="Cancelar" okButtonProps={{ danger: true }}
                                onConfirm={() => handleEliminarImagen(img.id, img.nombre)}>
                                <Button size="small" danger icon={<DeleteOutlined />}
                                  style={{ position: 'absolute', top: 4, right: 4, opacity: 0.9 }} />
                              </Popconfirm>
                            )}
                          </div>
                          <Typography.Text style={{ fontSize: 11, color: '#6b7280', display: 'block', textAlign: 'center', marginTop: 2 }}>
                            {img.nombre}
                          </Typography.Text>
                        </Col>
                      ))}
                    </Row>
                  </Image.PreviewGroup>
                )
              }
              {editMode && (
                <>
                  <Button icon={<UploadOutlined />} loading={uploading} onClick={() => fileInput2dRef.current?.click()}>
                    Agregar imagen
                  </Button>
                  {uploading && uploadProgress > 0 && (
                    <Progress percent={uploadProgress} size="small" style={{ marginTop: 8, maxWidth: 300 }} />
                  )}
                </>
              )}
            </div>
          ),
        }] : []),
        ...( mostrar3D ? [{
          key: 'dicom',
          label: `🧊 DICOM (${imgsDicom.length})`,
          children: (
            <div>
              {imgsDicom.length === 0
                ? <Empty description="Sin archivos DICOM" style={{ marginBottom: 16 }} />
                : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', fontSize: 13 }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Archivo</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Tipo</th>
                        {editMode && <th style={{ padding: '8px 12px' }} />}
                      </tr>
                    </thead>
                    <tbody>
                      {imgsDicom.map(img => (
                        <tr key={img.id} style={{ borderBottom: '1px solid #e5e7eb', fontSize: 13 }}>
                          <td style={{ padding: '8px 12px' }}>{img.nombre}</td>
                          <td style={{ padding: '8px 12px' }}><Tag color="purple">DICOM</Tag></td>
                          {editMode && (
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              <Popconfirm title={`¿Eliminar "${img.nombre}"?`} okText="Eliminar"
                                cancelText="Cancelar" okButtonProps={{ danger: true }}
                                onConfirm={() => handleEliminarImagen(img.id, img.nombre)}>
                                <Button size="small" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
              {editMode && (
                <>
                  <div
                    onDrop={handleDicomFolderDrop}
                    onDragOver={e => e.preventDefault()}
                    style={{
                      border: '2px dashed #d1d5db', borderRadius: 8, padding: '12px 16px',
                      textAlign: 'center', background: '#fafafa', marginBottom: 8,
                      color: '#6b7280', fontSize: 12,
                    }}
                  >
                    Arrastra archivos o carpeta DICOM aquí
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button icon={<UploadOutlined />} loading={uploading} onClick={() => fileInputDicomRef.current?.click()}>
                      Agregar DICOM
                    </Button>
                    <Button
                      loading={uploading}
                      onClick={() => {
                        if (fileInputDicomFolderRef.current) {
                          fileInputDicomFolderRef.current.setAttribute('webkitdirectory', '')
                          fileInputDicomFolderRef.current.click()
                        }
                      }}
                    >
                      Seleccionar carpeta
                    </Button>
                  </div>
                  {uploading && uploadProgress > 0 && (
                    <Progress percent={uploadProgress} size="small" style={{ marginTop: 8, maxWidth: 300 }} />
                  )}
                </>
              )}
            </div>
          ),
        }, {
          key: 'preview',
          label: `🖼 Preview (${imgsPreview.length})`,
          children: (
            <div>
              {imgsPreview.length === 0
                ? <Empty description="Sin fotos de preview" style={{ marginBottom: 16 }} />
                : (
                  <Image.PreviewGroup>
                    <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
                      {imgsPreview.map(img => (
                        <Col key={img.id} xs={12} sm={8} md={6} lg={4}>
                          <div style={{ position: 'relative' }}>
                            <Image src={resolveUrl(img.url)} alt={img.nombre}
                              style={{ objectFit: 'cover', height: 120, width: '100%' }} />
                            {editMode && (
                              <Popconfirm title={`¿Eliminar "${img.nombre}"?`} okText="Eliminar"
                                cancelText="Cancelar" okButtonProps={{ danger: true }}
                                onConfirm={() => handleEliminarImagen(img.id, img.nombre)}>
                                <Button size="small" danger icon={<DeleteOutlined />}
                                  style={{ position: 'absolute', top: 4, right: 4, opacity: 0.9 }} />
                              </Popconfirm>
                            )}
                          </div>
                          <Typography.Text style={{ fontSize: 11, color: '#6b7280', display: 'block', textAlign: 'center', marginTop: 2 }}>
                            {img.nombre}
                          </Typography.Text>
                        </Col>
                      ))}
                    </Row>
                  </Image.PreviewGroup>
                )
              }
              {editMode && (
                <>
                  <Button icon={<UploadOutlined />} loading={uploading} onClick={() => fileInputPreviewRef.current?.click()}>
                    Agregar preview
                  </Button>
                  {uploading && uploadProgress > 0 && (
                    <Progress percent={uploadProgress} size="small" style={{ marginTop: 8, maxWidth: 300 }} />
                  )}
                </>
              )}
            </div>
          ),
        }] : []),
      ]} />

      {/* Bloque de nota */}
      {(editMode || puedeEditar) && (
        <div style={{
          marginTop: 24, padding: '16px 20px',
          background: '#fff', border: `1px solid ${editMode ? '#f59e0b' : '#e2e8f0'}`,
          borderRadius: 8,
          transition: 'border-color 0.2s',
        }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
            {editMode ? 'Nota sobre los cambios' : 'Agregar nota'}
            {' '}
            <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>(opcional)</Typography.Text>
          </Typography.Text>
          <Input.TextArea
            rows={2}
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder={editMode
              ? 'Describe qué se modificó y por qué… Se guardará al confirmar los cambios.'
              : 'Agrega una nota o comentario al historial…'
            }
            maxLength={500}
            showCount
          />
          <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {!editMode && (
              <Button
                icon={<SaveOutlined />}
                onClick={handleGuardarNota}
                loading={savingNota}
                disabled={!nota.trim()}
              >
                Guardar nota
              </Button>
            )}
            {editMode && hasChanges && (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={handleConfirmar}
                loading={confirming}
              >
                Confirmar cambios
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Modal preview informe PDF */}
      <Modal
        open={!!pdfUrl}
        onCancel={() => setPdfUrl(null)}
        footer={
          <Button icon={<DownloadOutlined />} loading={descargando} onClick={handleDescargarInforme}>
            Descargar
          </Button>
        }
        width="80vw"
        style={{ top: 16 }}
        styles={{ body: { padding: 0, height: '82vh' } }}
        title={
          <span>
            <FilePdfOutlined style={{ color: '#ef4444', marginRight: 8 }} />
            Informe — {examen?.paciente_nombre}
          </span>
        }
      >
        {pdfUrl && (
          <iframe
            src={resolveUrl(pdfUrl)}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="Informe PDF"
          />
        )}
      </Modal>

      {/* Historial de versiones */}
      {revisiones.length > 0 && (
        <div style={{
          marginTop: 24, padding: '16px 20px',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <HistoryOutlined style={{ color: '#6b7280' }} />
            <Typography.Text strong style={{ fontSize: 13 }}>Historial</Typography.Text>
          </div>
          <Timeline
            items={revisiones.map(r => ({
              color: TIPO_CAMBIO_COLOR[r.tipo_cambio] ?? 'gray',
              children: (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    {r.tipo_cambio !== 'nota' && (
                      <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>v{r.numero_version}</Tag>
                    )}
                    <Tag
                      color={TIPO_CAMBIO_COLOR[r.tipo_cambio] ?? 'default'}
                      style={{ fontSize: 11, margin: 0 }}
                    >
                      {TIPO_CAMBIO_LABEL[r.tipo_cambio] ?? r.tipo_cambio}
                    </Tag>
                    <Typography.Text style={{ fontSize: 11, color: '#9ca3af' }}>
                      {new Date(r.creado_en).toLocaleString('es-CL')}
                    </Typography.Text>
                  </div>
                  {r.nombre_archivo && (
                    <Typography.Text style={{ fontSize: 12, color: '#374151', display: 'block' }}>
                      {r.nombre_archivo}
                    </Typography.Text>
                  )}
                  {r.comentario && (
                    <Typography.Text style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', display: 'block' }}>
                      "{r.comentario}"
                    </Typography.Text>
                  )}
                </div>
              ),
            }))}
          />
        </div>
      )}
    </div>
      <NovexBadge />
    </div>
  )
}
