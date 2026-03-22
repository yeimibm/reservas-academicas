import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../../db.js';
import { insertAuditLog, insertOutboxEvent } from '../../lib/audit.js';
import { requireContextActor } from '../../lib/http.js';
import { ensureApprovedReceiptForExtension } from '../../lib/payment-receipt-rules.js';
import { withActorTransaction } from '../../lib/request-context.js';
import {
  calculateExtensionAmount,
  ensureNoOperationalConflict,
  ensureOwnershipOrDirection,
  getSystemConfig,
  parseDateTime,
  validateWithinSchedule
} from '../../lib/reservation-rules.js';

const createExtensionSchema = z.object({
  requestedNewEndAt: z.string().datetime(),
  comments: z.string().max(1000).optional()
});

const reviewExtensionSchema = z.object({
  comments: z.string().max(1000).optional()
});

export const extensionRoutes = new Hono();

extensionRoutes.get('/extensions', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const status = c.req.query('status');
  const values: string[] = [];
  let whereClause = '';

  if (status) {
    values.push(status);
    whereClause = 'WHERE re.status = $1';
  }

  const result = await pool.query(
    `
      SELECT re.*,
             r.event_name,
             r.space_id,
             r.start_at,
             u.first_name AS requested_by_first_name,
             u.last_name AS requested_by_last_name,
             pr.id AS receipt_id,
             pr.processing_status AS receipt_status
      FROM reservation_extensions re
      JOIN reservations r ON r.id = re.reservation_id
      JOIN users u ON u.id = re.requested_by_user_id
      LEFT JOIN LATERAL (
        SELECT id, processing_status
        FROM payment_receipts
        WHERE extension_id = re.id
        ORDER BY created_at DESC
        LIMIT 1
      ) pr ON true
      ${whereClause}
      ORDER BY re.requested_at DESC
    `,
    values
  );

  return c.json({ items: result.rows });
});

extensionRoutes.post('/reservations/:id/request-extension', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = createExtensionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido' }, 400);
  }

  try {
    const extension = await withActorTransaction(c, async ({ actor, client }) => {
      const reservationResult = await client.query('SELECT * FROM reservations WHERE id = $1', [c.req.param('id')]);
      const reservation = reservationResult.rows[0];

      if (!reservation) {
        throw new Error('Reserva no encontrada');
      }

      ensureOwnershipOrDirection(actor, reservation.user_id);
      if (reservation.status !== 'CONFIRMED') {
        throw new Error('Solo se puede extender una reserva confirmada');
      }

      const config = await getSystemConfig(client);
      const currentEndAt = new Date(reservation.end_at);
      const requestedEndAt = parseDateTime(parsed.data.requestedNewEndAt);
      const nextEffectiveEndAt = new Date(requestedEndAt.getTime() + reservation.cleaning_buffer_minutes * 60_000);
      validateWithinSchedule(new Date(reservation.start_at), requestedEndAt, config);
      await ensureNoOperationalConflict(client, reservation.space_id, new Date(reservation.start_at), nextEffectiveEndAt, reservation.id);
      const { extraMinutes, amountToPay } = calculateExtensionAmount(
        currentEndAt,
        requestedEndAt,
        config.extensionReferenceAmount
      );

      const extensionResult = await client.query(
        `
          INSERT INTO reservation_extensions (
            reservation_id, requested_by_user_id, current_end_at, requested_new_end_at, extra_minutes, amount_to_pay, status, comments
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, 'PENDING_PAYMENT', $7
          )
          RETURNING *
        `,
        [reservation.id, actor.sub, reservation.end_at, requestedEndAt.toISOString(), extraMinutes, amountToPay, parsed.data.comments ?? null]
      );

      const extension = extensionResult.rows[0];

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'EXTENSION_REQUESTED',
        entityType: 'reservation_extension',
        entityId: extension.id,
        newData: extension
      });

      await insertOutboxEvent(client, {
        aggregateType: 'reservation_extension',
        aggregateId: extension.id,
        eventType: 'reservation.extension.requested',
        payload: extension,
        idempotencyKey: `reservation.extension.requested:${extension.id}`
      });

      return extension;
    });

    return c.json(extension, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible solicitar la extension';
    return c.json({ message }, message === 'Reserva no encontrada' ? 404 : 400);
  }
});

extensionRoutes.get('/extensions/my', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await pool.query(
    `
      SELECT re.*,
             r.event_name,
             r.space_id,
             r.start_at,
             pr.id AS receipt_id,
             pr.processing_status AS receipt_status
      FROM reservation_extensions re
      JOIN reservations r ON r.id = re.reservation_id
      LEFT JOIN LATERAL (
        SELECT id, processing_status
        FROM payment_receipts
        WHERE extension_id = re.id
        ORDER BY created_at DESC
        LIMIT 1
      ) pr ON true
      WHERE re.requested_by_user_id = $1
      ORDER BY re.requested_at DESC
    `,
    [auth.actor.sub]
  );

  return c.json({ items: result.rows });
});

