import { useEffect, useMemo, useState } from 'react'
import {
  Tabs, Table, Typography, Button, Select, Statistic, Card, Row, Col,
  Tag, message, Spin, Divider, InputNumber, Space, Modal, Form, Popconfirm,
} from 'antd'
import { SendOutlined, CalculatorOutlined, EyeOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  getHonorariosGlobal, getHonorariosDerivador, generarHonorarios,
  enviarHonorarios, previewHonorarios,
  getTarifas, crearTarifaItem, eliminarTarifaItem,
  getTiposExamen,
} from '../api/honorarios'
import { getDerivadores } from '../api/derivadores'
import type { Derivador } from '../api/derivadores'

interface TarifaRow { tipo_examen: string; precio: number }
interface TipoItem { nombre: string; dimension: '2D' | '3D' | 'AMBOS'; custom: boolean }

// ── Editor de exámenes + tarifas ──────────────────────────────────────────────

function TarifasEditor({ derivadorId }: { derivadorId: number }) {
  const [tarifas, setTarifas] = useState<TarifaRow[]>([])
  const [allTipos, setAllTipos] = useState<TipoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [form] = Form.useForm()
  const tipoSeleccionado: string | undefined = Form.useWatch('tipo_examen', form)

  const esNuevo = useMemo(
    () => !!tipoSeleccionado && !allTipos.find(t => t.nombre === tipoSeleccionado),
    [tipoSeleccionado, allTipos]
  )

  const dimAutoDetect = useMemo(() => {
    const found = allTipos.find(t => t.nombre === tipoSeleccionado)
    return found?.dimension ?? null
  }, [tipoSeleccionado, allTipos])

  const cargar = () => {
    setLoading(true)
    Promise.all([getTarifas(derivadorId), getTiposExamen()])
      .then(([t, tipos]) => { setTarifas(t); setAllTipos(tipos) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [derivadorId])

  const tipoOptions = useMemo(() => {
    const q = searchText.trim().toUpperCase()
    const dimColor = (d: string) => d === '3D' ? 'purple' : d === 'AMBOS' ? 'geekblue' : 'cyan'
    const base = allTipos.map(t => ({
      value: t.nombre,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{t.nombre}</span>
          <Tag color={dimColor(t.dimension)} style={{ margin: 0, fontSize: 10 }}>{t.dimension}</Tag>
        </div>
      ),
    }))
    if (q && !allTipos.find(t => t.nombre === q)) {
      base.push({ value: q, label: <span style={{ color: '#2563EB' }}>➕ Crear nuevo: "{q}"</span> as any })
    }
    return base
  }, [allTipos, searchText])

  const handleAgregar = async (values: { tipo_examen: string; precio: number; dimension?: string }) => {
    setSaving(true)
    try {
      const dimension = values.dimension ?? dimAutoDetect ?? '2D'
      await crearTarifaItem(derivadorId, {
        tipo_examen: values.tipo_examen.trim().toUpperCase(),
        precio: values.precio,
        dimension,
      })
      message.success('Examen y tarifa guardados')
      setModalOpen(false)
      form.resetFields()
      setSearchText('')
      cargar()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleEliminar = async (tipo: string) => {
    try {
      await eliminarTarifaItem(derivadorId, tipo)
      message.success(`"${tipo}" eliminado`)
      cargar()
    } catch {
      message.error('Error al eliminar')
    }
  }

  const columns = [
    {
      title: 'Tipo de examen', dataIndex: 'tipo_examen', key: 'tipo_examen',
      render: (v: string) => {
        const t = allTipos.find(x => x.nombre === v)
        const dimColor = (d: string) => d === '3D' ? 'purple' : d === 'AMBOS' ? 'geekblue' : 'cyan'
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag color="blue" style={{ margin: 0 }}>{v}</Tag>
            {t && <Tag color={dimColor(t.dimension)} style={{ margin: 0, fontSize: 10 }}>{t.dimension}</Tag>}
          </div>
        )
      },
    },
    {
      title: 'Precio', dataIndex: 'precio', key: 'precio', align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 600 }}>${v.toLocaleString('es-CL')}</span>,
    },
    {
      title: '', key: 'accion',
      render: (_: any, r: TarifaRow) => (
        <Popconfirm
          title={`¿Quitar "${r.tipo_examen}" de este centro?`}
          okText="Quitar" cancelText="Cancelar"
          okButtonProps={{ danger: true }}
          onConfirm={() => handleEliminar(r.tipo_examen)}
        >
          <Button size="small" danger type="text" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {tarifas.length === 0 ? 'Sin exámenes configurados.' : `${tarifas.length} tipo${tarifas.length !== 1 ? 's' : ''} configurado${tarifas.length !== 1 ? 's' : ''}`}
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setModalOpen(true)}>
          Agregar examen
        </Button>
      </div>

      {tarifas.length > 0 && (
        <Table
          dataSource={tarifas}
          columns={columns}
          rowKey="tipo_examen"
          pagination={false}
          size="small"
          style={{ maxWidth: 520 }}
        />
      )}

      <Modal
        title="Agregar examen y tarifa"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setSearchText('') }}
        onOk={() => form.submit()}
        okText="Guardar"
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" onFinish={handleAgregar} style={{ marginTop: 16 }}>
          <Form.Item
            name="tipo_examen"
            label="Tipo de examen"
            rules={[{ required: true, message: 'Selecciona o escribe el nombre' }]}
            extra={esNuevo ? 'Se creará como nuevo tipo en el catálogo global.' : ''}
          >
            <Select
              showSearch
              placeholder="Buscar o escribir nombre…"
              filterOption={(input, opt) =>
                String(opt?.value ?? '').toLowerCase().includes(input.toLowerCase())
              }
              onSearch={setSearchText}
              options={tipoOptions}
              style={{ width: '100%' }}
            />
          </Form.Item>

          {esNuevo && (
            <Form.Item
              name="dimension"
              label="Dimensión (nuevo tipo)"
              rules={[{ required: true, message: 'Indica si es 2D o 3D' }]}
            >
              <Select
                options={[
                  { value: '2D', label: '2D — Imagen plana (JPG/PNG)' },
                  { value: '3D', label: '3D — CBCT / DICOM' },
                  { value: 'AMBOS', label: 'Ambos — 2D y 3D (dos carpetas)' },
                ]}
              />
            </Form.Item>
          )}

          <Form.Item
            name="precio"
            label="Precio (CLP)"
            rules={[{ required: true, message: 'Ingresa el precio' }]}
          >
            <InputNumber
              min={0}
              step={1000}
              style={{ width: '100%' }}
              formatter={v => `$${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={v => Number(v?.replace(/\$\s?|(\.)*/g, '') || 0)}
              placeholder="$0"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Spin>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function HonorariosPage() {
  const [derivadores, setDerivadores] = useState<Derivador[]>([])
  const [global, setGlobal] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<string>('resumen')
  const [periodo, setPeriodo] = useState(dayjs().format('YYYY-MM'))
  const [detalles, setDetalles] = useState<Record<number, any>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Promise.all([getDerivadores(), getHonorariosGlobal()]).then(([devs, glob]) => {
      setDerivadores(devs)
      setGlobal(glob)
    })
  }, [])

  const loadDetalle = async (derivadorId: number) => {
    const data = await getHonorariosDerivador(derivadorId, periodo)
    setDetalles(prev => ({ ...prev, [derivadorId]: data }))
  }

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    const id = parseInt(key)
    if (!isNaN(id)) loadDetalle(id)
  }

  const handlePeriodoChange = (value: string) => {
    setPeriodo(value)
    const id = parseInt(activeTab)
    if (!isNaN(id)) {
      getHonorariosDerivador(id, value).then(data =>
        setDetalles(prev => ({ ...prev, [id]: data }))
      )
    }
  }

  const handleGenerar = async (id: number) => {
    setLoading(true)
    try {
      await generarHonorarios(id, periodo)
      await loadDetalle(id)
      message.success('Honorarios generados')
    } catch {
      message.error('Error al generar')
    } finally {
      setLoading(false)
    }
  }

  const handlePreview = async (id: number) => {
    try {
      const blob = await previewHonorarios(id, periodo)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch {
      message.error('Error al generar la vista previa')
    }
  }

  const handleEnviar = async (id: number) => {
    setLoading(true)
    try {
      const res = await enviarHonorarios(id, periodo)
      if (res.enviado) {
        message.success('Honorarios enviados por email')
        await loadDetalle(id)
      } else {
        message.warning(res.mensaje)
      }
    } catch {
      message.error('Error al enviar')
    } finally {
      setLoading(false)
    }
  }

  const periodoOptions = Array.from({ length: 12 }, (_, i) => {
    const m = dayjs().subtract(i, 'month')
    return { value: m.format('YYYY-MM'), label: m.format('MMMM YYYY') }
  })

  const columnsDetalle = [
    { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', width: 100 },
    { title: 'Paciente', dataIndex: 'paciente', key: 'paciente' },
    {
      title: 'Examen', dataIndex: 'tipo_examen', key: 'tipo_examen',
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: 'Precio', dataIndex: 'precio', key: 'precio', align: 'right' as const,
      render: (v: number) => `$${v.toLocaleString('es-CL')}`,
    },
  ]

  const resumenGlobal = () => {
    const totalGlobal = global.reduce((acc, d) => {
      const h = d.honorarios.find((x: any) => x.periodo === periodo)
      return acc + (h?.total || 0)
    }, 0)
    return (
      <div>
        <Card style={{ marginBottom: 16 }}>
          <Statistic
            title={`Total acumulado ${periodo}`}
            value={totalGlobal}
            prefix="$"
            formatter={v => Number(v).toLocaleString('es-CL')}
          />
        </Card>
        <Divider orientation="left" style={{ marginTop: 28 }}>
          <Typography.Text strong style={{ fontSize: 14 }}>Por clínica — {periodo}</Typography.Text>
        </Divider>
        <Table
          dataSource={global}
          rowKey="derivador_id"
          pagination={false}
          size="small"
          columns={[
            { title: 'Clínica', dataIndex: 'derivador_nombre', key: 'nombre' },
            {
              title: `Total ${periodo}`, key: 'total',
              render: (_: any, d: any) => {
                const h = d.honorarios.find((x: any) => x.periodo === periodo)
                return h ? `$${Number(h.total).toLocaleString('es-CL')}` : '—'
              },
            },
            {
              title: 'Estado', key: 'estado',
              render: (_: any, d: any) => {
                const h = d.honorarios.find((x: any) => x.periodo === periodo)
                if (!h) return <Tag>Sin generar</Tag>
                return <Tag color={h.estado === 'ENVIADO' ? 'green' : 'orange'}>{h.estado}</Tag>
              },
            },
          ]}
        />
      </div>
    )
  }

  const tabs = [
    { key: 'resumen', label: 'Resumen global', children: resumenGlobal() },
    ...derivadores.map(d => {
      const detalle = detalles[d.id]
      return {
        key: String(d.id),
        label: d.nombre,
        children: (
          <Spin spinning={loading}>
            {/* ── Honorarios del período ─────────────────────────── */}
            <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
              <Col>
                <Statistic
                  title="Total del período"
                  value={detalle?.total || 0}
                  prefix="$"
                  formatter={v => Number(v).toLocaleString('es-CL')}
                />
              </Col>
              <Col flex="auto" />
              <Col>
                <Tag color={
                  detalle?.estado === 'ENVIADO' ? 'green'
                    : detalle?.estado === 'BORRADOR' ? 'orange'
                    : 'default'
                }>
                  {detalle?.estado || 'SIN_GENERAR'}
                </Tag>
              </Col>
              <Col>
                <Space>
                  <Button icon={<CalculatorOutlined />} onClick={() => handleGenerar(d.id)}>
                    Calcular
                  </Button>
                  <Button
                    icon={<EyeOutlined />}
                    onClick={() => handlePreview(d.id)}
                  >
                    Vista previa
                  </Button>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={() => handleEnviar(d.id)}
                    disabled={!detalle || detalle.estado === 'SIN_GENERAR'}
                  >
                    Enviar a clínica
                  </Button>
                </Space>
              </Col>
            </Row>

            <Table
              dataSource={detalle?.detalle || []}
              columns={columnsDetalle}
              rowKey="examen_id"
              pagination={false}
              size="small"
              summary={() => detalle?.total ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3}><strong>TOTAL</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <strong>${Number(detalle.total).toLocaleString('es-CL')}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              ) : null}
            />

            {/* ── Tarifas ────────────────────────────────────────── */}
            <Divider orientation="left" style={{ marginTop: 32 }}>
              <Typography.Text strong style={{ fontSize: 14 }}>Tarifas por tipo de examen</Typography.Text>
            </Divider>
            <TarifasEditor derivadorId={d.id} />

          </Spin>
        ),
      }
    }),
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Honorarios</Typography.Title>
        <Select
          value={periodo}
          options={periodoOptions}
          onChange={handlePeriodoChange}
          style={{ width: 180 }}
        />
      </div>
      <Tabs items={tabs} activeKey={activeTab} onChange={handleTabChange} />
    </div>
  )
}
