import { useEffect, useState } from 'react'
import { Alert, Button, Form, Input, Tag, Divider, Typography, Popconfirm, message } from 'antd'
import { WarningOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { getIncidencia, crearIncidencia, actualizarIncidencia } from '../api/incidencias'
import type { Incidencia } from '../api/incidencias'

interface Props {
  examenId: number
}

export default function IncidenciaSection({ examenId }: Props) {
  const [incidencia, setIncidencia] = useState<Incidencia | null>(null)
  const [loading, setLoading] = useState(true)
  const [formVisible, setFormVisible] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [form] = Form.useForm()

  const cargar = () => {
    setLoading(true)
    getIncidencia(examenId)
      .then(setIncidencia)
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [examenId])

  const handleCrear = async (values: { comentario: string }) => {
    setGuardando(true)
    try {
      const inc = await crearIncidencia(examenId, values.comentario)
      setIncidencia(inc)
      setFormVisible(false)
      form.resetFields()
      message.success('Incidencia creada — derivador notificado por email')
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'Error al crear incidencia')
    } finally { setGuardando(false) }
  }

  const handleReabrir = async () => {
    if (!incidencia) return
    setGuardando(true)
    try {
      const inc = await actualizarIncidencia(incidencia.id, { estado: 'ABIERTA' })
      setIncidencia(inc)
      message.success('Incidencia reabierta')
    } finally { setGuardando(false) }
  }

  if (loading) return null

  return (
    <div style={{ marginTop: 24 }}>
      <Divider style={{ margin: '16px 0' }}>
        <Typography.Text style={{ fontSize: 12, color: '#9ca3af' }}>Incidencias</Typography.Text>
      </Divider>

      {/* Sin incidencia */}
      {!incidencia && !formVisible && (
        <Button
          size="small"
          danger
          icon={<WarningOutlined />}
          onClick={() => setFormVisible(true)}
          style={{ opacity: 0.7 }}
        >
          Reportar incidencia
        </Button>
      )}

      {/* Form crear */}
      {!incidencia && formVisible && (
        <Form form={form} onFinish={handleCrear} layout="vertical">
          <Form.Item
            name="comentario"
            label="Comentario para el derivador"
            rules={[{ required: true, message: 'Escribe el comentario' }]}
          >
            <Input.TextArea rows={3} placeholder="Describe el error o problema encontrado…" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => setFormVisible(false)}>Cancelar</Button>
            <Button type="primary" danger htmlType="submit" loading={guardando}>
              Crear incidencia y notificar
            </Button>
          </div>
        </Form>
      )}

      {/* Incidencia existente */}
      {incidencia && (
        <div>
          {incidencia.estado === 'ABIERTA' ? (
            <Alert
              type="error"
              icon={<WarningOutlined />}
              message="Incidencia abierta"
              description={
                <div>
                  <p style={{ margin: '4px 0 8px' }}>{incidencia.comentario_doctora}</p>
                  {incidencia.comentario_derivador && (
                    <div style={{ background: '#fff7f7', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', marginTop: 8 }}>
                      <Typography.Text style={{ fontSize: 12, color: '#6b7280' }}>Respuesta del derivador:</Typography.Text>
                      <p style={{ margin: '2px 0 0', fontSize: 13 }}>{incidencia.comentario_derivador}</p>
                    </div>
                  )}
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
                  <p style={{ margin: '4px 0' }}>{incidencia.comentario_doctora}</p>
                  {incidencia.comentario_derivador && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '8px 12px', marginTop: 6 }}>
                      <Typography.Text style={{ fontSize: 12, color: '#6b7280' }}>Respuesta:</Typography.Text>
                      <p style={{ margin: '2px 0 0', fontSize: 13 }}>{incidencia.comentario_derivador}</p>
                    </div>
                  )}
                  {incidencia.resuelto_en && (
                    <Typography.Text style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginTop: 6 }}>
                      Resuelta el {new Date(incidencia.resuelto_en).toLocaleString('es-CL')}
                    </Typography.Text>
                  )}
                  <Popconfirm
                    title="¿Reabrir incidencia?"
                    onConfirm={handleReabrir}
                    okText="Reabrir"
                    cancelText="Cancelar"
                  >
                    <Button size="small" icon={<ReloadOutlined />} style={{ marginTop: 8 }} loading={guardando}>
                      Reabrir
                    </Button>
                  </Popconfirm>
                </div>
              }
            />
          )}
        </div>
      )}
    </div>
  )
}
