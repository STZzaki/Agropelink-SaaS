# Agropelink — Reglas Técnicas y de Seguridad

Este documento es de cumplimiento obligatorio. Cualquier PR que viole una regla de seguridad se rechaza.

## 1. Stack tecnológico

| Capa | Tecnología | Notas |
|------|------------|-------|
| Backend | **FastAPI** (Python 3.12+) | API REST, validación con Pydantic v2 |
| ORM | SQLAlchemy 2.x + Alembic | Único método de acceso a datos |
| Frontend | **React** + **Vite** | SPA, TypeScript recomendado |
| Estilos | **Tailwind CSS** | Sin CSS ad-hoc salvo excepciones justificadas |
| Auth | Cookies `HttpOnly` + `Secure` + `SameSite` | Nunca tokens en `localStorage` |

### Estructura del repositorio

```
/backend    → API FastAPI (app, modelos, esquemas, servicios, migraciones, tests)
/frontend   → SPA React + Vite + Tailwind
tech_rules.md
todo.md
```

## 2. Reglas de seguridad

### 2.1 Sin API keys en el frontend
- El código del frontend se considera **público**. Ninguna clave secreta (pagos, mapas con permisos de escritura, servicios cloud, LLMs, etc.) puede aparecer en `/frontend`.
- Variables `VITE_*` solo para valores públicos (p. ej. URL base de la API).
- Toda llamada a un servicio de terceros con credenciales pasa por el backend (patrón proxy).

### 2.2 Ocultar stack traces en las respuestas de la API
- `debug=False` en producción.
- Manejador global de excepciones que devuelve un cuerpo genérico (`{"detail": "Internal server error", "request_id": "..."}`) y registra el detalle **solo** en logs del servidor.
- Los errores de validación no deben filtrar detalles internos (nombres de tablas, rutas de archivos, queries).

### 2.3 Prohibido subir archivos `.env` a GitHub
- `.env` y `.env.*` están en `.gitignore`; solo se versiona `.env.example` sin valores reales.
- Configuración cargada con `pydantic-settings`.
- Recomendado: hook de pre-commit con detección de secretos (p. ej. `gitleaks` o `detect-secrets`).

### 2.4 No almacenar tokens de autenticación en `localStorage`
- Ni `localStorage` ni `sessionStorage` para tokens de acceso o refresh.
- Tokens en cookies `HttpOnly; Secure; SameSite=Lax|Strict`.
- Protección CSRF (double-submit token o `SameSite=Strict`) en endpoints que mutan estado.

### 2.5 Validar todos los inputs de usuario
- Backend: todo body, query y path param tipado con esquemas Pydantic (longitudes, rangos, formatos, `extra="forbid"`).
- Frontend: validación de formularios para UX (p. ej. `zod` + `react-hook-form`), **nunca** como única barrera.
- Escapado de salida; no usar `dangerouslySetInnerHTML` con contenido de usuario.

### 2.6 Limitar tipos y tamaños de subidas en buckets privados
- Lista blanca de tipos MIME y extensiones por caso de uso (p. ej. imágenes: `image/jpeg`, `image/png`, `image/webp`).
- Verificación por *magic bytes*, no solo por extensión o `Content-Type`.
- Tamaño máximo definido por configuración (p. ej. 5 MB imágenes) y aplicado en servidor.
- Buckets **privados**; acceso mediante URLs firmadas de corta duración.
- Nombres de archivo generados por el servidor (UUID), nunca el nombre original como ruta.

### 2.7 Prohibido el SQL crudo con inputs de usuario — usar siempre el ORM
- Todo acceso a datos mediante SQLAlchemy (consultas construidas con la API del ORM/Core).
- Prohibido `text()`, f-strings o concatenación con datos de usuario en consultas.
- Revisión obligatoria en code review y regla de linter (`ruff` con reglas `S608`).

### 2.8 Bloquear CORS estrictamente a nuestro dominio
- `CORSMiddleware` con `allow_origins` = lista explícita desde configuración (dominio de producción; `http://localhost:5173` solo en desarrollo).
- Prohibido `allow_origins=["*"]`, especialmente con `allow_credentials=True`.
- Métodos y cabeceras permitidos limitados a los necesarios.

## 3. Prácticas complementarias
- Rate limiting en login, registro y endpoints sensibles.
- Contraseñas con hash `argon2` o `bcrypt`.
- Cabeceras de seguridad (HSTS, `X-Content-Type-Options`, CSP en el frontend).
- Dependencias auditadas (`pip-audit`, `npm audit`) en CI.
- Principio de mínimo privilegio en roles de base de datos y credenciales cloud.
