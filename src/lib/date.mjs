const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseCalendarDate(value) {
  if (value === undefined || value === null || value === '') return null;

  // Registration dates are calendar dates. Construct bare YYYY-MM-DD values in
  // local time so users west of UTC do not see the previous calendar day.
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    if (match) {
      const [, year, month, day] = match;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      if (
        date.getFullYear() === Number(year)
        && date.getMonth() === Number(month) - 1
        && date.getDate() === Number(day)
      ) {
        return date;
      }
      return null;
    }
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localCalendarDayTimestamp(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function calculateExpirationDayDifference(value, referenceDate = new Date()) {
  const expiration = parseCalendarDate(value);
  const reference = parseCalendarDate(referenceDate);
  if (expiration === null || reference === null) return null;

  return (
    localCalendarDayTimestamp(expiration) - localCalendarDayTimestamp(reference)
  ) / MILLISECONDS_PER_DAY;
}

export function formatExpirationDayDifference(dayDifference) {
  if (!Number.isInteger(dayDifference)) return null;
  const unit = Math.abs(dayDifference) === 1 ? 'day' : 'days';
  return `${dayDifference} ${unit}`;
}
