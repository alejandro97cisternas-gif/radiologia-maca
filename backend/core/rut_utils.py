import re


def normalizar_rut(rut: str) -> str:
    """Normaliza RUT chileno a formato XX.XXX.XXX-Y.
    Acepta: 19493457-2 / 19.493.457-2 / 194934572 / 19.493.4572
    """
    clean = re.sub(r'[\.\-\s]', '', rut.strip()).upper()
    if len(clean) < 2:
        return rut.strip().upper()
    cuerpo, dv = clean[:-1], clean[-1]
    partes: list[str] = []
    while len(cuerpo) > 3:
        partes.append(cuerpo[-3:])
        cuerpo = cuerpo[:-3]
    if cuerpo:
        partes.append(cuerpo)
    return '.'.join(reversed(partes)) + '-' + dv


def limpiar_rut(rut: str) -> str:
    """Devuelve solo dígitos+DV en mayúscula, sin puntos ni guión. Útil para comparaciones."""
    return re.sub(r'[\.\-\s]', '', rut.strip()).upper()
