const express = require('express');
const {
  getUser,
  getEvent,
  createEvent,
  createEventWithTasks,
  updateEvent,
  deleteEvent,
  listEvents,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  listTasks,
  updateTaskStatus,
  logTaskEvent,
  listTaskEvents,
  listActivities,
  sumPendingHoursByDate,
  suggestedDates,
} = require('../supabase');
const { requireAuth, asyncHandler } = require('../middleware');

const router = express.Router();

router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUS = new Set(['pending', 'done', 'postponed']);
const HOURS_MIN = 0.25;
const HOURS_MAX = 24;

function bad(res, message) {
  return res.status(400).json({
    error: 'validation',
    message,
  });
}

async function assertOwnsEvent(userId, eventId) {
  const event = await getEvent(eventId);

  if (!event || event.user_id !== userId) {
    const err = new Error('No encontramos ese evento.');
    err.status = 404;
    throw err;
  }

  return event;
}

async function assertOwnsTask(userId, taskId) {
  const task = await getTask(taskId);

  if (!task || task.user_id !== userId) {
    const err = new Error('No encontramos esa tarea.');
    err.status = 404;
    throw err;
  }

  return task;
}

async function assertTaskBelongsToEvent(userId, task, eventId) {
  const event = await assertOwnsEvent(userId, eventId);

  if (task.event_id !== event.id) {
    const err = new Error('No encontramos esa tarea.');
    err.status = 404;
    throw err;
  }

  return event;
}

function parseHours(value) {
  const hours = Number(value);

  if (!Number.isFinite(hours) || hours < HOURS_MIN || hours > HOURS_MAX) {
    return null;
  }

  return Math.round(hours * 4) / 4;
}

function parseDate(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (!DATE_RE.test(String(value))) {
    return null;
  }

  return String(value);
}

function taskProgress(task) {
  return {
    id: task.id,
    eventId: task.event_id,
    title: task.title,
    description: task.description,
    scheduledDate: task.scheduled_date,
    estimatedHours: task.estimated_hours,
    status: task.status,
    note: task.note || '',
    createdAt: task.created_at,
  };
}

function eventSummary(event) {
  return {
    id: event.id,
    name: event.name,
    type: event.event_type,
    date: event.event_date,
    description: event.description,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  };
}

async function buildConflict(user, task, newDate, newHours, opts = {}) {
  const dailyLimit = user.daily_hours_limit;
  const otherHours = await sumPendingHoursByDate(
    user.id,
    newDate,
    task ? task.id : null,
  );

  const scheduledHours = otherHours + newHours;
  const hasConflict = scheduledHours > dailyLimit;

  const base = {
    type: 'OVERLOAD',
    dailyLimit,
    scheduledHours,
    otherHours,
    movingHours: newHours,
    excessHours: hasConflict ? scheduledHours - dailyLimit : 0,
    overloadHours: hasConflict ? scheduledHours - dailyLimit : 0,
    date: newDate,
  };

  if (!hasConflict) {
    return base;
  }

  base.message =
    `Mover "${task ? task.title : 'esta tarea'}" a ${newDate} deja ${scheduledHours}h de gestiones ` +
    `pendientes planificadas para ese día, superando el límite de ${dailyLimit}h/día que definiste.`;

  base.excessReduction =
    Math.ceil((scheduledHours - dailyLimit) * 4) / 4;

  base.maxAllowedHours = Math.max(
    HOURS_MIN,
    Math.round((dailyLimit - otherHours) * 4) / 4,
  );

  base.alternatives = [
    {
      id: 'another_day',
      label: 'Mover a otra fecha',
      description: 'Elegí un día con menos carga. Te sugerimos estos:',
      suggestedDates:
        opts.suggestedDates ||
        await suggestedDates(user.id, task, newDate, 3),
    },
    {
      id: 'reduce_hours',
      label: 'Reducir horas estimadas',
      description:
        `Recortá la gestión a ${base.maxAllowedHours} h o menos para caber dentro del límite de ${dailyLimit}h/día.`,
      maxAllowedHours: base.maxAllowedHours,
    },
    {
      id: 'postpone',
      label: 'Posponer la gestión',
      description:
        'Sacala del plan activo hoy; seguirá visible como “en pausa”.',
    },
    {
      id: 'accept',
      label: 'Aceptar la sobrecarga igual',
      description:
        `Programar ${scheduledHours}h igualmente, ${base.excessHours}h por encima de tu límite.`,
    },
  ];

  return base;
}

