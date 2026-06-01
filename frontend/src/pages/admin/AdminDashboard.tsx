import { useEffect, useState } from 'react'

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'novex.cloud'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Tag, Space, Modal, Form, Input, Popconfirm,
  Typography, Layout, message, Tooltip, Switch,
} from 'antd'
import { PlusOutlined, EditOutlined, KeyOutlined, LogoutOutlined } from '@ant-design/icons'
import {
  adminListarRadiologos, adminCrearRadiologo,
  adminActualizarRadiologo, adminResetPassword,
} from '../../api/admin'

const { Header, Content } = Layout
const { Title, Text } = Typography

type Radiologo = {
  id: number; username: string; slug: string; nombre_display: string
  email: string; activo: boolean; creado_en: string
  stats: { derivadores: number; examenes: number }
}

export default function AdminDashboard() {
  const [radiologos, setRadiologos] = useState<Radiologo[]>([])
  const [loading, setLoading] = useState(true)
  const [modalCrear, setModalCrear] = useState(false)
  const [modalEditar, setModalEditar] = useState<Radiologo | null>(null)
  const [modalPassword, setModalPassword] = useState<Radiologo | null>(null)
  const [formCrear] = Form.useForm()
  const [formEditar] = Form.useForm()
  const [formPassword] = Form.useForm()
  const navigate = useNavigate()

  const cargar = async () => {
    setLoading(true)
    try { setRadiologos(await adminListarRadiologos()) }
    catch { navigate('/admin/login') }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [])

  const handleCrear = async (values: any) => {
    try {
      await adminCrearRadiologo(values)
      message.success('Radiólogo creado')
      setModalCrear(false)
      formCrear.resetFields()
      cargar()
    } catch (e: any) {
      message.error(e.response?.data?.detail || 'Error al crear')
    }
  }

  const handleEditar = async (values: any) => {
    if (!modalEditar) return
    try {
      await adminActualizarRadiologo(modalEditar.id, values)
      message.success('Actualizado')
      setModalEditar(null)
      cargar()
    } catch (e: any) {
      message.error(e.response?.data?.detail || 'Error al actualizar')
    }
  }

  const handleToggleActivo = async (id: number, activo: boolean) => {
    try {
      await adminActualizarRadiologo(id, { activo })
      cargar()
    } catch { message.error('Error al actualizar') }
  }

  const handlePassword = async ({ password }: { password: string }) => {
    if (!modalPassword) return
    try {
      await adminResetPassword(modalPassword.id, password)
      message.success('Contraseña actualizada')
      setModalPassword(null)
      formPassword.resetFields()
    } catch (e: any) {
      message.error(e.response?.data?.detail || 'Error')
    }
  }

  const columnas = [
    { title: 'Nombre', dataIndex: 'nombre_display', key: 'nombre', render: (v: string, r: Radiologo) => (
      <Space direction="vertical" size={0}>
        <Text strong>{v}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>@{r.username} · {r.slug}.{BASE_DOMAIN}</Text>
      </Space>
    )},
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Derivadores', key: 'derivadores', render: (_: any, r: Radiologo) => r.stats?.derivadores ?? 0 },
    { title: 'Exámenes', key: 'examenes', render: (_: any, r: Radiologo) => r.stats?.examenes ?? 0 },
    { title: 'Activo', key: 'activo', render: (_: any, r: Radiologo) => (
      <Switch checked={r.activo} onChange={(v) => handleToggleActivo(r.id, v)} />
    )},
    { title: 'Acciones', key: 'acciones', render: (_: any, r: Radiologo) => (
      <Space>
        <Tooltip title="Editar">
          <Button icon={<EditOutlined />} size="small" onClick={() => { setModalEditar(r); formEditar.setFieldsValue(r) }} />
        </Tooltip>
        <Tooltip title="Cambiar contraseña">
          <Button icon={<KeyOutlined />} size="small" onClick={() => setModalPassword(r)} />
        </Tooltip>
      </Space>
    )},
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <Title level={4} style={{ color: '#fff', margin: 0 }}>Panel de Administración</Title>
        <Button icon={<LogoutOutlined />} type="text" style={{ color: '#fff' }}
          onClick={() => { localStorage.removeItem('admin_token'); navigate('/admin/login') }}>
          Salir
        </Button>
      </Header>

      <Content style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>Radiólogos ({radiologos.length})</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
            Nuevo radiólogo
          </Button>
        </div>

        <Table dataSource={radiologos} columns={columnas} rowKey="id" loading={loading}
          rowClassName={(r) => r.activo ? '' : 'opacity-50'} />
      </Content>

      {/* Modal crear */}
      <Modal title="Nuevo radiólogo" open={modalCrear} onCancel={() => { setModalCrear(false); formCrear.resetFields() }}
        onOk={() => formCrear.submit()} okText="Crear">
        <Form form={formCrear} layout="vertical" onFinish={handleCrear}>
          <Form.Item name="nombre_display" label="Nombre completo" rules={[{ required: true }]}>
            <Input placeholder="Dra. María Pérez" />
          </Form.Item>
          <Form.Item name="slug" label="Subdominio" rules={[{ required: true, pattern: /^[a-z0-9-]+$/, message: 'Solo minúsculas, números y guiones' }]}>
            <Input addonAfter={`.${BASE_DOMAIN}`} placeholder="draperez" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="username" label="Usuario (login)" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Contraseña inicial" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal editar */}
      <Modal title="Editar radiólogo" open={!!modalEditar} onCancel={() => setModalEditar(null)}
        onOk={() => formEditar.submit()} okText="Guardar">
        <Form form={formEditar} layout="vertical" onFinish={handleEditar}>
          <Form.Item name="nombre_display" label="Nombre completo" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="slug" label="Subdominio" rules={[{ required: true, pattern: /^[a-z0-9-]+$/ }]}>
            <Input addonAfter={`.${BASE_DOMAIN}`} />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal password */}
      <Modal title={`Cambiar contraseña — ${modalPassword?.nombre_display}`}
        open={!!modalPassword} onCancel={() => { setModalPassword(null); formPassword.resetFields() }}
        onOk={() => formPassword.submit()} okText="Cambiar">
        <Form form={formPassword} layout="vertical" onFinish={handlePassword}>
          <Form.Item name="password" label="Nueva contraseña" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}
