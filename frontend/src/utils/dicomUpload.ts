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

async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise(res => {
      (entry as FileSystemFileEntry).file(f => res([f]), () => res([]))
    })
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const all: File[] = []
  await new Promise<void>(resolve => {
    const batch = () => reader.readEntries(async entries => {
      if (!entries.length) { resolve(); return }
      for (const e of entries) all.push(...await readEntry(e))
      batch()
    }, () => resolve())
    batch()
  })
  return all
}

/** Lee todos los archivos de un evento drop, incluyendo carpetas recursivamente. */
export async function readDropItems(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = []
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.()
    if (entry) {
      files.push(...await readEntry(entry))
    } else {
      const f = items[i].getAsFile()
      if (f) files.push(f)
    }
  }
  return files
}

/** Filtra archivos DICOM por magic bytes. Devuelve válidos y cuenta de omitidos. */
export async function filterDicomFromFiles(files: File[]): Promise<{ dicom: File[]; skipped: number }> {
  const checks = await Promise.all(files.map(async f => ({ f, ok: await isDicomFile(f) })))
  const dicom = checks.filter(c => c.ok).map(c => c.f)
  return { dicom, skipped: files.length - dicom.length }
}

/** Extrae archivos DICOM de un ZIP. Devuelve los archivos y cuántos se omitieron. */
export async function extractDicomFromZip(zipFile: File): Promise<{ dicom: File[]; skipped: number; total: number }> {
  const { unzipSync } = await import('fflate')
  const buf = await zipFile.arrayBuffer()
  const entries = unzipSync(new Uint8Array(buf))

  const candidates: File[] = Object.entries(entries)
    .filter(([name]) => !name.endsWith('/'))  // skip directories
    .map(([name, data]) => {
      const basename = name.split('/').pop() || name
      return new File([data], basename, { type: 'application/octet-stream' })
    })

  const { dicom, skipped } = await filterDicomFromFiles(candidates)
  return { dicom, skipped, total: candidates.length }
}