/**
 * @openapi
 * paths:
 *   /api/events:
 *     get:
 *       summary: Listar eventos del usuario
 *       description: Devuelve los eventos del usuario autenticado con sus contadores y progreso.
 *       security:
 *         - bearerAuth: []
 *       responses:
 *         '200':
 *           description: Lista de eventos.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 required:
 *                   - events
 *                 properties:
 *                   events:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         type:
 *                           type: string
 *                         date:
 *                           type: string
 *                           format: date
 *                         description:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                         taskCount:
 *                           type: integer
 *                         pendingCount:
 *                           type: integer
 *                         postponedCount:
 *                           type: integer
 *                         progress:
 *                           type: integer
 *                         doneHours:
 *                           type: number
 *                         totalHours:
 *                           type: number
 *               example:
 *                 events:
 *                   - id: 1
 *                     name: Conferencia anual
 *                     type: Conferencia
 *                     date: '2026-11-15'
 *                     description: Encuentro anual del equipo
 *                     createdAt: '2026-09-24T12:00:00.000Z'
 *                     updatedAt: '2026-09-24T12:00:00.000Z'
 *                     taskCount: 3
 *                     pendingCount: 2
 *                     postponedCount: 0
 *                     progress: 33
 *                     doneHours: 2
 *                     totalHours: 6
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await listEvents(req.userId);
    const events = await Promise.all(rows.map(async (event) => {
      const tasks = await listTasks(event.id);

      const total = tasks.reduce(
        (totalHours, task) =>
          totalHours +
          (task.status !== 'postponed' ? task.estimated_hours : 0),
        0,
      );

      const done = tasks.reduce(
        (doneHours, task) =>
          doneHours +
          (task.status === 'done' ? task.estimated_hours : 0),
        0,
      );

      const postponed = tasks.filter(
        (task) => task.status === 'postponed',
      ).length;

      return {
        ...eventSummary(event),
        taskCount: tasks.length,
        pendingCount: tasks.filter(
          (task) => task.status === 'pending',
        ).length,
        postponedCount: postponed,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
        doneHours: done,
        totalHours: total,
      };
    }));

    res.json({ events });
  }),
);

/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 * paths:
 *   /api/events:
 *     post:
 *       summary: Crear un evento con sus gestiones logísticas
 *       description: Crea un evento y su plan inicial de gestiones logísticas.
 *       security:
 *         - bearerAuth: []
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - name
 *                 - type
 *                 - date
 *                 - tasks
 *               properties:
 *                 name:
 *                   type: string
 *                 type:
 *                   type: string
 *                 date:
 *                   type: string
 *                   format: date
 *                 description:
 *                   type: string
 *                 tasks:
 *                   type: array
 *                   minItems: 1
 *                   maxItems: 50
 *                   items:
 *                     type: object
 *                     required:
 *                       - title
 *                       - scheduledDate
 *                       - estimatedHours
 *                     properties:
 *                       title:
 *                         type: string
 *                       scheduledDate:
 *                         type: string
 *                         format: date
 *                       estimatedHours:
 *                         type: number
 *                         minimum: 0.25
 *                         maximum: 24
 *                       description:
 *                         type: string
 *             example:
 *               name: Conferencia anual
 *               type: Conferencia
 *               date: '2026-11-15'
 *               description: Encuentro anual del equipo
 *               tasks:
 *                 - title: Reservar el salón
 *                   scheduledDate: '2026-10-01'
 *                   estimatedHours: 2
 *       responses:
 *         '201':
 *           description: Evento y gestiones creados correctamente.
 *           content:
 *             application/json:
 *               example:
 *                 event:
 *                   id: 1
 *                   name: Conferencia anual
 *                   type: Conferencia
 *                   date: '2026-11-15'
 *                   description: Encuentro anual del equipo
 *                   createdAt: '2026-09-24T12:00:00.000Z'
 *                   updatedAt: '2026-09-24T12:00:00.000Z'
 *                   tasks:
 *                     - id: 1
 *                       eventId: 1
 *                       title: Reservar el salón
 *                       description: ''
 *                       scheduledDate: '2026-10-01'
 *                       estimatedHours: 2
 *                       status: pending
 *                       note: ''
 *                       createdAt: '2026-09-24T12:00:00.000Z'
 *         '400':
 *           description: Los datos enviados no superan la validación.
 *           content:
 *             application/json:
 *               example:
 *                 error: validation
 *                 message: Ingresá un nombre de al menos 2 caracteres para el evento.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      name = '',
      type = '',
      date = '',
      description = '',
      tasks = [],
    } = req.body || {};

    const cleanName = String(name).trim();
    const cleanType = String(type).trim();
    const cleanDate = parseDate(date);
    const cleanDescription = String(description).trim();

    if (cleanName.length < 2) {
      return bad(
        res,
        'Ingresá un nombre de al menos 2 caracteres para el evento.',
      );
    }

    if (cleanType.length < 2) {
      return bad(
        res,
        'Ingresá el tipo de evento.',
      );
    }

    if (!cleanDate) {
      return bad(
        res,
        'Ingresá una fecha válida para el evento.',
      );
    }

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return bad(
        res,
        'Agregá al menos una gestión logística al plan.',
      );
    }

    if (tasks.length > 50) {
      return bad(
        res,
        'El evento no puede tener más de 50 gestiones.',
      );
    }

    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index] || {};
      const title = String(task.title || '').trim();
      const scheduledDate = parseDate(task.scheduledDate);
      const hours = parseHours(task.estimatedHours);

      if (title.length < 2) {
        return bad(
          res,
          `La gestión ${index + 1} debe tener un título de al menos 2 caracteres.`,
        );
      }

      if (!scheduledDate) {
        return bad(
          res,
          `La gestión "${title}" debe tener un plazo válido.`,
        );
      }

      if (hours === null) {
        return bad(
          res,
          `Las horas de "${title}" deben estar entre ${HOURS_MIN} y ${HOURS_MAX}.`,
        );
      }
    }

    const { event, tasks: created } = await createEventWithTasks({
      event: {
        userId: req.userId,
        name: cleanName,
        eventType: cleanType,
        eventDate: cleanDate,
        description: cleanDescription,
      },
      tasks: tasks.map((taskData) => ({
        title: String(taskData.title).trim(),
        description: String(taskData.description || '').trim(),
        scheduledDate: parseDate(taskData.scheduledDate),
        hours: parseHours(taskData.estimatedHours),
      })),
    });

    res.status(201).json({
      event: {
        ...eventSummary(event),
        tasks: created.map(taskProgress),
      },
    });
  }),
);

/**
 * @openapi
 * paths:
 *   /api/events/{id}:
 *     get:
 *       summary: Consultar un evento y sus gestiones logísticas
 *       description: Devuelve los datos del evento, sus gestiones, progreso y actividad.
 *       security:
 *         - bearerAuth: []
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema:
 *             type: integer
 *       responses:
 *         '200':
 *           description: Evento encontrado.
 *           content:
 *             application/json:
 *               example:
 *                 event:
 *                   id: 1
 *                   name: Conferencia anual
 *                   type: Conferencia
 *                   date: '2026-11-15'
 *                   description: Encuentro anual del equipo
 *                   createdAt: '2026-09-24T12:00:00.000Z'
 *                   updatedAt: '2026-09-24T12:00:00.000Z'
 *                   tasks:
 *                     - id: 1
 *                       eventId: 1
 *                       title: Reservar el salón
 *                       description: ''
 *                       scheduledDate: '2026-10-01'
 *                       estimatedHours: 2
 *                       status: pending
 *                       note: ''
 *                       createdAt: '2026-09-24T12:00:00.000Z'
 *                   progress: 0
 *                   doneHours: 0
 *                   totalHours: 2
 *                   activities: []
 *         '404':
 *           description: Evento no encontrado o no pertenece al usuario.
 *           content:
 *             application/json:
 *               example:
 *                 error: error
 *                 message: No encontramos ese evento.
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const event = await assertOwnsEvent(
      req.userId,
      Number(req.params.id),
    );

    const tasks = (await listTasks(event.id)).map(taskProgress);

    const total = tasks.reduce(
      (totalHours, task) =>
        totalHours +
        (task.status !== 'postponed' ? task.estimatedHours : 0),
      0,
    );

    const done = tasks.reduce(
      (doneHours, task) =>
        doneHours +
        (task.status === 'done' ? task.estimatedHours : 0),
      0,
    );

    res.json({
      event: {
        ...eventSummary(event),
        tasks,
        progress:
          total > 0 ? Math.round((done / total) * 100) : 0,
        doneHours: done,
        totalHours: total,
        activities: await listActivities(req.userId, event.id),
      },
    });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const event = await assertOwnsEvent(
      req.userId,
      Number(req.params.id),
    );

    const name = String(
      req.body?.name ?? event.name,
    ).trim();

    const type = String(
      req.body?.type ?? event.event_type,
    ).trim();

    const date = parseDate(
      req.body?.date ?? event.event_date,
    );

    const description = String(
      req.body?.description ?? event.description,
    ).trim();

    if (name.length < 2) {
      return bad(
        res,
        'El nombre del evento debe tener al menos 2 caracteres.',
      );
    }

    if (type.length < 2) {
      return bad(
        res,
        'Ingresá el tipo de evento.',
      );
    }

    if (!date) {
      return bad(
        res,
        'Ingresá una fecha válida para el evento.',
      );
    }

    const updated = await updateEvent({
      id: event.id,
      name,
      eventType: type,
      eventDate: date,
      description,
    });

    res.json({
      event: eventSummary(updated),
    });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await assertOwnsEvent(
      req.userId,
      Number(req.params.id),
    );

    await deleteEvent(Number(req.params.id));

    res.json({
      ok: true,
      message: 'Evento eliminado.',
    });
  }),
);

/**
 * @openapi
 * paths:
 *   /api/events/{id}/tasks:
 *     post:
 *       summary: Crear una gestión logística para un evento
 *       description: Agrega una gestión al evento indicado.
 *       security:
 *         - bearerAuth: []
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema:
 *             type: integer
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - title
 *                 - scheduledDate
 *                 - estimatedHours
 *               properties:
 *                 title:
 *                   type: string
 *                   minLength: 2
 *                 description:
 *                   type: string
 *                 scheduledDate:
 *                   type: string
 *                   format: date
 *                 estimatedHours:
 *                   type: number
 *                   minimum: 0.25
 *                   maximum: 24
 *             example:
 *               title: Reservar el salón
 *               description: Confirmar disponibilidad y capacidad
 *               scheduledDate: '2026-10-01'
 *               estimatedHours: 2
 *       responses:
 *         '201':
 *           description: Gestión creada correctamente.
 *           content:
 *             application/json:
 *               example:
 *                 task:
 *                   id: 1
 *                   eventId: 1
 *                   title: Reservar el salón
 *                   description: Confirmar disponibilidad y capacidad
 *                   scheduledDate: '2026-10-01'
 *                   estimatedHours: 2
 *                   status: pending
 *                   note: ''
 *                   createdAt: '2026-09-24T12:00:00.000Z'
 *         '400':
 *           description: Los datos de la gestión no superan la validación.
 *           content:
 *             application/json:
 *               example:
 *                 error: validation
 *                 message: La gestión debe tener un título de al menos 2 caracteres.
 */
