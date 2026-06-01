import { useEffect, useState } from 'react'
import { Table, Typography, Tag, Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { portalGetTarifas } from '../../api/portal'

export default function PortalTarifas() {
  const navigate = useNavigate()
  const [tarifas, setTarifas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    portalGetTarifas().then(setTarifas).finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>Volver</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>Tarifas</Typography.Title>
      </div>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        Las tarifas son gestionadas por la doctora.
      </Typography.Text>
      <Table
        dataSource={tarifas}
        rowKey="tipo_examen"
        loading={loading}
        pagination={false}
        columns={[
          {
            title: 'Tipo de examen',
            dataIndex: 'tipo_examen',
            render: (v: string) => <Tag color="blue">{v}</Tag>,
          },
          {
            title: 'Precio',
            dataIndex: 'precio',
            align: 'right' as const,
            render: (v: number) => v > 0
              ? <Typography.Text strong>${v.toLocaleString('es-CL')}</Typography.Text>
              : <Typography.Text type="secondary">—</Typography.Text>,
          },
        ]}
      />
    </div>
  )
}
