require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

let serverClient;
let publishableClient;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  return {
    url: url && !url.includes('YOUR_PROJECT_REF') ? url : null,
    publishableKey: publishableKey && !publishableKey.includes('YOUR_PUBLISHABLE_KEY')
      ? publishableKey
      : null,
    secretKey: secretKey && !secretKey.includes('YOUR_SECRET_KEY')
      ? secretKey
      : null,
  };
}

function isSupabaseConfigured() {
  const { url, secretKey } = getSupabaseConfig();
  return Boolean(url && secretKey);
}

function getSupabaseClient() {
  if (serverClient) return serverClient;

  const { url, secretKey } = getSupabaseConfig();
  if (!url || !secretKey) {
    throw new Error('Configura SUPABASE_URL y SUPABASE_SECRET_KEY en el entorno del servidor.');
  }

  serverClient = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return serverClient;
}

function getSupabasePublishableClient() {
  if (publishableClient) return publishableClient;

  const { url, publishableKey } = getSupabaseConfig();
  if (!url || !publishableKey) {
    throw new Error('Configura SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en el entorno.');
  }

  publishableClient = createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return publishableClient;
}

async function result(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function maybeOne(query) {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

function parseRow(row) {
  if (!row) return null;
  const parsed = { ...row };
  for (const key of ['id', 'event_id', 'user_id', 'task_id']) {
    if (parsed[key] !== undefined && parsed[key] !== null) parsed[key] = Number(parsed[key]);
  }
  if (parsed.is_demo !== undefined && parsed.is_demo !== null) parsed.is_demo = Boolean(parsed.is_demo);
  return parsed;
}

async function getUser(id) {
  return parseRow(await maybeOne(getSupabaseClient().from('users').select('*').eq('id', Number(id))));
}

async function getUserByEmail(email) {
  return parseRow(await maybeOne(
    getSupabaseClient().from('users').select('*').ilike('email', String(email)),
  ));
}

async function updateUserDailyHoursLimit(id, dailyHoursLimit) {
  const row = await maybeOne(getSupabaseClient().from('users').update({
    daily_hours_limit: Number(dailyHoursLimit),
  }).eq('id', Number(id)).select('*'));
  return parseRow(row);
}

async function createUser({ name, email, passwordHash, isDemo = false, dailyHoursLimit = 6 }) {
  const row = await result(getSupabaseClient().from('users').insert({
    name,
    email,
    password_hash: passwordHash,
    is_demo: Boolean(isDemo),
    daily_hours_limit: dailyHoursLimit,
  }).select('*').single());
  return parseRow(row);
}

async function getEvent(id) {
  return parseRow(await maybeOne(getSupabaseClient().from('events').select('*').eq('id', Number(id))));
}

async function getEventByOwnerLast(userId, name) {
  return parseRow(await maybeOne(
    getSupabaseClient().from('events').select('*')
      .eq('user_id', Number(userId)).eq('name', name)
      .order('id', { ascending: false }).limit(1),
  ));
}

async function getTask(id) {
  return parseRow(await maybeOne(getSupabaseClient().from('tasks').select('*').eq('id', Number(id))));
}

async function listEvents(userId) {
  const rows = await result(getSupabaseClient().from('events').select('*')
    .eq('user_id', Number(userId)).order('updated_at', { ascending: false }));
  return rows.map(parseRow);
}

async function listTasks(eventId) {
  const rows = await result(getSupabaseClient().from('tasks').select('*')
    .eq('event_id', Number(eventId))
    .order('scheduled_date', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true }));
  return rows.map(parseRow);
}

async function listTodayTasks(userId) {
  const rows = await result(getSupabaseClient().from('tasks').select('*')
    .eq('user_id', Number(userId))
    .order('status', { ascending: true })
    .order('scheduled_date', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true }));
  return rows.map(parseRow);
}

async function createEvent({ userId, name, eventType, eventDate, description = '' }) {
  const row = await result(getSupabaseClient().from('events').insert({
    user_id: Number(userId),
    name,
    event_type: eventType,
    event_date: eventDate,
    description,
  }).select('*').single());
  return parseRow(row);
}

async function createEventWithTasks({ event: eventData, tasks: taskData }) {
  const event = await createEvent(eventData);
  const tasks = [];

  try {
    for (const task of taskData) {
      const createdTask = await createTask({
        eventId: event.id,
        userId: eventData.userId,
        ...task,
      });
      tasks.push(createdTask);
      await logTaskEvent({
        taskId: createdTask.id,
        userId: eventData.userId,
        action: 'created',
        note: 'Plan inicial',
      });
    }
    return { event, tasks };
  } catch (error) {
    try {
      // The schema cascades this cleanup to any tasks and task_events already created.
      await deleteEvent(event.id);
    } catch (cleanupError) {
      error.cleanupError = cleanupError;
    }
    throw error;
  }
}