extensionRoutes.get('/extensions/:id', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await pool.query(
    `
      SELECT re.*, r.user_id AS reservation_owner_user_id
      FROM reservation_extensions re
      JOIN reservations r ON r.id = re.reservation_id
      WHERE re.id = $1
    `,
    [c.req.param('id')]
  );
  if (!result.rows[0]) {
    return c.json({ message: 'Extension no encontrada' }, 404);
  }

  try {
    ensureOwnershipOrDirection(auth.actor, result.rows[0].reservation_owner_user_id);
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : 'No autorizado' }, 403);
  }

  return c.json(result.rows[0]);
});

extensionRoutes.patch('/extensions/:id/approve', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = reviewExtensionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido' }, 400);
  }

  try {
    const updatedExtension = await withActorTransaction(c, async ({ actor, client }) => {
      const extensionResult = await client.query('SELECT * FROM reservation_extensions WHERE id = $1', [c.req.param('id')]);
      const extension = extensionResult.rows[0];
      if (!extension) {
        throw new Error('Extension no encontrada');
      }

      if (!['PENDING_REVIEW', 'PAYMENT_UNDER_REVIEW', 'PENDING_PAYMENT'].includes(extension.status)) {
        throw new Error('La extension no esta en un estado aprobable');
      }

      await ensureApprovedReceiptForExtension(client, extension.id, Number(extension.amount_to_pay));

      const reservationBeforeResult = await client.query('SELECT * FROM reservations WHERE id = $1', [extension.reservation_id]);
      const reservationBefore = reservationBeforeResult.rows[0];
      if (!reservationBefore || reservationBefore.status !== 'CONFIRMED') {
        throw new Error('La reserva asociada no puede extenderse');
      }

      const config = await getSystemConfig(client);
      const requestedEndAt = new Date(extension.requested_new_end_at);
      const nextEffectiveEndAt = new Date(requestedEndAt.getTime() + reservationBefore.cleaning_buffer_minutes * 60_000);
      validateWithinSchedule(new Date(reservationBefore.start_at), requestedEndAt, config);
      await ensureNoOperationalConflict(
        client,
        reservationBefore.space_id,
        new Date(reservationBefore.start_at),
        nextEffectiveEndAt,
        reservationBefore.id
      );

      const updatedExtensionResult = await client.query(
        `
          UPDATE reservation_extensions
          SET status = 'APPROVED',
              reviewed_by = $2,
              reviewed_at = now(),
              comments = COALESCE($3, comments)
          WHERE id = $1
          RETURNING *
        `,
        [c.req.param('id'), actor.sub, parsed.data.comments ?? null]
      );

      const updatedExtension = updatedExtensionResult.rows[0];

      const reservationResult = await client.query(
        `
          UPDATE reservations
          SET end_at = $2,
              effective_end_at = $2 + make_interval(mins => cleaning_buffer_minutes),
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [extension.reservation_id, extension.requested_new_end_at]
      );

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'EXTENSION_APPROVED',
        entityType: 'reservation_extension',
        entityId: updatedExtension.id,
        oldData: extension,
        newData: updatedExtension
      });

      await insertOutboxEvent(client, {
        aggregateType: 'reservation_extension',
        aggregateId: updatedExtension.id,
        eventType: 'reservation.extension.approved',
        payload: { extension: updatedExtension, reservation: reservationResult.rows[0] },
        idempotencyKey: `reservation.extension.approved:${updatedExtension.id}`
      });

      return updatedExtension;
    });

    return c.json(updatedExtension);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible aprobar la extension';
    return c.json({ message }, message === 'Extension no encontrada' ? 404 : 400);
  }
});

extensionRoutes.patch('/extensions/:id/reject', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = reviewExtensionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido' }, 400);
  }

  try {
    const result = await withActorTransaction(c, async ({ actor, client }) => {
      const before = await client.query('SELECT * FROM reservation_extensions WHERE id = $1', [c.req.param('id')]);
      if (!before.rows[0]) {
        throw new Error('Extension no encontrada');
      }

      const result = await client.query(
        `
          UPDATE reservation_extensions
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
        actionType: 'EXTENSION_REJECTED',
        entityType: 'reservation_extension',
        entityId: c.req.param('id'),
        oldData: before.rows[0],
        newData: result.rows[0]
      });

      return result.rows[0];
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible rechazar la extension';
    return c.json({ message }, message === 'Extension no encontrada' ? 404 : 400);
  }
});
