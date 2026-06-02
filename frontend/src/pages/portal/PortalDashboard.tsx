import { useEffect, useState, useMemo } from 'react'
import { useTutorialDerivador, reiniciarTutorialDerivador } from '../../hooks/useTutorialDerivador'
import {
  Typography, Table, Tag, Button, Layout, Menu,
  Popconfirm, message, Segmented, Badge, Calendar, Modal, Input, Alert, Form,
} from 'antd'
import {
  PlusOutlined, PictureOutlined, DollarOutlined,
  DeleteOutlined, AppstoreOutlined, TableOutlined, CalendarOutlined, WarningOutlined, CheckCircleOutlined,
  BellOutlined, QuestionCircleOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { portalGetIncidencia, portalResolverIncidencia } from '../../api/incidencias'
import type { Incidencia } from '../../api/incidencias'
import PanelIncidencias from '../../components/PanelIncidencias'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { portalMe, portalGetExamenes, portalEliminarExamen, portalGetNotificaciones, portalLeerNotificacion, portalLeerTodas } from '../../api/portal'
import type { NotificacionPortal } from '../../api/portal'

const { Sider, Content, Header } = Layout

type Vista = 'board' | 'tabla' | 'calendario'

const COLUMNAS = [
  { key: 'PENDIENTE',  label: 'Enviados',    color: '#d97706', bg: '#fffbeb' },
  { key: 'EN_PROCESO', label: 'En proceso',  color: '#2563EB', bg: '#eff6ff' },
  { key: 'COMPLETADO', label: 'Completados', color: '#16a34a', bg: '#f0fdf4' },
]

const ESTADO_COLOR: Record<string, string> = {
  BORRADOR: 'default', PENDIENTE: 'orange', EN_PROCESO: 'processing', COMPLETADO: 'success',
}

// ── Card de examen (solo lectura) ─────────────────────────────────────────────

function ExamenCard({ e, onVer, onIncidencia }: { e: any; onVer: () => void; onIncidencia: () => void }) {
  return (
    <div
      onClick={onVer}
      style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        padding: '10px 12px', marginBottom: 8, cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <Typography.Text strong style={{ fontSize: 13, color: '#1e3a5f' }}>
          {e.paciente_nombre}
        </Typography.Text>
        <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{e.tipo_examen}</Tag>
      </div>
      {e.paciente_rut && (
        <Typography.Text style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 4 }}>
          {e.paciente_rut}
        </Typography.Text>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <Typography.Text style={{ fontSize: 11, color: '#9ca3af' }}>
          {new Date(e.creado_en).toLocaleDateString('es-CL')}
        </Typography.Text>
        <div style={{ display: 'flex', gap: 4 }}>
          <Tag color={e.dimension === '3D' ? 'purple' : 'cyan'} style={{ margin: 0, fontSize: 10 }}>{e.dimension}</Tag>
          <Tag color={(e.version ?? 0) === 0 ? 'default' : 'orange'} style={{ margin: 0, fontSize: 10, fontWeight: 600 }}>
            v{e.version ?? 0}
          </Tag>
          {e.incidencia_estado === 'ABIERTA' && (
            <Tag
              color="error" style={{ margin: 0, fontSize: 10, cursor: 'pointer' }}
              onClick={ev => { ev.stopPropagation(); onIncidencia() }}
            >⚠ Incidencia</Tag>
          )}
          {e.incidencia_estado === 'RESUELTA' && (
            <Tag color="success" style={{ margin: 0, fontSize: 10 }}>✓ Resuelta</Tag>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Board (solo lectura) ──────────────────────────────────────────────────────

function BoardPortal({ examenes, onVer, onIncidencia }: { examenes: any[]; onVer: (id: number) => void; onIncidencia: (e: any) => void }) {
  const porColumna = useMemo(() => {
    const map: Record<string, any[]> = { PENDIENTE: [], EN_PROCESO: [], COMPLETADO: [] }
    for (const e of examenes) (map[e.estado] ??= []).push(e)
    return map
  }, [examenes])

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', width: '100%' }}>
      {COLUMNAS.map(col => (
        <div key={col.key} style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
            marginBottom: 8, borderRadius: 8, background: col.bg,
            border: `1px solid ${col.color}22`,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.color }} />
            <Typography.Text strong style={{ color: col.color, fontSize: 13 }}>{col.label}</Typography.Text>
            <Badge count={porColumna[col.key]?.length ?? 0} color={col.color} style={{ marginLeft: 'auto' }} />
          </div>
          <div style={{ minHeight: 80 }}>
            {(porColumna[col.key] ?? []).map((e: any) => (
              <ExamenCard key={e.id} e={e} onVer={() => onVer(e.id)} onIncidencia={() => onIncidencia(e)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tabla ─────────────────────────────────────────────────────────────────────

function TablaPortal({
  examenes, onVer, onEliminar, onIncidencia,
}: {
  examenes: any[]
  onVer: (id: number) => void
  onEliminar: (id: number) => void
  onIncidencia: (e: any) => void
}) {
  const columns = [
    {
      title: 'Paciente', key: 'paciente',
      render: (_: any, e: any) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{e.paciente_nombre || '—'}</div>
          {e.paciente_rut && <div style={{ fontSize: 11, color: '#9ca3af' }}>{e.paciente_rut}</div>}
        </div>
      ),
    },
    {
      title: 'Examen', key: 'examen',
      render: (_: any, e: any) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Tag color="blue">{e.tipo_examen}</Tag>
          <Tag color={e.dimension === '3D' ? 'purple' : 'cyan'}>{e.dimension}</Tag>
        </div>
      ),
    },
    {
      title: 'Versión', key: 'version',
      width: 70,
      render: (_: any, e: any) => (
        <Tag color={(e.version ?? 0) === 0 ? 'default' : 'orange'} style={{ fontWeight: 600 }}>
          v{e.version ?? 0}
        </Tag>
      ),
    },
    {
      title: 'Estado', key: 'estado',
      render: (_: any, e: any) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Tag color={ESTADO_COLOR[e.estado] ?? 'default'}>{e.estado}</Tag>
          {e.incidencia_estado === 'ABIERTA' && (
            <Tag color="error" style={{ cursor: 'pointer', fontSize: 11 }} onClick={() => onIncidencia(e)}>
              <WarningOutlined /> Incidencia
            </Tag>
          )}
          {e.incidencia_estado === 'RESUELTA' && (
            <Tag color="success" style={{ fontSize: 11 }}><CheckCircleOutlined /> Resuelta</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Fecha', dataIndex: 'creado_en', key: 'fecha',
      render: (v: string) => new Date(v).toLocaleDateString('es-CL'),
    },
    {
      title: '', key: 'acciones',
      render: (_: any, e: any) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" icon={<PictureOutlined />} onClick={() => onVer(e.id)}>Ver</Button>
          {e.estado !== 'COMPLETADO' && (
            <Popconfirm
              title="¿Eliminar examen?"
              description="Se borrarán las imágenes y la tarea."
              okText="Eliminar" cancelText="Cancelar"
              okButtonProps={{ danger: true }}
              onConfirm={() => onEliminar(e.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </div>
      ),
    },
  ]

  return (
    <Table
      dataSource={examenes}
      columns={columns}
      rowKey="id"
      size="small"
      pagination={{ pageSize: 25 }}
    />
  )
}

// ── Dashboard principal ───────────────────────────────────────────────────────

export default function PortalDashboard() {
  const [info, setInfo] = useState<any>(null)
  const [examenes, setExamenes] = useState<any[]>([])
  const [vista, setVista] = useState<Vista>('board')
  const [notificaciones, setNotificaciones] = useState<NotificacionPortal[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const navigate = useNavigate()

  // Modal incidencia
  const [incModal, setIncModal] = useState<{ examenId: number; examen: any } | null>(null)
  const [incidencia, setIncidencia] = useState<Incidencia | null>(null)
  const [loadingInc, setLoadingInc] = useState(false)
  const [formInc] = Form.useForm()

  useTutorialDerivador(!info)

  const abrirIncidencia = async (examen: any) => {
    setIncModal({ examenId: examen.id, examen })
    setIncidencia(null)
    const inc = await portalGetIncidencia(examen.id).catch(() => null)
    setIncidencia(inc)
  }

  const handleResolver = async (values: { comentario?: string }) => {
    if (!incidencia) return
    setLoadingInc(true)
    try {
      await portalResolverIncidencia(incidencia.id, values.comentario)
      message.success('Incidencia marcada como resuelta')
      setIncModal(null)
      formInc.resetFields()
      cargar()
    } catch { message.error('Error al resolver') }
    finally { setLoadingInc(false) }
  }

  const cargarNotificaciones = () =>
    portalGetNotificaciones().then(setNotificaciones).catch(() => {})

  const cargar = () => {
    portalMe().then(setInfo)
    portalGetExamenes().then(data => setExamenes(data.filter((e: any) => e.estado !== 'BORRADOR')))
    cargarNotificaciones()
  }

  useEffect(() => {
    cargar()
    const intervalo = setInterval(cargarNotificaciones, 30_000)
    return () => clearInterval(intervalo)
  }, [])

  const noLeidas = notificaciones.filter(n => !n.leida).length

  const abrirNotif = () => setNotifOpen(true)

  const clickNotificacion = async (n: NotificacionPortal) => {
    if (!n.leida) await portalLeerNotificacion(n.id).catch(() => {})
    setNotifOpen(false)
    setNotificaciones(prev => prev.map(x => x.id === n.id ? { ...x, leida: true } : x))
    if (n.examen_id) navigate(`/portal/examen/${n.examen_id}`)
  }

  const marcarTodas = async () => {
    await portalLeerTodas().catch(() => {})
    setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })))
  }

  const handleEliminar = async (id: number) => {
    try {
      await portalEliminarExamen(id)
      message.success('Examen eliminado')
      cargar()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'No se pudo eliminar')
    }
  }

  // Calendario
  const porDia = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of examenes) {
      const dia = dayjs(e.creado_en).format('YYYY-MM-DD')
      map[dia] = (map[dia] ?? 0) + 1
    }
    return map
  }, [examenes])

  const cellRender = (date: Dayjs) => {
    const n = porDia[date.format('YYYY-MM-DD')]
    return n ? <Badge count={n} size="small" color="#2563EB" /> : null
  }

  return (
    <>
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={200} style={{ background: '#1e3a5f' }}>
        <div id="portal-titulo" style={{ padding: '20px 16px', color: '#fff', fontWeight: 700, fontSize: 14 }}>
          Portal Clínica
        </div>
        <Menu
          theme="dark"
          defaultSelectedKeys={['dashboard']}
          style={{ background: '#1e3a5f', border: 'none' }}
          items={[
            { key: 'dashboard', label: 'Mis exámenes', onClick: () => navigate('/portal/dashboard') },
            { key: 'tarifas', icon: <DollarOutlined />, label: <span id="portal-tarifas-link">Tarifas</span>, onClick: () => navigate('/portal/tarifas') },
          ]}
        />
      </Sider>

      <Layout style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Header style={{
          background: '#fff', padding: '0 24px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #e5e7eb',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Typography.Text strong style={{ fontSize: 15 }}>{info?.nombre}</Typography.Text>
            <Segmented
              id="portal-vista-selector"
              value={vista}
              onChange={v => setVista(v as Vista)}
              options={[
                { value: 'board',      icon: <AppstoreOutlined />, label: 'Board'      },
                { value: 'tabla',      icon: <TableOutlined />,    label: 'Tabla'      },
                { value: 'calendario', icon: <CalendarOutlined />, label: 'Calendario' },
              ]}
              size="small"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Campana de notificaciones */}
            <Button
              icon={<QuestionCircleOutlined />}
              type="text"
              title="Ver tutorial"
              onClick={() => { reiniciarTutorialDerivador(); window.location.reload() }}
            />
            <Badge count={noLeidas} size="small" offset={[-2, 2]}>
              <Button
                id="portal-notificaciones"
                shape="circle"
                icon={<BellOutlined />}
                onClick={abrirNotif}
                style={{ border: noLeidas > 0 ? '1px solid #f59e0b' : undefined }}
              />
            </Badge>
            <Button id="portal-nuevo-caso" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/portal/nuevo-paciente')}>
              Nuevo caso
            </Button>
          </div>
        </Header>

        {/* Contenido */}
        <Content style={{ flex: 1, overflow: 'auto', padding: 24, background: '#f8fafc' }}>
          {vista === 'board' && (
            <div id="portal-board">
            <BoardPortal
              examenes={examenes}
              onVer={id => navigate(`/portal/examen/${id}`)}
              onIncidencia={abrirIncidencia}
            />
            </div>
          )}
          {vista === 'tabla' && (
            <TablaPortal
              examenes={examenes}
              onVer={id => navigate(`/portal/examen/${id}`)}
              onEliminar={handleEliminar}
              onIncidencia={abrirIncidencia}
            />
          )}
          {vista === 'calendario' && (
            <div style={{ maxWidth: 760 }}>
              <Calendar
                fullscreen={false}
                cellRender={cellRender}
                style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}
              />
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                Los badges indican exámenes ingresados cada día.
              </Typography.Text>
            </div>
          )}

        </Content>
        <PanelIncidencias
          examenes={examenes.map((e: any) => ({
            id: e.id,
            paciente: e.paciente_nombre,
            tipo_examen: e.tipo_examen,
            derivador: '',
            incidencia_estado: e.incidencia_estado,
          }))}
          onAbrir={e => abrirIncidencia(examenes.find((ex: any) => ex.id === e.id))}
        />
      </Layout>
    </Layout>

    {/* Modal notificaciones */}
    <Modal
      open={notifOpen}
      onCancel={() => setNotifOpen(false)}
      footer={null}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
          <span><BellOutlined style={{ marginRight: 8, color: '#2563EB' }} />Notificaciones</span>
          {noLeidas > 0 && (
            <Button size="small" type="link" onClick={marcarTodas} style={{ padding: 0 }}>
              Marcar todas como leídas
            </Button>
          )}
        </div>
      }
      width={420}
    >
      {notificaciones.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af' }}>
          Sin notificaciones
        </div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {notificaciones.map(n => (
            <div
              key={n.id}
              onClick={() => clickNotificacion(n)}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #f1f5f9',
                cursor: n.examen_id ? 'pointer' : 'default',
                background: n.leida ? '#fff' : '#eff6ff',
                display: 'flex', alignItems: 'flex-start', gap: 10,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (n.examen_id) e.currentTarget.style.background = n.leida ? '#f8fafc' : '#dbeafe' }}
              onMouseLeave={e => { e.currentTarget.style.background = n.leida ? '#fff' : '#eff6ff' }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                background: n.leida ? '#d1d5db' : '#2563EB',
              }} />
              <div style={{ flex: 1 }}>
                <Typography.Text style={{ fontSize: 13, fontWeight: n.leida ? 400 : 600, display: 'block' }}>
                  {n.mensaje}
                </Typography.Text>
                <Typography.Text style={{ fontSize: 11, color: '#9ca3af' }}>
                  {new Date(n.creado_en).toLocaleString('es-CL')}
                </Typography.Text>
              </div>
              {!n.leida && <Tag color="blue" style={{ margin: 0, fontSize: 10, flexShrink: 0 }}>Nuevo</Tag>}
            </div>
          ))}
        </div>
      )}
    </Modal>

    {/* Modal incidencia */}

    <Modal
      open={!!incModal}
      onCancel={() => { setIncModal(null); formInc.resetFields() }}
      footer={null}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <WarningOutlined style={{ color: '#dc2626' }} />
          <span>Incidencia — {incModal?.examen?.paciente_nombre}</span>
        </div>
      }
    >
      {incidencia ? (
        <div>
          {incidencia.estado === 'RESUELTA' ? (
            <Alert
              type="success"
              icon={<CheckCircleOutlined />}
              message="Incidencia resuelta"
              description={
                <div>
                  <p style={{ margin: '4px 0' }}>{incidencia.comentario_doctora}</p>
                  {incidencia.comentario_derivador && (
                    <p style={{ margin: '8px 0 0', color: '#16a34a' }}>
                      Tu respuesta: {incidencia.comentario_derivador}
                    </p>
                  )}
                </div>
              }
            />
          ) : (
            <>
              <Alert
                type="error"
                icon={<WarningOutlined />}
                message="La doctora reportó el siguiente problema:"
                description={incidencia.comentario_doctora}
                style={{ marginBottom: 16 }}
              />
              <Form form={formInc} layout="vertical" onFinish={handleResolver}>
                <Form.Item name="comentario" label="Comentario (opcional)">
                  <Input.TextArea rows={3} placeholder="Puedes añadir una respuesta o explicación…" />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={loadingInc} block>
                  Marcar como resuelta
                </Button>
              </Form>
            </>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>Cargando…</div>
      )}
    </Modal>
    </>
  )
}
