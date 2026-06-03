import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Spin, Result, Button, Form, Input, Card, Typography, message } from 'antd'
import { MailOutlined } from '@ant-design/icons'
import { portalAcceder, portalSolicitarAcceso, portalTenantInfo } from '../../api/portal'

const { Title, Text } = Typography

function FormSolicitarAcceso() {
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [tenantNombre, setTenantNombre] = useState('Radiología')

  useEffect(() => {
    portalTenantInfo().then(d => setTenantNombre(`Radiología · ${d.nombre_display}`)).catch(() => {})
  }, [])

  const onFinish = async ({ email }: { email: string }) => {
    setLoading(true)
    try {
      await portalSolicitarAcceso(email)
      setEnviado(true)
    } catch {
      message.error('Error al enviar el enlace. Intente más tarde.')
    } finally {
      setLoading(false)
    }
  }

  if (enviado) return (
    <Result
      status="success"
      title="Enlace enviado"
      subTitle="Si tu email está registrado, recibirás el enlace de acceso en breve."
    />
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F4F8' }}>
      <Card style={{ width: 400, border: '2px solid #1e3a5f' }}>
        <div style={{ background: '#1e3a5f', margin: '-24px -24px 24px', padding: '20px 24px' }}>
          <Title level={4} style={{ color: '#fff', margin: 0 }}>{tenantNombre}</Title>
        </div>
        <Title level={5} style={{ marginBottom: 8 }}>Acceso al portal</Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          Ingresa tu email para recibir un enlace de acceso.
        </Text>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Email válido requerido' }]}>
            <Input prefix={<MailOutlined />} placeholder="tu@email.com" size="large" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Enviar enlace de acceso
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default function PortalAcceso() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const called = useRef(false)

  const token = params.get('token')

  useEffect(() => {
    if (!token) return
    if (called.current) return
    called.current = true
    portalAcceder(token)
      .then(res => {
        localStorage.setItem('portal_token', res.access_token)
        navigate('/portal/dashboard')
      })
      .catch(() => setError('Enlace inválido o expirado'))
  }, [token])

  if (!token) return <FormSolicitarAcceso />

  if (error) return (
    <Result
      status="error"
      title="Enlace inválido"
      subTitle={error}
      extra={<Button onClick={() => navigate('/portal/acceder')}>Solicitar nuevo enlace</Button>}
    />
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin size="large" tip="Verificando enlace..." />
    </div>
  )
}
