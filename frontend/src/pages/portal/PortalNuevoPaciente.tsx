import { useState, useRef, useCallback, useEffect } from 'react'
import { useTutorialNuevoCaso, reiniciarTutorialNuevoCaso } from '../../hooks/useTutorialDerivador'
import {
  Steps, Form, Input, Button, Card, DatePicker, Select,
  message, Typography, Tag, Alert, Spin, Progress, Image,
  Divider, Space, Modal, Checkbox,
} from 'antd'
import { InboxOutlined, PlusOutlined, DeleteOutlined, BellOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  portalBuscarPaciente, portalCrearPaciente, portalCrearExamen,
  portalConfirmarTareas, portalNotificarCaso,
  portalGetTipos,
} from '../../api/portal'
import { useUpload } from '../../context/UploadContext'
import { readDropItems, filterDicomFromFiles, extractDicomFromZip } from '../../utils/dicomUpload'
import NovexBadge from '../../components/NovexBadge'
import { normalizarRut } from '../../utils/rut'

interface TipoExamen { nombre: string; dimension: '2D' | '3D' | 'AMBOS'; categoria?: string; custom: boolean }

const dimension = (tipo: string, tiposMap?: Map<string, '2D' | '3D' | 'AMBOS'>): '2D' | '3D' | 'AMBOS' =>
  tiposMap?.get(tipo) ?? '2D'

const BIMAXILAR = 'CBCT-BI'

interface ArchivoSubida {
  id: string
  file: File
  subtipo: 'imagen' | 'dicom' | 'preview'
  ubicacion: string
  dimFolder?: '2D' | '3D'
  progreso: number
  estado: 'pendiente' | 'subiendo' | 'ok' | 'error'
  preview?: string
  startedAt?: number
}

interface ExamenCard {
  uid: string
  tipo_examen: string
  examen_id: number | null
  archivos: ArchivoSubida[]
  creando: boolean
}

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Drop zone reutilizable ────────────────────────────────────────────────────

function DropZone({
  label, accept, onFiles, folderScan = false,
}: {
  label: string
  accept: string
  onFiles: (files: File[]) => void
  folderScan?: boolean
}) {
  const mainRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)
  const [procesando, setProcesando] = useState(false)

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    if (folderScan && e.dataTransfer.items?.length > 0) {
      setProcesando(true)
      try {
        // Detectar si soltaron un ZIP
        const firstFile = e.dataTransfer.files[0]
        if (e.dataTransfer.files.length === 1 && firstFile?.name.toLowerCase().endsWith('.zip')) {
          const { dicom, skipped, total } = await extractDicomFromZip(firstFile)
          if (skipped > 0) message.info(`${skipped} de ${total} archivos omitidos (no son DICOM)`)
          if (dicom.length) { message.success(`${dicom.length} DICOMs extraídos del ZIP`); onFiles(dicom) }
          else message.warning('No se encontraron DICOMs en el ZIP')
          return
        }
        const all = await readDropItems(e.dataTransfer.items)
        const { dicom, skipped } = await filterDicomFromFiles(all)
        if (skipped > 0) message.info(`${skipped} archivo${skipped !== 1 ? 's' : ''} omitido${skipped !== 1 ? 's' : ''} (no son DICOM)`)
        if (dicom.length) onFiles(dicom)
      } finally {
        setProcesando(false)
      }
    } else {
      onFiles(Array.from(e.dataTransfer.files))
    }
  }

  const handleFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return
    setProcesando(true)
    try {
      const { dicom, skipped } = await filterDicomFromFiles(Array.from(e.target.files))
      if (skipped > 0) message.info(`${skipped} archivo${skipped !== 1 ? 's' : ''} omitido${skipped !== 1 ? 's' : ''} (no son DICOM)`)
      if (dicom.length) onFiles(dicom)
    } finally {
      setProcesando(false)
      e.target.value = ''
    }
  }

  const handleZipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setProcesando(true)
    try {
      const { dicom, skipped, total } = await extractDicomFromZip(file)
      if (skipped > 0) message.info(`${skipped} de ${total} archivos omitidos (no son DICOM)`)
      if (dicom.length) { message.success(`${dicom.length} DICOMs extraídos del ZIP`); onFiles(dicom) }
      else message.warning('No se encontraron DICOMs en el ZIP')
    } finally {
      setProcesando(false)
      e.target.value = ''
    }
  }

  if (folderScan) {
    return (
      <div>
        <input ref={mainRef} type="file" multiple accept={accept} style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.length) onFiles(Array.from(e.target.files)); e.target.value = '' }} />
        <input ref={folderRef} type="file" multiple style={{ display: 'none' }} onChange={handleFolderChange} />
        <input ref={zipRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={handleZipChange} />

        {/* Zona drag & drop */}
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          style={{
            border: '2px dashed #a5b4fc', borderRadius: 8, padding: '14px 10px',
            textAlign: 'center', background: procesando ? '#eef2ff' : '#fafafe',
            transition: 'background 0.2s',
          }}
        >
          {procesando
            ? <div style={{ fontSize: 12, color: '#6366f1' }}>Procesando archivos…</div>
            : <>
                <InboxOutlined style={{ fontSize: 20, color: '#818cf8' }} />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  Arrastra aquí una <strong>carpeta</strong> o un <strong>ZIP</strong>
                </div>
              </>
          }
        </div>

        {/* Botones explícitos */}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button
            type="button"
            onClick={() => { folderRef.current?.setAttribute('webkitdirectory', ''); folderRef.current?.click() }}
            style={{
              flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600,
              border: '1px solid #c7d2fe', borderRadius: 6, background: '#eef2ff',
              color: '#4f46e5', cursor: 'pointer',
            }}
          >
            📂 Seleccionar carpeta
          </button>
          <button
            type="button"
            onClick={() => zipRef.current?.click()}
            style={{
              flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600,
              border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb',
              color: '#374151', cursor: 'pointer',
            }}
          >
            🗜 Abrir ZIP
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      onClick={() => mainRef.current?.click()}
      style={{
        border: '2px dashed #d1d5db', borderRadius: 8, padding: '14px',
        textAlign: 'center', cursor: 'pointer', background: '#fafafa',
      }}
    >
      <input
        ref={mainRef}
        type="file" multiple accept={accept}
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.length) onFiles(Array.from(e.target.files)); e.target.value = '' }}
      />
      <InboxOutlined style={{ fontSize: 22, color: '#9ca3af' }} />
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{label}</div>
    </div>
  )
}

