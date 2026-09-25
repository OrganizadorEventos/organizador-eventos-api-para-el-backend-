/** Prueba end-to-end de la API (sin servidor externo): valida T1–T4 y auth. */
process.env.DB_FILE = require('node:path').join(__dirname, 'data', 'test-e2e.db');
const fs = require('node:fs');
fs.rmSync(process.env.DB_FILE, { force: true });
fs.rmSync(process.env.DB_FILE + '-wal', { force: true });
fs.rmSync(process.env.DB_FILE + '-shm', { force: true });

const app = require('./app');

let base = 'http://127.0.0.1:0';
let server;
let failures = 0;

function ok(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
}

function pdate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

async function api(path, { method = 'GET', token, body } = {}) {
  const full = String(path).startsWith('http') ? path : base + path;
  const res = await fetch(full, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* sin cuerpo */ }
  return { status: res.status, json };
}

async function main() {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      process.env.__PORT__ = server.address().port;
      resolve();
    });
  });
  const realBase = `http://127.0.0.1:${server.address().port}`;
  base = realBase; // ahora la helper `api` usa el puerto real
  const a = (p, o = {}) => api(p, { ...o });
  const url = `${realBase}/api`;

  // ---------- AUTH ----------
  let r = await a(`${url}/auth/register`, { method: 'POST', body: { name: 'Ana Prueba', email: 'ana@test.com', password: 'secreto1' } });
  ok('Registro valida', r.status === 201, `status=${r.status}`);
  let token = r.json.token;
  ok('Registro devuelve token', Boolean(token));

  r = await a(`${url}/auth/login`, { method: 'POST', body: { email: 'ana@test.com', password: 'secreto1' } });
  ok('Login ok', r.status === 200 && r.json.user.name === 'Ana Prueba');
  token = r.json.token;

  r = await a(`${url}/auth/login`, { method: 'POST', body: { email: 'ana@test.com', password: 'mala' } });
  ok('Login con password incorrecto -> 401', r.status === 401);

  // Rutas protegidas
  r = await a(`${url}/events`);
  ok('Sin token -> 401', r.status === 401);
  r = await a(`${url}/events`, { token });
  ok('Con token -> 200', r.status === 200);

  ok('Límite por defecto = 6h', r.json.events === undefined || r.json.events.length === 0);
  r = await a(`${url}/auth/me`, { token });
  ok('dailyHoursLimit default 6', r.json.user.dailyHoursLimit === 6);

  // ---------- T1: crear evento + plan inicial ----------
  const hoy = pdate(0);
  r = await a(`${url}/events`, {
    method: 'POST', token,
    body: {
      name: 'Fiesta de prueba',
      description: 'Evento e2e',
      tasks: [
        { title: 'Reservar salón', scheduledDate: hoy, estimatedHours: 1 },
        { title: 'Enviar invitaciones', scheduledDate: hoy, estimatedHours: 2 },
        { title: 'Confirmar catering', scheduledDate: pdate(3), estimatedHours: 1.5 },
      ],
    },
  });
  ok('Crear evento + plan (T1)', r.status === 201, `status=${r.status}`);
  const eventId = r.json.event.id;
  ok('Evento tiene 3 subtareas', r.json.event.tasks.length === 3);
  const t1 = r.json.event.tasks[0];

  // Validación: sin tareas
  r = await a(`${url}/events`, { method: 'POST', token, body: { name: 'Vacío' } });
  ok('Crear evento sin tareas -> 422', r.status === 422);

  // ---------- T2: vista Hoy ----------
  r = await a(`${url}/today?date=${hoy}`, { token });
  ok('Vista Hoy devuelve urgentes (T2)', r.status === 200, `urgentes=${r.json.urgentes.length}`);
  ok('Fecha de hoy aparece en Hoy', r.json.date === hoy);
  ok('Carga hoy = 3h (1+2)', r.json.todayHours === 3, `todayHours=${r.json.todayHours}`);
  ok('Reglas de prioridad documentadas (>=3)', r.json.rules.length >= 3);
  ok('Hoy solo trae tareas de hoy/vencidas', r.json.urgentes.every((u) => u.isToday || u.overdue), JSON.stringify(r.json.urgentes.map(u => [u.title, u.overdue])));

  // ---------- T3: reprogramar + conflicto ----------
  // Reprogramar "Confirmar catering" (1.5h) a hoy: hoy ya tiene 3h pendientes -> 4.5 <= 6, sin conflicto
  r = await a(`${url}/events/${eventId}/tasks/${t1.id + 2}/reschedule`, { method: 'POST', token, body: { newDate: hoy } });
  ok('Reprogramar sin sobrecarga -> 200', r.status === 200, `status=${r.status} error=${r.json.error || ''}`);

  // Sumamos gestiones de 1h al día de hoy: 3h + 2h = 5h
  r = await a(`${url}/events/${eventId}/tasks`, { method: 'POST', token, body: { title: 'Coordinar proveedores A', scheduledDate: hoy, estimatedHours: 1 } });
  r = await a(`${url}/events/${eventId}/tasks`, { method: 'POST', token, body: { title: 'Coordinar proveedores B', scheduledDate: hoy, estimatedHours: 1 } });
  // hoy = 1(reservar) + 2(invitar) + 1.5(catering) + 1 + 1 = 6.5h > 6 -> conflicto si movemos otra tarea grande aquí

  // Reprogramar "Confirmar catering" con más horas a hoy: 5h (otras) + 2h = 7h > 6h -> CONFLICTO
  r = await a(`${url}/events/${eventId}/tasks/${t1.id + 2}/reschedule`, { method: 'POST', token, body: { newDate: hoy, newHours: 2 } });
  ok('Conflicto detectado -> 409', r.status === 409, `status=${r.status} (${r.json.message || ''})`);
  const conflict = r.json.conflict;
  ok('Conflicto reporta límite 6h', conflict.dailyLimit === 6, `limit=${conflict.dailyLimit}`);
  ok('Conflicto reporta horas programadas > límite', conflict.scheduledHours > 6, `scheduledHours=${conflict.scheduledHours}`);
  ok('Conflicto ofrece alternativas (T3)', Array.isArray(conflict.alternatives) && conflict.alternatives.length >= 4, `alt=${conflict.alternatives.length}`);

  // Resolver: reducir horas (5h otras + 1h <= 6h ya no es conflicto)
  r = await a(`${url}/events/${eventId}/tasks/${t1.id + 2}/reschedule`, { method: 'POST', token, body: { newDate: hoy, newHours: conflict.maxAllowedHours } });
  ok('Resolver reduciendo horas -> 200', r.status === 200, `status=${r.status} (${r.json.message || ''})`);
  ok('Tarea actualizada con horas reducidas', r.json.task.estimatedHours === conflict.maxAllowedHours);

  // Resolver: aceptar sobrecarga explícitamente
  r = await a(`${url}/events/${eventId}/tasks/${t1.id + 2}/reschedule`, { method: 'POST', token, body: { newDate: hoy, newHours: 3, acceptConflict: true } });
  ok('Aceptar sobrecarga -> 200', r.status === 200);

  // Reprogramar a día libre -> sin conflicto
  r = await a(`${url}/events/${eventId}/tasks/${t1.id}/reschedule`, { method: 'POST', token, body: { newDate: pdate(1), newHours: 3 } });
  ok('Reprogramar a día libre -> 200 sin conflicto', r.status === 200 && r.json.conflict.excessHours === 0);

  // ---------- T4: ejecución + progreso ----------
  r = await a(`${url}/events/${eventId}/tasks/${t1.id + 2}/execute`, { method: 'POST', token, body: { action: 'done', note: 'Catering confirmado por teléfono.' } });
  ok('Registrar tarea como hecha (T4)', r.status === 200 && r.json.task.status === 'done');

  r = await a(`${url}/events/${eventId}/tasks/${t1.id + 1}/execute`, { method: 'POST', token, body: { action: 'postponed', note: 'Falta presupuesto.' } });
  ok('Registrar tarea como pospuesta (T4)', r.status === 200 && r.json.task.status === 'postponed');

  r = await a(`${url}/events/${eventId}`, { token });
  ok('Progreso del evento calculado', typeof r.json.event.progress === 'number' && r.json.event.progress >= 0, `progress=${r.json.event.progress}`);
  ok('Bitácora de actividades presente', Array.isArray(r.json.event.activities) && r.json.event.activities.length >= 5, `act=${r.json.event.activities.length}`);

  r = await a(`${url}/events`, { token });
  const ev = r.json.events.find((e) => e.id === eventId);
  ok('Lista de eventos incluye progreso', typeof ev.progress === 'number', `progress=${ev.progress}`);

  // ---------- Editar / eliminar ----------
  r = await a(`${url}/events/${eventId}`, { method: 'PATCH', token, body: { name: 'Fiesta de prueba (editada)' } });
  ok('Editar evento', r.status === 200 && r.json.event.name.includes('editada'));

  r = await a(`${url}/events/${eventId}/tasks/${t1.id}`, { method: 'PATCH', token, body: { estimatedHours: 3 } });
  ok('Editar subtarea (horas)', r.status === 200 && r.json.task.estimatedHours === 3);

  r = await a(`${url}/events/${eventId}/tasks/${t1.id}`, { method: 'DELETE', token });
  ok('Eliminar subtarea', r.status === 200);

  r = await a(`${url}/events/${eventId}`, { method: 'DELETE', token });
  ok('Eliminar evento', r.status === 200);
  r = await a(`${url}/events/${eventId}`, { token });
  ok('Evento eliminado -> 404', r.status === 404);

  // ---------- Aislamiento entre usuarios ----------
  let r2 = await a(`${url}/auth/register`, { method: 'POST', body: { name: 'Otra Usuaria', email: 'otra@test.com', password: 'secreto1' } });
  r2 = await a(`${url}/events`, { token: r2.json.token });
  ok('Datos aislados por usuario', r2.json.events.length === 0);

  // ---------- Demo ----------
  r = await a(`${url}/auth/demo`, { method: 'POST' });
  ok('Login demo crea datos y devuelve token', r.status === 200 && r.json.token);
  const demoToken = r.json.token;
  r = await a(`${url}/events`, { token: demoToken });
  ok('Demo tiene eventos sembrados', r.json.events.length >= 2, `events=${r.json.events.length}`);
  r = await a(`${url}/today?date=${hoy}`, { token: demoToken });
  ok('Demo tiene gestiones urgentes en Hoy', r.status === 200 && (r.json.urgentes || []).length >= 1, `status=${r.status} urgentes=${(r.json.urgentes || []).length} ${r.json.message || ''}`);

  console.log(failures === 0 ? '\n✅  Todas las pruebas pasaron.' : `\n❌  ${failures} pruebas fallaron.`);
  server.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR FATAL', e); server && server.close(); process.exit(1); });