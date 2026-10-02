# MIVO · API del organizador de eventos

API REST del organizador de eventos MIVO, construida con Express y Supabase. Permite administrar eventos, sus gestiones logísticas, agenda y cuentas. Requiere Node.js 22.5 o superior.

## Desarrollo local

```bash
npm install
npm run dev
```

El servidor inicia en `http://localhost:4000`. Configura `SUPABASE_URL`, `SUPABASE_SECRET_KEY` y `JWT_SECRET` en `backend/.env`. La app web usa el proxy de Vite hacia esta dirección.

## Migración MIVO

En una base existente, ejecuta [`migrations/001_mivo_fields_and_password_resets.sql`](migrations/001_mivo_fields_and_password_resets.sql) y [`migrations/004_event_status_and_cascade_delete.sql`](migrations/004_event_status_and_cascade_delete.sql) en Supabase SQL Editor. Agregan campos sin borrar datos y recargan el esquema de PostgREST. La migración 001 agrega `event_time`; si ya ejecutaste su versión anterior, puedes volver a ejecutarla o ejecutar [`migrations/002_event_time.sql`](migrations/002_event_time.sql). La migración 004 garantiza el estado persistente de cada evento y la eliminación en cascada de sus subtareas. Si ya ejecutaste la migración 003, la 004 puede ejecutarse igualmente.

Para restablecer contraseñas localmente, establece `RESET_EMAIL_MODE=console` y `FRONTEND_URL=http://localhost:5173`. El enlace de un solo uso se imprime en la terminal del backend. En producción configura `RESEND_API_KEY`, `RESEND_FROM` y `FRONTEND_URL` para enviar los enlaces por correo.

## Rutas principales

- `POST /api/auth/register`, `POST /api/auth/login`
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- `GET/PATCH /api/auth/me`
- `GET/POST /api/events`, `GET/PATCH/DELETE /api/events/:id`
- `PATCH /api/events/:id/status` (marcar un evento como pendiente o terminado; requiere la migración 003)
- `POST/PATCH/DELETE /api/events/:id/tasks[/:taskId]` (gestiones logísticas del evento)
- `POST /api/events/:eventId/tasks/:taskId/reschedule` (reprogramar una gestión)
- `POST /api/events/:eventId/tasks/:taskId/execute` (actualizar el estado de una gestión)
- `GET /api/today?date=YYYY-MM-DD`
- `GET /api/health`

Las rutas que modifican información requieren un token JWT en `Authorization: Bearer <token>`.

Por compatibilidad con las bases y clientes existentes, la API conserva `tasks` en algunos nombres de ruta y propiedades. En la interfaz de MIVO esos registros se presentan como gestiones de preparación del evento.
