# Agropelink — TODO

Leyenda: `[ ]` pendiente · `[x]` hecho. Toda tarea debe cumplir [tech_rules.md](tech_rules.md).

> **Primer paso a ejecutar: Fase 1 — Configuración del frontend.**

---

## Fase 1 — Configuración del frontend ⬅️ EMPEZAR AQUÍ
- [x] Inicializar proyecto con Vite + React en `/frontend` (JSX)
- [x] Configurar Tailwind CSS (config, directivas base, paleta de marca: primary/secondary/accent)
- [x] Layout base: `Layout`, `Header` oscuro con logo, `Footer` con sección institucional (UE / Give a Chance)
- [x] Configurar PWA básica: `public/manifest.json`, iconos 192/512/maskable, `public/sw.js` registrado en producción
- [ ] Configurar ESLint + Prettier (incluir regla que prohíba `localStorage` para tokens y `dangerouslySetInnerHTML`)
- [x] Definir estructura de carpetas (`src/pages`, `src/components`, `src/features`, `src/hooks`)
- [x] Configurar React Router con layout base y página 404 (`/dashboard`, `/tasks`, `/documents`)
- [x] Crear cliente HTTP (axios, `src/api.js`) con `withCredentials` y URL base `http://localhost:8000/api/v1` (sobrescribible con `VITE_API_URL`)
- [x] Crear `frontend/.env.example` solo con variables públicas
- [ ] Configurar proxy de desarrollo de Vite hacia el backend
- [ ] Instalar `zod` + `react-hook-form` para validación de formularios
- [x] Componentes UI base: Button, FormField, Card, Alert, Spinner, PageHeader
- [ ] Componentes UI pendientes: Modal, Toast

## Fase 2 — Configuración del backend
- [x] Inicializar proyecto FastAPI en `/backend` (`.venv` + `requirements.txt`)
- [x] Modelos `User`, `Farm`, `Task`, `Document` y esquemas Pydantic Create/Update/Response
- [ ] Reorganizar en paquetes (`app/api`, `app/core`, `app/models`, `app/schemas`, `app/services`, `app/db`) cuando crezca
- [x] Configuración con `pydantic-settings` + `backend/.env.example`
- [x] Conexión a base de datos con SQLAlchemy 2.x (SQLite en desarrollo; PostgreSQL en producción)
- [ ] Configurar Alembic y primera migración (sustituir `create_all` del arranque)
- [x] `CORSMiddleware` con orígenes explícitos desde configuración
- [x] Manejador global de excepciones que oculta stack traces + `request_id`
- [ ] Logging estructurado del lado servidor
- [ ] Cabeceras de seguridad y rate limiting (`slowapi`)
- [x] Endpoint `/api/health`
- [ ] Ruff (con reglas de seguridad `S`), mypy y pytest

## Fase 2b — CRUD y frontend conectado
- [x] Endpoints `GET/POST /api/v1/farms`, `GET/POST/PUT/DELETE /api/v1/tasks`
- [x] Dashboard con resumen (granjas y tareas por estado) y alta rápida de granjas
- [x] Página `/tasks`: listado filtrable, formulario de creación y marcar como completada

## Fase 2c — Asistente Agropelink AI
- [x] `AgentChat` flotante en el Layout: historial, input y tarjeta Human-in-the-Loop (Aprobar / Rechazar)
- [x] Endpoint `POST /api/v1/agent/chat` con Gemini (`google-genai`); clave solo en backend (`SecretStr`), rate limit por usuario
- [x] Acción `create_task` extraída y validada en servidor; `mockAgent.js` eliminado
- [x] Aprobar en la tarjeta HITL crea la tarea vía `POST /api/v1/tasks` (granja y fecha elegidas por el usuario)
- [ ] Registro de auditoría de acciones propuestas/aprobadas/rechazadas
- [ ] Rate limit del agente compartido (Redis) cuando haya varios workers
- [ ] Modelo/endpoint de costes para la imputación

