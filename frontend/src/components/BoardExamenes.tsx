import { useMemo, useState } from 'react'
import { Tag, Typography, Badge, Tooltip, message } from 'antd'
import { PictureOutlined, DownloadOutlined } from '@ant-design/icons'
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, useDroppable, useDraggable,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { Caso } from '../api/examenes'
import { patchEstadoCaso, descargarCaso, isVencido } from '../api/examenes'

type Estado = 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO'

const COLUMNAS: { key: Estado; label: string; color: string; bg: string }[] = [
  { key: 'PENDIENTE',  label: 'Pendiente',  color: '#d97706', bg: '#fffbeb' },
  { key: 'EN_PROCESO', label: 'En proceso', color: '#2563EB', bg: '#eff6ff' },
  { key: 'COMPLETADO', label: 'Completado', color: '#16a34a', bg: '#f0fdf4' },
]

function CasoCard({ caso, onClick, dragging }: { caso: Caso; onClick: () => void; dragging: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: caso.caso_id,
    data: { caso },
  })
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined
  const vencido = isVencido(caso)

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        opacity: isDragging ? 0.35 : 1,
        background: vencido ? '#fff5f5' : '#fff',
        border: vencido ? '1px solid #fca5a5' : '1px solid #e2e8f0',
        borderLeft: `4px solid ${vencido ? '#ef4444' : (caso.derivador_color || '#e2e8f0')}`,
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        cursor: 'grab',
        boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
        userSelect: 'none',
      }}
      {...listeners}
      {...attributes}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <Typography.Text
          strong
          style={{ fontSize: 13, cursor: 'pointer', color: '#1e3a5f' }}
          onClick={ev => { ev.stopPropagation(); onClick() }}
        >
          {caso.paciente}
        </Typography.Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'flex-end', maxWidth: 160 }}>
          {caso.examenes.map(e => (
            <Tag key={e.id} color="blue" style={{ margin: 0, fontSize: 10 }}>{e.tipo_examen}</Tag>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: caso.derivador_color || '#9ca3af', flexShrink: 0 }} />
        <Typography.Text style={{ fontSize: 12, color: '#6b7280' }}>{caso.derivador}</Typography.Text>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Typography.Text style={{ fontSize: 11, color: '#9ca3af' }}>
            {new Date(caso.creado_en).toLocaleDateString('es-CL')}
            {' · '}{caso.imagenes_count} img
          </Typography.Text>
          {vencido && <Tag color="red" style={{ margin: 0, fontSize: 10 }}>⏰ +48h</Tag>}
          {caso.incidencia_estado === 'ABIERTA' && <Tag color="error" style={{ margin: 0, fontSize: 10 }}>⚠ Incidencia</Tag>}
          {caso.incidencia_estado === 'RESUELTA' && <Tag color="success" style={{ margin: 0, fontSize: 10 }}>✓ Resuelta</Tag>}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Tooltip title="Ver carpeta">
            <PictureOutlined
              style={{ color: '#2563EB', cursor: 'pointer', fontSize: 14 }}
              onClick={ev => { ev.stopPropagation(); onClick() }}
            />
          </Tooltip>
          {caso.imagenes_count > 0 && (
            <Tooltip title="Descargar imágenes">
              <DownloadOutlined
                style={{ color: '#6b7280', cursor: 'pointer', fontSize: 13 }}
                onClick={async ev => {
                  ev.stopPropagation()
                  const hide = message.loading('Preparando descarga…', 0)
                  try { await descargarCaso(caso) }
                  catch { message.error('Error al descargar') }
                  finally { hide() }
                }}
              />
            </Tooltip>
          )}
          {caso.tiene_informe && <span style={{ fontSize: 13, color: '#16a34a' }}>✓</span>}
        </div>
      </div>
    </div>
  )
}

function Columna({ col, casos, onOpenCaso, draggingId }: {
  col: typeof COLUMNAS[number]
  casos: Caso[]
  onOpenCaso: (c: Caso) => void
  draggingId: string | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key })
  return (
    <div id={`board-${col.key.toLowerCase().replace('_', '-')}`} style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', marginBottom: 8,
        borderRadius: 8, background: col.bg, border: `1px solid ${col.color}22`,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.color }} />
        <Typography.Text strong style={{ color: col.color, fontSize: 13 }}>{col.label}</Typography.Text>
        <Badge count={casos.length} color={col.color} style={{ marginLeft: 'auto' }} />
      </div>
      <div
        ref={setNodeRef}
        style={{
          minHeight: 120, padding: '4px 0', borderRadius: 8,
          background: isOver ? `${col.color}0A` : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        {casos.map(c => (
          <CasoCard key={c.caso_id} caso={c} onClick={() => onOpenCaso(c)} dragging={draggingId === c.caso_id} />
        ))}
      </div>
    </div>
  )
}

interface Props {
  casos: Caso[]
  onOpenCaso: (c: Caso) => void
  onUpdate: () => void
}

export default function BoardExamenes({ casos, onOpenCaso, onUpdate }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const porColumna = useMemo(() => {
    const map: Record<Estado, Caso[]> = { PENDIENTE: [], EN_PROCESO: [], COMPLETADO: [] }
    for (const c of casos) map[c.estado as Estado]?.push(c)
    return map
  }, [casos])

  const draggingCaso = casos.find(c => c.caso_id === draggingId) ?? null

  const handleDragStart = (ev: DragStartEvent) => setDraggingId(ev.active.id as string)

  const handleDragEnd = async (ev: DragEndEvent) => {
    setDraggingId(null)
    const { active, over } = ev
    if (!over) return
    const nuevoEstado = over.id as Estado
    const caso = casos.find(c => c.caso_id === active.id)
    if (!caso || caso.estado === nuevoEstado) return
    try {
      await patchEstadoCaso(caso.caso_id, nuevoEstado)
      onUpdate()
    } catch {
      message.error('No se pudo actualizar el estado')
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', width: '100%' }}>
        {COLUMNAS.map(col => (
          <Columna key={col.key} col={col} casos={porColumna[col.key]} onOpenCaso={onOpenCaso} draggingId={draggingId} />
        ))}
      </div>
      <DragOverlay>
        {draggingCaso && (
          <div style={{ background: '#fff', border: '2px solid #2563EB', borderRadius: 8, padding: '10px 12px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', width: 220, opacity: 0.95 }}>
            <Typography.Text strong style={{ fontSize: 13 }}>{draggingCaso.paciente}</Typography.Text>
            <br />
            {draggingCaso.examenes.map(e => <Tag key={e.id} color="blue" style={{ marginTop: 4 }}>{e.tipo_examen}</Tag>)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