router.post(
  '/:id/tasks',
  asyncHandler(async (req, res) => {
    const event = await assertOwnsEvent(
      req.userId,
      Number(req.params.id),
    );

    const {
      title = '',
      description = '',
      scheduledDate = null,
      estimatedHours = null,
    } = req.body || {};

    const cleanTitle = String(title).trim();
    const hours = parseHours(estimatedHours);
    const date = parseDate(scheduledDate);

    if (cleanTitle.length < 2) {
      return bad(
        res,
        'La gestión debe tener un título de al menos 2 caracteres.',
      );
    }

    if (!date) {
      return bad(
        res,
        'La gestión debe tener un plazo válido.',
      );
    }

    if (hours === null) {
      return bad(
        res,
        `Las horas deben ser entre ${HOURS_MIN} y ${HOURS_MAX}.`,
      );
    }

    const task = await createTask({
      eventId: event.id,
      userId: req.userId,
      title: cleanTitle,
      description: String(description || '').trim(),
      scheduledDate: date,
      hours,
    });

    await logTaskEvent({
      taskId: task.id,
      userId: req.userId,
      action: 'created',
    });

    res.status(201).json({
      task: taskProgress(task),
    });
  }),
);

router.patch(
  '/:eventId/tasks/:taskId',
  asyncHandler(async (req, res) => {
    const task = await assertOwnsTask(
      req.userId,
      Number(req.params.taskId),
    );

    await assertTaskBelongsToEvent(
      req.userId,
      task,
      Number(req.params.eventId),
    );

    const title = String(
      req.body?.title ?? task.title,
    ).trim();

    const hours = parseHours(
      req.body?.estimatedHours ?? task.estimated_hours,
    );

    const date = parseDate(
      req.body?.scheduledDate ?? task.scheduled_date,
    );

    if (title.length < 2) {
      return bad(
        res,
        'El título debe tener al menos 2 caracteres.',
      );
    }

    if (!date) {
      return bad(
        res,
        'La gestión debe tener un plazo válido.',
      );
    }

    if (hours === null) {
      return bad(
        res,
        `Las horas deben ser entre ${HOURS_MIN} y ${HOURS_MAX}.`,
      );
    }

    const updated = await updateTask({
      id: task.id,
      title,
      description: String(
        req.body?.description ?? task.description,
      ).trim(),
      scheduledDate: date,
      hours,
    });

    res.json({
      task: taskProgress(updated),
    });
  }),
);

