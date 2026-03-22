import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../../db.js';
import { insertAuditLog, insertOutboxEvent } from '../../lib/audit.js';
import { requireContextActor } from '../../lib/http.js';
import { withActorTransaction } from '../../lib/request-context.js';
import {
  assertReservationActor,
  buildDateTime,
  calculateReservationWindow,
  ensureNoOperationalConflict,
  ensureOwnershipOrDirection,
  getSystemConfig,
  validateWithinSchedule
} from '../../lib/reservation-rules.js';

const seriesSchema = z.object({
  baseSpaceId: z.string().uuid(),
  eventName: z.string().min(3).max(200),
  eventDescription: z.string().max(1000).optional(),
  startDate: z.string(),
  endDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  dayOfWeek: z.number().int().min(0).max(6).optional()
});

const updateInstanceSchema = z.object({
  spaceId: z.string().uuid().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional()
});

function generateDates(input: z.infer<typeof seriesSchema>) {
  const start = new Date(`${input.startDate}T00:00:00`);
  const end = new Date(`${input.endDate}T00:00:00`);
  const dates: string[] = [];

  while (start <= end) {
    const day = start.getDay();
    if (
      input.frequency === 'DAILY' ||
      (input.frequency === 'WEEKLY' && day === input.dayOfWeek) ||
      (input.frequency === 'MONTHLY' && new Date(`${input.startDate}T00:00:00`).getDate() === start.getDate())
    ) {
      dates.push(start.toISOString().slice(0, 10));
    }

    start.setDate(start.getDate() + 1);
  }

  return dates;
}

export const reservationSeriesRoutes = new Hono();

reservationSeriesRoutes.post('/', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = seriesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido', issues: parsed.error.flatten() }, 400);
  }

  const dates = generateDates(parsed.data);
  if (dates.length === 0) {
    return c.json({ message: 'No se generaron instancias para la serie' }, 400);
  }

  try {
    const series = await withActorTransaction(c, async ({ actor, client }) => {
      assertReservationActor(actor);
      const config = await getSystemConfig(client);

      for (const date of dates) {
        const startAt = buildDateTime(date, parsed.data.startTime);
        const endAt = buildDateTime(date, parsed.data.endTime);
        validateWithinSchedule(startAt, endAt, config);
        const effectiveEndAt = new Date(endAt.getTime() + config.cleaningBufferMinutes * 60_000);
        await ensureNoOperationalConflict(client, parsed.data.baseSpaceId, startAt, effectiveEndAt);
      }

      const seriesResult = await client.query(
        `
          INSERT INTO reservation_series (
            user_id, base_space_id, event_name, event_description, start_date, end_date, start_time, end_time, frequency, day_of_week
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::time, $8::time, $9, $10)
          RETURNING *
        `,
        [
          actor.sub,
          parsed.data.baseSpaceId,
          parsed.data.eventName,
          parsed.data.eventDescription ?? null,
          parsed.data.startDate,
          parsed.data.endDate,
          parsed.data.startTime,
          parsed.data.endTime,
          parsed.data.frequency,
          parsed.data.dayOfWeek ?? null
        ]
      );

      const series = seriesResult.rows[0];

      for (const date of dates) {
        const reservationResult = await client.query(
          `
            INSERT INTO reservations (
              user_id, space_id, event_name, event_description, reservation_type, start_at, end_at, cleaning_buffer_minutes, effective_end_at, status, editable_after_at
            )
            VALUES (
              $1, $2, $3, $4, 'SERIES_INSTANCE', $5::timestamptz, $6::timestamptz, $7, $8::timestamptz, 'CONFIRMED', now() + interval '10 seconds'
            )
            RETURNING *
          `,
          (() => {
            const startAt = buildDateTime(date, parsed.data.startTime);
            const window = calculateReservationWindow(
              startAt,
              Math.round((buildDateTime(date, parsed.data.endTime).getTime() - startAt.getTime()) / 60_000),
              config.cleaningBufferMinutes
            );
            return [
              actor.sub,
              parsed.data.baseSpaceId,
              parsed.data.eventName,
              parsed.data.eventDescription ?? null,
              window.start.toISOString(),
              window.end.toISOString(),
              config.cleaningBufferMinutes,
              window.effectiveEnd.toISOString()
            ];
          })()
        );

        await client.query(
          `
            INSERT INTO reservation_series_instances (
              series_id, reservation_id, specific_date, start_at, end_at, space_id, is_exception, status
            )
            VALUES ($1, $2, $3::date, $4::timestamptz, $5::timestamptz, $6, false, 'CONFIRMED')
          `,
          [
            series.id,
            reservationResult.rows[0].id,
            date,
            `${date}T${parsed.data.startTime}:00`,
            `${date}T${parsed.data.endTime}:00`,
            parsed.data.baseSpaceId
          ]
        );
      }

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'SERIES_CREATED',
        entityType: 'reservation_series',
        entityId: series.id,
        newData: { ...series, generatedDates: dates }
      });

      await insertOutboxEvent(client, {
        aggregateType: 'reservation_series',
        aggregateId: series.id,
        eventType: 'reservation.series.created',
        payload: { ...series, generatedDates: dates },
        idempotencyKey: `reservation.series.created:${series.id}`
      });

      return series;
    });

    return c.json({ ...series, generatedDates: dates }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible crear la serie';
    return c.json({ message }, 400);
  }
});

