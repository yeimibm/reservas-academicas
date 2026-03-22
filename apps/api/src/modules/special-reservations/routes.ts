import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../../db.js';
import { insertAuditLog, insertOutboxEvent } from '../../lib/audit.js';
import { requireContextActor } from '../../lib/http.js';
import { ensureApprovedReceiptForSpecialRequest } from '../../lib/payment-receipt-rules.js';
import { withActorTransaction } from '../../lib/request-context.js';
import {
  assertReservationActor,
  buildDateTime,
  ensureNoOperationalConflict,
  ensureOwnershipOrDirection,
  getBusinessDates,
  getSystemConfig,
  validateWithinSchedule
} from '../../lib/reservation-rules.js';

const specialReservationSchema = z.object({
  spaceId: z.string().uuid(),
  eventName: z.string().min(3).max(200),
  eventDescription: z.string().max(1000).optional(),
  startDate: z.string(),
  endDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  comments: z.string().max(1000).optional()
});

const specialReviewSchema = z.object({
  comments: z.string().max(1000).optional()
});

export const specialReservationRoutes = new Hono();

specialReservationRoutes.get('/', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const status = c.req.query('status');
  const values: string[] = [];
  let whereClause = '';

  if (status) {
    values.push(status);
    whereClause = 'WHERE sr.status = $1';
  }

  const result = await pool.query(
    `
      SELECT sr.*,
             u.first_name AS requested_by_first_name,
             u.last_name AS requested_by_last_name,
             s.name AS space_name,
             s.code AS space_code,
             pr.id AS receipt_id,
             pr.processing_status AS receipt_status
      FROM special_reservation_requests sr
      JOIN users u ON u.id = sr.user_id
      JOIN spaces s ON s.id = sr.space_id
      LEFT JOIN LATERAL (
        SELECT id, processing_status
        FROM payment_receipts
        WHERE special_request_id = sr.id
        ORDER BY created_at DESC
        LIMIT 1
      ) pr ON true
      ${whereClause}
      ORDER BY sr.requested_at DESC
    `,
    values
  );

  return c.json({ items: result.rows });
});

specialReservationRoutes.post('/', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = specialReservationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido', issues: parsed.error.flatten() }, 400);
  }

  const dates = getBusinessDates(parsed.data.startDate, parsed.data.endDate);
  if (dates.length === 0) {
    return c.json({ message: 'El rango no contiene dias habiles' }, 400);
  }
  if (dates.length > 6) {
    return c.json({ message: 'El maximo permitido es de 6 dias habiles por solicitud especial' }, 400);
  }

  try {
    const request = await withActorTransaction(c, async ({ actor, client }) => {
      assertReservationActor(actor);
      const config = await getSystemConfig(client);

      for (const date of dates) {
        const startAt = buildDateTime(date, parsed.data.startTime);
        const endAt = buildDateTime(date, parsed.data.endTime);
        validateWithinSchedule(startAt, endAt, config);
        const effectiveEndAt = new Date(endAt.getTime() + config.cleaningBufferMinutes * 60_000);
        await ensureNoOperationalConflict(client, parsed.data.spaceId, startAt, effectiveEndAt);
      }

      const requestResult = await client.query(
        `
          INSERT INTO special_reservation_requests (
            user_id, space_id, event_name, event_description, start_date, end_date, start_time, end_time, amount_to_pay, status, comments
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::time, $8::time, $9, 'PENDING_PAYMENT', $10)
          RETURNING *
        `,
        [
          actor.sub,
          parsed.data.spaceId,
          parsed.data.eventName,
          parsed.data.eventDescription ?? null,
          parsed.data.startDate,
          parsed.data.endDate,
          parsed.data.startTime,
          parsed.data.endTime,
          Number((dates.length * config.specialReservationDailyAmount).toFixed(2)),
          parsed.data.comments ?? null
        ]
      );

      const request = requestResult.rows[0];

      for (const date of dates) {
        await client.query(
          `
            INSERT INTO special_reservation_request_dates (
              request_id, specific_date, start_at, end_at, effective_end_at
            )
            VALUES (
              $1,
              $2::date,
              $3::timestamptz,
              $4::timestamptz,
              $5::timestamptz
            )
          `,
          [
            request.id,
            date,
            buildDateTime(date, parsed.data.startTime).toISOString(),
            buildDateTime(date, parsed.data.endTime).toISOString(),
            new Date(buildDateTime(date, parsed.data.endTime).getTime() + config.cleaningBufferMinutes * 60_000).toISOString()
          ]
        );
      }

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'SPECIAL_RESERVATION_REQUESTED',
        entityType: 'special_reservation_request',
        entityId: request.id,
        newData: request
      });

      await insertOutboxEvent(client, {
        aggregateType: 'special_reservation_request',
        aggregateId: request.id,
        eventType: 'special_reservation.requested',
        payload: request,
        idempotencyKey: `special_reservation.requested:${request.id}`
      });

      return request;
    });

    return c.json({ ...request, businessDates: dates }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible crear la solicitud especial';
    return c.json({ message }, 400);
  }
});

