# Reglas de Eficiencia de Salida (90% Output Optimization)
- [cite_start]Priorizar `Edit` para cambios parciales; evitar `Write` en archivos extensos[cite: 580].
- [cite_start]Prohibida la prosa, preámbulos o resúmenes de acción[cite: 71, 72].
- [cite_start]Tras 2 errores en la misma tarea, solicitar `/clear` para resetear contexto contaminado[cite: 141, 200].
- [cite_start]Usar subagentes para lectura/investigación de archivos fuera del foco inmediato[cite: 153].
- [cite_start]Responder con fragmentos de código atómicos, omitiendo imports existentes[cite: 44, 45].



data/pacientes/
└── {rut}/
    └── ordenes/
        └── {orden_id}/
            ├── 2D/
            │   └── {tipo_examen}/       (PANO, RETRO, BW-UNI…)
            │       └── imagen/          ← JPG / PNG subidos
            │           └── informe/
            │               └── Anotaciones&pantallazos/
            └── 3D/
                └── {tipo_examen}/       (CBCT-LOC, CBCT-BI…)
                    └── imagen/
                        ├── dicom/       ← archivos .dcm
                        └── preview/     ← thumbnails PNG