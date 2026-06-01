# Inicialización del Proyecto — Gestión Informes Maca

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI + Uvicorn (ASGI) |
| ORM | SQLAlchemy 2.0 |
| Base de datos | PostgreSQL 16 (Docker, puerto 5433) |
| Auth | JWT (python-jose) + bcrypt |
| PDF | ReportLab |
| Frontend | React 19 + TypeScript + Vite |
| UI | Ant Design 6 + @dnd-kit |
| HTTP Client | Axios |

---

## Arrancar el Proyecto

```bash
# 1. Base de datos
docker-compose up -d

# 2. Backend
cd backend
python -m uvicorn api.main:app --reload --port 8000

# 3. Frontend
cd frontend
npm run dev   # → localhost:5173
```

**Seed inicial**: usuario `doctora` / contraseña `Maca2024!` (se crea en `init_db()`)

---

## Variables de Entorno (`backend/.env`)

```
DATABASE_URL=postgresql://maca:maca123@localhost:5433/maca_informes
SECRET_KEY=<clave-secreta>
ACCESS_TOKEN_EXPIRE_MINUTES=480
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
DOCTORA_EMAIL=
DOCTORA_NOMBRE=Dra. Macarena
STORAGE_ROOT=data/pacientes
```

---

## Arquitectura

```
Gestion_informes_maca/
├── backend/
│   ├── api/
│   │   ├── main.py                ← Entry point FastAPI
│   │   └── routers/
│   │       ├── auth.py
│   │       ├── examenes.py        ← Doctor: CRUD + subir informe + descargar ZIP
│   │       ├── derivadores.py     ← CRUD derivadores + color
│   │       ├── honorarios.py      ← Tarifas por derivador + generación PDF
│   │       ├── incidencias.py     ← Incidencias + notificaciones doctora
│   │       ├── portal.py          ← Portal derivador: pacientes, exámenes, imágenes,
│   │       │                         versiones, notificaciones
│   │       └── dashboard.py
│   ├── core/
│   │   ├── config.py
│   │   ├── database.py            ← Engine + init_db()
│   │   ├── dependencies.py        ← get_current_user / get_portal_derivador
│   │   ├── email_service.py       ← SMTP Gmail (magic link, informe listo, honorarios,
│   │   │                             incidencia, tarea pendiente)
│   │   ├── security.py            ← JWT create/verify
│   │   └── storage.py             ← Gestión archivos en disco (dim override para tipos custom)
│   └── modulos/
│       ├── usuarios/models.py
│       ├── derivadores/models.py  ← campo color (#hex)
│       ├── pacientes/models.py
│       ├── examenes/models.py     ← Examen (version), ImagenExamen,
│       │                             RevisionExamen, TipoExamenCustom
│       ├── informes/models.py
│       ├── tarifas/models.py
│       ├── honorarios/models.py
│       ├── incidencias/models.py
│       └── notificaciones/models.py  ← derivador_id + examen_id para portal
├── frontend/
│   └── src/
│       ├── api/
│       │   ├── client.ts          ← Axios doctora (JWT)
│       │   ├── portalClient.ts    ← Axios portal (token portal)
│       │   ├── examenes.ts        ← + descargarImagenes()
│       │   ├── portal.ts          ← + notificaciones, subida con dim_override
│       │   ├── honorarios.ts      ← tarifas por ítem, preview PDF
│       │   ├── derivadores.ts     ← + color
│       │   └── incidencias.ts
│       ├── components/
│       │   ├── BoardExamenes.tsx  ← color derivador, version tag, botón descarga ZIP
│       │   ├── TablaExamenes.tsx  ← color derivador, version tag, botón descarga ZIP
│       │   └── ExamenDrawer.tsx   ← subir informe + popup confirmación + botón descarga ZIP
│       ├── pages/
│       │   ├── DashboardPage.tsx
│       │   ├── DerivadoresPage.tsx  ← ColorPicker
│       │   ├── HonorariosPage.tsx   ← tarifas por derivador, tipos custom, preview
│       │   └── portal/
│       │       ├── PortalDashboard.tsx   ← campana notificaciones, sin BORRADOR
│       │       ├── PortalNuevoPaciente.tsx ← zonas upload por dimensión, sin doble diálogo
│       │       └── PortalExamen.tsx       ← modo edición, versiones, preview PDF informe
│       └── App.tsx
└── docker-compose.yml
```

