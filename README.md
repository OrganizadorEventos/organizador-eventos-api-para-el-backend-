# Organizador de Eventos — API (backend)

API REST del **Organizador de Eventos Independientes**: planificación, ejecución y reprogramación de trabajo logístico de eventos, con detección de conflictos por sobrecarga diaria.

Stack: **Express 4 + SQLite (`node:sqlite`)** · CommonJS · **JWT** (`jsonwebtoken`, bcryptjs).

## Requisitos

- Node.js ≥ 22.5.0

## Inicio rápido

```bash
npm install
npm start          # arranca en http://localhost:4000
```

En desarrollo: `npm run dev` (`node --watch`).

## Tests end-to-end

```bash
node test-e2e.js
```

Cubre registro/login/demo, CRUD de eventos y tareas, reprogramación con conflicto (409 + alternativas), ejecución de tareas y vista "Hoy". Usa una BD temporal (`data/test-e2e.db`) que se recrea en cada corrida.

## Configuración (variables de entorno)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `4000` | Puerto del servidor |
| `DB_FILE` | `./data/organizador.db` | Ruta del archivo SQLite (se crea solo) |
| `JWT_SECRET` | `dev-secret-...` | Secreto para firmar tokens (cambiar en producción) |
| `CORS_ORIGIN` | `*` | Orígenes permitidos, separados por coma |

Copiar `.env.example` a `.env` para desarrollo local.

## Endpoints principales

Todas las respuestas son JSON con código HTTP (`200, 201, 400, 401, 404, 409, 422, 500`). Rutas protegidas requieren `Authorization: Bearer <token>`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Crear cuenta y obtener token |
| `POST` | `/api/auth/login` | Iniciar sesión |
| `POST` | `/api/auth/demo` | Entrar con usuario demo precargado |
| `GET/PATCH` | `/api/auth/me` | Perfil / límite diario (h/día) |
| `GET/POST` | `/api/events` | Listar / crear eventos con plan de subtareas |
| `GET/PATCH/DELETE` | `/api/events/:id` | Detalle (tareas, progreso, bitácora) / editar / eliminar |
| `POST/PATCH/DELETE` | `/api/events/:id/tasks[/:taskId]` | CRUD de gestiones logísticas |
| `POST` | `/api/events/:eventId/tasks/:taskId/reschedule` | Reprogramar con detección de conflicto (409 + alternativas) |
| `POST` | `/api/events/:eventId/tasks/:taskId/execute` | Marcar `done` / `postponed` con nota |
| `GET` | `/api/events/:eventId/tasks/:taskId/log` | Bitácora de la gestión |
| `GET` | `/api/today?date=YYYY-MM-DD` | Gestiones urgentes del día (vencidas + de hoy) |
| `GET` | `/api/health` | Health check |

### Conflicto estándar (T3)

Al reprogramar una gestión, si la suma de horas pendientes para ese día supera el límite diario del usuario (default **6 h**), la API responde **409** con un objeto `conflict` (`type: "OVERLOAD"`) y 4 alternativas: mover a otra fecha, reducir horas, posponer, o aceptar con `acceptConflict: true`.

## Despliegue (Render)

- **Web Service**, build `npm install`, start `node server.js`.
- Variables: `JWT_SECRET`, `CORS_ORIGIN=https://<front>.vercel.app`, `PORT`.
- Persistencia: usar Render Persistent Disk o migrar a PostgreSQL/Supabase (SQLite no persiste entre deploys gratuitos).

## Autores / proyecto

Proyecto educativo. Detalle de decisiones UX y contrato API completo en el repositorio de documentación del equipo (`docs/` del workspace).