async function createSupabaseDemoData(userId) {
  const existing = await result(getSupabaseClient().from('events').select('id')
    .eq('user_id', Number(userId)).limit(1));
  if (existing.length > 0) return false;

  const now = new Date();
  const formatDate = (date) => date.toISOString().slice(0, 10);
  const today = formatDate(now);
  const yesterday = formatDate(new Date(now.getTime() - 86400000));
  const tomorrow = formatDate(new Date(now.getTime() + 86400000));
  const in3Days = formatDate(new Date(now.getTime() + 3 * 86400000));
  const in10Days = formatDate(new Date(now.getTime() + 10 * 86400000));
  const examples = [
    {
      name: 'Fiesta de cumpleaños de Emma',
      description: 'Festejo familiar de 10 años en casa.',
      tasks: [
        ['Reservar el salón', 'Verificar disponibilidad del quincho.', today, 1],
        ['Enviar invitaciones', 'WhatsApp + papel para abuelos.', today, 2],
        ['Confirmar catering', 'Pagar seña del foodtruck.', today, 1.5],
        ['Comprar decoración', 'Globos y mesa dulce.', tomorrow, 1],
        ['Coordinar música', 'Confirmar equipo de sonido.', in3Days, 1],
      ],
    },
    {
      name: 'Boda de Laura y Tomás',
      description: 'Ceremonia + recepción para 120 personas.',
      tasks: [
        ['Buscar proveedores de catering', 'Comparar 3 cotizaciones.', yesterday, 4],
        ['Reservar iglesia', 'Confirmar fecha con el párroco.', today, 1],
        ['Enviar invitaciones', 'Imprimir tarjetas.', in10Days, 3],
        ['Confirmar DJ', 'Señar el servicio.', in10Days, 1, 'postponed', 'Se pospuso hasta definir adelanto.'],
      ],
    },
    {
      name: 'Lanzamiento de producto',
      description: 'Presentación para clientes en coworking.',
      tasks: [
        ['Definir agenda del evento', 'Lista de oradores y tiempos.', yesterday, 2, 'done', 'Agenda aprobada por marketing.'],
        ['Reservar coworking', 'DTO de la sala grande.', today, 1],
        ['Enviar invitaciones a clientes', 'Ranking de 40 contactos.', tomorrow, 2],
        ['Confirmar catering', 'Cafetería del lugar.', tomorrow, 1],
      ],
    },
  ];
  const createdEventIds = [];

  try {
    for (const example of examples) {
      const event = await createEvent({
        userId,
        name: example.name,
        eventType: '',
        eventDate: '',
        description: example.description,
      });
      createdEventIds.push(event.id);

      for (const [title, description, scheduledDate, hours, status = 'pending', note = ''] of example.tasks) {
        let task = await createTask({
          eventId: event.id,
          userId,
          title,
          description,
          scheduledDate,
          hours,
        });
        if (status !== 'pending') {
          task = await updateTaskStatus({ id: task.id, status, note });
          await logTaskEvent({
            taskId: task.id,
            userId,
            action: status,
            note: note || (status === 'done' ? 'Tarea completada.' : 'Se pospuso por imprevisto.'),
            newDate: scheduledDate,
          });
        }
      }
    }
    return true;
  } catch (error) {
    try {
      await Promise.all(createdEventIds.map((id) => deleteEvent(id)));
    } catch (cleanupError) {
      error.cleanupError = cleanupError;
    }
    throw error;
  }
}

async function updateEvent({ id, name, eventType = null, eventDate = null, description }) {
  const current = await getEvent(id);
  if (!current) return null;

  const row = await maybeOne(getSupabaseClient().from('events').update({
    name,
    event_type: eventType ?? current.event_type,
    event_date: eventDate ?? current.event_date,
    description,
    updated_at: new Date().toISOString(),
  }).eq('id', Number(id)).select('*'));
  return parseRow(row);
}

async function deleteEvent(id) {
  await result(getSupabaseClient().from('events').delete().eq('id', Number(id)));
}

async function createTask({ eventId, userId, title, description = '', scheduledDate = null, hours = 1 }) {
  const row = await result(getSupabaseClient().from('tasks').insert({
    event_id: Number(eventId),
    user_id: Number(userId),
    title,
    description,
    scheduled_date: scheduledDate || null,
    estimated_hours: hours,
  }).select('*').single());

  await result(getSupabaseClient().from('events').update({ updated_at: new Date().toISOString() })
    .eq('id', Number(eventId)));
  return parseRow(row);
}

