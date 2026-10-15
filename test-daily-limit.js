const test = require('node:test');
const assert = require('node:assert/strict');
const { dailyLimitConflicts } = require('./daily-limit');

function task(id, date, hours, status = 'pending') {
  return { id, eventId: 1, title: `Subtarea ${id}`, scheduled_date: date, estimated_hours: hours, status };
}

test('permite 5 y 6 horas cuando el límite es 6; detecta 7', () => {
  assert.deepEqual(dailyLimitConflicts([task(1, '2026-10-15', 5)], 6), []);
  assert.deepEqual(dailyLimitConflicts([task(1, '2026-10-15', 3), task(2, '2026-10-15', 3)], 6), []);
  const [conflict] = dailyLimitConflicts([task(1, '2026-10-15', 3), task(2, '2026-10-15', 4)], 6);
  assert.equal(conflict.scheduledHours, 7);
  assert.equal(conflict.dailyLimit, 6);
});

test('detecta todas las fechas y excluye subtareas hechas o pospuestas', () => {
  const conflicts = dailyLimitConflicts([
    task(1, '2026-10-15', 6),
    task(2, '2026-10-16', 7),
    task(3, '2026-10-15', 10, 'done'),
    task(4, '2026-10-16', 10, 'postponed'),
  ], 5);
  assert.deepEqual(conflicts.map(({ date, scheduledHours }) => [date, scheduledHours]), [
    ['2026-10-15', 6],
    ['2026-10-16', 7],
  ]);
});

test('recalcula tras reducir horas o posponer una subtarea', () => {
  const schedule = [task(1, '2026-10-15', 3), task(2, '2026-10-15', 3)];
  assert.equal(dailyLimitConflicts(schedule, 5).length, 1);
  schedule[0].estimated_hours = 2;
  assert.deepEqual(dailyLimitConflicts(schedule, 5), []);

  schedule[0].estimated_hours = 3;
  schedule[1].status = 'postponed';
  assert.deepEqual(dailyLimitConflicts(schedule, 5), []);
});
