import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../../db.js';
import { insertAuditLog, insertOutboxEvent } from '../../lib/audit.js';
import { requireContextActor } from '../../lib/http.js';
import { withActorTransaction } from '../../lib/request-context.js';
import {
  assertReservationActor,
  calculateReservationWindow,
  ensureEditableAfter,
  ensureNoOperationalConflict,
  ensureOwnershipOrDirection,
  getSystemConfig,
  listAvailableSpaces,
  parseDateTime,
  validateWithinSchedule
} from '../../lib/reservation-rules.js';

const createReservationSchema = z.object({
  spaceId: z.string().uuid(),
  eventName: z.string().min(3).max(200),
  eventDescription: z.string().max(1000).optional(),
  startAt: z.string().datetime()
});

const updateReservationSchema = z.object({
  spaceId: z.string().uuid().optional(),
  eventName: z.string().min(3).max(200).optional(),
  eventDescription: z.string().max(1000).optional(),
  startAt: z.string().datetime().optional()
});

export const reservationRoutes = new Hono();

reservationRoutes.post('/', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = createReservationSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ message: 'Payload invalido', issues: parsed.error.flatten() }, 400);
  }

  try {
    const reservation = await withActorTransaction(c, async ({ actor, client }) => {
      assertReservationActor(actor);

      const config = await getSystemConfig(client);
      const startAt = parseDateTime(parsed.data.startAt);
      const window = calculateReservationWindow(startAt, config.defaultReservationMinutes, config.cleaningBufferMinutes);
      validateWithinSchedule(window.start, window.end, config);
      await ensureNoOperationalConflict(client, parsed.data.spaceId, window.start, window.effectiveEnd);

      const reservationResult = await client.query(
        `
          INSERT INTO reservations (
            user_id,
            space_id,
            event_name,
            event_description,
            reservation_type,
            start_at,
            end_at,
            cleaning_buffer_minutes,
            effective_end_at,
            status,
            editable_after_at
          )
          VALUES (
            $1, $2, $3, $4, 'NORMAL',
            $5::timestamptz,
            $5::timestamptz + make_interval(mins => $6),
            $7,
            $5::timestamptz + make_interval(mins => ($6 + $7)),
            'CONFIRMED',
            now() + interval '10 seconds'
          )
          RETURNING *
        `,
        [
          actor.sub,
          parsed.data.spaceId,
          parsed.data.eventName,
          parsed.data.eventDescription ?? null,
          window.start.toISOString(),
          config.defaultReservationMinutes,
          config.cleaningBufferMinutes
        ]
      );

      const reservation = reservationResult.rows[0];

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'RESERVATION_CREATED',
        entityType: 'reservation',
        entityId: reservation.id,
        newData: reservation
      });

      await insertOutboxEvent(client, {
        aggregateType: 'reservation',
        aggregateId: reservation.id,
        eventType: 'reservation.created',
        payload: reservation,
        idempotencyKey: `reservation.created:${reservation.id}`
      });

      return reservation;
    });

    return c.json(reservation, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible crear la reserva';
    return c.json({ message }, 409);
  }
});

reservationRoutes.get('/my', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await pool.query(
    `
      SELECT *
      FROM reservations
      WHERE user_id = $1
      ORDER BY start_at DESC
    `,
    [auth.actor.sub]
  );

  return c.json({ items: result.rows });
});

reservationRoutes.get('/:id', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await pool.query('SELECT * FROM reservations WHERE id = $1', [c.req.param('id')]);
  if (!result.rows[0]) {
    return c.json({ message: 'Reserva no encontrada' }, 404);
  }

  try {
    ensureOwnershipOrDirection(auth.actor, result.rows[0].user_id);
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : 'No autorizado' }, 403);
  }

  return c.json(result.rows[0]);
});

