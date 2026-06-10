import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { portalSubirEnChunks, portalSubirImagen } from '../api/portal'

const MAX_CONCURRENT_FILES = 4

export interface UploadTask {
  id: string
  nombre: string
  fileSize: number
  pct: number
  speedKBs: number
  etaSeg: number
  estado: 'enCola' | 'subiendo' | 'completado' | 'error'
  error?: string
}

interface StartParams {
  examenId: number
  file: File
  subtipo: 'dicom' | 'preview' | 'imagen'
  ubicacion?: string
  dimOverride?: '2D' | '3D'
  onProgress?: (pct: number) => void
  onComplete?: (result: any) => void
  onError?: (err: Error) => void
}

interface UploadContextValue {
  tasks: UploadTask[]
  startUpload: (params: StartParams) => void
}

const UploadContext = createContext<UploadContextValue>({ tasks: [], startUpload: () => {} })

export const useUpload = () => useContext(UploadContext)

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const samplesRef = useRef<Record<string, { t: number; b: number }[]>>({})
  const activeRef = useRef(0)
  const queueRef = useRef<(() => void)[]>([])

  const runQueued = useCallback(() => {
    while (activeRef.current < MAX_CONCURRENT_FILES && queueRef.current.length > 0) {
      const next = queueRef.current.shift()!
      activeRef.current++
      next()
    }
  }, [])

  const startUpload = useCallback((params: StartParams) => {
    const { examenId, file, subtipo, ubicacion = '', dimOverride, onProgress, onComplete, onError } = params
    const id = crypto.randomUUID()

    const initialEstado = activeRef.current < MAX_CONCURRENT_FILES ? 'subiendo' : 'enCola'
    setTasks(prev => [...prev, {
      id, nombre: file.name, fileSize: file.size,
      pct: 0, speedKBs: 0, etaSeg: 0, estado: initialEstado,
    }])
    samplesRef.current[id] = []

    const handleProgress = (pct: number) => {
      const bytes = (pct / 100) * file.size
      const now = Date.now()
      const samples = samplesRef.current[id] ?? []
      samples.push({ t: now, b: bytes })
      const cutoff = now - 10_000
      while (samples.length > 1 && samples[0].t < cutoff) samples.shift()
      samplesRef.current[id] = samples

      let speedKBs = 0
      let etaSeg = 0
      if (samples.length >= 2) {
        const first = samples[0]
        const dBytes = bytes - first.b
        const dTime = (now - first.t) / 1000
        if (dTime > 0) {
          speedKBs = dBytes / dTime / 1024
          etaSeg = speedKBs > 0 ? (file.size - bytes) / (speedKBs * 1024) : 0
        }
      }

      setTasks(prev => prev.map(t => t.id === id ? { ...t, pct, speedKBs, etaSeg } : t))
      onProgress?.(pct)
    }

    const doUpload = () => {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, estado: 'subiendo' } : t))
      const promise = subtipo === 'dicom'
        ? portalSubirEnChunks(examenId, file, subtipo, handleProgress, ubicacion, dimOverride)
        : portalSubirImagen(examenId, subtipo, file, handleProgress, ubicacion, dimOverride)

      promise.then(result => {
        delete samplesRef.current[id]
        setTasks(prev => prev.map(t => t.id === id ? { ...t, pct: 100, estado: 'completado' } : t))
        onComplete?.(result)
        setTimeout(() => setTasks(prev => prev.filter(t => t.id !== id)), 4000)
      }).catch((err: Error) => {
        delete samplesRef.current[id]
        setTasks(prev => prev.map(t => t.id === id ? { ...t, estado: 'error', error: err.message } : t))
        onError?.(err)
      }).finally(() => {
        activeRef.current--
        runQueued()
      })
    }

    if (activeRef.current < MAX_CONCURRENT_FILES) {
      activeRef.current++
      doUpload()
    } else {
      queueRef.current.push(doUpload)
    }
  }, [runQueued])

  return (
    <UploadContext.Provider value={{ tasks, startUpload }}>
      {children}
    </UploadContext.Provider>
  )
}
