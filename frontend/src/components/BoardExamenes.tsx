import { useMemo, useState } from 'react'
import { Tag, Typography, Badge, Tooltip, message } from 'antd'
import { PictureOutlined, DownloadOutlined } from '@ant-design/icons'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { Examen } from '../api/examenes'
import { patchEstadoExamen, descargarImagenes } from '../api/examenes'

type Estado = 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO'

const COLUMNAS: { key: Estado; label: string; color: string; bg: string }[] = [
  { key: 'PENDIENTE',   label: 'Pendiente',   color: '#d97706', bg: '#fffbeb' },
  { key: 'EN_PROCESO',  label: 'En proceso',  color: '#2563EB', bg: '#eff6ff' },
  { key: 'COMPLETADO',  label: 'Completado',  color: '#16a34a', bg: '#f0fdf4' },
]

// ── Card ─────────────────────────────────────────────────────────────────────

function ExamenCard({
  examen,
  onClick,
  dragging,
}: {
  examen: Examen
  onClick: () => void
  dragging: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: examen.id,
    data: { examen },
  })

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        opacity: isDragging ? 0.35 : 1,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderLeft: `4px solid ${examen.derivador_color || '#e2e8f0'}`,
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
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <Typography.Text
          strong
          style={{ fontSize: 13, cursor: 'pointer', color: '#1e3a5f' }}
          onClick={(ev) => { ev.stopPropagation(); onClick() }}
        >
          {examen.paciente}
        </Typography.Text>
        <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{examen.tipo_examen}</Tag>
      </div>

      {/* Clínica */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: examen.derivador_color || '#9ca3af', flexShrink: 0 }} />
        <Typography.Text style={{ fontSize: 12, color: '#6b7280' }}>{examen.derivador}</Typography.Text>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Typography.Text style={{ fontSize: 11, color: '#9ca3af' }}>
            {new Date(examen.creado_en).toLocaleDateString('es-CL')}
            {' · '}{examen.imagenes_count} img
          </Typography.Text>
          <Tag
            color={(examen.version ?? 0) === 0 ? 'default' : 'orange'}
            style={{ margin: 0, fontSize: 10, fontWeight: 600 }}
          >
            v{examen.version ?? 0}
          </Tag>
          {examen.incidencia_estado === 'ABIERTA' && (
            <Tag color="error" style={{ margin: 0, fontSize: 10 }}>⚠ Incidencia</Tag>
          )}
          {examen.incidencia_estado === 'RESUELTA' && (
            <Tag color="success" style={{ margin: 0, fontSize: 10 }}>✓ Resuelta</Tag>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Tooltip title="Ver carpeta">
            <PictureOutlined
              style={{ color: '#2563EB', cursor: 'pointer', fontSize: 14 }}
              onClick={(ev) => { ev.stopPropagation(); onClick() }}
            />
          </Tooltip>
          {examen.imagenes_count > 0 && (
            <Tooltip title="Descargar imágenes">
              <DownloadOutlined
                style={{ color: '#6b7280', cursor: 'pointer', fontSize: 13 }}
                onClick={async (ev) => {
                  ev.stopPropagation()
                  try { await descargarImagenes(examen) }
                  catch { message.error('Error al descargar') }
                }}
              />
            </Tooltip>
          )}
          {examen.tiene_informe && (
            <span style={{ fontSize: 13, color: '#16a34a' }}>✓</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Columna ───────────────────────────────────────────────────────────────────

function Columna({
  col,
  examenes,
  onOpenExamen,
  onUpdate,
  draggingId,
}: {
  col: typeof COLUMNAS[number]
  examenes: Examen[]
  onOpenExamen: (e: Examen) => void
  draggingId: number | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key })

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Cabecera columna */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', marginBottom: 8,
        borderRadius: 8, background: col.bg,
        border: `1px solid ${col.color}22`,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.color }} />
        <Typography.Text strong style={{ color: col.color, fontSize: 13 }}>{col.label}</Typography.Text>
        <Badge count={examenes.length} color={col.color} style={{ marginLeft: 'auto' }} />
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        style={{
          minHeight: 120,
          padding: '4px 0',
          borderRadius: 8,
          background: isOver ? `${col.color}0A` : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        {examenes.map(e => (
          <ExamenCard
            key={e.id}
            examen={e}
            onClick={() => onOpenExamen(e)}
            dragging={draggingId === e.id}
          />
        ))}
      </div>
    </div>
  )
}

// ── Board ─────────────────────────────────────────────────────────────────────

interface Props {
  examenes: Examen[]
  onOpenExamen: (e: Examen) => void
  onUpdate: () => void
}

export default function BoardExamenes({ examenes, onOpenExamen, onUpdate }: Props) {
  const [draggingId, setDraggingId] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const porColumna = useMemo(() => {
    const map: Record<Estado, Examen[]> = { PENDIENTE: [], EN_PROCESO: [], COMPLETADO: [] }
    for (const e of examenes) map[e.estado as Estado]?.push(e)
    return map
  }, [examenes])

  const draggingExamen = examenes.find(e => e.id === draggingId) ?? null

  const handleDragStart = (ev: DragStartEvent) => {
    setDraggingId(ev.active.id as number)
  }

  const handleDragEnd = async (ev: DragEndEvent) => {
    setDraggingId(null)
    const { active, over } = ev
    if (!over) return
    const nuevoEstado = over.id as Estado
    const examen = examenes.find(e => e.id === active.id)
    if (!examen || examen.estado === nuevoEstado) return
    try {
      await patchEstadoExamen(examen.id, nuevoEstado)
      onUpdate()
    } catch {
      message.error('No se pudo actualizar el estado')
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', width: '100%' }}>
        {COLUMNAS.map(col => (
          <Columna
            key={col.key}
            col={col}
            examenes={porColumna[col.key]}
            onOpenExamen={onOpenExamen}
            onUpdate={onUpdate}
            draggingId={draggingId}
          />
        ))}
      </div>

      <DragOverlay>
        {draggingExamen && (
          <div style={{
            background: '#fff', border: '2px solid #2563EB',
            borderRadius: 8, padding: '10px 12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            width: 220, opacity: 0.95,
          }}>
            <Typography.Text strong style={{ fontSize: 13 }}>{draggingExamen.paciente}</Typography.Text>
            <br />
            <Tag color="blue" style={{ marginTop: 4 }}>{draggingExamen.tipo_examen}</Tag>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