## Fase 2d — Landing pública (`/`)
- [x] Landing en `src/pages/Landing.jsx` con componentes en `src/components/landing/`
- [x] Header con navegación por secciones, Instagram y CTA "Acceso Plataforma"; menú móvil y CTA fijo inferior
- [x] Hero con carrusel (automático, manual, swipe, respeta `prefers-reduced-motion`)
- [x] "Qué es Agropelink" + respaldo institucional (UE / Give a Chance)
- [x] Clima en directo (Open-Meteo, Almería) y agropizarra orientativa
- [x] Equipo fundador y formulario de contacto → `POST /api/v1/contact` (validación, honeypot, rate limit por IP)
- [ ] Confirmar usuario oficial de Instagram y buzones `@agropelink.es` (`src/config/site.js`)
- [ ] Revisar bios del equipo y añadir fotografías reales
- [ ] Conectar cotizaciones de lonja a una fuente real (hoy: datos de referencia manuales)
- [ ] Páginas `/privacidad` y `/aviso-legal`
- [ ] Notificación por email al equipo al recibir un contacto

## Fase 3 — Autenticación y usuarios
- [x] Contraseñas con Argon2id (`argon2-cffi`), rehash automático si cambian los parámetros
- [x] `POST /auth/register` (política: 8+ caracteres, letra, número y símbolo; rol `farmer`; respuesta idéntica exista o no el email)
- [x] `POST /auth/login` → cookie `HttpOnly; Secure; SameSite=Lax` con token opaco (en BD solo su hash SHA-256)
- [x] `POST /auth/logout` revoca la sesión en servidor · `GET /auth/me`
- [x] Fuerza bruta: 5 fallos/15 min por email y 20 por IP; límite de registros por IP
- [x] CSRF: comprobación de `Origin` + cabecera `X-Requested-With` obligatoria en métodos que modifican estado
- [x] Cabeceras de seguridad (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `no-store`)
- [x] Frontend: `/login` y `/register`, medidor de contraseña en tiempo real, `RequireAuth` en `/dashboard`, `/tasks`, `/documents`
- [x] Header: Iniciar sesión / Registrarse o avatar con "Cerrar sesión"
- [ ] Verificación de email y recuperación de contraseña (requiere servicio de correo)
- [ ] Mover rate limiting a Redis antes de desplegar con varios workers
- [ ] Revisar `X-Forwarded-For` de confianza al desplegar tras proxy inverso
- [ ] Datos huérfanos del antiguo usuario de desarrollo `dev@agropelink.local` (no puede iniciar sesión)

## Fase 3b — Landing ampliada y comunidad
- [x] Carrusel del Hero ampliado (`max-w-6xl`) con gráfico de sensores interactivo
- [x] Fotos del equipo (`public/team/*.jpg`) con fallback automático a iniciales
- [x] Doble vídeo panorámico (`public/media/campo-1.mp4`, `campo-2.mp4`) con fallback si falta el archivo
- [x] Feed de Instagram (tarjetas curadas en `src/data/instagramPosts.js`)
- [x] Gasóleo B: `GET /api/v1/market/fuel` (Geoportal MITECO, caché 1 h, tendencia semanal y media España)
- [x] Radar de normativa (SIEX, fitosanitarios/fertilizantes, agua) en `src/data/regulations.js`
- [x] Foro: `/foro`, `/foro/:id`, categorías, búsqueda, hilos, respuestas y modal de nuevo tema (requiere sesión)
- [ ] Colocar fotos reales del equipo, los dos vídeos y las imágenes/URLs reales de Instagram
- [ ] Revisar trimestralmente `regulations.js` (fechas normativas cambiantes)
- [ ] Moderación del foro (reportar, ocultar, rol moderador)

## Fase 3c — Auditoría web pública (19 puntos, 2026-10-10)
- [x] 404, CTA above the fold (verificado a 320×568), meta title/description/canonical por ruta, Open Graph + og-image
- [x] Favicons (ico 16/32/48, PNG, apple-touch), robots.txt, sitemap.xml
- [x] Alt text, sin scroll horizontal a 320 px, sticky CTA, estados de carga y error accesibles (foco al primer error)
- [x] /privacidad (RGPD, derechos, IA), /terminos (aviso legal LSSI + condiciones), redirección /aviso-legal
- [x] Banner de cookies con categorías y persistencia; Elfsight y analítica solo tras consentimiento
- [x] Titular (Zakaryae Abechar, NIF Y4618181W) en `LEGAL`, páginas legales y pie
- [x] Domicilio fiscal (Sevilla) y proveedor de hosting (cloud UE) en `LEGAL`, páginas legales y pie
- [ ] Revisión de los textos legales por un abogado antes de publicar
- [ ] Elegir proveedor de analítica (`VITE_ANALYTICS_PROVIDER`)
- [ ] Autoalojar la fuente Inter (evita enviar la IP de los visitantes a Google Fonts)
- [ ] Prerender/SSR de rutas públicas si se quiere SEO por página en redes sociales (hoy OG es global)

