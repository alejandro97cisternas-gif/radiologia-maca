# Inicialización del Proyecto — Gestión Informes Maca

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI + Uvicorn (ASGI) |
| ORM | SQLAlchemy 2.0 + Alembic |
| Base de datos | PostgreSQL 16 (Docker) |
| Auth | JWT (python-jose) + bcrypt |
| PDF | ReportLab |
| Storage | Cloudflare R2 (prod) / disco local (dev) |
| Frontend | React 19 + TypeScript + Vite |
| UI | Ant Design 6 + @dnd-kit |
| HTTP Client | Axios |
| Proxy | Nginx + Certbot (wildcard SSL) |

---

## Arquitectura Multi-Tenant

Cada radiólogo es un tenant aislado con su propio subdominio:

```
draperez.novex.cloud      → panel doctora + portal derivadores
drsanchez.novex.cloud     → otro radiólogo
radioadmin.novex.cloud    → panel superadmin
```

- **Tenant resolver**: middleware lee `Host` header → extrae slug → inyecta `radiologo_id`
- **Aislamiento**: todos los datos filtrados por `radiologo_id` en BD
- **Storage**: `data/{radiologo_id}/{rut}/ordenes/{examen_id}/...`

---

## Arrancar en Desarrollo

```bash
# 1. Base de datos
docker start Macarena_postgres

# 2. Backend
cd backend
python -m uvicorn api.main:app --reload --port 8000

# 3. Frontend
cd frontend
npm run dev   # → localhost:5173
```

**Dev tenant**: abrir consola del browser y ejecutar:
```js
localStorage.setItem('dev_tenant_slug', 'draperez')
```

---

## Variables de Entorno (`backend/.env`)

```
# PostgreSQL
POSTGRES_USER=novex-freeradio
POSTGRES_PASSWORD=<password>
POSTGRES_DB=radiologia_db
DATABASE_URL=postgresql://novex-freeradio:<password>@localhost:5433/radiologia_db

# Seguridad
SECRET_KEY=<clave 64 chars hex>
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Dominio
BASE_DOMAIN=novex.cloud
APP_URL=https://novex.cloud
FRONTEND_URL=https://novex.cloud

# Superadmin
SUPERADMIN_USERNAME=admin
SUPERADMIN_PASSWORD=<password>
SUPERADMIN_EMAIL=<email>

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=

# Storage
STORAGE_ROOT=data
STORAGE_BACKEND=r2          ← "local" en dev, "r2" en prod
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY=<r2 access key>
R2_SECRET_KEY=<r2 secret key>
R2_BUCKET=maca-radiologia
R2_URL_EXPIRY_SECONDS=86400
```

---

## Migraciones (Alembic)

```bash
# Aplicar migraciones
cd backend && alembic upgrade head

# Nueva migración tras cambiar modelos
alembic revision --autogenerate -m "descripcion"
alembic upgrade head
```

---

## Infraestructura Producción

| Componente | Dónde |
|---|---|
| VPS | Hostinger (`177.7.48.49`) |
| Backend | Docker puerto `8001` |
| Frontend | Docker puerto `3001` |
| PostgreSQL | Docker puerto `5432` (interno) |
| Storage archivos | Cloudflare R2 bucket `maca-radiologia` |
| Dominio + DNS | Cloudflare (`novex.cloud`) |
| SSL wildcard | Certbot + dns-cloudflare plugin |
| Proxy | Nginx → `/api/` a 8001, `/` a 3001 |

### Deploy en VPS

