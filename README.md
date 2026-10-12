# Agropelink

Plataforma AgTech para explotaciones agrícolas: sensores en directo, tareas y equipo, economía de la finca,
archivo documental, cuaderno SIEX, foro de la comunidad y el asistente **Agropelink AI** conectado a todo ello.

- **Backend:** FastAPI · SQLAlchemy 2 (solo ORM) · Pydantic v2 · SQLite en desarrollo, **TiDB/MySQL** en producción.
- **Frontend:** React 18 · Vite · Tailwind · PWA. Sesión en cookie HttpOnly (nunca tokens en `localStorage`).

## Puesta en marcha (desarrollo)

```bash
# Backend
cd backend
python -m venv .venv && .venv/Scripts/activate      # Windows (en Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env                                 # y rellena JWT_SECRET
uvicorn main:app --port 8000 --reload

# Frontend
cd frontend
npm install
npm run dev                                          # http://localhost:5173
```

Cuentas de prueba: `python dev_seed.py` (contraseña común en el propio archivo o en `DEV_SEED_PASSWORD`).
Superadministrador: `python scripts/create_admin.py`.

**Tests:** `cd backend && .venv/Scripts/python -m pytest -q` · **Build:** `cd frontend && npm run build`.

## Agropelink AI

El agente responde con los datos reales de la cuenta (fincas, cosechas, sensores, tareas, trabajadores, economía,
recordatorios de documentos y SIEX) mediante herramientas de solo lectura limitadas a las fincas del usuario.
Puede **proponer** tareas, gastos y archivo de documentos: nada se guarda sin que el usuario lo confirme en la tarjeta.

| `AGENT_ENGINE` | Qué usa | Coste | Privacidad |
|---|---|---|---|
| `auto` (defecto) | Ollama si hay `OLLAMA_URL`; si no, `local` | Gratis | Nada sale de tu infraestructura |
| `local` | Reglas en español + datos de la cuenta + guía agronómica general | Gratis, instantáneo | Nada sale del servidor |
| `ollama` | Modelo abierto en tu propio servidor (`OLLAMA_URL`, `OLLAMA_MODEL`) | Gratis (tu hardware) | Nada sale de tu infraestructura |
| `gemini` | Google Gemini (`GEMINI_API_KEY`) | De pago por uso | Envía pregunta y contexto mínimo a Google: solo si lo eliges |

- Las acciones («programa un riego mañana para Lucía», «he gastado 120 € en abono») se interpretan siempre con el
  motor local (determinista) y se validan contra las fincas y trabajadores propios.
- Con un modelo, solo se le envía el bloque de datos que la pregunta necesita (nunca sueldos) y su salida se trata
  como no confiable. Si Ollama no responde, contesta el motor local.
- El **resumen del día** del panel (`GET /api/v1/agent/briefing`) y la redacción del **SIEX** (`?assist=true`)
  también usan el agente; el resumen es siempre local.

## Producción

1. `ENVIRONMENT=production`, `COOKIE_SECURE=true`, `CORS_ORIGINS=["https://tu-dominio"]`, `JWT_SECRET` largo y aleatorio.
2. Base de datos TiDB: `DATABASE_URL=mysql+pymysql://…:4000/agropelink?charset=utf8mb4` y `DATABASE_SSL_CA` con la CA
   del sistema. Las tablas y columnas nuevas se crean al arrancar (`db_migrations.sync_schema`).
3. `npm run build` y servir `frontend/dist` junto a la API bajo el mismo dominio (proxy inverso hacia `/api`).
4. Los directorios de `storage/` deben ser persistentes, **no servidos** por el proxy y con copia de seguridad.
5. Con varios procesos de uvicorn, mover los límites de peticiones (en memoria) a Redis.

## Pendiente

- Tokens de ingesta por dispositivo para los sensores físicos (hoy las lecturas entran con la sesión del titular).
- Alembic para migraciones versionadas (hoy `sync_schema` añade tablas, columnas e índices de forma segura).
- Fotografías y biografías definitivas del equipo; usuario oficial de Instagram.

Normas técnicas y de seguridad: [tech_rules.md](tech_rules.md) · Hoja de ruta: [todo.md](todo.md).
