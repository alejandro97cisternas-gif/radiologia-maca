import { useEffect, useState } from 'react'
import { Drawer, Descriptions, Tag, Image, Upload, Button, message, Modal, Spin, Empty, Tabs, Badge, Typography } from 'antd'
import { UploadOutlined, DownloadOutlined, FilePdfOutlined, CheckCircleOutlined } from '@ant-design/icons'
import type { Examen } from '../api/examenes'
import { getExamenDetalle, subirInforme, patchEstadoExamen, descargarImagenes } from '../api/examenes'
import type { ExamenDetalle } from '../api/examenes'
import IncidenciaSection from './IncidenciaSection'

const ESTADO_COLOR: Record<string, string> = {
  PENDIENTE: 'orange',
  EN_PROCESO: 'processing',
  COMPLETADO: 'success',
}

interface Props {
  examen: Examen | null
  onClose: () => void
  onUpdate: () => void
}

export default function ExamenDrawer({ examen, onClose, onUpdate }: Props) {
  const [detalle, setDetalle] = useState<ExamenDetalle | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!examen) { setDetalle(null); return }
    setLoading(true)
    getExamenDetalle(examen.id)
      .then(async d => {
        setDetalle(d)
        // Auto-avanzar PENDIENTE → EN_PROCESO al abrir
        if (d.estado === 'PENDIENTE') {
          await patchEstadoExamen(d.id, 'EN_PROCESO')
          onUpdate()
        }
      })
      .finally(() => setLoading(false))
  }, [examen?.id])

  const handleDescargar = async () => {
    if (!examen) return
    setDownloading(true)
    try {
      await descargarImagenes(examen)
    } catch {
      message.error('Error al descargar imágenes')
    } finally {
      setDownloading(false)
    }
  }

  const handleSubirPDF = async (file: File) => {
    if (!examen) return
    setUploading(true)
    try {
      await subirInforme(examen.id, file)
      onUpdate()
      onClose()
      Modal.success({
        title: 'Informe subido correctamente',
        content: 'El examen ha pasado a COMPLETADO y se ha notificado al derivador por correo electrónico.',
        okText: 'Entendido',
      })
    } catch {
      message.error('Error al subir el informe')
    } finally {
      setUploading(false)
    }
    return false
  }

  const imgs2D = detalle?.imagenes.filter(i => i.tipo === '2D') ?? []
  const imgsDicom = detalle?.imagenes.filter(i => i.tipo === 'DICOM') ?? []
  const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  return (
    <Drawer
      open={!!examen}
      onClose={onClose}
      width={680}
      extra={
        examen ? (
          <Button
            icon={<DownloadOutlined />}
            loading={downloading}
            onClick={handleDescargar}
            disabled={(detalle?.imagenes.length ?? 0) === 0}
          >
            Descargar imágenes
          </Button>
        ) : null
      }
      title={
        examen ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 4, height: 32, borderRadius: 2,
              background: examen.derivador_color || '#e2e8f0',
              flexShrink: 0,
            }} />
            <span>{examen.paciente}</span>
            <Tag color={ESTADO_COLOR[examen.estado]}>{examen.estado}</Tag>
            <Tag color="blue">{examen.tipo_examen}</Tag>
            <Tag color={(examen.version ?? 0) === 0 ? 'default' : 'orange'} style={{ fontWeight: 600 }}>
              v{examen.version ?? 0}
            </Tag>
          </div>
        ) : null
      }
      footer={
        !detalle?.tiene_informe ? (
          <Upload accept=".pdf" showUploadList={false} beforeUpload={handleSubirPDF}>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              loading={uploading}
              size="large"
              block
            >
              Subir informe PDF
            </Button>
          </Upload>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', padding: '8px 0' }}>
            <CheckCircleOutlined style={{ fontSize: 18 }} />
            <Typography.Text style={{ color: '#16a34a', fontWeight: 600 }}>Informe subido</Typography.Text>
          </div>
        )
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 60 }}><Spin size="large" /></div>
      ) : detalle ? (
        <>
          <Descriptions size="small" column={2} style={{ marginBottom: 20 }}>
            <Descriptions.Item label="Clínica">{detalle.derivador}</Descriptions.Item>
            <Descriptions.Item label="RUT">{detalle.rut || '—'}</Descriptions.Item>
            <Descriptions.Item label="Tipo">{detalle.tipo_examen}</Descriptions.Item>
            <Descriptions.Item label="Ingresado">
              {new Date(detalle.creado_en).toLocaleDateString('es-CL')}
            </Descriptions.Item>
          </Descriptions>

          <Tabs items={[
            {
              key: '2d',
              label: <span>Imágenes 2D <Badge count={imgs2D.length} color="#2563EB" /></span>,
              children: imgs2D.length === 0
                ? <Empty description="Sin imágenes 2D" imageStyle={{ height: 48 }} />
                : (
                  <Image.PreviewGroup>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {imgs2D.map(img => (
                        <div key={img.id}>
                          <Image
                            src={`${BASE}${img.url}`}
                            alt={img.nombre}
                            style={{ width: '100%', height: 120, objectFit: 'cover' }}
                          />
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
              key: 'dicom',
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
          <IncidenciaSection examenId={detalle.id} />
        </>
      ) : null}
    </Drawer>
  )
}