```bash
cd /var/www/radiologia-maca
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Solo backend o frontend

```bash
docker compose -f docker-compose.prod.yml up -d --build backend
docker compose -f docker-compose.prod.yml up -d --build frontend
```

---

## Arquitectura de Código

```
Gestion_informes_maca/
├── backend/
│   ├── api/
│   │   ├── main.py                ← FastAPI entry point + CORS + middleware
│   │   └── routers/
│   │       ├── auth.py            ← login doctora + superadmin
│   │       ├── admin.py           ← CRUD radiólogos (superadmin)
│   │       ├── examenes.py        ← CRUD exámenes + informe + ZIP
│   │       ├── derivadores.py     ← CRUD derivadores + magic link
│   │       ├── honorarios.py      ← Tarifas + PDF honorarios
│   │       ├── incidencias.py     ← Incidencias + notificaciones
│   │       ├── portal.py          ← Portal derivador completo
│   │       └── dashboard.py       ← Calendario + árbol carpetas
│   ├── core/
│   │   ├── config.py              ← Settings (pydantic)
│   │   ├── database.py            ← Engine + seed superadmin
│   │   ├── dependencies.py        ← get_current_user / get_portal_derivador / get_superadmin
│   │   ├── email_service.py       ← SMTP emails
│   │   ├── security.py            ← JWT create/verify
│   │   ├── storage.py             ← Dual backend: local / Cloudflare R2
│   │   └── tenant.py              ← TenantMiddleware (Host → radiologo_id)
│   ├── migrations/                ← Alembic versions
│   └── modulos/
│       ├── usuarios/models.py     ← rol, slug, nombre_display (multi-tenant)
│       ├── derivadores/models.py  ← radiologo_id FK
│       ├── pacientes/models.py    ← radiologo_id FK
│       ├── examenes/models.py     ← TipoExamenCustom con radiologo_id
│       ├── informes/models.py
│       ├── tarifas/models.py
│       ├── honorarios/models.py
│       ├── incidencias/models.py
│       └── notificaciones/models.py ← radiologo_id FK
├── frontend/
│   └── src/
│       ├── api/
│       │   ├── client.ts          ← Axios doctora (JWT + X-Tenant-Slug)
│       │   ├── portalClient.ts    ← Axios portal (token + X-Tenant-Slug + sliding window)
│       │   ├── adminClient.ts     ← Axios superadmin
│       │   ├── tenant.ts          ← Extrae slug del subdominio
│       │   └── ...
│       ├── pages/
│       │   ├── admin/
│       │   │   ├── AdminLogin.tsx
│       │   │   └── AdminDashboard.tsx  ← CRUD radiólogos
│       │   └── portal/
│       │       ├── PortalAcceso.tsx    ← Magic link + self-service email
│       │       └── ...
│       └── App.tsx
├── docker-compose.yml             ← Desarrollo local
├── docker-compose.prod.yml        ← Producción
└── .gitignore
```

---

## Modelo de Datos

| Tabla | Campos clave |
|-------|-------------|
| `usuarios` | rol (superadmin/radiologo), slug, nombre_display, email |
| `derivadores` | radiologo_id FK, nombre, email, color |
| `portal_magic_links` | token UUID, expira_en, activo (uso único) |
| `pacientes` | radiologo_id FK, derivador_id FK, rut |
| `examenes` | estado, version, paciente_id, derivador_id |
| `imagenes_examen` | ruta (R2 key o path local), tipo (2D/DICOM/PREVIEW) |
| `informes` | ruta_pdf (R2 key), token_publico UUID |
| `tipos_examen_custom` | radiologo_id FK, nombre, dimension (2D/3D/AMBOS) |
| `tarifas_derivador` | derivador_id, tipo_examen, precio |
| `honorarios` | derivador_id, periodo YYYY-MM, total, detalle_json |
| `incidencias` | examen_id, comentario_doctora, estado |
| `notificaciones` | radiologo_id FK, derivador_id (NULL=doctora) |

**Estados examen**: `BORRADOR → PENDIENTE → EN_PROCESO → COMPLETADO`

---

## Flujo de Acceso

### Radiólogo (doctora)
1. `https://draperez.novex.cloud` → login con username/password
2. JWT con tipo `"doctora"` scoped al tenant

### Derivador (portal)
1. Doctora genera magic link → email al derivador
2. Derivador abre link → token validado → JWT 7 días
3. **Self-service**: derivador entra a `https://draperez.novex.cloud/portal/acceder` → ingresa email → recibe nuevo link
4. **Sliding window**: JWT se renueva automáticamente si quedan <3 días (header `X-Token-Refresh`)

### Superadmin
1. `https://radioadmin.novex.cloud/admin/login`
2. Crea radiólogos con slug → define subdominio automáticamente

---

## Agregar nuevo radiólogo

1. Entrar a `https://radioadmin.novex.cloud/admin/login`
2. Crear radiólogo con slug (ej: `draperez`)
3. El radiólogo entra a `https://draperez.novex.cloud`
4. Desde su panel crea derivadores → les envía magic link por email

---

## Storage Cloudflare R2

```
Bucket: maca-radiologia
Estructura: {radiologo_id}/{rut}/ordenes/{examen_id}/{dim}/{tipo}/imagen/{archivo}
```

- `STORAGE_BACKEND=local` → disco local (dev)
- `STORAGE_BACKEND=r2` → Cloudflare R2 (prod)
- URLs firmadas con expiración 24h (`R2_URL_EXPIRY_SECONDS=86400`)

---

## Pendiente

- [ ] Configurar Resend para emails transaccionales
- [ ] Configurar SMTP en `.env` del VPS
