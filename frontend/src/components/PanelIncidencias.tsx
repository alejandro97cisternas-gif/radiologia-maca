import { useMemo } from 'react'
import { Collapse, Badge, Tag, List, Typography } from 'antd'
import { WarningOutlined } from '@ant-design/icons'

interface ExamenConIncidencia {
  id: number
  paciente: string        // nombre del paciente
  tipo_examen: string
  derivador: string       // nombre de la clínica
  incidencia_estado: 'ABIERTA' | 'RESUELTA' | null
}

interface Props {
  examenes: ExamenConIncidencia[]
  onAbrir: (e: ExamenConIncidencia) => void
}

export default function PanelIncidencias({ examenes, onAbrir }: Props) {
  const conIncidencia = useMemo(
    () => examenes.filter(e => e.incidencia_estado !== null),
    [examenes],
  )
  const abiertas = conIncidencia.filter(e => e.incidencia_estado === 'ABIERTA').length

  if (conIncidencia.length === 0) return null

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <WarningOutlined style={{ color: abiertas > 0 ? '#dc2626' : '#9ca3af' }} />
      <span style={{ fontWeight: 600, fontSize: 13 }}>Incidencias</span>
      {abiertas > 0 && <Badge count={abiertas} color="#dc2626" />}
      {abiertas === 0 && <Tag color="success" style={{ fontSize: 11 }}>Todas resueltas</Tag>}
    </div>
  )

  return (
    <div style={{ margin: '12px 24px 8px' }}>
      <Collapse
        size="small"
        defaultActiveKey={abiertas > 0 ? ['inc'] : []}
        items={[{
          key: 'inc',
          label: header,
          style: {
            border: `1px solid ${abiertas > 0 ? '#fca5a5' : '#d1fae5'}`,
            borderRadius: 8,
            background: abiertas > 0 ? '#fff7f7' : '#f0fdf4',
          },
          children: (
            <List
              size="small"
              dataSource={conIncidencia}
              renderItem={e => (
                <List.Item
                  style={{ cursor: 'pointer', padding: '6px 0' }}
                  onClick={() => onAbrir(e)}
                  extra={
                    e.incidencia_estado === 'ABIERTA'
                      ? <Tag color="error" style={{ fontSize: 11 }}>⚠ Abierta</Tag>
                      : <Tag color="success" style={{ fontSize: 11 }}>✓ Resuelta</Tag>
                  }
                >
                  <List.Item.Meta
                    title={<Typography.Text style={{ fontSize: 13 }}>{e.paciente}</Typography.Text>}
                    description={
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Tag color="blue" style={{ fontSize: 11 }}>{e.tipo_examen}</Tag>
                        <Typography.Text style={{ fontSize: 12, color: '#9ca3af' }}>{e.derivador}</Typography.Text>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          ),
        }]}
      />
    </div>
  )
}
