# MIVO API

API REST para MIVO, construida con Express y Supabase. Requiere Node.js 22.5 o superior.

## Desarrollo local

```bash
npm install
npm run dev
```

El servidor inicia en `http://localhost:4000`. Configura `SUPABASE_URL`, `SUPABASE_SECRET_KEY` y `JWT_SECRET` en `backend/.env`. La app web usa el proxy de Vite hacia esta dirección.

## Migración MIVO

Antes de usar curso, peso y restablecimiento de contraseña en una base existente, ejecuta una vez [`migrations/001_mivo_fields_and_password_resets.sql`](migrations/001_mivo_fields_and_password_resets.sql) en Supabase SQL Editor. Solo agrega columnas y una tabla; conserva los datos actuales.

Para restablecer contraseñas localmente, establece `RESET_EMAIL_MODE=console` y `FRONTEND_URL=http://localhost:5173`. El enlace de un solo uso se imprime en la terminal del backend. En producción configura `RESEND_API_KEY`, `RESEND_FROM` y `FRONTEND_URL` para enviar los enlaces por correo.

## Rutas principales

- `POST /api/auth/register`, `POST /api/auth/login`
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- `GET/PATCH /api/auth/me`
- `GET/POST /api/events`, `GET/PATCH/DELETE /api/events/:id`
- `POST/PATCH/DELETE /api/events/:id/tasks[/:taskId]`
- `POST /api/events/:eventId/tasks/:taskId/reschedule`
- `POST /api/events/:eventId/tasks/:taskId/execute`
- `GET /api/today?date=YYYY-MM-DD`
- `GET /api/health`

Las rutas que modifican información requieren un token JWT en `Authorization: Bearer <token>`.
