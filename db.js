const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'organizador.db');
const db = new DatabaseSync(DB_FILE);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    email            TEXT    UNIQUE NOT NULL,
    password_hash    TEXT    NOT NULL,
    is_demo          INTEGER DEFAULT 0,
    daily_hours_limit REAL   DEFAULT 6,
    created_at       TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    event_type  TEXT    NOT NULL DEFAULT '',
    event_date  TEXT    NOT NULL DEFAULT '',
    description TEXT    DEFAULT '',
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title            TEXT    NOT NULL,
    description      TEXT    DEFAULT '',
    scheduled_date   TEXT,
    estimated_hours  REAL    DEFAULT 1,
    status           TEXT    DEFAULT 'pending' CHECK (status IN ('pending','done','postponed')),
    note             TEXT    DEFAULT '',
    created_at       TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action      TEXT    NOT NULL,
    note        TEXT    DEFAULT '',
    prev_date   TEXT,
    new_date    TEXT,
    prev_hours  REAL,
    new_hours   REAL,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_tasks_user_date  ON tasks(user_id, scheduled_date);
`);

const eventColumns = db.prepare('PRAGMA table_info(events)').all();
const eventColumnNames = new Set(eventColumns.map((column) => column.name));

if (!eventColumnNames.has('event_type')) {
  db.exec("ALTER TABLE events ADD COLUMN event_type TEXT NOT NULL DEFAULT ''");
}

if (!eventColumnNames.has('event_date')) {
  db.exec("ALTER TABLE events ADD COLUMN event_date TEXT NOT NULL DEFAULT ''");
}

function parseRow(row) {
  if (!row) return null;
  if (row.id !== undefined && row.id !== null) row.id = Number(row.id);
  if (row.event_id !== undefined && row.event_id !== null) row.event_id = Number(row.event_id);
  if (row.user_id !== undefined && row.user_id !== null) row.user_id = Number(row.user_id);
  if (row.task_id !== undefined && row.task_id !== null) row.task_id = Number(row.task_id);
  if (row.is_demo !== undefined && row.is_demo !== null) row.is_demo = Boolean(row.is_demo);
  return row;
}

const map = () => ['get', 'all', 'run'].map((m) => (sql, ...args) => db.prepare(sql)[m](...args));

function getUser(id) {
  const [get] = map();
  return parseRow(get('SELECT * FROM users WHERE id = ?', Number(id)));
}

function getUserByEmail(email) {
  const [get] = map();
  return parseRow(get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', email));
}

function getEvent(id) {
  const [get] = map();
  return parseRow(get('SELECT * FROM events WHERE id = ?', Number(id)));
}

function getEventByOwnerLast(userId, name) {
  const [get] = map();
  return parseRow(get(
    'SELECT * FROM events WHERE user_id = ? AND name = ? ORDER BY id DESC LIMIT 1',
    Number(userId),
    name,
  ));
}

function getTask(id) {
  const [get] = map();
  return parseRow(get('SELECT * FROM tasks WHERE id = ?', Number(id)));
}

function listEvents(userId) {
  const [, all] = map();
  return all(
    'SELECT * FROM events WHERE user_id = ? ORDER BY updated_at DESC',
    Number(userId),
  ).map(parseRow);
}

function listTasks(eventId) {
  const [, all] = map();
  return all(
    'SELECT * FROM tasks WHERE event_id = ? ORDER BY scheduled_date IS NULL, scheduled_date ASC, id ASC',
    Number(eventId),
  ).map(parseRow);
}

function listTodayTasks(userId) {
  const [, all] = map();
  return all(
    'SELECT * FROM tasks WHERE user_id = ? ORDER BY status, scheduled_date IS NULL, scheduled_date ASC, id ASC',
    Number(userId),
  ).map(parseRow);
}

function createUser({
  name,
  email,
  passwordHash,
  isDemo = false,
  dailyHoursLimit = 6,
}) {
  const [run] = map();

  run(
    'INSERT INTO users (name, email, password_hash, is_demo, daily_hours_limit) VALUES (?, ?, ?, ?, ?)',
    name,
    email,
    passwordHash,
    isDemo ? 1 : 0,
    dailyHoursLimit,
  );

  return getUserByEmail(email);
}

function createEvent({
  userId,
  name,
  eventType,
  eventDate,
  description = '',
}) {
  const [run] = map();

  run(
    `INSERT INTO events
      (user_id, name, event_type, event_date, description)
     VALUES (?, ?, ?, ?, ?)`,
    userId,
    name,
    eventType,
    eventDate,
    description,
  );

  return getEventByOwnerLast(userId, name);
}

function updateEvent({
  id,
  name,
  eventType = null,
  eventDate = null,
  description,
}) {
  const [run] = map();

  run(
    `UPDATE events
     SET name = ?,
         event_type = COALESCE(?, event_type),
         event_date = COALESCE(?, event_date),
         description = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    name,
    eventType,
    eventDate,
    description,
    Number(id),
  );

  return getEvent(id);
}

function deleteEvent(id) {
  const [run] = map();
  run('DELETE FROM events WHERE id = ?', Number(id));
}

