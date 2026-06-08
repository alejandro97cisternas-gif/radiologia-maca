import { useEffect, useState } from 'react'
import {
  Drawer, Descriptions, Tag, Image, Upload, Button, message,
  Spin, Empty, Tabs, Badge, Typography, Divider,
} from 'antd'
import { UploadOutlined, DownloadOutlined, FilePdfOutlined, CheckCircleOutlined } from '@ant-design/icons'
import type { Caso, ImagenExamen } from '../api/examenes'
import { getCasoDetalle, subirInforme, patchEstadoCaso, descargarCaso, notificarDerivador } from '../api/examenes'
import IncidenciaSection from './IncidenciaSection'

type ExamenConImagenes = {
  id: number
  tipo_examen: string
  estado: string
  tiene_informe: boolean
  notificacion_derivador_enviada: boolean
  version: number
  imagenes: ImagenExamen[]
}

const ESTADO_COLOR: Record<string, string> = {
  PENDIENTE: 'orange', EN_PROCESO: 'processing', COMPLETADO: 'success',
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
  const [downloading, setDownloading] = useState(false)
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
    setDownloading(true)
    try { await descargarCaso(caso) }
    catch { message.error('Error al descargar imágenes') }
    finally { setDownloading(false) }
  }

  const handleSubirPDF = async (examenId: number, file: File) => {
    setUploading(examenId)
    try {
      await subirInforme(examenId, file)
      if (caso) {
        const data = await getCasoDetalle(caso.caso_id)
        setExamenes(data.examenes as ExamenConImagenes[])
        message.success('Informe subido correctamente')
      }
    } catch {
      message.error('Error al subir el informe')
    } finally {
      setUploading(null)
    }
    return false
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
      if (res.reenvio) {
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
          <Button icon={<DownloadOutlined />} loading={downloading} onClick={handleDescargar}
            disabled={(caso.imagenes_count ?? 0) === 0}>
            Descargar imágenes
          </Button>
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
                  {
                    key: `2d-${examen.id}`,
                    label: <span>Imágenes 2D <Badge count={imgs2D.length} color="#2563EB" /></span>,
                    children: imgs2D.length === 0
                      ? <Empty description="Sin imágenes 2D" imageStyle={{ height: 48 }} />
                      : (
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
                  },
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

                {!examen.tiene_informe && (
                  <Upload accept=".pdf" showUploadList={false} beforeUpload={f => handleSubirPDF(examen.id, f)}>
                    <Button
                      type="primary"
                      icon={<UploadOutlined />}
                      loading={uploading === examen.id}
                      style={{ marginTop: 12 }}
                      block
                    >
                      Subir informe — {examen.tipo_examen}
                    </Button>
                  </Upload>
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