reservationRoutes.patch('/:id', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = updateReservationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido', issues: parsed.error.flatten() }, 400);
  }

  try {
    const updated = await withActorTransaction(c, async ({ actor, client }) => {
      assertReservationActor(actor);

      const beforeResult = await client.query('SELECT * FROM reservations WHERE id = $1', [c.req.param('id')]);
      const before = beforeResult.rows[0];
      if (!before) {
        throw new Error('Reserva no encontrada');
      }

      ensureOwnershipOrDirection(actor, before.user_id);
      ensureEditableAfter(before.editable_after_at);

      const config = await getSystemConfig(client);
      const nextSpaceId = parsed.data.spaceId ?? before.space_id;
      const nextStartAt = parsed.data.startAt ? parseDateTime(parsed.data.startAt) : new Date(before.start_at);
      const durationMinutes = Math.round((new Date(before.end_at).getTime() - new Date(before.start_at).getTime()) / 60_000);
      const nextWindow = calculateReservationWindow(nextStartAt, durationMinutes, before.cleaning_buffer_minutes ?? config.cleaningBufferMinutes);
      validateWithinSchedule(nextWindow.start, nextWindow.end, config);

      try {
        await ensureNoOperationalConflict(client, nextSpaceId, nextWindow.start, nextWindow.effectiveEnd, before.id);
      } catch {
        const availableSpaces = await listAvailableSpaces(client, nextWindow.start, nextWindow.effectiveEnd);
        const conflictError = new Error('El aula original no esta disponible para el nuevo horario');
        (conflictError as Error & { availableSpaces?: unknown[] }).availableSpaces = availableSpaces;
        throw conflictError;
      }

      const updatedResult = await client.query(
        `
          UPDATE reservations
          SET space_id = COALESCE($2, space_id),
              event_name = COALESCE($3, event_name),
              event_description = COALESCE($4, event_description),
              start_at = $5::timestamptz,
              end_at = $6::timestamptz,
              effective_end_at = $7::timestamptz,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [
          c.req.param('id'),
          nextSpaceId,
          parsed.data.eventName ?? null,
          parsed.data.eventDescription ?? null,
          nextWindow.start.toISOString(),
          nextWindow.end.toISOString(),
          nextWindow.effectiveEnd.toISOString()
        ]
      );

      const updated = updatedResult.rows[0];

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'RESERVATION_UPDATED',
        entityType: 'reservation',
        entityId: c.req.param('id'),
        oldData: before,
        newData: updated
      });

      return updated;
    });

    return c.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible actualizar la reserva';
    const availableSpaces =
      error && typeof error === 'object' && 'availableSpaces' in error ? (error as { availableSpaces: unknown[] }).availableSpaces : undefined;

    if (availableSpaces) {
      return c.json({ message, availableSpaces }, 409);
    }

    return c.json({ message }, message === 'Reserva no encontrada' ? 404 : 400);
  }
});

reservationRoutes.patch('/:id/cancel', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await withActorTransaction(c, async ({ actor, client }) => {
      const before = await client.query('SELECT * FROM reservations WHERE id = $1', [c.req.param('id')]);
      if (!before.rows[0]) {
        throw new Error('Reserva no encontrada');
      }

      ensureOwnershipOrDirection(actor, before.rows[0].user_id);

      const result = await client.query(
        `
          UPDATE reservations
          SET status = 'CANCELLED',
              cancelled_at = now(),
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [c.req.param('id')]
      );

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'RESERVATION_CANCELLED',
        entityType: 'reservation',
        entityId: c.req.param('id'),
        oldData: before.rows[0],
        newData: result.rows[0]
      });

      await insertOutboxEvent(client, {
        aggregateType: 'reservation',
        aggregateId: c.req.param('id'),
        eventType: 'reservation.cancelled',
        payload: result.rows[0],
        idempotencyKey: `reservation.cancelled:${c.req.param('id')}`
      });

      return result.rows[0];
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible cancelar la reserva';
    return c.json({ message }, message === 'Reserva no encontrada' ? 404 : 400);
  }
});
