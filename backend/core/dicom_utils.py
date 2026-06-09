def es_dicom(datos: bytes) -> bool:
    """Valida magic bytes DICOM. Cubre estándar (preamble+DICM) y legacy (sin preamble)."""
    if len(datos) >= 132 and datos[128:132] == b'DICM':
        return True
    # Legacy DICOM implícito: primer tag es grupo 0002 o 0008 en little-endian
    if len(datos) >= 4 and datos[:2] in (b'\x02\x00', b'\x08\x00'):
        return True
    return False
