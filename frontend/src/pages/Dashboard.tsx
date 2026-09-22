import { useEffect, useState, useCallback, useMemo } from 'react'
import { Segmented, Typography, Spin, Button, Modal, Switch, DatePicker, message } from 'antd'
import { useTutorialDashboard } from '../hooks/useTutorialDoctora'
import { TableOutlined, AppstoreOutlined, CalendarOutlined, CalendarFilled } from '@ant-design/icons'
import PanelIncidencias from '../components/PanelIncidencias'
import type { Examen, Caso } from '../api/examenes'
import { getTodosExamenes, agruparEnCasos } from '../api/examenes'
import { getMe, updateVacaciones } from '../api/auth'
import TablaExamenes from '../components/TablaExamenes'
import BoardExamenes from '../components/BoardExamenes'
import CalendarioCasos from '../components/CalendarioCasos'
import ExamenDrawer from '../components/ExamenDrawer'
import dayjs, { type Dayjs } from 'dayjs'

type Vista = 'tabla' | 'board' | 'calendario'


export default function Dashboard() {
  const [vista, setVista] = useState<Vista>('calendario')
  const [examenes, setExamenes] = useState<Examen[]>([])
  const [loading, setLoading] = useState(true)
  const [casoAbierto, setCasoAbierto] = useState<Caso | null>(null)
  const [modalVac, setModalVac] = useState(false)
  const [enVacaciones, setEnVacaciones] = useState(false)
  const [fechaRetorno, setFechaRetorno] = useState<Dayjs | null>(null)
  const [savingVac, setSavingVac] = useState(false)

  useTutorialDashboard(loading)

  const casos = useMemo(() => agruparEnCasos(examenes), [examenes])

  const cargar = useCallback(() => {
    setLoading(true)
    getTodosExamenes()
      .then(setExamenes)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    cargar()
    getMe().then(u => {
      document.title = `Portal Doctor · ${u.nombre_display || u.username}`
      setEnVacaciones(u.en_vacaciones)
      setFechaRetorno(u.fecha_retorno ? dayjs(u.fecha_retorno) : null)
    }).catch(() => {})
  }, [cargar])

  const guardarVacaciones = async () => {
    if (enVacaciones && !fechaRetorno) { message.warning('Selecciona la fecha de retorno'); return }
    setSavingVac(true)
    try {
      await updateVacaciones(enVacaciones, enVacaciones ? fechaRetorno!.format('YYYY-MM-DD') : null)
      message.success(enVacaciones ? `Vacaciones activadas hasta el ${fechaRetorno!.format('DD/MM/YYYY')}` : 'Vacaciones desactivadas')
      setModalVac(false)
    } catch { message.error('Error al guardar') }
    finally { setSavingVac(false) }
  }

  const handleOpenCaso = (c: Caso) => {
    if (c.estado === 'PENDIENTE') {
      setExamenes(prev => prev.map(e =>
        (e.caso_id === c.caso_id || (!e.caso_id && `solo_${e.id}` === c.caso_id))
          ? { ...e, estado: 'EN_PROCESO' }
          : e
      ))
    }
    setCasoAbierto(c)
  }

  // Para PanelIncidencias (sigue trabajando con Examen individual)
  const handleOpenExamenDesdeIncidencia = (e: Examen) => {
    const casoKey = e.caso_id || `solo_${e.id}`
    const caso = casos.find(c => c.caso_id === casoKey)
    if (caso) handleOpenCaso(caso)
  }

  const handleDrawerClose = () => {
    setCasoAbierto(null)
    cargar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, width: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: '1px solid #e5e7eb', background: '#fff',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Typography.Title level={4} style={{ margin: 0, color: '#1e3a5f' }}>
            Exámenes
          </Typography.Title>
          <Button
            size="small"
            icon={<CalendarFilled />}
            onClick={() => setModalVac(true)}
            style={enVacaciones ? { borderColor: '#f59e0b', color: '#f59e0b' } : {}}
            title="Gestionar vacaciones"
          >
            {enVacaciones ? `Vacaciones · ${fechaRetorno?.format('DD/MM')}` : 'Vacaciones'}
          </Button>
        </div>
        <Segmented
          id="vista-selector"
          value={vista}
          onChange={v => setVista(v as Vista)}
          options={[
            { value: 'calendario', icon: <CalendarOutlined />, label: 'Calendario' },
            { value: 'board',      icon: <AppstoreOutlined />, label: 'Board'      },
            { value: 'tabla',      icon: <TableOutlined />,    label: 'Tabla'      },
          ]}
          size="middle"
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 24, width: '100%' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin size="large" /></div>
        ) : (
          <>
            {vista === 'calendario' && (
              <CalendarioCasos casos={casos} onOpenCaso={handleOpenCaso} />
            )}
            {vista === 'board' && (
              <BoardExamenes casos={casos} onOpenCaso={handleOpenCaso} onUpdate={cargar} />
            )}
            {vista === 'tabla' && (
              <TablaExamenes casos={casos} onOpenCaso={handleOpenCaso} onUpdate={cargar} />
            )}
          </>
        )}
      </div>

      <PanelIncidencias examenes={examenes} onAbrir={handleOpenExamenDesdeIncidencia} />

      <ExamenDrawer caso={casoAbierto} onClose={handleDrawerClose} onUpdate={cargar} />

      <Modal
        title="Gestionar vacaciones"
        open={modalVac}
        onCancel={() => setModalVac(false)}
        onOk={guardarVacaciones}
        okText="Guardar"
        cancelText="Cancelar"
        confirmLoading={savingVac}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography.Text>Activar modo vacaciones</Typography.Text>
            <Switch checked={enVacaciones} onChange={setEnVacaciones} />
          </div>
          {enVacaciones && (
            <div>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
                Fecha de retorno (los derivadores verán esta fecha en sus exámenes)
              </Typography.Text>
              <DatePicker
                value={fechaRetorno}
                onChange={setFechaRetorno}
                format="DD/MM/YYYY"
                placeholder="Selecciona fecha de retorno"
                style={{ width: '100%' }}
                disabledDate={d => d.isBefore(dayjs(), 'day')}
              />
            </div>
          )}
          {enVacaciones && fechaRetorno && (
            <Typography.Text style={{ fontSize: 12, color: '#f59e0b', background: '#fffbeb', padding: '8px 12px', borderRadius: 6, border: '1px solid #fde68a' }}>
              Los derivadores verán un aviso indicando que los informes se entregarán a partir del {fechaRetorno.format('DD/MM/YYYY')}.
            </Typography.Text>
          )}
        </div>
      </Modal>
    </div>
  )
}
