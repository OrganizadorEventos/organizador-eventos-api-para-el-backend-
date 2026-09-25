/** Datos de ejemplo para el usuario demo (Sprint 0-1). Si el usuario demo ya
 *  tiene eventos, no se vuelve a sembrar. */
function createDemoData(userId, db) {
  const existing = db.prepare('SELECT id FROM events WHERE user_id = ? LIMIT 1').get(userId);
  if (existing) return false;

  const now = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const today = fmt(now);
  const yesterday = fmt(new Date(now.getTime() - 86400000));
  const tomorrow = fmt(new Date(now.getTime() + 86400000));
  const in3 = fmt(new Date(now.getTime() + 3 * 86400000));
  const in10 = fmt(new Date(now.getTime() + 10 * 86400000));

  const insertEvent = db.prepare('INSERT INTO events (user_id, name, description) VALUES (?, ?, ?)');
  const insertTask = db.prepare(
    'INSERT INTO tasks (event_id, user_id, title, description, scheduled_date, estimated_hours, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertLog = db.prepare(
    'INSERT INTO task_events (task_id, user_id, action, note, prev_date, new_date) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const mascotas = insertEvent.run(userId, 'Fiesta de cumpleaños de Emma', 'Festejo familiar de 10 años en casa.').lastInsertRowid;
  const bodas = insertEvent.run(userId, 'Boda de Laura y Tomás', 'Ceremonia + recepción para 120 personas.').lastInsertRowid;
  const lanzamiento = insertEvent.run(userId, 'Lanzamiento de producto', 'Presentación para clientes en coworking.').lastInsertRowid;

  const mk = (eventId, title, desc, date, hours, status = 'pending', note = '') => {
    const t = insertTask.run(eventId, userId, title, desc, date, hours, status, note).lastInsertRowid;
    if (['done', 'postponed'].includes(status)) {
      insertLog.run(t, userId, status, note || (status === 'done' ? 'Tarea completada.' : 'Se pospuso por imprevisto.'), null, date);
    }
    return t;
  };

  // Evento 1 — la mayoría de sus gestiones son de HOY (T2)
  mk(mascotas, 'Reservar el salón', 'Verificar disponibilidad del quincho.', today, 1);
  mk(mascotas, 'Enviar invitaciones', 'WhatsApp + papel para abuelos.', today, 2);
  mk(mascotas, 'Confirmar catering', 'Pagar seña del foodtruck.', today, 1.5);
  mk(mascotas, 'Comprar decoración', 'Globos y mesa dulce.', tomorrow, 1);
  mk(mascotas, 'Coordinar música', 'Confirmar equipo de sonido.', in3, 1);

  // Evento 2 — tiene una gestión VENCIDA (urgente en “Hoy”) y otras reprogramadas
  mk(bodas, 'Buscar proveedores de catering', 'Comparar 3 cotizaciones.', yesterday, 4, 'pending');
  mk(bodas, 'Reservar iglesia', 'Confirmar fecha con el párroco.', today, 1);
  mk(bodas, 'Enviar invitaciones', 'Imprimir tarjetas.', in10, 3);
  mk(bodas, 'Confirmar DJ', 'Señar el servicio.', in10, 1, 'postponed', 'Se pospuso hasta definir adelanto.');

  // Evento 3 — sin fecha vencida, mezcla hecha/pendiente (progreso parcial)
  mk(lanzamiento, 'Definir agenda del evento', 'Lista de oradores y tiempos.', yesterday, 2, 'done', 'Agenda aprobada por marketing.');
  mk(lanzamiento, 'Reservar coworking', 'DTO de la sala grande.', today, 1);
  mk(lanzamiento, 'Enviar invitaciones a clientes', 'Ranking de 40 contactos.', tomorrow, 2);
  mk(lanzamiento, 'Confirmar catering', 'Cafetería del lugar.', tomorrow, 1);

  return true;
}

module.exports = { createDemoData };