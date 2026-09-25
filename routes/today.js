const express = require('express');
const {
  getUser,
  getEvent,
  listTodayTasks,
  listTasks,
} = require('../supabase');
const { requireAuth, asyncHandler } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Vista “Hoy” (T2): gestiones urgentes del día con reglas de prioridad documentadas.
 *  El cliente envía su fecha local para evitar desvíos de zona horaria. */
router.get('/', asyncHandler(async (req, res) => {
  const today = String(req.query.date || '');
  if (!DATE_RE.test(today)) {
    return res.status(422).json({ error: 'validation', message: 'Parámetro "date" inválido (AAAA-MM-DD).' });
  }

  const user = await getUser(req.userId);
  const tasks = (await listTodayTasks(req.userId))
    .filter((task) => task.status === 'pending')
    .sort((a, b) => a.id - b.id);

  const decorated = await Promise.all(tasks.map(async (t) => {
      const ev = await getEvent(t.event_id);
      const evTasks = await listTasks(t.event_id);
      const total = evTasks.reduce((a, x) => a + (x.status !== 'postponed' ? Number(x.estimated_hours) : 0), 0);
      const done = evTasks.reduce((a, x) => a + (x.status === 'done' ? Number(x.estimated_hours) : 0), 0);
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        scheduledDate: t.scheduled_date,
        estimatedHours: Number(t.estimated_hours),
        status: t.status,
        overdue: Boolean(t.scheduled_date && t.scheduled_date < today),
        isToday: t.scheduled_date === today,
        urgencyScore: scoreUrgency(t, today),
        eventName: ev ? ev.name : 'Sin evento',
        eventId: ev ? ev.id : null,
        eventProgress: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    }));

  // Solo importan para “Hoy” las vencidas y las de hoy; el resto no entra a la lista.
  const urgentes = decorated
    .filter((t) => t.isToday || t.overdue)
    .sort((a, b) => b.urgencyScore - a.urgencyScore);

  const overdueHours = tasks.reduce(
    (sum, task) => sum + (task.scheduled_date !== null && task.scheduled_date !== undefined && task.scheduled_date < today ? Number(task.estimated_hours) : 0),
    0,
  );
  const todayHours = tasks.reduce(
    (sum, task) => sum + (task.scheduled_date === today ? Number(task.estimated_hours) : 0),
    0,
  );

  res.json({
    date: today,
    dailyLimit: user.daily_hours_limit,
    todayHours,
    overdueHours,
    workloadHours: overdueHours + todayHours,
    urgentes,
    rules: [
      '1. Vencidas sin hacer: máxima urgencia (+200 puntos).',
      '2. Gestiones planificadas para hoy: urgente (+100 puntos).',
      '3. Mayor carga estimada desempata la lista.',
    ],
  });
}));

function scoreUrgency(t, today) {
  if (t.scheduled_date < today) return 200 + t.estimated_hours;
  if (t.scheduled_date === today) return 100 + t.estimated_hours;
  return 0;
}

module.exports = router;
