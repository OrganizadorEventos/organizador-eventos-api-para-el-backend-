function isOverloaded(scheduledHours, dailyLimit) {
  return Number(scheduledHours) > Number(dailyLimit);
}

function dailyLimitConflicts(tasks, dailyLimit) {
  const byDate = new Map();
  for (const task of tasks) {
    if (task.status !== 'pending' || !task.scheduled_date) continue;
    const hours = Number(task.estimated_hours || 0);
    const rows = byDate.get(task.scheduled_date) || [];
    rows.push({
      id: Number(task.id),
      eventId: Number(task.eventId ?? task.event_id),
      title: task.title,
      estimatedHours: hours,
      scheduledDate: task.scheduled_date,
    });
    byDate.set(task.scheduled_date, rows);
  }

  return [...byDate.entries()]
    .map(([date, dateTasks]) => ({
      date,
      scheduledHours: dateTasks.reduce((sum, task) => sum + task.estimatedHours, 0),
      dailyLimit,
      tasks: dateTasks,
    }))
    .filter((conflict) => isOverloaded(conflict.scheduledHours, dailyLimit))
    .sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { dailyLimitConflicts, isOverloaded };