router.delete(
  '/:eventId/tasks/:taskId',
  asyncHandler(async (req, res) => {
    const task = await assertOwnsTask(
      req.userId,
      Number(req.params.taskId),
    );

    await assertTaskBelongsToEvent(
      req.userId,
      task,
      Number(req.params.eventId),
    );

    await logTaskEvent({
      taskId: task.id,
      userId: req.userId,
      action: 'deleted',
    });

    await deleteTask(task.id);

    res.json({
      ok: true,
      message: 'Gestión eliminada.',
    });
  }),
);

router.post(
  '/:eventId/tasks/:taskId/reschedule',
  asyncHandler(async (req, res) => {
    const task = await assertOwnsTask(
      req.userId,
      Number(req.params.taskId),
    );

    await assertTaskBelongsToEvent(
      req.userId,
      task,
      Number(req.params.eventId),
    );

    const newDate = parseDate(req.body?.newDate);

    if (newDate === null) {
      return bad(
        res,
        'Elegí una fecha válida (AAAA-MM-DD) para reprogramar.',
      );
    }

    const newHours = parseHours(
      req.body?.newHours ?? task.estimated_hours,
    );

    if (newHours === null) {
      return bad(
        res,
        `Las horas deben ser entre ${HOURS_MIN} y ${HOURS_MAX}.`,
      );
    }

    const user = await getUser(req.userId);

    const conflict = await buildConflict(
      user,
      task,
      newDate,
      newHours,
      {
        suggestedDates: await suggestedDates(
          user.id,
          task,
          newDate,
          3,
        ),
      },
    );

    if (
      conflict.excessHours > 0 &&
      !req.body?.acceptConflict
    ) {
      return res.status(409).json({
        error: 'conflict',
        conflict,
        message: conflict.message,
        task: taskProgress(task),
      });
    }

    const updated = await updateTask({
      id: task.id,
      title: task.title,
      description: task.description,
      scheduledDate: newDate,
      hours: newHours,
    });

    await logTaskEvent({
      taskId: task.id,
      userId: req.userId,
      action: 'rescheduled',
      note:
        conflict.excessHours > 0
          ? 'Reprogramada aceptando sobrecarga diaria.'
          : 'Reprogramada.',
      prevDate: task.scheduled_date,
      newDate,
      prevHours: task.estimated_hours,
      newHours,
    });

    res.json({
      task: taskProgress(updated),
      conflict,
    });
  }),
);

router.post(
  '/:eventId/tasks/:taskId/execute',
  asyncHandler(async (req, res) => {
    const task = await assertOwnsTask(
      req.userId,
      Number(req.params.taskId),
    );

    await assertTaskBelongsToEvent(
      req.userId,
      task,
      Number(req.params.eventId),
    );

    const action = String(
      req.body?.action || '',
    ).toLowerCase();

    if (!VALID_STATUS.has(action)) {
      return bad(
        res,
        'Estado no válido. Usá "done" o "postponed".',
      );
    }

    const note = String(
      req.body?.note || '',
    ).trim();

    const updated = await updateTaskStatus({
      id: task.id,
      status: action,
      note,
    });

    await logTaskEvent({
      taskId: task.id,
      userId: req.userId,
      action,
      note,
    });

    res.json({
      task: taskProgress(updated),
    });
  }),
);

router.get(
  '/:eventId/tasks/:taskId/log',
  asyncHandler(async (req, res) => {
    const task = await assertOwnsTask(
      req.userId,
      Number(req.params.taskId),
    );

    await assertTaskBelongsToEvent(
      req.userId,
      task,
      Number(req.params.eventId),
    );

    res.json({
      log: await listTaskEvents(task.id),
    });
  }),
);

module.exports = router;
