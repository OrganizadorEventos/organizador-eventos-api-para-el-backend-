const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const idParam = (name, description) => ({
  in: 'path', name, required: true, description,
  schema: { type: 'integer' },
});
const jsonBody = (schema, example) => ({
  required: true,
  content: { 'application/json': { schema, ...(example ? { example } : {}) } },
});
const response = (description, example) => ({
  description,
  ...(example ? { content: { 'application/json': { example } } } : {}),
});
const auth = [{ bearerAuth: [] }];
const errorExample = { error: 'validation', message: 'Los datos enviados no superan la validación.' };
const taskExample = {
  id: 1, eventId: 1, title: 'Reservar el salón', description: '',
  scheduledDate: '2026-10-01', estimatedHours: 2, status: 'pending',
  note: '', createdAt: '2026-09-24T12:00:00.000Z',
};
const taskSchema = {
  type: 'object', properties: {
    id: { type: 'integer' }, eventId: { type: 'integer' }, title: { type: 'string' },
    description: { type: 'string' }, scheduledDate: { type: 'string', format: 'date' },
    estimatedHours: { type: 'number' }, status: { type: 'string', enum: ['pending', 'done', 'postponed'] },
    note: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' },
  },
};
const taskInput = {
  type: 'object', required: ['title', 'scheduledDate', 'estimatedHours'],
  properties: {
    title: { type: 'string', minLength: 2 }, description: { type: 'string' },
    scheduledDate: { type: 'string', format: 'date' },
    estimatedHours: { type: 'number', minimum: 0.25, maximum: 24 },
  },
};
const eventIdParams = [idParam('id', 'Identificador del evento.')];
const taskIdParams = [idParam('eventId', 'Identificador del evento.'), idParam('taskId', 'Identificador de la gestión.')];
const eventExample = {
  id: 1, name: 'Conferencia anual', type: 'Conferencia', date: '2026-11-15',
  description: 'Encuentro anual del equipo', createdAt: '2026-09-24T12:00:00.000Z',
  updatedAt: '2026-09-24T12:00:00.000Z',
};
const userSchema = {
  type: 'object', properties: {
    id: { type: 'integer' }, name: { type: 'string' }, email: { type: 'string', format: 'email' },
    isDemo: { type: 'boolean' }, dailyHoursLimit: { type: 'number' }, createdAt: { type: 'string', format: 'date-time' },
  },
};
const tokenReply = { token: 'eyJhbGciOiJIUzI1NiIs...', user: { id: 1, name: 'Ana Pérez', email: 'ana@example.com', isDemo: false, dailyHoursLimit: 6, createdAt: '2026-09-24T12:00:00.000Z' } };

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Organizador de Eventos API',
      version: '1.0.0',
      description: 'API REST del Organizador de Eventos Independientes',
    },
    servers: [{ url: 'http://localhost:4000' }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: { Task: taskSchema, User: userSchema },
    },
    paths: {
      '/api/login/': {
        post: { tags: ['Autenticación'], summary: 'Iniciar sesión (ruta de compatibilidad)', description: 'Alias de POST /api/auth/login; utiliza la misma autenticación JWT.', requestBody: jsonBody({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } }, { email: 'ana@example.com', password: 'secreto123' }), responses: { 200: response('Sesión iniciada.', tokenReply), 401: response('Credenciales incorrectas.', { error: 'invalid_credentials', message: 'Correo o contraseña incorrectos.' }) } },
      },
      '/api/registro/': {
        post: { tags: ['Autenticación'], summary: 'Registrar usuario (ruta de compatibilidad)', description: 'Alias de POST /api/auth/register.', requestBody: jsonBody({ type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string', minLength: 2 }, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 6 } } }, { name: 'Ana Pérez', email: 'ana@example.com', password: 'secreto123' }), responses: { 201: response('Cuenta creada y token emitido.', tokenReply), 409: response('El correo ya está registrado.', { error: 'email_taken', message: 'Ya existe una cuenta con ese correo.' }), 422: response('Datos inválidos.', errorExample) } },
      },
      '/api/usuarios/{user_id}/limite': {
        get: { tags: ['Usuarios'], summary: 'Consultar límite diario de un usuario', description: 'Solo el usuario autenticado puede consultar su propio límite.', security: auth, parameters: [idParam('user_id', 'Identificador del usuario autenticado.')], responses: { 200: response('Límite diario actual.', { user: { ...tokenReply.user, dailyHoursLimit: 6 } }), 401: response('Autenticación requerida.', { error: 'auth_required', message: 'Debes iniciar sesión para continuar.' }), 404: response('Usuario no encontrado.', { error: 'not_found', message: 'Usuario no encontrado.' }) } },
        put: { tags: ['Usuarios'], summary: 'Actualizar límite diario de un usuario', description: 'Alias de PATCH /api/auth/me; actualiza users.daily_hours_limit y solo admite al usuario autenticado.', security: auth, parameters: [idParam('user_id', 'Identificador del usuario autenticado.')], requestBody: jsonBody({ type: 'object', required: ['dailyHoursLimit'], properties: { dailyHoursLimit: { type: 'number', exclusiveMinimum: 0, maximum: 24 } } }, { dailyHoursLimit: 6 }), responses: { 200: response('Límite diario actualizado.', { user: { ...tokenReply.user, dailyHoursLimit: 6 } }), 401: response('Autenticación requerida.', { error: 'auth_required', message: 'Debes iniciar sesión para continuar.' }), 404: response('Usuario no encontrado.', { error: 'not_found', message: 'Usuario no encontrado.' }), 422: response('Límite inválido.', errorExample) } },
      },
      '/api/hoy/': {
        get: { tags: ['Hoy'], summary: 'Consultar resumen de hoy (ruta de compatibilidad)', description: 'Alias de GET /api/today; requiere la fecha local y autenticación.', security: auth, parameters: [{ in: 'query', name: 'date', required: true, description: 'Fecha local en formato AAAA-MM-DD.', schema: { type: 'string', format: 'date' }, example: '2026-09-24' }], responses: { 200: response('Resumen de carga y gestiones urgentes.', { date: '2026-09-24', dailyLimit: 6, todayHours: 2, overdueHours: 1, workloadHours: 3, urgentes: [], rules: [] }), 401: response('Autenticación requerida.', { error: 'auth_required', message: 'Debes iniciar sesión para continuar.' }), 422: response('Fecha ausente o inválida.', errorExample) } },
      },
      '/api/eventos/plan-inicial/': {
        post: { tags: ['Eventos'], summary: 'Crear evento y plan inicial (compatibilidad)', description: 'Alias de POST /api/events. Crea el evento y sus gestiones iniciales en las tablas events y tasks existentes.', security: auth, requestBody: jsonBody({ type: 'object', required: ['name', 'type', 'date', 'tasks'], properties: { name: { type: 'string', minLength: 2 }, type: { type: 'string', minLength: 2 }, date: { type: 'string', format: 'date' }, description: { type: 'string' }, tasks: { type: 'array', minItems: 1, maxItems: 50, items: taskInput } } }, { name: eventExample.name, type: eventExample.type, date: eventExample.date, description: eventExample.description, tasks: [{ title: taskExample.title, scheduledDate: taskExample.scheduledDate, estimatedHours: 2 }] }), responses: { 201: response('Evento y plan inicial creados.', { event: { ...eventExample, tasks: [taskExample] } }), 400: response('Datos inválidos.', errorExample), 401: response('Autenticación requerida.', { error: 'auth_required', message: 'Debes iniciar sesión para continuar.' }) } },
      },
      '/api/eventos/{event_id}': {
        get: { tags: ['Eventos'], summary: 'Consultar evento (ruta de compatibilidad)', security: auth, parameters: [idParam('event_id', 'Identificador del evento.')], responses: { 200: response('Evento, gestiones, progreso y actividad.', { event: { ...eventExample, tasks: [taskExample], progress: 0, doneHours: 0, totalHours: 2, activities: [] } }), 401: response('Autenticación requerida.', { error: 'auth_required', message: 'Debes iniciar sesión para continuar.' }), 404: response('Evento no encontrado.', { error: 'error', message: 'No encontramos ese evento.' }) } },
        patch: { tags: ['Eventos'], summary: 'Actualizar evento (ruta de compatibilidad)', security: auth, parameters: [idParam('event_id', 'Identificador del evento.')], requestBody: jsonBody({ type: 'object', properties: { name: { type: 'string', minLength: 2 }, type: { type: 'string', minLength: 2 }, date: { type: 'string', format: 'date' }, description: { type: 'string' } } }, { name: eventExample.name, type: eventExample.type, date: eventExample.date, description: eventExample.description }), responses: { 200: response('Evento actualizado.', { event: eventExample }), 400: response('Datos inválidos.', errorExample), 401: response('Autenticación requerida.', { error: 'auth_required', message: 'Debes iniciar sesión para continuar.' }), 404: response('Evento no encontrado.', { error: 'error', message: 'No encontramos ese evento.' }) } },
        delete: { tags: ['Eventos'], summary: 'Eliminar evento (ruta de compatibilidad)', security: auth, parameters: [idParam('event_id', 'Identificador del evento.')], responses: { 200: response('Evento y sus gestiones eliminados.', { ok: true, message: 'Evento eliminado.' }), 401: response('Autenticación requerida.', { error: 'auth_required', message: 'Debes iniciar sesión para continuar.' }), 404: response('Evento no encontrado.', { error: 'error', message: 'No encontramos ese evento.' }) } },
      },
      '/api/eventos/{event_id}/progreso': {
        get: { tags: ['Eventos'], summary: 'Consultar progreso de evento', description: 'Calcula el progreso con las gestiones existentes: porcentaje completado y horas realizadas frente al total.', security: auth, parameters: [idParam('event_id', 'Identificador del evento.')], responses: { 200: response('Progreso calculado a partir de tasks.', { eventId: 1, progress: 50, doneHours: 2, totalHours: 4 }), 401: response('Autenticación requerida.', { error: 'auth_required', message: 'Debes iniciar sesión para continuar.' }), 404: response('Evento no encontrado.', { error: 'error', message: 'No encontramos ese evento.' }) } },
      },
      '/api/eventos/{event_id}/subtareas/': {
        post: { tags: ['Gestiones'], summary: 'Crear subtarea/gestión para evento', description: 'Alias de POST /api/events/{id}/tasks; usa la tabla tasks.', security: auth, parameters: [idParam('event_id', 'Identificador del evento.')], requestBody: jsonBody(taskInput, { title: taskExample.title, description: 'Confirmar disponibilidad', scheduledDate: taskExample.scheduledDate, estimatedHours: 2 }), responses: { 201: response('Subtarea creada.', { task: taskExample }), 400: response('Datos inválidos.', errorExample), 401: response('Autenticación requerida.', { error: 'auth_required', message: 'Debes iniciar sesión para continuar.' }), 404: response('Evento no encontrado.', { error: 'error', message: 'No encontramos ese evento.' }) } },
        get: { tags: ['Gestiones'], summary: 'Listar subtareas/gestiones del evento', description: 'Devuelve las tareas del evento usando la tabla tasks existente.', security: auth, parameters: [idParam('event_id', 'Identificador del evento.')], responses: { 200: response('Subtareas asociadas al evento.', { eventId: 1, subtareas: [taskExample] }), 401: response('Autenticación requerida.', { error: 'auth_required', message: 'Debes iniciar sesión para continuar.' }), 404: response('Evento no encontrado.', { error: 'error', message: 'No encontramos ese evento.' }) } },
      },
      '/api/eventos/{event_id}/subtareas/{subtask_id}': {
        patch: { tags: ['Gestiones'], summary: 'Actualizar subtarea/gestión', description: 'Alias de PATCH /api/events/{eventId}/tasks/{taskId}. Los campos omitidos conservan su valor.', security: auth, parameters: [idParam('event_id', 'Identificador del evento.'), idParam('subtask_id', 'Identificador de la subtarea.')], requestBody: jsonBody({ type: 'object', properties: { title: { type: 'string', minLength: 2 }, description: { type: 'string' }, scheduledDate: { type: 'string', format: 'date' }, estimatedHours: { type: 'number', minimum: 0.25, maximum: 24 } } }, { title: taskExample.title, description: 'Confirmar disponibilidad', scheduledDate: taskExample.scheduledDate, estimatedHours: 2 }), responses: { 200: response('Subtarea actualizada.', { task: taskExample }), 400: response('Datos inválidos.', errorExample), 401: response('Autenticación requerida.', { error: 'auth_required', message: 'Debes iniciar sesión para continuar.' }), 404: response('Evento o subtarea no encontrados.', { error: 'error', message: 'No encontramos esa tarea.' }) } },
        delete: { tags: ['Gestiones'], summary: 'Eliminar subtarea/gestión', description: 'Alias de DELETE /api/events/{eventId}/tasks/{taskId}.', security: auth, parameters: [idParam('event_id', 'Identificador del evento.'), idParam('subtask_id', 'Identificador de la subtarea.')], responses: { 200: response('Subtarea eliminada.', { ok: true, message: 'Gestión eliminada.' }), 401: response('Autenticación requerida.', { error: 'auth_required', message: 'Debes iniciar sesión para continuar.' }), 404: response('Evento o subtarea no encontrados.', { error: 'error', message: 'No encontramos esa tarea.' }) } },
      },
      '/api/health': {
        get: { tags: ['Sistema'], summary: 'Comprobar estado del servicio', responses: { 200: response('Servicio activo.', { ok: true, uptime: 123.4 }) } },
      },
      '/api/health/': {
        get: { tags: ['Sistema'], summary: 'Comprobar estado del servicio (ruta de compatibilidad)', description: 'Alias con barra final de GET /api/health.', responses: { 200: response('Servicio activo.', { ok: true, uptime: 123.4 }) } },
      },
      '/api/docs': {
        get: { tags: ['Sistema'], summary: 'Abrir documentación interactiva Swagger UI', responses: { 200: { description: 'Interfaz HTML de Swagger UI.' } } },
      },
      '/api/auth/register': {
        post: { tags: ['Autenticación'], summary: 'Registrar usuario', requestBody: jsonBody({ type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string', minLength: 2 }, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 6 } } }, { name: 'Ana Pérez', email: 'ana@example.com', password: 'secreto123' }), responses: { 201: response('Cuenta creada y token emitido.', tokenReply), 409: response('El correo ya está registrado.', { error: 'email_taken', message: 'Ya existe una cuenta con ese correo.' }), 422: response('Datos inválidos.', errorExample) } },
      },
      '/api/auth/login': {
        post: { tags: ['Autenticación'], summary: 'Iniciar sesión', requestBody: jsonBody({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } }, { email: 'ana@example.com', password: 'secreto123' }), responses: { 200: response('Sesión iniciada.', tokenReply), 401: response('Credenciales incorrectas.', { error: 'invalid_credentials', message: 'Correo o contraseña incorrectos.' }) } },
      },
      '/api/auth/demo': {
        post: { tags: ['Autenticación'], summary: 'Iniciar sesión como usuario demo', description: 'Crea los datos demo en el primer uso y devuelve un token.', responses: { 200: response('Token y usuario demo.', { ...tokenReply, user: { ...tokenReply.user, name: 'Usuario Demo', email: 'demo@organizador.app', isDemo: true } }) } },
      },
      '/api/auth/me': {
        get: { tags: ['Autenticación'], summary: 'Consultar usuario autenticado', security: auth, responses: { 200: response('Datos públicos del usuario.', { user: tokenReply.user }), 401: response('Sesión inválida.', { error: 'auth_required', message: 'Sesión no válida.' }) } },
        patch: { tags: ['Autenticación'], summary: 'Actualizar límite diario de horas', security: auth, requestBody: jsonBody({ type: 'object', required: ['dailyHoursLimit'], properties: { dailyHoursLimit: { type: 'number', exclusiveMinimum: 0, maximum: 24 } } }, { dailyHoursLimit: 6 }), responses: { 200: response('Usuario actualizado.', { user: tokenReply.user }), 422: response('Límite inválido.', errorExample) } },
      },
      '/api/events': {
        get: { tags: ['Eventos'], summary: 'Listar eventos del usuario', description: 'Incluye contadores de gestiones y progreso.', security: auth, responses: { 200: response('Eventos del usuario.', { events: [{ ...eventExample, taskCount: 3, pendingCount: 2, postponedCount: 0, progress: 33, doneHours: 2, totalHours: 6 }] }) } },
        post: { tags: ['Eventos'], summary: 'Crear evento con gestiones iniciales', security: auth, requestBody: jsonBody({ type: 'object', required: ['name', 'type', 'date', 'tasks'], properties: { name: { type: 'string', minLength: 2 }, type: { type: 'string', minLength: 2 }, date: { type: 'string', format: 'date' }, description: { type: 'string' }, tasks: { type: 'array', minItems: 1, maxItems: 50, items: taskInput } } }, { name: eventExample.name, type: eventExample.type, date: eventExample.date, description: eventExample.description, tasks: [{ title: taskExample.title, scheduledDate: taskExample.scheduledDate, estimatedHours: 2 }] }), responses: { 201: response('Evento y gestiones iniciales creados.', { event: { ...eventExample, tasks: [taskExample] } }), 400: response('Datos inválidos.', errorExample) } },
      },
      '/api/events/{id}': {
        get: { tags: ['Eventos'], summary: 'Consultar evento, gestiones y actividad', security: auth, parameters: eventIdParams, responses: { 200: response('Detalle del evento.', { event: { ...eventExample, tasks: [taskExample], progress: 0, doneHours: 0, totalHours: 2, activities: [] } }), 404: response('Evento inexistente o ajeno al usuario.', { error: 'error', message: 'No encontramos ese evento.' }) } },
        patch: { tags: ['Eventos'], summary: 'Actualizar evento', description: 'Los campos omitidos conservan su valor actual.', security: auth, parameters: eventIdParams, requestBody: jsonBody({ type: 'object', properties: { name: { type: 'string', minLength: 2 }, type: { type: 'string', minLength: 2 }, date: { type: 'string', format: 'date' }, description: { type: 'string' } } }, { name: eventExample.name, type: eventExample.type, date: eventExample.date, description: eventExample.description }), responses: { 200: response('Evento actualizado.', { event: eventExample }), 400: response('Datos inválidos.', errorExample), 404: response('Evento no encontrado.', { error: 'error', message: 'No encontramos ese evento.' }) } },
        delete: { tags: ['Eventos'], summary: 'Eliminar evento', security: auth, parameters: eventIdParams, responses: { 200: response('Evento eliminado.', { ok: true, message: 'Evento eliminado.' }), 404: response('Evento no encontrado.', { error: 'error', message: 'No encontramos ese evento.' }) } },
      },
      '/api/events/{id}/tasks': {
        post: { tags: ['Gestiones'], summary: 'Agregar gestión a un evento', security: auth, parameters: eventIdParams, requestBody: jsonBody(taskInput, { title: taskExample.title, description: 'Confirmar disponibilidad y capacidad', scheduledDate: taskExample.scheduledDate, estimatedHours: 2 }), responses: { 201: response('Gestión creada.', { task: taskExample }), 400: response('Datos inválidos.', errorExample), 404: response('Evento no encontrado.', { error: 'error', message: 'No encontramos ese evento.' }) } },
      },
      '/api/events/{eventId}/tasks/{taskId}': {
        patch: { tags: ['Gestiones'], summary: 'Actualizar gestión', description: 'Los campos omitidos conservan su valor actual.', security: auth, parameters: taskIdParams, requestBody: jsonBody({ type: 'object', properties: { title: { type: 'string', minLength: 2 }, description: { type: 'string' }, scheduledDate: { type: 'string', format: 'date' }, estimatedHours: { type: 'number', minimum: 0.25, maximum: 24 } } }, { title: taskExample.title, description: 'Confirmar disponibilidad', scheduledDate: taskExample.scheduledDate, estimatedHours: 2 }), responses: { 200: response('Gestión actualizada.', { task: taskExample }), 400: response('Datos inválidos.', errorExample), 404: response('Evento o gestión no encontrados.', { error: 'error', message: 'No encontramos esa tarea.' }) } },
        delete: { tags: ['Gestiones'], summary: 'Eliminar gestión', security: auth, parameters: taskIdParams, responses: { 200: response('Gestión eliminada.', { ok: true, message: 'Gestión eliminada.' }), 404: response('Evento o gestión no encontrados.', { error: 'error', message: 'No encontramos esa tarea.' }) } },
      },
      '/api/events/{eventId}/tasks/{taskId}/reschedule': {
        post: { tags: ['Gestiones'], summary: 'Reprogramar gestión', security: auth, parameters: taskIdParams, requestBody: jsonBody({ type: 'object', required: ['newDate'], properties: { newDate: { type: 'string', format: 'date' }, newHours: { type: 'number', minimum: 0.25, maximum: 24 }, acceptConflict: { type: 'boolean', description: 'Permite guardar aun cuando se exceda el límite diario.' } } }, { newDate: '2026-10-03', newHours: 2, acceptConflict: false }), responses: { 200: response('Gestión reprogramada; incluye evaluación de carga.', { task: taskExample, conflict: { type: 'OVERLOAD', dailyLimit: 6, scheduledHours: 4, otherHours: 2, movingHours: 2, excessHours: 0, overloadHours: 0, date: '2026-10-03' } }), 400: response('Fecha u horas inválidas.', errorExample), 404: response('Evento o gestión no encontrados.', { error: 'error', message: 'No encontramos esa tarea.' }), 409: response('Sobrecarga diaria; se puede reintentar con acceptConflict=true.', { error: 'conflict', conflict: { type: 'OVERLOAD', dailyLimit: 6, scheduledHours: 8, otherHours: 6, movingHours: 2, excessHours: 2, date: '2026-10-03' }, message: 'La fecha supera el límite diario.', task: taskExample }) } },
      },
      '/api/events/{eventId}/tasks/{taskId}/execute': {
        post: { tags: ['Gestiones'], summary: 'Cambiar estado de una gestión', security: auth, parameters: taskIdParams, requestBody: jsonBody({ type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['done', 'postponed', 'pending'] }, note: { type: 'string' } } }, { action: 'done', note: 'Confirmado con el proveedor' }), responses: { 200: response('Estado actualizado.', { task: { ...taskExample, status: 'done', note: 'Confirmado con el proveedor' } }), 400: response('Estado inválido.', errorExample), 404: response('Evento o gestión no encontrados.', { error: 'error', message: 'No encontramos esa tarea.' }) } },
      },
      '/api/events/{eventId}/tasks/{taskId}/log': {
        get: { tags: ['Gestiones'], summary: 'Consultar historial de una gestión', security: auth, parameters: taskIdParams, responses: { 200: response('Historial de acciones.', { log: [{ id: 1, taskId: 1, action: 'created', note: 'Plan inicial', createdAt: '2026-09-24T12:00:00.000Z' }] }), 404: response('Evento o gestión no encontrados.', { error: 'error', message: 'No encontramos esa tarea.' }) } },
      },
      '/api/today': {
        get: { tags: ['Gestiones'], summary: 'Consultar gestiones urgentes del día', description: 'Incluye gestiones vencidas y las planificadas para la fecha local indicada.', security: auth, parameters: [{ in: 'query', name: 'date', required: true, description: 'Fecha local en formato AAAA-MM-DD.', schema: { type: 'string', format: 'date' }, example: '2026-09-24' }], responses: { 200: response('Carga diaria y lista priorizada.', { date: '2026-09-24', dailyLimit: 6, todayHours: 2, overdueHours: 1, workloadHours: 3, urgentes: [{ ...taskExample, overdue: false, isToday: true, urgencyScore: 102, eventName: eventExample.name, eventId: 1, eventProgress: 0 }], rules: ['1. Vencidas sin hacer: máxima urgencia (+200 puntos).', '2. Gestiones planificadas para hoy: urgente (+100 puntos).', '3. Mayor carga estimada desempata la lista.'] }), 422: response('Fecha ausente o inválida.', errorExample) } },
      },
    },
  },
  // Se conserva el escaneo de anotaciones existentes de las rutas.
  apis: [path.join(__dirname, 'routes', '*.js').replace(/\\/g, '/')],
};

module.exports = swaggerJsdoc(options);