async function touchEventForTask(taskId) {
  const task = await getTask(taskId);
  if (!task) return;
  await result(getSupabaseClient().from('events').update({ updated_at: new Date().toISOString() })
    .eq('id', task.event_id));
}

async function updateTask({ id, title, description, scheduledDate, hours }) {
  const row = await maybeOne(getSupabaseClient().from('tasks').update({
    title,
    description,
    scheduled_date: scheduledDate || null,
    estimated_hours: hours,
  }).eq('id', Number(id)).select('*'));
  if (row) await touchEventForTask(id);
  return parseRow(row);
}

async function updateTaskStatus({ id, status, note = '' }) {
  const row = await maybeOne(getSupabaseClient().from('tasks').update({ status, note })
    .eq('id', Number(id)).select('*'));
  if (row) await touchEventForTask(id);
  return parseRow(row);
}

async function deleteTask(id) {
  const task = await getTask(id);
  if (!task) return;
  await result(getSupabaseClient().from('events').update({ updated_at: new Date().toISOString() })
    .eq('id', task.event_id));
  await result(getSupabaseClient().from('tasks').delete().eq('id', Number(id)));
}

async function logTaskEvent({
  taskId, userId, action, note = '', prevDate = null, newDate = null,
  prevHours = null, newHours = null,
}) {
  const row = await result(getSupabaseClient().from('task_events').insert({
    task_id: Number(taskId),
    user_id: Number(userId),
    action,
    note,
    prev_date: prevDate,
    new_date: newDate,
    prev_hours: prevHours,
    new_hours: newHours,
  }).select('*').single());
  return parseRow(row);
}

async function listTaskEvents(taskId) {
  const rows = await result(getSupabaseClient().from('task_events').select('*')
    .eq('task_id', Number(taskId)).order('created_at', { ascending: true }));
  return rows.map(parseRow);
}

async function listActivities(userId, eventId, limit = 30) {
  const rows = await result(getSupabaseClient().from('task_events')
    .select('*, tasks!inner(title,event_id)')
    .eq('user_id', Number(userId)).eq('tasks.event_id', Number(eventId))
    .order('created_at', { ascending: false }).limit(Number(limit)));
  const event = await getEvent(eventId);
  return rows.map((row) => parseRow({
    ...row,
    task_title: row.tasks?.title,
    event_name: event?.name,
    tasks: undefined,
  }));
}

async function sumPendingHoursByDate(userId, date, excludeTaskId = null) {
  let query = getSupabaseClient().from('tasks').select('estimated_hours')
    .eq('user_id', Number(userId)).eq('scheduled_date', date).eq('status', 'pending');
  if (excludeTaskId !== null) query = query.neq('id', Number(excludeTaskId));
  const rows = await result(query);
  return rows.reduce((total, row) => total + Number(row.estimated_hours || 0), 0);
}

async function sumOverdueHours(userId, today) {
  const rows = await result(getSupabaseClient().from('tasks').select('estimated_hours')
    .eq('user_id', Number(userId)).eq('status', 'pending')
    .not('scheduled_date', 'is', null).lt('scheduled_date', today));
  return rows.reduce((total, row) => total + Number(row.estimated_hours || 0), 0);
}

async function suggestedDates(userId, movingTask = null, minDate = null, count = 3) {
  const user = await getUser(userId);
  if (!user) return [];

  const cursor = new Date(minDate || new Date(Date.now() + 86400000));
  cursor.setHours(12, 0, 0, 0);
  const dates = [];

  while (dates.length < count) {
    const date = cursor.toISOString().slice(0, 10);
    const load = await sumPendingHoursByDate(userId, date, movingTask?.id ?? null);
    const scheduled = load + (movingTask ? Number(movingTask.estimated_hours) : 0);
    dates.push({
      date,
      load: scheduled,
      fitsLimit: scheduled <= Number(user.daily_hours_limit),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

module.exports = {
  getSupabaseConfig,
  isSupabaseConfigured,
  getSupabaseClient,
  getSupabasePublishableClient,
  parseRow,
  getUser,
  getUserByEmail,
  updateUserDailyHoursLimit,
  createUser,
  getEvent,
  getEventByOwnerLast,
  getTask,
  listEvents,
  listTasks,
  listTodayTasks,
  createEvent,
  createEventWithTasks,
  createSupabaseDemoData,
  updateEvent,
  deleteEvent,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  logTaskEvent,
  listTaskEvents,
  listActivities,
  sumPendingHoursByDate,
  sumOverdueHours,
  suggestedDates,
};
