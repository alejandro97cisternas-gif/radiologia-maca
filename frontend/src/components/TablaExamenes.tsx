import { useState, useMemo } from 'react'
import { Table, Tag, Select, Input, Row, Col, Button, Tooltip, Badge, message } from 'antd'
import { SearchOutlined, FolderOpenOutlined, DownloadOutlined } from '@ant-design/icons'
import type { Examen } from '../api/examenes'
import { descargarImagenes } from '../api/examenes'

const ESTADO_COLOR: Record<string, string> = {
  PENDIENTE: 'orange',
  EN_PROCESO: 'processing',
  COMPLETADO: 'success',
}

interface Props {
  examenes: Examen[]
  onOpenExamen: (e: Examen) => void
  onUpdate: () => void
}

export default function TablaExamenes({ examenes, onOpenExamen, onUpdate }: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string | null>(null)
  const [filtroClinica, setFiltroClinica] = useState<string | null>(null)

  const clinicas = useMemo(
    () => [...new Set(examenes.map(e => e.derivador))].sort(),
    [examenes]
  )

  const filtrados = useMemo(() => {
    return examenes.filter(e => {
      if (filtroEstado && e.estado !== filtroEstado) return false
      if (filtroClinica && e.derivador !== filtroClinica) return false
      if (busqueda) {
        const q = busqueda.toLowerCase()
        return (
          e.paciente.toLowerCase().includes(q) ||
          (e.rut?.toLowerCase().includes(q) ?? false) ||
          e.tipo_examen.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [examenes, filtroEstado, filtroClinica, busqueda])

  const columns = [
    {
      title: 'Fecha',
      dataIndex: 'creado_en',
      key: 'fecha',
      width: 90,
      render: (v: string) => new Date(v).toLocaleDateString('es-CL'),
      sorter: (a: Examen, b: Examen) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime(),
    },
    {
      title: 'Paciente',
      key: 'paciente',
      render: (_: any, e: Examen) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{e.paciente}</div>
          {e.rut && <div style={{ color: '#9ca3af', fontSize: 11 }}>{e.rut}</div>}
        </div>
      ),
    },
    {
      title: 'Clínica',
      key: 'clinica',
      width: 150,
      render: (_: any, e: Examen) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: e.derivador_color || '#9ca3af', flexShrink: 0 }} />
          <span style={{ fontSize: 13 }}>{e.derivador}</span>
        </div>
      ),
    },
    {
      title: 'Examen',
      dataIndex: 'tipo_examen',
      key: 'examen',
      width: 100,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: 'Ver.',
      key: 'version',
      width: 55,
      render: (_: any, e: Examen) => (
        <Tag color={(e.version ?? 0) === 0 ? 'default' : 'orange'} style={{ fontWeight: 600, margin: 0 }}>
          v{e.version ?? 0}
        </Tag>
      ),
    },
    {
      title: 'Estado',
      dataIndex: 'estado',
      key: 'estado',
      width: 120,
      render: (v: string, e: Examen) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Badge status={v === 'COMPLETADO' ? 'success' : v === 'EN_PROCESO' ? 'processing' : 'warning'} text={v.replace('_', ' ')} />
          {e.incidencia_estado === 'ABIERTA' && <Tag color="error" style={{ margin: 0, fontSize: 10 }}>⚠ Incidencia</Tag>}
          {e.incidencia_estado === 'RESUELTA' && <Tag color="success" style={{ margin: 0, fontSize: 10 }}>✓ Resuelta</Tag>}
        </div>
      ),
    },
    {
      title: 'Imgs',
      dataIndex: 'imagenes_count',
      key: 'imgs',
      width: 60,
      align: 'center' as const,
      render: (v: number) => <span style={{ color: v === 0 ? '#d1d5db' : '#374151', fontWeight: v > 0 ? 600 : 400 }}>{v}</span>,
    },
    {
      title: 'Acciones',
      key: 'acciones',
      width: 110,
      render: (_: any, e: Examen) => (
        <Row gutter={6} wrap={false} align="middle">
          <Col>
            <Tooltip title="Abrir carpeta">
              <Button size="small" icon={<FolderOpenOutlined />} onClick={() => onOpenExamen(e)} />
            </Tooltip>
          </Col>
          {e.imagenes_count > 0 && (
            <Col>
              <Tooltip title="Descargar imágenes">
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={async () => {
                    try { await descargarImagenes(e) }
                    catch { message.error('Error al descargar') }
                  }}
                />
              </Tooltip>
            </Col>
          )}
          {e.tiene_informe && (
            <Col>
              <Tooltip title="Informe subido">
                <Tag color="success" style={{ margin: 0, fontSize: 11 }}>✓</Tag>
              </Tooltip>
            </Col>
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
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            allowClear
          />
        </Col>
        <Col>
          <Select
            placeholder="Estado"
            allowClear
            value={filtroEstado}
            onChange={setFiltroEstado}
            style={{ width: 140 }}
            options={[
              { value: 'PENDIENTE', label: 'Pendiente' },
              { value: 'EN_PROCESO', label: 'En proceso' },
              { value: 'COMPLETADO', label: 'Completado' },
            ]}
          />
        </Col>
        <Col>
          <Select
            placeholder="Clínica"
            allowClear
            value={filtroClinica}
            onChange={setFiltroClinica}
            style={{ width: 160 }}
            options={clinicas.map(c => ({ value: c, label: c }))}
          />
        </Col>
      </Row>

      <Table
        dataSource={filtrados}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 25, showTotal: total => `${total} exámenes` }}
        onRow={e => ({ onDoubleClick: () => onOpenExamen(e) })}
        rowClassName={e => e.estado === 'COMPLETADO' ? 'row-completado' : ''}
      />
    </div>
  )
}