// ── Lista de archivos subidos ─────────────────────────────────────────────────

function fmtEta(secs: number): string {
  if (secs < 60) return `~${secs}s`
  return `~${Math.ceil(secs / 60)} min`
}

function ListaArchivos({ archivos, resumen = false }: { archivos: ArchivoSubida[], resumen?: boolean }) {
  if (!archivos.length) return null

  if (resumen) {
    const total = archivos.length
    const ok = archivos.filter(a => a.estado === 'ok').length
    const errores = archivos.filter(a => a.estado === 'error').length
    const activo = archivos.find(a => a.estado === 'subiendo')
    const terminado = ok + errores === total && !activo

    if (terminado) {
      return (
        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
          <Tag color="success" style={{ margin: 0 }}>✓ {ok} archivo{ok !== 1 ? 's' : ''}</Tag>
          {errores > 0 && <Tag color="error" style={{ margin: 0 }}>✕ {errores} error{errores !== 1 ? 'es' : ''}</Tag>}
        </div>
      )
    }

    const pct = total > 0
      ? Math.round(((ok + (activo ? activo.progreso / 100 : 0)) / total) * 100)
      : 0

    let eta = ''
    const primerInicio = archivos.find(a => a.startedAt)?.startedAt
    if (primerInicio && ok > 0) {
      const elapsed = (Date.now() - primerInicio) / 1000
      const restantes = total - ok - (activo ? 1 : 0)
      if (restantes > 0) eta = fmtEta(Math.round((elapsed / ok) * restantes))
    }

    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <Typography.Text style={{ fontSize: 12, color: '#6b7280' }}>
            Subiendo {Math.min(ok + 1, total)} / {total}
          </Typography.Text>
          <Typography.Text style={{ fontSize: 12, color: '#6b7280' }}>
            {pct}%{eta ? ` · ${eta}` : ''}
          </Typography.Text>
        </div>
        <Progress percent={pct} showInfo={false} size="small"
          status={errores > 0 ? 'exception' : 'active'} />
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10 }}>
      {archivos.map(a => (
        <div key={a.id} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {a.preview && <img src={a.preview} style={{ width: 26, height: 26, objectFit: 'cover', borderRadius: 3 }} />}
            <Typography.Text ellipsis style={{ flex: 1, fontSize: 12 }}>{a.file.name}</Typography.Text>
            {a.ubicacion && <Tag color="geekblue" style={{ margin: 0, fontSize: 10 }}>{a.ubicacion}</Tag>}
            <Tag color={a.estado === 'ok' ? 'success' : a.estado === 'error' ? 'error' : 'processing'} style={{ margin: 0, fontSize: 11 }}>
              {a.estado === 'ok' ? '✓' : a.estado === 'error' ? 'Error' : `${a.progreso}%`}
            </Tag>
          </div>
          {a.estado === 'subiendo' && <Progress percent={a.progreso} size="small" showInfo={false} style={{ marginTop: 2 }} />}
        </div>
      ))}
    </div>
  )
}

