import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Card, Typography, message } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { adminLogin } from '../../api/admin'

const { Title } = Typography

export default function AdminLogin() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onFinish = async ({ username, password }: { username: string; password: string }) => {
    setLoading(true)
    try {
      const res = await adminLogin(username, password)
      localStorage.setItem('admin_token', res.access_token)
      navigate('/admin')
    } catch {
      message.error('Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F172A' }}>
      <Card style={{ width: 380, border: '2px solid #2563EB' }}>
        <div style={{ background: '#2563EB', margin: '-24px -24px 24px', padding: '20px 24px' }}>
          <Title level={4} style={{ color: '#fff', margin: 0 }}>Panel de Administración</Title>
        </div>
        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item name="username" label="Usuario" rules={[{ required: true }]}>
            <Input prefix={<UserOutlined />} size="large" />
          </Form.Item>
          <Form.Item name="password" label="Contraseña" rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} size="large" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Ingresar
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
