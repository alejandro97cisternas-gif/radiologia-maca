/**
 * Detecta archivos DICOM por magic bytes (no solo por extensión).
 * Cubre: estándar con preamble 128B+"DICM", legacy sin preamble, y DICOMDIR.
 */
export async function isDicomFile(file: File): Promise<boolean> {
  if (file.size < 4) return false
  const buf = await file.slice(0, 132).arrayBuffer()
  const b = new Uint8Array(buf)
  if (b.length >= 132 && b[128] === 0x44 && b[129] === 0x49 && b[130] === 0x43 && b[131] === 0x4D) return true
  if (b[0] === 0x02 && b[1] === 0x00) return true
  if (b[0] === 0x08 && b[1] === 0x00) return true
  return false
}

export interface DicomEntry { file: File; path: string }

/** Extrae la carpeta contenedora del path relativo.
 *  "Serie1/000001.dcm"       → "Serie1"
 *  "Root/A/B/000001.dcm"    → "Root/A/B"
 *  "000001.dcm"              → ""
 */
export function pathToUbicacion(path: string): string {
  const parts = path.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}

async function readEntry(entry: FileSystemEntry, pathPrefix = ''): Promise<DicomEntry[]> {
  const currentPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name
  if (entry.isFile) {
    return new Promise(res => {
      (entry as FileSystemFileEntry).file(f => res([{ file: f, path: currentPath }]), () => res([]))
    })
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const all: DicomEntry[] = []
  await new Promise<void>(resolve => {
    const batch = () => reader.readEntries(async entries => {
      if (!entries.length) { resolve(); return }
      for (const e of entries) all.push(...await readEntry(e, currentPath))
      batch()
    }, () => resolve())
    batch()
  })
  return all
}

/** Lee todos los archivos de un evento drop, incluyendo carpetas recursivamente.
 *  Preserva la ruta relativa de cada archivo en `path`.
 */
export async function readDropItems(items: DataTransferItemList): Promise<DicomEntry[]> {
  const entries: DicomEntry[] = []
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.()
    if (entry) {
      entries.push(...await readEntry(entry))
    } else {
      const f = items[i].getAsFile()
      if (f) entries.push({ file: f, path: f.name })
    }
  }
  return entries
}

/** Filtra archivos DICOM por magic bytes. Acepta DicomEntry[] o File[]. */
export async function filterDicomFromFiles(
  entries: (DicomEntry | File)[],
): Promise<{ dicom: DicomEntry[]; skipped: number }> {
  const normalized: DicomEntry[] = entries.map(e =>
    e instanceof File
      ? { file: e, path: (e as any).webkitRelativePath || e.name }
      : e
  )
  const checks = await Promise.all(normalized.map(async e => ({ e, ok: await isDicomFile(e.file) })))
  const dicom = checks.filter(c => c.ok).map(c => c.e)
  return { dicom, skipped: entries.length - dicom.length }
}

/** Extrae archivos DICOM de un ZIP. */
export async function extractDicomFromZip(zipFile: File): Promise<{ dicom: File[]; skipped: number; total: number }> {
  const { unzipSync } = await import('fflate')
  const buf = await zipFile.arrayBuffer()
  const entries = unzipSync(new Uint8Array(buf))

  const candidates: File[] = Object.entries(entries)
    .filter(([name]) => !name.endsWith('/'))
    .map(([name, data]) => {
      const basename = name.split('/').pop() || name
      return new File([data], basename, { type: 'application/octet-stream' })
    })

  const { dicom, skipped } = await filterDicomFromFiles(candidates)
  return { dicom: dicom.map(e => e.file), skipped, total: candidates.length }
}

const DOC_EXTS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'ppt', 'pptx'])

export function filterDocFiles(files: File[]): File[] {
  return files.filter(f => DOC_EXTS.has(f.name.split('.').pop()?.toLowerCase() ?? ''))
}

export async function extractDocsFromZip(zipFile: File): Promise<{ files: File[]; skipped: number }> {
  const { unzipSync } = await import('fflate')
  const buf = await zipFile.arrayBuffer()
  const entries = unzipSync(new Uint8Array(buf))
  let skipped = 0
  const files: File[] = []
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('/')) continue
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const basename = name.split('/').pop() || name
    if (DOC_EXTS.has(ext)) {
      files.push(new File([data], basename, { type: 'application/octet-stream' }))
    } else {
      skipped++
    }
  }
  return { files, skipped }
}
