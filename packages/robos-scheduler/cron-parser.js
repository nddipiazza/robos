'use strict';

/**
 * Minimal cron expression parser.
 * Supports standard 5-field cron: minute hour day month weekday
 *
 * Field syntax:
 *   *        — every value
 *   N        — specific value
 *   N-M      — range (inclusive)
 *   N,M,O    — list of values
 *   * /N      — every N (step), written without the space
 *   N-M/S    — range with step
 */

/**
 * Parse a single cron field into an array of valid values.
 */
function parseField(field, min, max) {
  const values = new Set();

  const parts = field.split(',');
  for (const part of parts) {
    // Handle step: */N or N-M/N
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;

      let start = min;
      let end = max;
      if (range !== '*') {
        if (range.includes('-')) {
          const [a, b] = range.split('-').map(Number);
          start = a;
          end = b;
        } else {
          start = parseInt(range, 10);
        }
      }

      for (let i = start; i <= end; i += step) {
        if (i >= min && i <= max) values.add(i);
      }
    } else if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) {
        if (i >= min && i <= max) values.add(i);
      }
    } else {
      const n = parseInt(part, 10);
      if (!isNaN(n) && n >= min && n <= max) values.add(n);
    }
  }

  return [...values].sort((a, b) => a - b);
}

/**
 * Parse a full 5-field cron expression.
 * Returns { minutes, hours, days, months, weekdays }
 */
function parseCron(expr) {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
  }

  return {
    minutes: parseField(fields[0], 0, 59),
    hours: parseField(fields[1], 0, 23),
    days: parseField(fields[2], 1, 31),
    months: parseField(fields[3], 1, 12),
    weekdays: parseField(fields[4], 0, 6), // 0 = Sunday
  };
}

/**
 * Check if a Date matches a parsed cron schedule.
 */
function matchesCron(date, schedule) {
  return (
    schedule.minutes.includes(date.getMinutes()) &&
    schedule.hours.includes(date.getHours()) &&
    schedule.days.includes(date.getDate()) &&
    schedule.months.includes(date.getMonth() + 1) &&
    schedule.weekdays.includes(date.getDay())
  );
}

/**
 * Compute the next run time after a given date for a cron schedule.
 * Searches up to 1 year ahead.
 */
function nextRun(cronExpr, after = new Date()) {
  const schedule = typeof cronExpr === 'string' ? parseCron(cronExpr) : cronExpr;

  // Start from the next minute
  const candidate = new Date(after);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  const maxIterations = 525960; // ~1 year in minutes
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCron(candidate, schedule)) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return null; // No match within 1 year
}

module.exports = { parseField, parseCron, matchesCron, nextRun };
