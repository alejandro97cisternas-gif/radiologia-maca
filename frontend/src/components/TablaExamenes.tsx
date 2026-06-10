import { useState, useMemo } from 'react'
import { Table, Tag, Select, Input, Row, Col, Button, Tooltip, Badge, message } from 'antd'
import { SearchOutlined, FolderOpenOutlined, DownloadOutlined } from '@ant-design/icons'
import type { Caso } from '../api/examenes'
import { descargarCaso, isVencido } from '../api/examenes'

const ESTADO_COLOR: Record<string, string> = {
  PENDIENTE: 'orange',
  EN_PROCESO: 'processing',
  COMPLETADO: 'success',
}

interface Props {
  casos: Caso[]
  onOpenCaso: (c: Caso) => void
  onUpdate: () => void
}

export default function TablaExamenes({ casos, onOpenCaso }: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string | null>(null)
  const [filtroClinica, setFiltroClinica] = useState<string | null>(null)

  const clinicas = useMemo(() => [...new Set(casos.map(c => c.derivador))].sort(), [casos])

  const filtrados = useMemo(() => casos.filter(c => {
    if (filtroEstado && c.estado !== filtroEstado) return false
    if (filtroClinica && c.derivador !== filtroClinica) return false
    if (busqueda) {
      const q = busqueda.toLowerCase()
      return (
        c.paciente.toLowerCase().includes(q) ||
        (c.rut?.toLowerCase().includes(q) ?? false) ||
        c.examenes.some(e => e.tipo_examen.toLowerCase().includes(q))
      )
    }
    return true
  }), [casos, filtroEstado, filtroClinica, busqueda])

  const columns = [
    {
      title: 'Fecha', dataIndex: 'creado_en', key: 'fecha', width: 90,
      render: (v: string) => new Date(v).toLocaleDateString('es-CL'),
      sorter: (a: Caso, b: Caso) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime(),
    },
    {
      title: 'Paciente', key: 'paciente',
      render: (_: any, c: Caso) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.paciente}</div>
          {c.rut && <div style={{ color: '#9ca3af', fontSize: 11 }}>{c.rut}</div>}
          {c.fecha_nacimiento && <div style={{ color: '#9ca3af', fontSize: 11 }}>{new Date(c.fecha_nacimiento + 'T12:00:00').toLocaleDateString('es-CL')}</div>}
        </div>
      ),
    },
    {
      title: 'Clínica', key: 'clinica', width: 150,
      render: (_: any, c: Caso) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.derivador_color || '#9ca3af', flexShrink: 0 }} />
          <span style={{ fontSize: 13 }}>{c.derivador}</span>
        </div>
      ),
    },
    {
      title: 'Exámenes', key: 'examenes',
      render: (_: any, c: Caso) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {c.examenes.map(e => <Tag key={e.id} color="blue" style={{ margin: 0, fontSize: 11 }}>{e.tipo_examen}</Tag>)}
        </div>
      ),
    },
    {
      title: 'Estado', dataIndex: 'estado', key: 'estado', width: 140,
      render: (v: string, c: Caso) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Badge status={v === 'COMPLETADO' ? 'success' : v === 'EN_PROCESO' ? 'processing' : 'warning'} text={v.replace('_', ' ')} />
          {isVencido(c) && <Tag color="red" style={{ margin: 0, fontSize: 10 }}>⏰ +48h</Tag>}
          {c.incidencia_estado === 'ABIERTA' && <Tag color="error" style={{ margin: 0, fontSize: 10 }}>⚠ Incidencia</Tag>}
          {c.incidencia_estado === 'RESUELTA' && <Tag color="success" style={{ margin: 0, fontSize: 10 }}>✓ Resuelta</Tag>}
          {c.archivo_estado && <Tag color="default" style={{ margin: 0, fontSize: 10 }}>📦 Archivado</Tag>}
        </div>
      ),
    },
    {
      title: 'Imgs', dataIndex: 'imagenes_count', key: 'imgs', width: 60, align: 'center' as const,
      render: (v: number) => <span style={{ color: v === 0 ? '#d1d5db' : '#374151', fontWeight: v > 0 ? 600 : 400 }}>{v}</span>,
    },
    {
      title: 'Acciones', key: 'acciones', width: 110,
      render: (_: any, c: Caso) => (
        <Row gutter={6} wrap={false} align="middle">
          <Col>
            <Tooltip title="Abrir caso">
              <Button size="small" icon={<FolderOpenOutlined />} onClick={() => onOpenCaso(c)} />
            </Tooltip>
          </Col>
          {c.imagenes_count > 0 && (
            <Col>
              <Tooltip title="Descargar imágenes">
                <Button size="small" icon={<DownloadOutlined />} onClick={async () => {
                  const key = `dl-${c.caso_id}`
                  message.loading({ content: 'Descargando…', key, duration: 0 })
                  try {
                    await descargarCaso(c, pct => message.loading({ content: `Descargando… ${pct}%`, key, duration: 0 }))
                    message.success({ content: '✓ Descarga lista', key, duration: 2 })
                  } catch { message.error({ content: 'Error al descargar', key, duration: 3 }) }
                }} />
              </Tooltip>
            </Col>
          )}
          {c.tiene_informe && (
            <Col><Tooltip title="Informe subido"><Tag color="success" style={{ margin: 0, fontSize: 11 }}>✓</Tag></Tooltip></Col>
          )}
        </Row>
      ),
    },
  ]

  return (
    <div>
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Input
            placeholder="Buscar paciente, RUT o examen…"
            prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
            value={busqueda} onChange={e => setBusqueda(e.target.value)} allowClear
          />
        </Col>
        <Col>
          <Select placeholder="Estado" allowClear value={filtroEstado} onChange={setFiltroEstado} style={{ width: 140 }}
            options={[{ value: 'PENDIENTE', label: 'Pendiente' }, { value: 'EN_PROCESO', label: 'En proceso' }, { value: 'COMPLETADO', label: 'Completado' }]}
          />
        </Col>
        <Col>
          <Select placeholder="Clínica" allowClear value={filtroClinica} onChange={setFiltroClinica} style={{ width: 160 }}
            options={clinicas.map(c => ({ value: c, label: c }))}
          />
        </Col>
      </Row>
      <Table
        dataSource={filtrados} columns={columns} rowKey="caso_id" size="small"
        pagination={{ pageSize: 25, showTotal: total => `${total} casos` }}
        onRow={c => ({ onDoubleClick: () => onOpenCaso(c) })}
        rowClassName={c => c.estado === 'COMPLETADO' ? 'row-completado' : ''}
      />
    </div>
  )
}
