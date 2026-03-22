const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC'
});

const dateTimeFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC'
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC'
});

export function formatFriendlyDate(value: string) {
  return dateFormatter.format(new Date(value));
}

export function formatFriendlyDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

export function formatFriendlyTimeFromClock(clock: string) {
  return timeFormatter.format(new Date(`1970-01-01T${clock}:00Z`));
}

export function addMinutesToClock(clock: string, minutes: number) {
  const [hours, mins] = clock.split(':').map(Number);
  const totalMinutes = hours * 60 + mins + minutes;
  const normalizedHours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const normalizedMinutes = String(totalMinutes % 60).padStart(2, '0');
  return `${normalizedHours}:${normalizedMinutes}`;
}

export function toUtcWallClock(date: string, time: string) {
  return `${date}T${time}:00.000Z`;
}

export function extractUtcDate(value: string) {
  return value.slice(0, 10);
}

export function extractUtcTime(value: string) {
  return value.slice(11, 16);
}

export function addDaysToDate(date: string, days: number) {
  const nextDate = new Date(`${date}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

export function getBusinessDatesBetween(startDate: string, endDate: string) {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  while (current <= end) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(current.toISOString().slice(0, 10));
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export function nextBusinessDate(date: string) {
  let cursor = addDaysToDate(date, 1);
  while (true) {
    const current = new Date(`${cursor}T00:00:00Z`);
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) {
      return cursor;
    }
    cursor = addDaysToDate(cursor, 1);
  }
}
