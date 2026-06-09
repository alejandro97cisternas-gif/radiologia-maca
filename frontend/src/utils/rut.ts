/** Normaliza RUT chileno a formato XX.XXX.XXX-Y */
export function normalizarRut(rut: string): string {
  const clean = rut.replace(/[.\-\s]/g, '').toUpperCase()
  if (clean.length < 2) return rut
  const cuerpo = clean.slice(0, -1)
  const dv = clean.slice(-1)
  const partes: string[] = []
  let c = cuerpo
  while (c.length > 3) {
    partes.unshift(c.slice(-3))
    c = c.slice(0, -3)
  }
  if (c) partes.unshift(c)
  return partes.join('.') + '-' + dv
}

/** Quita puntos, guiones y espacios. Para comparaciones client-side. */
export function limpiarRut(rut: string): string {
  return rut.replace(/[.\-\s]/g, '').toUpperCase()
}