---

## Modelo de Datos

| Tabla | Campos clave / notas |
|-------|---------------------|
| `usuarios` | auth doctora |
| `derivadores` | nombre, email, color (#hex) |
| `portal_magic_links` | token temporal 24h por derivador |
| `pacientes` | N→1 derivador, rut, fecha_nacimiento |
| `examenes` | estado, **version** (int), N→1 paciente/derivador, 1→N imagenes |
| `revision_examenes` | examen_id, numero_version, tipo_cambio, comentario |
| `imagenes_examen` | tipo (2D/DICOM/PREVIEW), ruta absoluta en disco |
| `informes` | 1→1 examen, ruta_pdf, token_publico |
| `tipos_examen_custom` | nombre único, dimension (2D/3D/**AMBOS**), activo |
| `tarifas_derivador` | derivador_id, tipo_examen, precio — creadas por ítem, no pre-seeding |
| `honorarios` | período YYYY-MM, total, estado |
| `incidencias` | comentario doctora/derivador, estado ABIERTA/RESUELTA |
| `notificaciones` | mensaje, leida, **derivador_id** (NULL=doctora, SET=portal) |

**Estados examen**: `BORRADOR → PENDIENTE → EN_PROCESO → COMPLETADO`

**Dimensiones**: `2D` / `3D` / `AMBOS` (activa dos zonas de subida)

**Tipos base**: `PANO, CBCT-LOC, CBCT-SUP, CBCT-INF, CBCT-BI, RETRO, BW-UNI, BW-BIL, TELE-L, ORTO, CEF-AN, CARP`

---

## Migraciones manuales ejecutadas

```sql
-- Color en derivadores
ALTER TABLE derivadores ADD COLUMN IF NOT EXISTS color VARCHAR DEFAULT '#6b7280';

-- Versión en examenes
ALTER TABLE examenes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;

-- Tabla revisiones
CREATE TABLE IF NOT EXISTS revision_examenes (...);

-- Tabla tipos custom
CREATE TABLE IF NOT EXISTS tipos_examen_custom (...);

-- Notificaciones portal
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS derivador_id INTEGER REFERENCES derivadores(id);
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS examen_id INTEGER REFERENCES examenes(id);
```

---

## API Endpoints Principales

### Doctora (JWT Bearer)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/examenes/tipos` | Tipos base + custom activos |
| GET | `/api/examenes/todos` | Todos los exámenes (sin BORRADOR) |
| GET | `/api/examenes/{id}` | Detalle con imágenes |
| GET | `/api/examenes/{id}/descargar-imagenes` | ZIP `{RUT}-{TIPO}.zip` |
| POST | `/api/examenes/{id}/informe` | Sube PDF → COMPLETADO + email + notif portal |
| GET | `/api/honorarios/{id}/tarifas` | Tarifas configuradas del derivador |
| POST | `/api/honorarios/{id}/tarifas/item` | Crear tarifa + tipo si es nuevo |
| DELETE | `/api/honorarios/{id}/tarifas/{tipo}` | Quitar tarifa del derivador |
| GET | `/api/honorarios/{id}/preview` | PDF honorarios en streaming |
| PATCH | `/api/honorarios/tipos-examen/{id}` | Activar/desactivar tipo custom |

### Portal derivador (token portal)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/portal/examenes` | Exámenes del derivador (sin BORRADOR) |
| GET | `/api/portal/examenes/{id}` | Detalle + informe_url si existe |
| POST | `/api/portal/examenes/{id}/imagenes` | Sube imagen/dicom/preview (dim_override para AMBOS) |
| POST | `/api/portal/examenes/{id}/confirmar-edicion` | Bumps version, crea RevisionExamen |
| POST | `/api/portal/examenes/{id}/nota` | Crea nota sin bump de versión |
| POST | `/api/portal/confirmar-tareas` | BORRADOR → PENDIENTE |
| GET | `/api/portal/notificaciones` | Notificaciones no leídas del derivador |
| POST | `/api/portal/notificaciones/leer-todas` | Marca todas como leídas |
| POST | `/api/portal/notificaciones/{id}/leer` | Marca una como leída |

---

## Storage de Archivos

```
data/pacientes/
└── {rut}/
    └── ordenes/
        └── {examen_id}/
            ├── 2D/{tipo}/imagen/            ← JPG/PNG (2D puro o lado 2D de AMBOS)
            │              └── informe/      ← PDF subido por doctora
            └── 3D/{tipo}/imagen/
                           ├── dicom/        ← .dcm
                           └── preview/      ← capturas/fotos del DICOM
```

Tipos AMBOS: guardan en `2D/` o `3D/` según `dim_override` enviado desde el frontend.

---

## Zonas de subida por dimensión (Portal Nuevo Caso)

| Tipo | Zonas |
|------|-------|
| 2D | imagen (JPG/PNG) |
| 3D | DICOM (.dcm) + Preview (JPG/PNG) |
| 3D Bimaxilar | Superior DICOM + Inferior DICOM + Preview |
| AMBOS | 2D imagen + 3D DICOM + 3D Preview |

---

## Funcionalidades por módulo

### Dashboard Doctora
- Vista board (kanban drag & drop) / tabla / calendario
- Color del derivador en borde de card y punto indicador
- Tag de versión `v0` (gris) / `v1+` (naranja)
- Botón descarga ZIP imágenes por examen (`{RUT}-{TIPO}.zip`)
- Popup confirmación al subir informe ("pasado a COMPLETADO, notificado al derivador")

### Derivadores
- CRUD con ColorPicker (10 colores preset + picker libre)
- Color se propaga a board, tabla, drawer y emails

### Honorarios
- Tarifas por derivador, creadas individualmente (sin pre-seeding)
- Catálogo global de tipos de examen con búsqueda inteligente (evita duplicados)
- Activar/desactivar tipos custom por demanda
- Dimensión: 2D / 3D / Ambos
- Vista previa PDF honorarios en modal
- Envío por email con PDF adjunto

### Portal Derivador — Nuevo caso
- Búsqueda por RUT con autocompletado
- Múltiples exámenes por caso, tipos desde catálogo global
- Zonas de subida según dimensión (ver tabla arriba)
- Las tareas solo se crean al paso "Notificar" (no antes)

### Portal Derivador — Edición
- Botón "Modificar" activa modo edición
- Cambios (add/delete imágenes) detectados automáticamente
- "Confirmar cambios" → bumps versión + crea RevisionExamen
- "Guardar nota" → RevisionExamen tipo nota sin bump
- Historial de versiones con timeline
- Pestañas dinámicas según dimensión: `📷 2D` / `🧊 DICOM` / `🖼 Preview`
- Botón "Ver informe" (cuando COMPLETADO) → modal 80% viewport con iframe PDF
- Footer del modal: "Descargar" → `Informe_{RUT}_{TIPO}.pdf`

### Notificaciones Portal
- Al subir informe: se crea `Notificacion` con `derivador_id`
- Campana `🔔` en header del portal con badge de no leídas
- Polling cada 30 segundos
- Modal con lista: fondo azul = no leída, click → navega al examen + marca leída
- "Marcar todas como leídas"

### Email (SMTP Gmail)
| Evento | Destinatario | Contenido |
|--------|-------------|-----------|
| Magic link | Derivador | Enlace acceso portal (24h) |
| Nuevo caso | Doctora | Datos paciente + examen |
| Informe listo | Derivador | Tabla datos + botón PDF + botón portal |
| Incidencia | Derivador | Descripción + link portal |
| Honorarios | Derivador | PDF adjunto del período |

---

## Seguridad

- **Doctora**: JWT via `get_current_user()` (tipo `"doctora"`)
- **Derivadores**: token portal via `get_portal_derivador()` (tipo `"portal"`)
- **CORS**: `localhost:5173`, `localhost:5174`
- **Magic links**: token único UUID por derivador, expiración 24h, uso único (se desactiva al usar)

---

## Rutas Frontend

```
/                          → Dashboard doctora (board/tabla/calendario)
/login                     → Login doctora
/derivadores               → CRUD derivadores + color
/honorarios                → Honorarios + tarifas por centro + preview
/portal/acceder?token=...  → Login derivador (magic link)
/portal/dashboard          → Dashboard derivador (board/tabla/calendario + campana)
/portal/nuevo-paciente     → Crear caso con exámenes e imágenes
/portal/examen/:id         → Detalle examen: imágenes, edición, versiones, informe
/portal/tarifas            → Ver tarifas del propio centro
```
