# Skill: Token Architect (Output Optimizer)
# Proposito: Reducir drasticamente el gasto de tokens de salida en sesiones largas.

## Protocolo de Respuesta de "Baja Verbosidad"
- **Prioridad de Herramientas**: Usa SIEMPRE `Edit` para modificar bloques específicos. [cite_start]NUNCA uses `Write` para archivos de más de 50 líneas si solo cambias una fracción[cite: 181, 464].
- [cite_start]**Cero Prosa**: Omite introducciones ("Claro, voy a ayudarte..."), resúmenes de acciones y conclusiones corteses[cite: 633, 634].
- [cite_start]**Respuestas Atómicas**: Si la respuesta puede ser solo el bloque de código o el comando Bash, no añadas texto adicional[cite: 71, 265].

## Gestión de Sesión Larga (Higiene de Contexto)
- [cite_start]**Investigación Aislada**: Para explorar el código base (6k+ líneas), usa siempre un subagente (`general-purpose`) para que la lectura de archivos no sature esta conversación principal[cite: 154, 156].
- [cite_start]**Compactación Inteligente**: Al detectar saturación de contexto, sugiere `/compact` preservando solo el esquema de la base de datos y el historial de errores actual[cite: 148, 149].
- [cite_start]**Uso de /btw**: Para consultas de documentación o dudas rápidas que no requieren cambios en disco, usa `/btw` para evitar que la respuesta entre en el historial persistente[cite: 150, 151].

## Lista "NEVER" (Prohibiciones)
- [cite_start]NUNCA reescribas un archivo completo para corregir un error tipográfico o cambiar un nombre de variable[cite: 42, 80].
- [cite_start]NUNCA expliques el "por qué" de un cambio a menos que se te pregunte explícitamente[cite: 77, 634].