import { useState } from 'react'
import { Progress } from 'antd'
import { CloudUploadOutlined, MinusOutlined } from '@ant-design/icons'
import { useUpload } from '../context/UploadContext'

function fmtSpeed(kbs: number) {
  if (kbs >= 1024) return `${(kbs / 1024).toFixed(1)} MB/s`
  return `${Math.round(kbs)} KB/s`
}

function fmtEta(secs: number) {
  if (secs <= 0 || !isFinite(secs) || secs > 7200) return ''
  if (secs < 60) return `~${Math.round(secs)}s`
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `~${m}:${String(s).padStart(2, '0')} min`
}

export default function UploadFloatingPanel() {
  const { tasks } = useUpload()
  const [minimized, setMinimized] = useState(false)

  if (tasks.length === 0) return null

  const active = tasks.filter(t => t.estado === 'subiendo').length
  const hasErrors = tasks.some(t => t.estado === 'error')
  const badgeColor = active > 0 ? '#1d4ed8' : hasErrors ? '#dc2626' : '#16a34a'

  if (minimized) {
    return (
      <div
        onClick={() => setMinimized(false)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1050,
          background: badgeColor, color: 'white',
          borderRadius: 24, padding: '8px 18px',
          cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 13, fontWeight: 600,
        }}
      >
        <CloudUploadOutlined />
        {active > 0 ? `Subiendo ${active} archivo${active !== 1 ? 's' : ''}` : hasErrors ? 'Error en subida' : 'Subidas completadas'}
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 1050,
      background: 'white', borderRadius: 14, width: 330,
      boxShadow: '0 8px 28px rgba(0,0,0,0.18)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', background: '#1e40af', color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <CloudUploadOutlined />
          {active > 0 ? `Subiendo ${tasks.length} archivo${tasks.length !== 1 ? 's' : ''}` : hasErrors ? 'Subida con errores' : 'Subidas completadas'}
        </div>
        <button
          onClick={() => setMinimized(true)}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, lineHeight: 1 }}
        >
          <MinusOutlined />
        </button>
      </div>

      {/* Task list */}
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {tasks.map(task => (
          <div key={task.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
            {/* Filename + estado */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{
                fontSize: 12, fontWeight: 500,
                maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {task.nombre}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600, flexShrink: 0, marginLeft: 8,
                color: task.estado === 'error' ? '#dc2626' : task.estado === 'completado' ? '#16a34a' : '#2563eb',
              }}>
                {task.estado === 'completado' ? '✓ Listo' : task.estado === 'error' ? '✗ Error' : `${task.pct}%`}
              </span>
            </div>

            <Progress
              percent={task.pct}
              size="small"
              showInfo={false}
              status={task.estado === 'error' ? 'exception' : task.estado === 'completado' ? 'success' : 'active'}
            />

            {/* Velocidad y ETA */}
            {task.estado === 'subiendo' && task.speedKBs > 1 && (
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
                {fmtSpeed(task.speedKBs)}
                {fmtEta(task.etaSeg) ? ` · quedan ${fmtEta(task.etaSeg)}` : ''}
              </div>
            )}

            {task.estado === 'error' && (
              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>
                {task.error ?? 'Error desconocido'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
