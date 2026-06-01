import { useEffect, useState, useCallback } from 'react'
import { Segmented, Typography, Spin, Badge, Calendar } from 'antd'
import { TableOutlined, AppstoreOutlined, CalendarOutlined } from '@ant-design/icons'
import PanelIncidencias from '../components/PanelIncidencias'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import type { Examen } from '../api/examenes'
import { getTodosExamenes } from '../api/examenes'
import { getCalendario } from '../api/dashboard'
import TablaExamenes from '../components/TablaExamenes'
import BoardExamenes from '../components/BoardExamenes'
import ExamenDrawer from '../components/ExamenDrawer'

type Vista = 'tabla' | 'board' | 'calendario'


export default function Dashboard() {
  const [vista, setVista] = useState<Vista>('board')
  const [examenes, setExamenes] = useState<Examen[]>([])
  const [loading, setLoading] = useState(true)
  const [examenAbierto, setExamenAbierto] = useState<Examen | null>(null)

  // Calendario
  const [mes, setMes] = useState(dayjs().format('YYYY-MM'))
  const [calendario, setCalendario] = useState<Record<string, any[]>>({})

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

  const handleOpenExamen = (e: Examen) => {
    // Optimistic update: si está PENDIENTE mostrarlo como EN_PROCESO inmediatamente
    if (e.estado === 'PENDIENTE') {
      setExamenes(prev => prev.map(ex => ex.id === e.id ? { ...ex, estado: 'EN_PROCESO' } : ex))
    }
    setExamenAbierto(e)
  }

  const handleDrawerClose = () => {
    setExamenAbierto(null)
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
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: '1px solid #e5e7eb', background: '#fff',
        flexShrink: 0,
      }}>
        <Typography.Title level={4} style={{ margin: 0, color: '#1e3a5f' }}>
          Exámenes
        </Typography.Title>
        <Segmented
          value={vista}
          onChange={v => setVista(v as Vista)}
          options={[
            { value: 'board',       icon: <AppstoreOutlined />,  label: 'Board'      },
            { value: 'tabla',       icon: <TableOutlined />,     label: 'Tabla'      },
            { value: 'calendario',  icon: <CalendarOutlined />,  label: 'Calendario' },
          ]}
          size="middle"
        />
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24, width: '100%' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin size="large" /></div>
        ) : (
          <>
            {vista === 'board' && (
              <BoardExamenes
                examenes={examenes}
                onOpenExamen={handleOpenExamen}
                onUpdate={cargar}
              />
            )}

            {vista === 'tabla' && (
              <TablaExamenes
                examenes={examenes}
                onOpenExamen={handleOpenExamen}
                onUpdate={cargar}
              />
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
                  Los badges muestran exámenes pendientes/en proceso por día.
                </Typography.Text>
              </div>
            )}
          </>
        )}
      </div>

      <PanelIncidencias examenes={examenes} onAbrir={handleOpenExamen} />

      <ExamenDrawer
        examen={examenAbierto}
        onClose={handleDrawerClose}
        onUpdate={cargar}
      />
    </div>
  )
}
