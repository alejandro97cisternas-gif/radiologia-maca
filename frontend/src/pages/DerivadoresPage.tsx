import { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Input, Select, Space, Tag, message, Popconfirm, Typography, Tooltip, Alert, ColorPicker } from 'antd'
import { PlusOutlined, LinkOutlined, EditOutlined, StopOutlined } from '@ant-design/icons'
import { getDerivadores, crearDerivador, actualizarDerivador, eliminarDerivador, generarMagicLink } from '../api/derivadores'
import type { Derivador } from '../api/derivadores'
import { useTutorialDerivadores } from '../hooks/useTutorialDoctora'

export default function DerivadoresPage() {
  const [derivadores, setDerivadores] = useState<Derivador[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Derivador | null>(null)
  const [linkResult, setLinkResult] = useState<{ url: string; email_enviado: boolean } | null>(null)
  const [form] = Form.useForm()

  useTutorialDerivadores()

  const load = () => {
    setLoading(true)
    getDerivadores().then(setDerivadores).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const openCreate = () => { setEditTarget(null); form.resetFields(); setModalOpen(true) }
  const openEdit = (d: Derivador) => {
    setEditTarget(d)
    form.setFieldsValue({ ...d, color: d.color || '#6b7280' })
    setModalOpen(true)
  }

  const onFinish = async (values: any) => {
    // ColorPicker devuelve un objeto Color de antd — extraemos el hex
    const color = typeof values.color === 'string'
      ? values.color
      : values.color?.toHexString?.() ?? '#6b7280'
    const payload = { ...values, color }
    try {
      if (editTarget) {
        await actualizarDerivador(editTarget.id, payload)
        message.success('Derivador actualizado')
      } else {
        await crearDerivador(payload)
        message.success('Derivador creado')
      }
      setModalOpen(false)
      load()
    } catch {
      message.error('Error al guardar')
    }
  }

  const handleDesactivar = async (id: number) => {
    await eliminarDerivador(id)
    message.success('Derivador desactivado')
    load()
  }

  const handleMagicLink = async (id: number) => {
    try {
      const res = await generarMagicLink(id)
      setLinkResult(res)
    } catch {
      message.error('Error al generar link')
    }
  }

  const columns = [
    {
      title: 'Nombre', key: 'nombre',
      render: (_: any, d: Derivador) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div id="col-color" style={{ width: 12, height: 12, borderRadius: '50%', background: d.color || '#6b7280', flexShrink: 0 }} />
          {d.nombre}
        </div>
      ),
    },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Teléfono', dataIndex: 'telefono', key: 'telefono', render: (v: string) => v || '-' },
    {
      title: 'Moneda', dataIndex: 'moneda', key: 'moneda',
      render: (v: string) => <Tag color={v === 'CAD' ? 'purple' : 'blue'}>{v || 'CLP'}</Tag>,
    },
    {
      title: 'Estado', dataIndex: 'activo', key: 'activo',
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activo' : 'Inactivo'}</Tag>
    },
    {
      title: <span id="col-acciones">Acciones</span>, key: 'actions',
      render: (_: any, d: Derivador) => (
        <Space>
          <Tooltip title="Editar"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(d)} /></Tooltip>
          <Tooltip title="Generar link portal">
            <Button size="small" icon={<LinkOutlined />} onClick={() => handleMagicLink(d.id)} />
          </Tooltip>
          {d.activo && (
            <Popconfirm title="¿Desactivar derivador?" onConfirm={() => handleDesactivar(d.id)}>
              <Button size="small" danger icon={<StopOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Derivadores</Typography.Title>
        <Button id="btn-nuevo-derivador" type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo derivador</Button>
      </div>

      {linkResult && (
        <Alert
          type="success"
          closable
          onClose={() => setLinkResult(null)}
          style={{ marginBottom: 16 }}
          message="Link de acceso generado"
          description={
            <>
              <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 12 }}>{linkResult.url}</div>
              <div style={{ marginTop: 4, color: '#6b7280' }}>
                {linkResult.email_enviado ? '✓ Email enviado al derivador' : '⚠ Email no enviado (SMTP no configurado)'}
              </div>
            </>
          }
        />
      )}

      <Table
        dataSource={derivadores}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editTarget ? 'Editar derivador' : 'Nuevo derivador'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Guardar"
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="telefono" label="Teléfono">
            <Input />
          </Form.Item>
          <Form.Item name="moneda" label="Moneda de cobro" initialValue="CLP" rules={[{ required: true }]}>
            <Select options={[
              { value: 'CLP', label: 'CLP — Peso chileno' },
              { value: 'CAD', label: 'CAD — Dólar canadiense' },
            ]} />
          </Form.Item>
          <Form.Item name="color" label="Color identificador">
            <ColorPicker
              format="hex"
              presets={[{
                label: 'Colores',
                colors: ['#2563EB','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#ea580c','#65a30d','#0284c7'],
              }]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