## Fase 3d — Hardening de seguridad (2026-10-10)
- [x] Suite `backend/tests/test_security.py` (46 tests): cookies, IDOR, validación, agente IA, subidas, CSRF, cabeceras
- [x] Cookie `__Host-` en producción · límite de tamaño de cuerpo (64 KB JSON / 411 sin longitud en subidas)
- [x] Agente: límite también por IP · logs del SDK con la API key redactada
- [x] Subidas: tipo declarado debe coincidir con el contenido real (magic bytes)
- [ ] Ejecutar `pytest` en CI en cada cambio
- [ ] Rotar la GEMINI_API_KEY si alguna vez se compartió fuera de `backend/.env`

## Fase 4 — Perfiles
- [ ] Modelo y esquemas de perfil (nombre, ubicación, tipo de actividad, contacto)
- [ ] Endpoints CRUD del perfil propio con validación
- [ ] Frontend: vista y edición de perfil

## Fase 5 — Subida de archivos (buckets privados)
- [x] Endpoint `POST /api/v1/documents/upload` (almacenamiento local privado en `backend/storage/`)
- [ ] Migrar almacenamiento a S3-compatible con bucket privado
- [x] Lista blanca de MIME + verificación por magic bytes (PDF, PNG, JPEG, WEBP)
- [x] Límite de tamaño configurable aplicado en servidor (`MAX_UPLOAD_BYTES`)
- [x] Nombres de archivo con UUID generados por el servidor
- [ ] Acceso mediante URLs firmadas de corta duración
- [x] Frontend: página `/documents` con dropzone, validación previa de tipo/tamaño y progreso de subida
- [x] Endpoint `GET /api/v1/documents` para listar documentos ya subidos (filtros por año, campaña, tipo, estado y código de serie)

## Fase 6 — Publicaciones / catálogo de productos agrícolas
- [ ] Modelo `Listing` (producto, categoría, cantidad, unidad, precio, ubicación, imágenes)
- [ ] CRUD de publicaciones (solo el propietario edita/borra)
- [ ] Listado con paginación, filtros y búsqueda vía ORM (sin SQL crudo)
- [ ] Frontend: listado, detalle, formulario de creación/edición

## Fase 7 — Contacto / mensajería entre usuarios
- [ ] Modelo de conversación y mensajes
- [ ] Endpoints para iniciar conversación y enviar mensajes (validación + rate limit)
- [ ] Frontend: bandeja de mensajes y vista de conversación

## Fase 8 — RBAC, panel de administración y moderación
- [x] Roles `admin` / `farmer` / `user` con `require_role` en la API; las cuentas nuevas nacen como `user`
- [x] Solicitudes de alta como agricultor y aprobación en 1 clic (rol + primera finca)
- [x] Gestión de usuarios: cambio de rol, bloqueo / desbloqueo con revocación de sesiones
- [x] Auto-Mod del foro (avisos, bloqueo por reincidencia o infracción grave), denuncias y centro de moderación
- [x] Archivo documental indexado (`AGRO-AAAA-XXX-NNNN`) con clasificación asistida por IA y confirmación humana
- [x] Subidas anti-malware: magic bytes, extensiones peligrosas, políglotas y PDF activos → 415; UUID sin extensión
- [x] Panel `/portal` (usuario estándar), `/admin` y botón global de ayuda / tickets de soporte
- [ ] Migraciones con Alembic (hoy `db_migrations.sync_schema` añade columnas en el arranque)
- [ ] Limitadores y Auto-Mod con estado compartido (Redis) si se despliegan varios workers

## Fase 9 — Calidad, CI/CD y despliegue
- [ ] Tests unitarios e integración backend (pytest) y frontend (Vitest + Testing Library)
- [ ] Pre-commit: ruff, eslint, prettier, detección de secretos (`gitleaks`)
- [ ] Pipeline CI: lint, tests, `pip-audit`, `npm audit`
- [ ] Dockerfiles para backend y frontend
- [ ] Gestión de secretos en el entorno de despliegue (nunca en el repo)
- [ ] Configuración de dominio, HTTPS y CORS de producción