function createTask({
  eventId,
  userId,
  title,
  description = '',
  scheduledDate = null,
  hours = 1,
}) {
  const [run] = map();

  run(
    'INSERT INTO tasks (event_id, user_id, title, description, scheduled_date, estimated_hours) VALUES (?, ?, ?, ?, ?, ?)',
    eventId,
    userId,
    title,
    description,
    scheduledDate || null,
    hours,
  );

  run(
    'UPDATE events SET updated_at = datetime(\'now\') WHERE id = ?',
    Number(eventId),
  );

  const [get] = map();

  return parseRow(get(
    'SELECT * FROM tasks WHERE event_id = ? AND title = ? ORDER BY id DESC LIMIT 1',
    Number(eventId),
    title,
  ));
}

function touchEventForTask(taskId) {
  const [run] = map();

  run(
    'UPDATE events SET updated_at = datetime(\'now\') WHERE id = (SELECT event_id FROM tasks WHERE id = ?)',
    Number(taskId),
  );
}

function updateTask({
  id,
  title,
  description,
  scheduledDate,
  hours,
}) {
  const [run] = map();

  run(
    'UPDATE tasks SET title = ?, description = ?, scheduled_date = ?, estimated_hours = ? WHERE id = ?',
    title,
    description,
    scheduledDate || null,
    hours,
    Number(id),
  );

  touchEventForTask(id);

  return getTask(id);
}

function updateTaskStatus({
  id,
  status,
  note = '',
}) {
  const [run] = map();

  run(
    'UPDATE tasks SET status = ?, note = ? WHERE id = ?',
    status,
    note,
    Number(id),
  );

  touchEventForTask(id);

  return getTask(id);
}

function deleteTask(id) {
  const [get] = map();
  const task = get(
    'SELECT event_id FROM tasks WHERE id = ?',
    Number(id),
  );

  if (task) {
    const [run] = map();

    run(
      'UPDATE events SET updated_at = datetime(\'now\') WHERE id = ?',
      Number(task.event_id),
    );

    run(
      'DELETE FROM tasks WHERE id = ?',
      Number(id),
    );
  }
}

function logTaskEvent({
  taskId,
  userId,
  action,
  note = '',
  prevDate = null,
  newDate = null,
  prevHours = null,
  newHours = null,
}) {
  const [run] = map();

  run(
    'INSERT INTO task_events (task_id, user_id, action, note, prev_date, new_date, prev_hours, new_hours) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    Number(taskId),
    Number(userId),
    action,
    note,
    prevDate,
    newDate,
    prevHours,
    newHours,
  );
}

function listTaskEvents(taskId) {
  const [, all] = map();

  return all(
    'SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at ASC',
    Number(taskId),
  ).map(parseRow);
}

function listActivities(userId, eventId, limit = 30) {
  const [, all] = map();

  return all(
    'SELECT te.*, t.title AS task_title, e.name AS event_name FROM task_events te ' +
    'JOIN tasks t ON t.id = te.task_id JOIN events e ON e.id = t.event_id ' +
    'WHERE te.user_id = ? AND t.event_id = ? ORDER BY te.created_at DESC LIMIT ?',
    Number(userId),
    Number(eventId),
    Number(limit),
  ).map(parseRow);
}

function sumPendingHoursByDate(userId, date, excludeTaskId = null) {
  const [get] = map();

  const params = [
    Number(userId),
    date,
    'pending',
  ];

  let sql = 'SELECT COALESCE(SUM(estimated_hours), 0) AS total FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = ?';

  if (excludeTaskId !== null) {
    sql += ' AND id != ?';
    params.push(Number(excludeTaskId));
  }

  const row = get(sql, ...params);

  return Number(row.total);
}

function sumOverdueHours(userId, today) {
  const [get] = map();

  const row = get(
    'SELECT COALESCE(SUM(estimated_hours), 0) AS total FROM tasks WHERE user_id = ? AND status = ? AND scheduled_date IS NOT NULL AND scheduled_date < ?',
    Number(userId),
    'pending',
    today,
  );

  return Number(row.total);
}

function suggestedDates(
  userId,
  movingTask = null,
  minDate = null,
  count = 3,
) {
  const [, all] = map();

  const limit = getUser(userId).daily_hours_limit;
  const out = [];

  const cursor = new Date(
    minDate || new Date(Date.now() + 86400000),
  );

  cursor.setHours(12, 0, 0, 0);

  while (out.length < count) {
    const ymd = cursor.toISOString().slice(0, 10);

    const load = sumPendingHoursByDate(
      userId,
      ymd,
      movingTask ? movingTask.id : null,
    );

    out.push({
      date: ymd,
      load: load + (movingTask ? movingTask.estimated_hours : 0),
      fitsLimit:
        load + (movingTask ? movingTask.estimated_hours : 0) <= limit,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

module.exports = {
  db,
  getUser,
  getUserByEmail,
  createUser,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  listEvents,
  getTask,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  listTasks,
  logTaskEvent,
  listTaskEvents,
  listActivities,
  sumPendingHoursByDate,
  sumOverdueHours,
  suggestedDates,
  listTodayTasks,
  parseRow,
};