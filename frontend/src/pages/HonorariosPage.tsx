import { useEffect, useMemo, useState } from 'react'
import { useTutorialHonorarios } from '../hooks/useTutorialDoctora'
import {
  Tabs, Table, Typography, Button, Select, Statistic, Card, Row, Col,
  Tag, message, Spin, Divider, InputNumber, Space, Modal, Form, Popconfirm,
} from 'antd'
import { SendOutlined, CalculatorOutlined, EyeOutlined, PlusOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  getHonorariosGlobal, getHonorariosDerivador, generarHonorarios,
  enviarHonorarios, previewHonorarios,
  getTarifas, crearTarifaItem, eliminarTarifaItem,
  getTiposExamen,
  getConvenios, crearConvenio, eliminarConvenio,
} from '../api/honorarios'
import type { ConvenioItem } from '../api/honorarios'
import { getDerivadores } from '../api/derivadores'
import type { Derivador } from '../api/derivadores'

interface TarifaRow { tipo_examen: string; precio: number }
interface TipoItem { nombre: string; dimension: '2D' | '3D' | 'AMBOS'; custom: boolean; categoria?: string }

// ── Editor de exámenes + tarifas ──────────────────────────────────────────────

function fmtMonto(v: number, moneda: string) {
  if (moneda === 'CAD') return `CA$${v.toLocaleString('en-CA', { minimumFractionDigits: 0 })}`
  return `$${v.toLocaleString('es-CL')}`
}