specialReservationRoutes.get('/my', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await pool.query(
    `
      SELECT sr.*,
             s.name AS space_name,
             s.code AS space_code,
             pr.id AS receipt_id,
             pr.processing_status AS receipt_status
      FROM special_reservation_requests sr
      JOIN spaces s ON s.id = sr.space_id
      LEFT JOIN LATERAL (
        SELECT id, processing_status
        FROM payment_receipts
        WHERE special_request_id = sr.id
        ORDER BY created_at DESC
        LIMIT 1
      ) pr ON true
      WHERE sr.user_id = $1
      ORDER BY sr.requested_at DESC
    `,
    [auth.actor.sub]
  );

  return c.json({ items: result.rows });
});

specialReservationRoutes.get('/:id', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const requestResult = await pool.query('SELECT * FROM special_reservation_requests WHERE id = $1', [c.req.param('id')]);
  if (!requestResult.rows[0]) {
    return c.json({ message: 'Solicitud no encontrada' }, 404);
  }

  try {
    ensureOwnershipOrDirection(auth.actor, requestResult.rows[0].user_id);
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : 'No autorizado' }, 403);
  }

  const datesResult = await pool.query(
    'SELECT * FROM special_reservation_request_dates WHERE request_id = $1 ORDER BY specific_date',
    [c.req.param('id')]
  );

  return c.json({
    ...requestResult.rows[0],
    dates: datesResult.rows
  });
});

specialReservationRoutes.patch('/:id/approve', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = specialReviewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido' }, 400);
  }

  try {
    const updatedRequest = await withActorTransaction(c, async ({ actor, client }) => {
      const before = await client.query('SELECT * FROM special_reservation_requests WHERE id = $1', [c.req.param('id')]);
      const request = before.rows[0];
      if (!request) {
        throw new Error('Solicitud no encontrada');
      }

      if (!['PENDING_REVIEW', 'PAYMENT_UNDER_REVIEW', 'PENDING_PAYMENT'].includes(request.status)) {
        throw new Error('La solicitud no esta en un estado aprobable');
      }

      await ensureApprovedReceiptForSpecialRequest(client, request.id, Number(request.amount_to_pay));

      const config = await getSystemConfig(client);
      const datesResult = await client.query(
        'SELECT * FROM special_reservation_request_dates WHERE request_id = $1 ORDER BY specific_date',
        [c.req.param('id')]
      );

      for (const row of datesResult.rows) {
        validateWithinSchedule(new Date(row.start_at), new Date(row.end_at), config);
        await ensureNoOperationalConflict(client, request.space_id, new Date(row.start_at), new Date(row.effective_end_at));
      }

      const updatedResult = await client.query(
        `
          UPDATE special_reservation_requests
          SET status = 'SCHEDULED',
              reviewed_by = $2,
              reviewed_at = now(),
              comments = COALESCE($3, comments)
          WHERE id = $1
          RETURNING *
        `,
        [c.req.param('id'), actor.sub, parsed.data.comments ?? null]
      );

      for (const row of datesResult.rows) {
        await client.query(
          `
            INSERT INTO reservations (
              user_id, space_id, event_name, event_description, reservation_type, start_at, end_at, cleaning_buffer_minutes, effective_end_at, status, editable_after_at
            )
            VALUES ($1, $2, $3, $4, 'SPECIAL_APPROVED', $5::timestamptz, $6::timestamptz, $7, $8::timestamptz, 'CONFIRMED', now() + interval '10 seconds')
          `,
          [
            request.user_id,
            request.space_id,
            request.event_name,
            request.event_description,
            row.start_at,
            row.end_at,
            config.cleaningBufferMinutes,
            row.effective_end_at
          ]
        );
      }

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'SPECIAL_RESERVATION_APPROVED',
        entityType: 'special_reservation_request',
        entityId: c.req.param('id'),
        oldData: request,
        newData: updatedResult.rows[0]
      });

      return updatedResult.rows[0];
    });

    return c.json(updatedRequest);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible aprobar la solicitud';
    return c.json({ message }, message === 'Solicitud no encontrada' ? 404 : 400);
  }
});

specialReservationRoutes.patch('/:id/reject', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = specialReviewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido' }, 400);
  }

  try {
    const result = await withActorTransaction(c, async ({ actor, client }) => {
      const before = await client.query('SELECT * FROM special_reservation_requests WHERE id = $1', [c.req.param('id')]);
      if (!before.rows[0]) {
        throw new Error('Solicitud no encontrada');
      }

      const result = await client.query(
        `
          UPDATE special_reservation_requests
          SET status = 'REJECTED',
              reviewed_by = $2,
              reviewed_at = now(),
              comments = COALESCE($3, comments)
          WHERE id = $1
          RETURNING *
        `,
        [c.req.param('id'), actor.sub, parsed.data.comments ?? null]
      );

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'SPECIAL_RESERVATION_REJECTED',
        entityType: 'special_reservation_request',
        entityId: c.req.param('id'),
        oldData: before.rows[0],
        newData: result.rows[0]
      });

      return result.rows[0];
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible rechazar la solicitud';
    return c.json({ message }, message === 'Solicitud no encontrada' ? 404 : 400);
  }
});