// ── Componente card de un examen ──────────────────────────────────────────────

function CardExamen({
  card, pacienteId, casoId, puedeEliminar, onChange, onDelete, tipos, tiposMap,
  replicar, otrosExamenes, esLider,
}: {
  card: ExamenCard
  pacienteId: number
  casoId: string
  puedeEliminar: boolean
  onChange: (uid: string, update: Partial<ExamenCard> | ((c: ExamenCard) => Partial<ExamenCard>)) => void
  onDelete: (uid: string) => void
  tipos: TipoExamen[]
  tiposMap: Map<string, '2D' | '3D' | 'AMBOS'>
  replicar: boolean
  otrosExamenes: ExamenCard[]
  esLider: boolean
}) {
  const { startUpload } = useUpload()
  const dim = card.tipo_examen ? dimension(card.tipo_examen, tiposMap) : null
  const esBimax = card.tipo_examen === BIMAXILAR
  const tiposUsados = new Set(
    otrosExamenes.filter(c => c.uid !== card.uid && c.tipo_examen).map(c => c.tipo_examen)
  )

  const seleccionarTipo = async (tipo: string) => {
    onChange(card.uid, { tipo_examen: tipo, creando: true })
    try {
      const e = await portalCrearExamen({ paciente_id: pacienteId, tipo_examen: tipo, caso_id: casoId })
      onChange(card.uid, { examen_id: e.id, creando: false })
      // Si replicar está ON, copia los archivos del primer examen con imágenes ya subidas
      if (replicar) {
        const fuente = otrosExamenes.find(c => c.uid !== card.uid && c.examen_id && c.archivos.some(a => a.estado === 'ok'))
        if (fuente) {
          for (const a of fuente.archivos.filter(ar => ar.estado === 'ok')) {
            try {
              await portalSubirImagen(e.id, a.subtipo, a.file, undefined, a.ubicacion, a.dimFolder)
            } catch { /* silent */ }
          }
          message.success(`Imágenes replicadas a "${tipo}"`)
        }
      }
    } catch {
      message.error('Error al crear el examen')
      onChange(card.uid, { tipo_examen: '', creando: false })
    }
  }

  const subirArchivos = (files: File[], subtipo: ArchivoSubida['subtipo'], ubicacion = '', dimFolder?: '2D' | '3D') => {
    if (!card.examen_id) return
    const nuevos: ArchivoSubida[] = files.map(f => ({
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      file: f, subtipo, ubicacion, dimFolder, progreso: 0, estado: 'pendiente' as const,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }))

    onChange(card.uid, { archivos: [...card.archivos, ...nuevos] })

    const dimArg = dim === 'AMBOS' ? dimFolder : undefined

    for (const item of nuevos) {
      const patch = (p: Partial<ArchivoSubida>) =>
        onChange(card.uid, c => ({
          archivos: c.archivos.map(a => a.id === item.id ? { ...a, ...p } : a),
        }))

      patch({ estado: 'subiendo', startedAt: Date.now() })

      startUpload({
        examenId: card.examen_id!,
        file: item.file,
        subtipo: item.subtipo,
        ubicacion: item.ubicacion,
        dimOverride: dimArg,
        onProgress: pct => patch({ progreso: pct }),
        onComplete: () => {
          patch({ estado: 'ok', progreso: 100 })
          if (replicar) {
            for (const otro of otrosExamenes) {
              if (otro.uid !== card.uid && otro.examen_id) {
                startUpload({ examenId: otro.examen_id, file: item.file, subtipo: item.subtipo, ubicacion: item.ubicacion, dimOverride: dimArg })
              }
            }
          }
        },
        onError: () => patch({ estado: 'error' }),
      })
    }
  }

  const archivosOk = card.archivos.filter(a => a.estado === 'ok').length

  return (
    <div style={{
      border: `1px solid ${archivosOk > 0 ? '#86efac' : '#e2e8f0'}`,
      borderRadius: 10, padding: 16,
      background: archivosOk > 0 ? '#f0fdf4' : '#fff',
      transition: 'all 0.2s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Select
          id="selector-tipo"
          placeholder="Tipo de examen…"
          value={card.tipo_examen || undefined}
          onChange={seleccionarTipo}
          loading={card.creando}
          disabled={!!card.tipo_examen}
          showSearch
          filterOption={(input, option) =>
            String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
          style={{ flex: 1 }}
          options={(() => {
            const categorias = [...new Set(tipos.map(t => t.categoria).filter(Boolean))]
            return categorias.map(cat => ({
              label: cat,
              options: tipos
                .filter(t => t.categoria === cat)
                .map(t => ({ value: t.nombre, label: t.nombre, disabled: tiposUsados.has(t.nombre) })),
            }))
          })()}
        />
        {card.tipo_examen && dim === 'AMBOS' && (
          <>
            <Tag color="blue" style={{ margin: 0 }}>2D</Tag>
            <Tag color="purple" style={{ margin: 0 }}>3D</Tag>
          </>
        )}
        {card.tipo_examen && dim !== 'AMBOS' && (
          <Tag color={dim === '3D' ? 'purple' : 'blue'} style={{ margin: 0 }}>{dim}</Tag>
        )}
        {archivosOk > 0 && <Tag color="success" style={{ margin: 0 }}>✓ {archivosOk}</Tag>}
        {puedeEliminar && (
          <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => onDelete(card.uid)} />
        )}
      </div>

      {/* Bloqueado: imágenes se replican desde el primer examen */}
      {card.examen_id && replicar && !esLider && (
        <div style={{ padding: '10px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px dashed #86efac' }}>
          <Typography.Text style={{ fontSize: 12, color: '#16a34a' }}>
            ↩ Las imágenes se replicarán automáticamente desde el primer examen.
          </Typography.Text>
          <ListaArchivos archivos={card.archivos} />
        </div>
      )}

      {/* 2D puro */}
      {card.examen_id && (!replicar || esLider) && dim === '2D' && (
        <>
          <DropZone accept=".jpg,.jpeg,.png" label="Arrastra imágenes JPG/PNG" onFiles={files => subirArchivos(files, 'imagen')} />
          <ListaArchivos archivos={card.archivos} />
        </>
      )}

      {/* 3D puro (no bimaxilar) */}
      {card.examen_id && (!replicar || esLider) && dim === '3D' && !esBimax && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <Typography.Text strong style={{ fontSize: 12, color: '#7c3aed', display: 'block', marginBottom: 6 }}>
              🧊 DICOM (.dcm)
            </Typography.Text>
            <DropZone accept=".dcm,.dicom" label="Arrastra archivos .dcm o carpeta" onFiles={files => subirArchivos(files, 'dicom')} folderScan />
            <ListaArchivos archivos={card.archivos.filter(a => a.subtipo === 'dicom')} resumen />
          </div>
          <div>
            <Typography.Text strong style={{ fontSize: 12, color: '#059669', display: 'block', marginBottom: 6 }}>
              🖼 Preview (capturas)
            </Typography.Text>
            <DropZone accept=".jpg,.jpeg,.png" label="Fotos / capturas del DICOM" onFiles={files => subirArchivos(files, 'preview')} />
            <ListaArchivos archivos={card.archivos.filter(a => a.subtipo === 'preview')} />
          </div>
        </div>
      )}

      {/* Bimaxilar: superior / inferior + preview */}
      {card.examen_id && (!replicar || esLider) && esBimax && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {(['superior', 'inferior'] as const).map(ub => (
              <div key={ub}>
                <Typography.Text strong style={{ fontSize: 12, textTransform: 'capitalize', display: 'block', marginBottom: 6 }}>
                  {ub === 'superior' ? '⬆ Superior' : '⬇ Inferior'}
                </Typography.Text>
                <DropZone accept=".dcm,.dicom" label={`DICOM ${ub} o carpeta`} onFiles={files => subirArchivos(files, 'dicom', ub)} folderScan />
                <ListaArchivos archivos={card.archivos.filter(a => a.ubicacion === ub)} resumen />
              </div>
            ))}
          </div>
          <Typography.Text strong style={{ fontSize: 12, color: '#059669', display: 'block', marginBottom: 6 }}>
            🖼 Preview (capturas)
          </Typography.Text>
          <DropZone accept=".jpg,.jpeg,.png" label="Fotos / capturas del DICOM" onFiles={files => subirArchivos(files, 'preview')} />
          <ListaArchivos archivos={card.archivos.filter(a => a.subtipo === 'preview')} />
        </div>
      )}

      {/* AMBOS: 2D imagen | columna 3D con DICOM + Preview */}
      {card.examen_id && (!replicar || esLider) && dim === 'AMBOS' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <Typography.Text strong style={{ fontSize: 12, color: '#2563EB', display: 'block', marginBottom: 6 }}>
              📷 2D — JPG/PNG
            </Typography.Text>
            <DropZone accept=".jpg,.jpeg,.png" label="Arrastra imágenes 2D" onFiles={files => subirArchivos(files, 'imagen', '', '2D')} />
            <ListaArchivos archivos={card.archivos.filter(a => a.dimFolder === '2D')} />
          </div>
          <div>
            <Typography.Text strong style={{ fontSize: 12, color: '#7c3aed', display: 'block', marginBottom: 6 }}>
              🧊 3D — DICOM
            </Typography.Text>
            <DropZone accept=".dcm,.dicom" label="Arrastra archivos .dcm o carpeta" onFiles={files => subirArchivos(files, 'dicom', '', '3D')} folderScan />
            <ListaArchivos archivos={card.archivos.filter(a => a.dimFolder === '3D' && a.subtipo === 'dicom')} resumen />
            <div style={{ marginTop: 8 }}>
              <Typography.Text strong style={{ fontSize: 12, color: '#059669', display: 'block', marginBottom: 6 }}>
                🖼 3D — Preview
              </Typography.Text>
              <DropZone accept=".jpg,.jpeg,.png" label="Capturas del DICOM" onFiles={files => subirArchivos(files, 'preview', '', '3D')} />
              <ListaArchivos archivos={card.archivos.filter(a => a.dimFolder === '3D' && a.subtipo === 'preview')} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function PortalNuevoPaciente() {
  const navigate = useNavigate()
  const [paso, setPaso] = useState(0)
  const [loading, setLoading] = useState(false)
  const [tipos, setTipos] = useState<TipoExamen[]>([])
  const tiposMap = new Map<string, '2D' | '3D' | 'AMBOS'>(tipos.map(t => [t.nombre, t.dimension]))

  useEffect(() => { portalGetTipos().then(setTipos).catch(() => {}) }, [])

  // Paso 0 — Paciente
  const [formPaciente] = Form.useForm()
  const [pacienteId, setPacienteId] = useState<number | null>(null)
  const [buscandoRut, setBuscandoRut] = useState(false)
  const [sugerencia, setSugerencia] = useState<any>(null)
  const rutTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Paso 1 — Exámenes
  const [casoId] = useState(() => crypto.randomUUID())
  const [replicar, setReplicar] = useState(true)
  const [examenes, setExamenes] = useState<ExamenCard[]>([
    { uid: crypto.randomUUID(), tipo_examen: '', examen_id: null, archivos: [], creando: false },
  ])

  // Paso 2 — Notificación
  const [notificado, setNotificado] = useState(false)

  useTutorialNuevoCaso(paso)

  // ── Helpers exámenes ──────────────────────────────────────────────────────

  const updateCard = useCallback((uid: string, update: Partial<ExamenCard> | ((c: ExamenCard) => Partial<ExamenCard>)) => {
    setExamenes(prev => prev.map(c => {
      if (c.uid !== uid) return c
      const partial = typeof update === 'function' ? update(c) : update
      return { ...c, ...partial }
    }))
  }, [])

  const deleteCard = useCallback((uid: string) => {
    setExamenes(prev => prev.filter(c => c.uid !== uid))
  }, [])

  const agregarExamen = () => {
    setExamenes(prev => [
      ...prev,
      { uid: crypto.randomUUID(), tipo_examen: '', examen_id: null, archivos: [], creando: false },
    ])
  }

  const liderTieneArchivos = examenes[0]?.archivos.some(a => a.estado === 'ok') ?? false

  const examenesListos = examenes.filter(c => {
    if (!c.examen_id) return false
    if (c.archivos.some(a => a.estado === 'ok')) return true
    return replicar && liderTieneArchivos  // secundario con imágenes replicadas al backend
  })
  const puedeNotificar = examenesListos.length > 0

  // ── Paso 0: RUT autocomplete ──────────────────────────────────────────────

  const onRutChange = (rut: string) => {
    setSugerencia(null)
    if (rutTimeout.current) clearTimeout(rutTimeout.current)
    const clean = rut.replace(/[.\-\s]/g, '')
    if (clean.length < 7) return
    rutTimeout.current = setTimeout(async () => {
      setBuscandoRut(true)
      try {
        const res = await portalBuscarPaciente(normalizarRut(rut))
        if (res) setSugerencia(res)
      } catch { /* silencioso */ }
      finally { setBuscandoRut(false) }
    }, 500)
  }

  const onRutBlur = () => {
    const val = formPaciente.getFieldValue('rut')
    if (val && val.replace(/[.\-\s]/g, '').length >= 7) {
      formPaciente.setFieldValue('rut', normalizarRut(val))
    }
  }

  const usarExistente = () => {
    if (!sugerencia) return
    formPaciente.setFieldsValue({
      nombre_completo: sugerencia.nombre_completo,
      fecha_nacimiento: sugerencia.fecha_nacimiento ? dayjs(sugerencia.fecha_nacimiento) : null,
    })
    setPacienteId(sugerencia.id)
    setSugerencia(null)
  }

  const crearPaciente = async (values: any) => {
    if (pacienteId) { setPaso(1); return }
    setLoading(true)
    try {
      const p = await portalCrearPaciente({
        nombre_completo: values.nombre_completo,
        rut: values.rut || undefined,
        fecha_nacimiento: dayjs(values.fecha_nacimiento).format('YYYY-MM-DD'),
      })
      setPacienteId(p.id)
      setPaso(1)
    } catch { message.error('Error al guardar el paciente') }
    finally { setLoading(false) }
  }

  // ── Paso 2: Confirmar + Notificar (un solo paso) ─────────────────────────────

  const notificar = async () => {
    setLoading(true)
    try {
      const ids = examenesListos.map(e => e.examen_id!)
      await portalConfirmarTareas(ids)
      await portalNotificarCaso(ids)
      setNotificado(true)
      Modal.success({
        title: 'Notificación exitosa',
        content: 'La doctora ha sido notificada. Puedes ver el estado de tus casos en el panel principal.',
        okText: 'Ir al panel',
        onOk: () => navigate('/portal/dashboard'),
      })
    } catch {
      message.error('Error al enviar la notificación')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', display: 'flex', flexDirection: 'column' }}>
    <div style={{ flex: 1, padding: '24px 0' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Typography.Title level={4} style={{ margin: 0, color: '#1e3a5f' }}>
            Nuevo caso
          </Typography.Title>
          <Button
            size="small" type="text"
            icon={<span style={{ fontSize: 14 }}>?</span>}
            onClick={() => { reiniciarTutorialNuevoCaso(); window.location.reload() }}
            title="Ver guía del formulario"
          />
        </div>

        <Steps
          current={paso}
          size="small"
          style={{ marginBottom: 28 }}
          items={[{ title: 'Paciente' }, { title: 'Exámenes' }, { title: 'Notificar' }]}
        />

        {/* ── PASO 0: Paciente ── */}
        {paso === 0 && (
          <Card>
            <Form form={formPaciente} layout="vertical" onFinish={crearPaciente}>
              <Form.Item name="rut" label="RUT (opcional)">
                <Input
                  id="campo-rut"
                  placeholder="12.345.678-9"
                  onChange={e => onRutChange(e.target.value)}
                  onBlur={onRutBlur}
                  suffix={buscandoRut ? <Spin size="small" /> : null}
                />
              </Form.Item>

              {sugerencia && (
                <Alert
                  type="info"
                  style={{ marginBottom: 16 }}
                  message={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 13 }}>
                        <strong>{sugerencia.nombre_completo}</strong>
                        {sugerencia.fecha_nacimiento && ` · ${sugerencia.fecha_nacimiento}`}
                      </span>
                      <Button size="small" type="primary" onClick={usarExistente}>Usar</Button>
                    </div>
                  }
                />
              )}

              <Form.Item name="nombre_completo" label="Nombre completo" rules={[{ required: true }]}>
                <Input id="campo-nombre" />
              </Form.Item>
              <Form.Item name="fecha_nacimiento" label="Fecha de nacimiento" rules={[{ required: true }]}>
                <DatePicker id="campo-fecha" style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>

              <Button id="btn-sig-paciente" type="primary" htmlType="submit" loading={loading} block>
                {pacienteId ? 'Continuar' : 'Siguiente'}
              </Button>
            </Form>
          </Card>
        )}

        {/* ── PASO 1: Exámenes ── */}
        {paso === 1 && pacienteId && (
          <div>
            {examenes.length > 1 && (
              <div style={{ marginBottom: 12, padding: '10px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                <Checkbox checked={replicar} onChange={e => setReplicar(e.target.checked)}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Replicar imágenes en todos los exámenes</span>
                </Checkbox>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, marginLeft: 24 }}>
                  Las imágenes subidas a cualquier examen se copian automáticamente a los demás.
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {examenes.map((card, idx) => (
                <CardExamen
                  key={card.uid}
                  card={card}
                  pacienteId={pacienteId}
                  casoId={casoId}
                  puedeEliminar={true}
                  onChange={updateCard}
                  onDelete={deleteCard}
                  tipos={tipos}
                  tiposMap={tiposMap}
                  replicar={replicar}
                  otrosExamenes={examenes}
                  esLider={idx === 0}
                />
              ))}
            </div>

            <Button
              id="btn-agregar-otro"
              type="dashed"
              icon={<PlusOutlined />}
              block
              style={{ marginTop: 12 }}
              onClick={agregarExamen}
            >
              Agregar otro examen
            </Button>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <Button onClick={() => setPaso(0)}>Atrás</Button>
              <Button
                type="primary"
                style={{ flex: 1 }}
                id="btn-sig-examenes"
                disabled={!puedeNotificar}
                onClick={() => setPaso(2)}
              >
                Siguiente ({examenesListos.length} examen{examenesListos.length !== 1 ? 'es' : ''} listo{examenesListos.length !== 1 ? 's' : ''})
              </Button>
            </div>
          </div>
        )}

        {/* ── PASO 2: Confirmar + Notificar ── */}
        {paso === 2 && (
          <Card>
            <Typography.Title level={5} style={{ marginBottom: 16 }}>Resumen del caso</Typography.Title>

            {/* Lista de exámenes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {examenesListos.map((e, idx) => {
                const imgs = e.archivos.filter(a => a.estado === 'ok')
                const previews = imgs.filter(a => a.preview)
                const esReplicado = replicar && idx > 0 && imgs.length === 0
                return (
                  <div key={e.uid} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: (previews.length || esReplicado) ? 8 : 0 }}>
                      <Tag color="blue">{e.tipo_examen}</Tag>
                      <Tag color={dimension(e.tipo_examen, tiposMap) === '3D' ? 'purple' : 'cyan'}>{dimension(e.tipo_examen, tiposMap)}</Tag>
                      <Typography.Text style={{ fontSize: 12, color: '#6b7280' }}>
                        {esReplicado ? 'Imágenes replicadas' : `${imgs.length} archivo${imgs.length !== 1 ? 's' : ''}`}
                      </Typography.Text>
                    </div>
                    {esReplicado && (
                      <Typography.Text style={{ fontSize: 11, color: '#16a34a' }}>
                        ↩ Las imágenes se han replicado desde el primer examen del caso.
                      </Typography.Text>
                    )}
                    {previews.length > 0 && (
                      <Image.PreviewGroup>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {previews.slice(0, 6).map((a, i) => (
                            <Image key={i} src={a.preview} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 4 }} />
                          ))}
                        </div>
                      </Image.PreviewGroup>
                    )}
                  </div>
                )
              })}
            </div>

            <Divider />

            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
              Revisa que todo esté correcto. Al notificar, las tareas quedarán asignadas a la doctora.
            </Typography.Text>
            <Button
              id="btn-notificar-doctora"
              type="primary" size="large" block
              icon={<BellOutlined />}
              loading={loading}
              onClick={notificar}
            >
              Notificar a la doctora ({examenesListos.length} examen{examenesListos.length !== 1 ? 'es' : ''})
            </Button>
          </Card>
        )}
      </div>
    </div>
    <NovexBadge />
    </div>
  )
}