reservationSeriesRoutes.get('/my', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await pool.query(
    'SELECT * FROM reservation_series WHERE user_id = $1 ORDER BY created_at DESC',
    [auth.actor.sub]
  );

  return c.json({ items: result.rows });
});

reservationSeriesRoutes.get('/:id', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const seriesResult = await pool.query('SELECT * FROM reservation_series WHERE id = $1', [c.req.param('id')]);
  if (!seriesResult.rows[0]) {
    return c.json({ message: 'Serie no encontrada' }, 404);
  }

  try {
    ensureOwnershipOrDirection(auth.actor, seriesResult.rows[0].user_id);
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : 'No autorizado' }, 403);
  }

  const instances = await pool.query(
    'SELECT * FROM reservation_series_instances WHERE series_id = $1 ORDER BY specific_date',
    [c.req.param('id')]
  );

  return c.json({
    ...seriesResult.rows[0],
    instances: instances.rows
  });
});

reservationSeriesRoutes.patch('/:id', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = seriesSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido' }, 400);
  }

  try {
    const result = await withActorTransaction(c, async ({ actor, client }) => {
      const before = await client.query('SELECT * FROM reservation_series WHERE id = $1', [c.req.param('id')]);
      if (!before.rows[0]) {
        throw new Error('Serie no encontrada');
      }
      ensureOwnershipOrDirection(actor, before.rows[0].user_id);

      const result = await client.query(
        `
          UPDATE reservation_series
          SET event_name = COALESCE($2, event_name),
              event_description = COALESCE($3, event_description),
              status = COALESCE($4, status),
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [c.req.param('id'), parsed.data.eventName ?? null, parsed.data.eventDescription ?? null, null]
      );

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'SERIES_UPDATED',
        entityType: 'reservation_series',
        entityId: c.req.param('id'),
        oldData: before.rows[0],
        newData: result.rows[0]
      });

      return result.rows[0];
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible actualizar la serie';
    return c.json({ message }, message === 'Serie no encontrada' ? 404 : 400);
  }
});

reservationSeriesRoutes.patch('/:id/cancel', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await withActorTransaction(c, async ({ actor, client }) => {
      const before = await client.query('SELECT * FROM reservation_series WHERE id = $1', [c.req.param('id')]);
      if (!before.rows[0]) {
        throw new Error('Serie no encontrada');
      }
      ensureOwnershipOrDirection(actor, before.rows[0].user_id);
      await client.query(
        `UPDATE reservation_series SET status = 'CANCELLED', updated_at = now() WHERE id = $1`,
        [c.req.param('id')]
      );
      await client.query(
        `UPDATE reservation_series_instances SET status = 'CANCELLED', updated_at = now() WHERE series_id = $1`,
        [c.req.param('id')]
      );

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'SERIES_CANCELLED',
        entityType: 'reservation_series',
        entityId: c.req.param('id'),
        newData: { status: 'CANCELLED' }
      });

      return { id: c.req.param('id'), status: 'CANCELLED' };
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible cancelar la serie';
    return c.json({ message }, message === 'Serie no encontrada' ? 404 : 400);
  }
});

reservationSeriesRoutes.patch('/:id/instances/:instanceId', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = updateInstanceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido' }, 400);
  }

  try {
    const result = await withActorTransaction(c, async ({ actor, client }) => {
      const before = await client.query(
        `
          SELECT rsi.*, rs.user_id
          FROM reservation_series_instances rsi
          JOIN reservation_series rs ON rs.id = rsi.series_id
          WHERE rsi.id = $1 AND rsi.series_id = $2
        `,
        [c.req.param('instanceId'), c.req.param('id')]
      );
      if (!before.rows[0]) {
        throw new Error('Instancia no encontrada');
      }
      ensureOwnershipOrDirection(actor, before.rows[0].user_id);

      const config = await getSystemConfig(client);
      const nextSpaceId = parsed.data.spaceId ?? before.rows[0].space_id;
      const nextStartAt = parsed.data.startAt ? new Date(parsed.data.startAt) : new Date(before.rows[0].start_at);
      const nextEndAt = parsed.data.endAt ? new Date(parsed.data.endAt) : new Date(before.rows[0].end_at);
      validateWithinSchedule(nextStartAt, nextEndAt, config);
      const nextEffectiveEndAt = new Date(nextEndAt.getTime() + config.cleaningBufferMinutes * 60_000);
      await ensureNoOperationalConflict(client, nextSpaceId, nextStartAt, nextEffectiveEndAt, before.rows[0].reservation_id ?? undefined);

      const result = await client.query(
        `
          UPDATE reservation_series_instances
          SET space_id = COALESCE($3, space_id),
              start_at = COALESCE($4::timestamptz, start_at),
              end_at = COALESCE($5::timestamptz, end_at),
              is_exception = true,
              updated_at = now()
          WHERE id = $1 AND series_id = $2
          RETURNING *
        `,
        [
          c.req.param('instanceId'),
          c.req.param('id'),
          nextSpaceId,
          nextStartAt.toISOString(),
          nextEndAt.toISOString()
        ]
      );

      if (before.rows[0].reservation_id) {
        await client.query(
          `
            UPDATE reservations
            SET space_id = $2,
                start_at = $3::timestamptz,
                end_at = $4::timestamptz,
                effective_end_at = $5::timestamptz,
                updated_at = now()
            WHERE id = $1
          `,
          [before.rows[0].reservation_id, nextSpaceId, nextStartAt.toISOString(), nextEndAt.toISOString(), nextEffectiveEndAt.toISOString()]
        );
      }

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'SERIES_INSTANCE_UPDATED',
        entityType: 'reservation_series_instance',
        entityId: c.req.param('instanceId'),
        oldData: before.rows[0],
        newData: result.rows[0]
      });

      return result.rows[0];
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible actualizar la instancia';
    return c.json({ message }, message === 'Instancia no encontrada' ? 404 : 400);
  }
});

reservationSeriesRoutes.patch('/:id/instances/:instanceId/cancel', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await withActorTransaction(c, async ({ actor, client }) => {
      const before = await client.query(
        `
          SELECT rsi.*, rs.user_id
          FROM reservation_series_instances rsi
          JOIN reservation_series rs ON rs.id = rsi.series_id
          WHERE rsi.id = $1 AND rsi.series_id = $2
        `,
        [c.req.param('instanceId'), c.req.param('id')]
      );
      if (!before.rows[0]) {
        throw new Error('Instancia no encontrada');
      }
      ensureOwnershipOrDirection(actor, before.rows[0].user_id);
      const result = await client.query(
        `
          UPDATE reservation_series_instances
          SET status = 'CANCELLED', updated_at = now()
          WHERE id = $1 AND series_id = $2
          RETURNING *
        `,
        [c.req.param('instanceId'), c.req.param('id')]
      );

      if (!result.rows[0]) {
        throw new Error('Instancia no encontrada');
      }

      if (before.rows[0].reservation_id) {
        await client.query(
          `
            UPDATE reservations
            SET status = 'CANCELLED', cancelled_at = now(), updated_at = now()
            WHERE id = $1
          `,
          [before.rows[0].reservation_id]
        );
      }

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'SERIES_INSTANCE_CANCELLED',
        entityType: 'reservation_series_instance',
        entityId: c.req.param('instanceId'),
        newData: result.rows[0]
      });

      return result.rows[0];
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible cancelar la instancia';
    return c.json({ message }, message === 'Instancia no encontrada' ? 404 : 400);
  }
});
