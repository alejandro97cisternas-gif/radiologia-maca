import { useEffect, useState, useCallback, useMemo } from 'react'
import { Segmented, Typography, Spin, Badge, Calendar } from 'antd'
import { useTutorialDashboard } from '../hooks/useTutorialDoctora'
import { TableOutlined, AppstoreOutlined, CalendarOutlined } from '@ant-design/icons'
import PanelIncidencias from '../components/PanelIncidencias'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import type { Examen, Caso } from '../api/examenes'
import { getTodosExamenes, agruparEnCasos } from '../api/examenes'
import { getCalendario } from '../api/dashboard'
import TablaExamenes from '../components/TablaExamenes'
import BoardExamenes from '../components/BoardExamenes'
import ExamenDrawer from '../components/ExamenDrawer'

type Vista = 'tabla' | 'board' | 'calendario'


export default function Dashboard() {
  const [vista, setVista] = useState<Vista>('board')
  const [examenes, setExamenes] = useState<Examen[]>([])
  const [loading, setLoading] = useState(true)
  const [casoAbierto, setCasoAbierto] = useState<Caso | null>(null)

  const [mes, setMes] = useState(dayjs().format('YYYY-MM'))
  const [calendario, setCalendario] = useState<Record<string, any[]>>({})

  useTutorialDashboard(loading)

  const casos = useMemo(() => agruparEnCasos(examenes), [examenes])

  const cargar = useCallback(() => {
    setLoading(true)
    getTodosExamenes()
      .then(setExamenes)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (vista !== 'calendario') return
    getCalendario(mes).then(d => setCalendario(d.dias || {}))
  }, [vista, mes])

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

  const cellRender = (date: Dayjs) => {
    const key = date.format('YYYY-MM-DD')
    const items = calendario[key] || []
    if (!items.length) return null
    return <Badge count={items.length} size="small" color="#2563EB" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, width: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: '1px solid #e5e7eb', background: '#fff',
        flexShrink: 0,
      }}>
        <Typography.Title level={4} style={{ margin: 0, color: '#1e3a5f' }}>
          Exámenes
        </Typography.Title>
        <Segmented
          id="vista-selector"
          value={vista}
          onChange={v => setVista(v as Vista)}
          options={[
            { value: 'board',      icon: <AppstoreOutlined />, label: 'Board'      },
            { value: 'tabla',      icon: <TableOutlined />,    label: 'Tabla'      },
            { value: 'calendario', icon: <CalendarOutlined />, label: 'Calendario' },
          ]}
          size="middle"
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 24, width: '100%' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin size="large" /></div>
        ) : (
          <>
            {vista === 'board' && (
              <BoardExamenes casos={casos} onOpenCaso={handleOpenCaso} onUpdate={cargar} />
            )}
            {vista === 'tabla' && (
              <TablaExamenes casos={casos} onOpenCaso={handleOpenCaso} onUpdate={cargar} />
            )}
            {vista === 'calendario' && (
              <div style={{ maxWidth: 800 }}>
                <Calendar
                  fullscreen={false}
                  cellRender={cellRender}
                  onPanelChange={d => setMes(d.format('YYYY-MM'))}
                  style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}
                />
                <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                  Los badges muestran casos pendientes/en proceso por día.
                </Typography.Text>
              </div>
            )}
          </>
        )}
      </div>

      <PanelIncidencias examenes={examenes} onAbrir={handleOpenExamenDesdeIncidencia} />

      <ExamenDrawer caso={casoAbierto} onClose={handleDrawerClose} onUpdate={cargar} />
    </div>
  )
}