function TarifasEditor({ derivadorId, moneda }: { derivadorId: number; moneda: string }) {
  const [tarifas, setTarifas] = useState<TarifaRow[]>([])
  const [allTipos, setAllTipos] = useState<TipoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalCatOpen, setModalCatOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [form] = Form.useForm()
  const [formCat] = Form.useForm()
  const catSeleccionada: string | undefined = Form.useWatch('categoria', formCat)
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
    const categorias = [...new Set(allTipos.map(t => t.categoria).filter(Boolean))]
    const grouped: any[] = categorias.map(cat => ({
      label: <strong>{cat}</strong>,
      options: allTipos
        .filter(t => t.categoria === cat)
        .map(t => ({
          value: t.nombre,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{t.nombre}</span>
              <Tag color={dimColor(t.dimension)} style={{ margin: 0, fontSize: 10 }}>{t.dimension}</Tag>
            </div>
          ),
        })),
    }))
    if (q && !allTipos.find(t => t.nombre === q)) {
      grouped.push({
        label: <strong>Nuevo</strong>,
        options: [{ value: q, label: <span style={{ color: '#2563EB' }}>➕ Crear nuevo: "{q}"</span> }],
      })
    }
    return grouped
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

  const categoriaOptions = useMemo(() => {
    const conteo = allTipos.reduce<Record<string, number>>((acc, t) => {
      const c = t.categoria
      if (!c) return acc
      acc[c] = (acc[c] || 0) + 1
      return acc
    }, {})
    return Object.entries(conteo)
      .map(([c]) => ({ value: c, label: c }))
  }, [allTipos])

  const examenesFaltantesCat = useMemo(() => {
    if (!catSeleccionada) return []
    return allTipos.filter(t =>
      t.categoria === catSeleccionada &&
      !tarifas.find(tar => tar.tipo_examen === t.nombre)
    )
  }, [catSeleccionada, allTipos, tarifas])

  const handleAgregarCategoria = async (values: { categoria: string; precio: number }) => {
    if (examenesFaltantesCat.length === 0) { message.info('Todos los exámenes de esa categoría ya tienen tarifa'); return }
    setSaving(true)
    try {
      await Promise.all(examenesFaltantesCat.map(t =>
        crearTarifaItem(derivadorId, { tipo_examen: t.nombre, precio: values.precio, dimension: t.dimension })
      ))
      message.success(`${examenesFaltantesCat.length} exámenes agregados`)
      setModalCatOpen(false)
      formCat.resetFields()
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
      title: `Precio (${moneda})`, dataIndex: 'precio', key: 'precio', align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{fmtMonto(v, moneda)}</span>,
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
        <Space>
          <Button size="small" onClick={() => setModalCatOpen(true)}>Por categoría</Button>
          <Button id="btn-agregar-examen" type="primary" icon={<PlusOutlined />} size="small" onClick={() => setModalOpen(true)}>
            Agregar examen
          </Button>
        </Space>
      </div>

      {tarifas.length > 0 && (
        <Table
          id="tabla-tarifas"
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
              filterOption={(input, opt) => {
                if (!opt?.value) return false
                const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                const hay = norm(String(opt.value))
                return norm(input).split(/\s+/).filter(Boolean).every(w => hay.includes(w))
              }}
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
            label={`Precio (${moneda})`}
            rules={[{ required: true, message: 'Ingresa el precio' }]}
          >
            <InputNumber
              min={0}
              step={moneda === 'CAD' ? 10 : 1000}
              style={{ width: '100%' }}
              formatter={v => moneda === 'CAD' ? `CA$${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : `$${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={v => Number((moneda === 'CAD' ? v?.replace(/CA\$|,/g, '') : v?.replace(/[$\.]/g, '')) || 0)}
              placeholder={moneda === 'CAD' ? 'CA$0' : '$0'}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Agregar categoría completa"
        open={modalCatOpen}
        onCancel={() => { setModalCatOpen(false); formCat.resetFields() }}
        onOk={() => formCat.submit()}
        okText="Guardar"
        confirmLoading={saving}
      >
        <Form form={formCat} layout="vertical" onFinish={handleAgregarCategoria} style={{ marginTop: 16 }}>
          <Form.Item name="categoria" label="Categoría" rules={[{ required: true }]}>
            <Select placeholder="Selecciona una categoría" options={categoriaOptions} />
          </Form.Item>
          {catSeleccionada && (
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
              {examenesFaltantesCat.length === 0
                ? 'Todos los exámenes de esta categoría ya tienen tarifa.'
                : `Se agregarán ${examenesFaltantesCat.length} exámenes con el mismo precio.`}
            </Typography.Text>
          )}
          <Form.Item name="precio" label={`Precio por examen (${moneda})`} rules={[{ required: true }]}>
            <InputNumber
              min={0} step={moneda === 'CAD' ? 10 : 1000} style={{ width: '100%' }}
              formatter={v => moneda === 'CAD' ? `CA$${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : `$${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={v => Number((moneda === 'CAD' ? v?.replace(/CA\$|,/g, '') : v?.replace(/[$\.]/g, '')) || 0)}
              placeholder={moneda === 'CAD' ? 'CA$0' : '$0'}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Spin>
  )
}

// ── Editor de convenios ───────────────────────────────────────────────────────

function ConveniosEditor({ derivadorId, moneda }: { derivadorId: number; moneda: string }) {
  const [convenios, setConvenios] = useState<ConvenioItem[]>([])
  const [tipos, setTipos] = useState<TipoItem[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const categorias = useMemo(() =>
    [...new Set(tipos.map(t => t.categoria).filter(Boolean))].map(c => ({ value: c, label: c }))
  , [tipos])

  const cargar = () => getConvenios(derivadorId).then(setConvenios)
  useEffect(() => {
    cargar()
    getTiposExamen().then(setTipos)
  }, [derivadorId])

  const handleGuardar = async (values: { categoria: string; descuento_2: number; descuento_3: number }) => {
    setSaving(true)
    try {
      await crearConvenio(derivadorId, values)
      message.success('Convenio guardado')
      setModalOpen(false)
      form.resetFields()
      cargar()
    } catch {
      message.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleEliminar = async (id: number) => {
    await eliminarConvenio(derivadorId, id)
    cargar()
  }

  const columns = [
    { title: 'Categoría', dataIndex: 'categoria', key: 'categoria' },
    {
      title: '2° examen', dataIndex: 'descuento_2', key: 'd2',
      render: (v: number) => v ? <Tag color="orange">-{fmtMonto(v, moneda)}</Tag> : <Tag>Sin descuento</Tag>,
    },
    {
      title: '3°+ examen', dataIndex: 'descuento_3', key: 'd3',
      render: (v: number) => v ? <Tag color="red">-{fmtMonto(v, moneda)}</Tag> : <Tag>Sin descuento</Tag>,
    },
    {
      title: '', key: 'accion',
      render: (_: any, r: ConvenioItem) => (
        <Popconfirm title="¿Eliminar convenio?" okText="Eliminar" okButtonProps={{ danger: true }} cancelText="Cancelar" onConfirm={() => handleEliminar(r.id)}>
          <Button size="small" danger type="text" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {convenios.length === 0 ? 'Sin convenios configurados.' : `${convenios.length} convenio${convenios.length !== 1 ? 's' : ''}`}
        </Typography.Text>
        <Button icon={<PlusOutlined />} size="small" onClick={() => setModalOpen(true)}>Agregar convenio</Button>
      </div>

      {convenios.length > 0 && (
        <Table dataSource={convenios} columns={columns} rowKey="id" pagination={false} size="small" style={{ maxWidth: 520 }} />
      )}

      <Modal title="Configurar convenio" open={modalOpen} onCancel={() => { setModalOpen(false); form.resetFields() }} onOk={() => form.submit()} okText="Guardar" confirmLoading={saving}>
        <Form form={form} layout="vertical" onFinish={handleGuardar} style={{ marginTop: 16 }}>
          <Form.Item name="categoria" label="Categoría" rules={[{ required: true }]}
            extra="Si ya existe un convenio para esta categoría, se actualizará.">
            <Select options={categorias} placeholder="Selecciona categoría" />
          </Form.Item>
          <Form.Item name="descuento_2" label={`Descuento en el 2° examen (${moneda})`} initialValue={0} rules={[{ required: true }]}>
            <InputNumber min={0} step={moneda === 'CAD' ? 10 : 1000} style={{ width: '100%' }}
              formatter={v => moneda === 'CAD' ? `CA$${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : `$${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={v => Number((moneda === 'CAD' ? v?.replace(/CA\$|,/g, '') : v?.replace(/[$\.]/g, '')) || 0)} />
          </Form.Item>
          <Form.Item name="descuento_3" label={`Descuento en el 3°+ examen (${moneda})`} initialValue={0} rules={[{ required: true }]}>
            <InputNumber min={0} step={moneda === 'CAD' ? 10 : 1000} style={{ width: '100%' }}
              formatter={v => moneda === 'CAD' ? `CA$${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : `$${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={v => Number((moneda === 'CAD' ? v?.replace(/CA\$|,/g, '') : v?.replace(/[$\.]/g, '')) || 0)} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
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

  useTutorialHonorarios()

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

  const handleDescargarCSV = (id: number) => {
    const det = detalles[id]?.detalle || []
    if (!det.length) { message.warning('No hay datos para este período'); return }
    const nombre = derivadores.find(d => d.id === id)?.nombre || String(id)
    const filas = [
      ['Fecha', 'Paciente', 'Tipo de examen', 'Precio base', 'Descuento', 'Precio final'],
      ...det.map((e: any) => [e.fecha, e.paciente, e.tipo_examen, e.precio_base, e.descuento, e.precio]),
    ]
    const csv = filas.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `honorarios_${nombre.replace(/\s+/g, '_')}_${periodo}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
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

  const agruparDetalle = (detalle: any[]) => {
    const map = new Map<string, any>()
    for (const item of detalle) {
      const key = item.caso_id || `solo_${item.examen_id}`
      if (!map.has(key)) map.set(key, { key, fecha: item.fecha, paciente: item.paciente, examenes: [] })
      map.get(key).examenes.push(item)
    }
    return Array.from(map.values()).map(c => ({
      ...c,
      total: c.examenes.reduce((s: number, e: any) => s + e.precio, 0),
    }))
  }

  const columnsDetalle = (moneda: string) => [
    { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', width: 100 },
    { title: 'Paciente', dataIndex: 'paciente', key: 'paciente', width: 180 },
    {
      title: 'Exámenes',
      key: 'examenes',
      render: (_: any, row: any) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {row.examenes.map((e: any, i: number) => (
            <div key={e.examen_id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{e.tipo_examen}</Tag>
              {e.descuento > 0 && (
                <Tag color="orange" style={{ margin: 0, fontSize: 10 }}>
                  -{fmtMonto(e.descuento, moneda)} {i === 1 ? '(2°)' : '(3°+)'}
                </Tag>
              )}
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'Total caso', key: 'total', align: 'right' as const,
      render: (_: any, row: any) => (
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontWeight: 600 }}>{fmtMonto(row.total, moneda)}</span>
          {row.examenes.length > 1 && (
            <div style={{ fontSize: 10, color: '#9ca3af' }}>
              {row.examenes.map((e: any) => fmtMonto(e.precio, moneda)).join(' + ')}
            </div>
          )}
        </div>
      ),
    },
  ]

  const resumenGlobal = () => {
    const totalCLP = global.filter(d => (d.moneda || 'CLP') === 'CLP').reduce((acc, d) => {
      const h = d.honorarios.find((x: any) => x.periodo === periodo)
      return acc + (h?.total || 0)
    }, 0)
    const totalCAD = global.filter(d => d.moneda === 'CAD').reduce((acc, d) => {
      const h = d.honorarios.find((x: any) => x.periodo === periodo)
      return acc + (h?.total || 0)
    }, 0)
    const hayCAD = global.some(d => d.moneda === 'CAD')
    return (
      <div>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col>
            <Card>
              <Statistic
                title={`Total CLP — ${periodo}`}
                value={totalCLP}
                prefix="$"
                formatter={v => Number(v).toLocaleString('es-CL')}
              />
            </Card>
          </Col>
          {hayCAD && (
            <Col>
              <Card>
                <Statistic
                  title={`Total CAD — ${periodo}`}
                  value={totalCAD}
                  prefix="CA$"
                  formatter={v => Number(v).toLocaleString('en-CA', { minimumFractionDigits: 0 })}
                />
              </Card>
            </Col>
          )}
        </Row>
        <Divider orientation="left" style={{ marginTop: 28 }}>
          <Typography.Text strong style={{ fontSize: 14 }}>Por clínica — {periodo}</Typography.Text>
        </Divider>
        <Table
          dataSource={global}
          rowKey="derivador_id"
          pagination={false}
          size="small"
          columns={[
            {
              title: 'Clínica', key: 'nombre',
              render: (_: any, d: any) => (
                <Space size={6}>
                  {d.derivador_nombre}
                  <Tag color={d.moneda === 'CAD' ? 'purple' : 'blue'} style={{ margin: 0, fontSize: 10 }}>{d.moneda || 'CLP'}</Tag>
                </Space>
              ),
            },
            {
              title: `Total ${periodo}`, key: 'total',
              render: (_: any, d: any) => {
                const h = d.honorarios.find((x: any) => x.periodo === periodo)
                return h ? fmtMonto(Number(h.total), d.moneda || 'CLP') : '—'
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
      const moneda = d.moneda || 'CLP'
      return {
        key: String(d.id),
        label: (
          <Space size={4}>
            {d.nombre}
            {moneda === 'CAD' && <Tag color="purple" style={{ margin: 0, fontSize: 10 }}>CAD</Tag>}
          </Space>
        ),
        children: (
          <Spin spinning={loading}>
            {/* ── Honorarios del período ─────────────────────────── */}
            <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
              <Col>
                <Statistic
                  title={`Total del período (${moneda})`}
                  value={detalle?.total || 0}
                  prefix={moneda === 'CAD' ? 'CA$' : '$'}
                  formatter={v => moneda === 'CAD' ? Number(v).toLocaleString('en-CA', { minimumFractionDigits: 0 }) : Number(v).toLocaleString('es-CL')}
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
                  <Button id="btn-calcular" icon={<CalculatorOutlined />} onClick={() => handleGenerar(d.id)}>
                    Calcular
                  </Button>
                  <Button
                    id="btn-vista-previa"
                    icon={<EyeOutlined />}
                    onClick={() => handlePreview(d.id)}
                  >
                    Vista previa
                  </Button>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={() => handleDescargarCSV(d.id)}
                    disabled={!detalle?.detalle?.length}
                  >
                    CSV
                  </Button>
                  <Button
                    id="btn-enviar-clinica"
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
              dataSource={agruparDetalle(detalle?.detalle || [])}
              columns={columnsDetalle(moneda)}
              rowKey="key"
              pagination={false}
              size="small"
              summary={() => detalle?.total ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3}><strong>TOTAL</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <strong>{fmtMonto(Number(detalle.total), moneda)}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              ) : null}
            />

            {/* ── Tarifas ────────────────────────────────────────── */}
            <Divider orientation="left" style={{ marginTop: 32 }}>
              <Typography.Text strong style={{ fontSize: 14 }}>Tarifas por tipo de examen</Typography.Text>
            </Divider>
            <TarifasEditor derivadorId={d.id} moneda={moneda} />

            {/* ── Convenios ──────────────────────────────────────── */}
            <Divider orientation="left" style={{ marginTop: 32 }}>
              <Typography.Text strong style={{ fontSize: 14 }}>Convenios de descuento</Typography.Text>
            </Divider>
            <ConveniosEditor derivadorId={d.id} moneda={moneda} />

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
          id="honorarios-selector-periodo"
          value={periodo}
          options={periodoOptions}
          onChange={handlePeriodoChange}
          style={{ width: 180 }}
        />
      </div>
      <Tabs id="honorarios-tabs" items={tabs} activeKey={activeTab} onChange={handleTabChange} />
    </div>
  )
}
