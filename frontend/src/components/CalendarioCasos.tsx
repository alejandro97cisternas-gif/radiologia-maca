import { useState, useMemo } from 'react'
import { Calendar, Tag, Typography, Button, Tooltip, message, Badge, Segmented } from 'antd'
import { LeftOutlined, RightOutlined, PictureOutlined, DownloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'

const CL = 'America/Santiago'
const clDay = (iso: string) => dayjs.utc(iso).tz(CL).format('YYYY-MM-DD')
const clTime = (iso: string) => dayjs.utc(iso).tz(CL)
import type { Caso } from '../api/examenes'
import { descargarCaso, isVencido } from '../api/examenes'

type SubVista = 'mes' | 'semana'

// ── Chip compacto para vista mes ──────────────────────────────────────────────

function CasoChip({ caso, orden, onClick }: { caso: Caso; orden: number; onClick: () => void }) {
  const vencido = isVencido(caso)
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        background: vencido ? '#fff5f5' : '#fff',
        borderLeft: `3px solid ${vencido ? '#ef4444' : (caso.derivador_color || '#2563EB')}`,
        borderRadius: 3,
        padding: '2px 5px',
        marginBottom: 2,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      }}
    >
      <span style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', flexShrink: 0, minWidth: 14 }}>
        {String(orden).padStart(2, '0')}
      </span>
      <Badge
        status={vencido ? 'error' : caso.estado === 'EN_PROCESO' ? 'processing' : 'warning'}
        style={{ flexShrink: 0 }}
      />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: '#1e3a5f', fontWeight: 600 }}>
        {caso.paciente}
      </span>
    </div>
  )
}

// ── Card para vista semana ────────────────────────────────────────────────────

