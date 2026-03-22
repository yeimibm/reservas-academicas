import type { PoolClient } from 'pg';
import type { Actor } from './http.js';

const DEFAULT_SCHEDULE_START = '08:00:00';
const DEFAULT_SCHEDULE_END = '22:00:00';
const DEFAULT_RESERVATION_MINUTES = 120;
const DEFAULT_CLEANING_MINUTES = 15;
const DEFAULT_EXTENSION_AMOUNT = 35;
const DEFAULT_SPECIAL_DAILY_AMOUNT = 35;

export type SystemConfig = {
  scheduleStart: string;
  scheduleEnd: string;
  defaultReservationMinutes: number;
  cleaningBufferMinutes: number;
  extensionReferenceAmount: number;
  specialReservationDailyAmount: number;
};

export async function getSystemConfig(client: PoolClient): Promise<SystemConfig> {
  const result = await client.query(
    `SELECT config_key, config_value #>> '{}' AS value FROM config
     WHERE config_key IN (
       'system_schedule_start',
       'system_schedule_end',
       'default_reservation_minutes',
       'cleaning_buffer_minutes',
       'extension_reference_amount',
       'special_reservation_daily_amount'
     )`
  );

  const map = new Map<string, string>(result.rows.map((row) => [row.config_key, row.value]));

  return {
    scheduleStart: map.get('system_schedule_start') ?? DEFAULT_SCHEDULE_START,
    scheduleEnd: map.get('system_schedule_end') ?? DEFAULT_SCHEDULE_END,
    defaultReservationMinutes: Number(map.get('default_reservation_minutes') ?? DEFAULT_RESERVATION_MINUTES),
    cleaningBufferMinutes: Number(map.get('cleaning_buffer_minutes') ?? DEFAULT_CLEANING_MINUTES),
    extensionReferenceAmount: Number(map.get('extension_reference_amount') ?? DEFAULT_EXTENSION_AMOUNT),
    specialReservationDailyAmount: Number(map.get('special_reservation_daily_amount') ?? DEFAULT_SPECIAL_DAILY_AMOUNT)
  };
}

export function assertReservationActor(actor: Actor) {
  if (!['STUDENT', 'TEACHER', 'DIRECTION'].includes(actor.userType)) {
    throw new Error('Rol no permitido para operar reservas');
  }
}

export function ensureOwnershipOrDirection(actor: Actor, ownerUserId: string) {
  if (actor.userType === 'DIRECTION') {
    return;
  }

  if (actor.sub !== ownerUserId) {
    throw new Error('No puedes operar recursos de otro usuario');
  }
}

export function parseDateTime(value: string) {
  const normalizedValue = /([zZ]|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Fecha invalida');
  }

  return date;
}

export function buildDateTime(date: string, time: string) {
  return parseDateTime(`${date}T${normalizeTime(time)}`);
}

export function normalizeTime(time: string) {
  return time.length === 5 ? `${time}:00` : time;
}

export function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getTimePortion(date: Date) {
  return date.toISOString().slice(11, 19);
}

export function validateWithinSchedule(start: Date, end: Date, config: SystemConfig) {
  if (end <= start) {
    throw new Error('La hora final debe ser mayor que la hora inicial');
  }

  const startTime = getTimePortion(start);
  const endTime = getTimePortion(end);

  if (startTime < normalizeTime(config.scheduleStart) || endTime > normalizeTime(config.scheduleEnd)) {
    throw new Error(`El horario permitido del sistema es de ${config.scheduleStart} a ${config.scheduleEnd}`);
  }
}

export function calculateReservationWindow(start: Date, durationMinutes: number, cleaningMinutes: number) {
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const effectiveEnd = new Date(end.getTime() + cleaningMinutes * 60_000);
  return { start, end, effectiveEnd };
}

export function calculateExtensionAmount(currentEnd: Date, requestedEnd: Date, hourlyReference: number) {
  const diffMinutes = Math.ceil((requestedEnd.getTime() - currentEnd.getTime()) / 60_000);
  const hours = Math.ceil(diffMinutes / 60);
  return {
    extraMinutes: diffMinutes,
    amountToPay: Number((hours * hourlyReference).toFixed(2))
  };
}

export async function ensureNoOperationalConflict(
  client: PoolClient,
  spaceId: string,
  startAt: Date,
  effectiveEndAt: Date,
  ignoreReservationId?: string
) {
  const result = await client.query(
    `
      SELECT 'reservation' AS source, id
      FROM reservations
      WHERE space_id = $1
        AND status = 'CONFIRMED'
        AND ($4::uuid IS NULL OR id <> $4::uuid)
        AND tstzrange(start_at, effective_end_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
      UNION ALL
      SELECT 'block' AS source, id
      FROM operational_blocks
      WHERE space_id = $1
        AND status = 'ACTIVE'
        AND tstzrange(start_at, end_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
      LIMIT 1
    `,
    [spaceId, startAt.toISOString(), effectiveEndAt.toISOString(), ignoreReservationId ?? null]
  );

  if (result.rows[0]) {
    throw new Error('El espacio no esta disponible para el rango solicitado');
  }
}

export async function listAvailableSpaces(
  client: PoolClient,
  startAt: Date,
  effectiveEndAt: Date
) {
  const result = await client.query(
    `
      SELECT s.id, s.name, s.code, s.building, s.floor, s.capacity
      FROM spaces s
      WHERE s.status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1
          FROM reservations r
          WHERE r.space_id = s.id
            AND r.status = 'CONFIRMED'
            AND tstzrange(r.start_at, r.effective_end_at, '[)') && tstzrange($1::timestamptz, $2::timestamptz, '[)')
        )
        AND NOT EXISTS (
          SELECT 1
          FROM operational_blocks ob
          WHERE ob.space_id = s.id
            AND ob.status = 'ACTIVE'
            AND tstzrange(ob.start_at, ob.end_at, '[)') && tstzrange($1::timestamptz, $2::timestamptz, '[)')
        )
      ORDER BY s.building, s.code
    `,
    [startAt.toISOString(), effectiveEndAt.toISOString()]
  );

  return result.rows;
}

export function ensureEditableAfter(editableAfterAt: string | Date) {
  const editableAt = new Date(editableAfterAt);
  if (editableAt > new Date()) {
    throw new Error('La reserva solo puede editarse despues de 10 segundos de creada');
  }
}

export function getBusinessDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(formatDate(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}