function CasoCardSemana({ caso, orden, onClick }: { caso: Caso; orden: number; onClick: () => void }) {
  const vencido = isVencido(caso)
  return (
    <div
      style={{
        background: vencido ? '#fff5f5' : '#fff',
        border: vencido ? '1px solid #fca5a5' : '1px solid #e2e8f0',
        borderLeft: `4px solid ${vencido ? '#ef4444' : (caso.derivador_color || '#e2e8f0')}`,
        borderRadius: 6,
        padding: '8px 10px',
        marginBottom: 6,
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', background: '#6b7280', borderRadius: 3, padding: '0 4px', lineHeight: '16px', flexShrink: 0 }}>
          #{String(orden).padStart(2, '0')}
        </span>
        <Typography.Text strong style={{ fontSize: 12, color: '#1e3a5f', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {caso.paciente}
        </Typography.Text>
        <Typography.Text style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>
          {clTime(caso.creado_en).format('HH:mm')}
        </Typography.Text>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 5 }}>
        {caso.examenes.map(e => (
          <Tag key={e.id} color="blue" style={{ margin: 0, fontSize: 10 }}>{e.tipo_examen}</Tag>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography.Text style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
          {caso.derivador}
        </Typography.Text>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Tooltip title="Ver carpeta">
            <PictureOutlined
              style={{ fontSize: 13, color: '#2563EB', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onClick() }}
            />
          </Tooltip>
          {caso.imagenes_count > 0 && (
            <Tooltip title="Descargar imágenes">
              <DownloadOutlined
                style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer' }}
                onClick={async e => {
                  e.stopPropagation()
                  try { await descargarCaso(caso) }
                  catch { message.error('Error al descargar') }
                }}
              />
            </Tooltip>
          )}
          {caso.tiene_informe && <span style={{ color: '#16a34a', fontSize: 12 }}>✓</span>}
          {vencido && <Tag color="red" style={{ margin: 0, fontSize: 9 }}>+48h</Tag>}
          {caso.incidencia_estado === 'ABIERTA' && <Tag color="error" style={{ margin: 0, fontSize: 10 }}>⚠</Tag>}
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  casos: Caso[]
  onOpenCaso: (c: Caso) => void
}

export default function CalendarioCasos({ casos, onOpenCaso }: Props) {
  const [subVista, setSubVista] = useState<SubVista>('mes')
  const [semanaInicio, setSemanaInicio] = useState<Dayjs>(() => {
    const hoy = dayjs()
    const dow = hoy.day() // 0=dom, 1=lun...
    return hoy.subtract(dow === 0 ? 6 : dow - 1, 'day').startOf('day')
  })

  // Agrupa por día Chile, ordena por hora de llegada (más antiguo primero)
  const porDia = useMemo(() => {
    const map = new Map<string, Caso[]>()
    for (const c of casos.filter(c => c.estado !== 'COMPLETADO')) {
      const key = clDay(c.creado_en)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    // Ordenar cada día: más antiguo primero (prioridad de atención)
    for (const [key, list] of map)
      map.set(key, list.sort((a, b) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime()))
    return map
  }, [casos])

  // ── Vista mes ──────────────────────────────────────────────────────────────

  const cellRender = (current: Dayjs, info: any) => {
    if (info?.type && info.type !== 'date') return info.originNode
    const key = current.tz ? current.tz(CL).format('YYYY-MM-DD') : current.format('YYYY-MM-DD')
    const dayCasos = porDia.get(key) ?? []
    if (!dayCasos.length) return null
    const MAX = 3
    return (
      <div style={{ padding: '2px 4px' }}>
        {dayCasos.slice(0, MAX).map((c, i) => (
          <CasoChip key={c.caso_id} caso={c} orden={i + 1} onClick={() => onOpenCaso(c)} />
        ))}
        {dayCasos.length > MAX && (
          <Typography.Text style={{ fontSize: 10, color: '#6b7280', paddingLeft: 4 }}>
            +{dayCasos.length - MAX} más
          </Typography.Text>
        )}
      </div>
    )
  }

  // ── Vista semana ───────────────────────────────────────────────────────────

  const diasSemana = Array.from({ length: 7 }, (_, i) => semanaInicio.add(i, 'day'))
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Segmented
          value={subVista}
          onChange={v => setSubVista(v as SubVista)}
          options={[{ value: 'mes', label: 'Mes' }, { value: 'semana', label: 'Semana' }]}
          size="small"
        />
        {subVista === 'semana' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button size="small" icon={<LeftOutlined />} onClick={() => setSemanaInicio(d => d.subtract(1, 'week'))} />
            <Typography.Text style={{ fontWeight: 600, fontSize: 13, minWidth: 180, textAlign: 'center' }}>
              {semanaInicio.format('DD MMM')} — {semanaInicio.add(6, 'day').format('DD MMM YYYY')}
            </Typography.Text>
            <Button size="small" icon={<RightOutlined />} onClick={() => setSemanaInicio(d => d.add(1, 'week'))} />
            <Button size="small" type="link" onClick={() => {
              const hoy = dayjs(); const dow = hoy.day()
              setSemanaInicio(hoy.subtract(dow === 0 ? 6 : dow - 1, 'day').startOf('day'))
            }}>Hoy</Button>
          </div>
        )}
      </div>

      {/* Vista mes */}
      {subVista === 'mes' && (
        <Calendar
          cellRender={cellRender}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}
        />
      )}

      {/* Vista semana */}
      {subVista === 'semana' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {diasSemana.map((dia, idx) => {
            const key = dia.tz ? dia.tz(CL).format('YYYY-MM-DD') : dia.format('YYYY-MM-DD')
            const dayCasos = porDia.get(key) ?? []
            const esHoy = dia.isSame(dayjs(), 'day')
            return (
              <div key={key} style={{ flex: 1, minWidth: 0 }}>
                {/* Cabecera día */}
                <div style={{
                  textAlign: 'center',
                  padding: '8px 4px 6px',
                  marginBottom: 8,
                  borderRadius: 8,
                  background: esHoy ? '#2563EB' : '#f8fafc',
                  border: `1px solid ${esHoy ? '#2563EB' : '#e2e8f0'}`,
                }}>
                  <Typography.Text style={{ fontSize: 10, color: esHoy ? 'rgba(255,255,255,0.8)' : '#6b7280', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {DIAS[idx]}
                  </Typography.Text>
                  <Typography.Text strong style={{ fontSize: 18, color: esHoy ? '#fff' : '#1e3a5f', lineHeight: 1.2, display: 'block' }}>
                    {dia.format('D')}
                  </Typography.Text>
                  {dayCasos.length > 0 && (
                    <Badge count={dayCasos.length} color={esHoy ? 'white' : '#2563EB'} style={{ fontSize: 9 }} />
                  )}
                </div>

                {/* Cards del día */}
                <div style={{ minHeight: 60 }}>
                  {dayCasos.map((c, i) => (
                    <CasoCardSemana key={c.caso_id} caso={c} orden={i + 1} onClick={() => onOpenCaso(c)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
