import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../../db.js';
import { insertAuditLog, insertOutboxEvent } from '../../lib/audit.js';
import { requireContextActor } from '../../lib/http.js';
import { getContentTypeFromExtension, readStoredUpload, saveReceiptUpload } from '../../lib/upload-storage.js';

const createReceiptSchema = z.object({
  extensionId: z.string().uuid().optional(),
  specialRequestId: z.string().uuid().optional(),
  reservationId: z.string().uuid().optional(),
  fileUrl: z.string().url(),
  fileType: z.enum(['png', 'jpg', 'jpeg', 'pdf'])
});

const reviewReceiptSchema = z.object({
  comments: z.string().max(1000).optional()
});

export const paymentReceiptRoutes = new Hono();

async function ensureReceiptOwnership(
  client: { query: typeof pool.query },
  input: {
    actorUserId: string;
    actorUserType: string;
    extensionId?: string;
    specialRequestId?: string;
    reservationId?: string;
  }
) {
  if (input.actorUserType === 'DIRECTION') {
    return;
  }

  if (input.extensionId) {
    const result = await client.query(
      `
        SELECT requested_by_user_id
        FROM reservation_extensions
        WHERE id = $1
      `,
      [input.extensionId]
    );

    if (!result.rows[0] || result.rows[0].requested_by_user_id !== input.actorUserId) {
      throw new Error('No puedes adjuntar comprobantes a extensiones de otro usuario');
    }
  }

  if (input.specialRequestId) {
    const result = await client.query(
      `
        SELECT user_id
        FROM special_reservation_requests
        WHERE id = $1
      `,
      [input.specialRequestId]
    );

    if (!result.rows[0] || result.rows[0].user_id !== input.actorUserId) {
      throw new Error('No puedes adjuntar comprobantes a solicitudes especiales de otro usuario');
    }
  }

  if (input.reservationId) {
    const result = await client.query(
      `
        SELECT user_id
        FROM reservations
        WHERE id = $1
      `,
      [input.reservationId]
    );

    if (!result.rows[0] || result.rows[0].user_id !== input.actorUserId) {
      throw new Error('No puedes adjuntar comprobantes a reservas de otro usuario');
    }
  }
}

paymentReceiptRoutes.get('/', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await pool.query(
    `
      SELECT pr.id,
             pr.extension_id,
             pr.special_request_id,
             pr.reservation_id,
             pr.uploaded_by_user_id,
             pr.file_url,
             pr.file_type,
             pr.processing_status,
             pr.payer_name,
             pr.receiver_name,
             pr.bank_name,
             pr.payment_date,
             pr.amount,
             pr.ai_extracted_json,
             pr.created_at,
             pr.updated_at,
             CASE
               WHEN pr.special_request_id IS NOT NULL THEN 'SPECIAL_REQUEST'
               WHEN pr.extension_id IS NOT NULL THEN 'EXTENSION'
               WHEN pr.reservation_id IS NOT NULL THEN 'RESERVATION'
               ELSE 'MANUAL'
             END AS related_type,
             COALESCE(
               sr.event_name,
               er.event_name,
               rr.event_name,
               'Carga manual sin vinculo'
             ) AS related_label
      FROM payment_receipts pr
      LEFT JOIN special_reservation_requests sr ON sr.id = pr.special_request_id
      LEFT JOIN reservation_extensions re ON re.id = pr.extension_id
      LEFT JOIN reservations er ON er.id = re.reservation_id
      LEFT JOIN reservations rr ON rr.id = pr.reservation_id
      ORDER BY pr.created_at DESC
    `
  );

  return c.json({ items: result.rows });
});

paymentReceiptRoutes.post('/', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const contentType = c.req.header('content-type') ?? '';
  const client = await pool.connect();

  try {
    let payload:
      | {
          id: string;
          extensionId?: string;
          specialRequestId?: string;
          reservationId?: string;
          fileUrl: string;
          fileType: 'png' | 'jpg' | 'jpeg' | 'pdf';
        }
      | undefined;

    if (contentType.includes('multipart/form-data')) {
      const body = await c.req.parseBody();
      const fileValue = body.file;

      if (!(fileValue instanceof File)) {
        return c.json({ message: 'El archivo es obligatorio' }, 400);
      }

      const savedFile = await saveReceiptUpload(fileValue);
      payload = {
        id: randomUUID(),
        extensionId: typeof body.extensionId === 'string' && body.extensionId ? body.extensionId : undefined,
        specialRequestId:
          typeof body.specialRequestId === 'string' && body.specialRequestId ? body.specialRequestId : undefined,
        reservationId: typeof body.reservationId === 'string' && body.reservationId ? body.reservationId : undefined,
        fileUrl: savedFile.publicUrl,
        fileType: savedFile.fileType as 'png' | 'jpg' | 'jpeg' | 'pdf'
      };
    } else {
      const body = await c.req.json();
      const parsed = createReceiptSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ message: 'Payload invalido', issues: parsed.error.flatten() }, 400);
      }

      payload = {
        id: randomUUID(),
        extensionId: parsed.data.extensionId,
        specialRequestId: parsed.data.specialRequestId,
        reservationId: parsed.data.reservationId,
        fileUrl: parsed.data.fileUrl,
        fileType: parsed.data.fileType
      };
    }

    await client.query('BEGIN');
    await ensureReceiptOwnership(client, {
      actorUserId: auth.actor.sub,
      actorUserType: auth.actor.userType,
      extensionId: payload.extensionId,
      specialRequestId: payload.specialRequestId,
      reservationId: payload.reservationId
    });

    const result = await client.query(
      `
        INSERT INTO payment_receipts (
          id, extension_id, special_request_id, reservation_id, uploaded_by_user_id, file_url, file_type, processing_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'SUBIDO')
        RETURNING *
      `,
      [
        payload.id,
        payload.extensionId ?? null,
        payload.specialRequestId ?? null,
        payload.reservationId ?? null,
        auth.actor.sub,
        payload.fileUrl,
        payload.fileType
      ]
    );

    if (payload.extensionId) {
      await client.query(
        `
          UPDATE reservation_extensions
          SET status = CASE
            WHEN status IN ('PENDING_PAYMENT', 'PENDING_REVIEW') THEN 'PAYMENT_UNDER_REVIEW'
            ELSE status
          END
          WHERE id = $1
        `,
        [payload.extensionId]
      );
    }

    if (payload.specialRequestId) {
      await client.query(
        `
          UPDATE special_reservation_requests
          SET status = CASE
            WHEN status IN ('PENDING_PAYMENT', 'PENDING_REVIEW') THEN 'PAYMENT_UNDER_REVIEW'
            ELSE status
          END
          WHERE id = $1
        `,
        [payload.specialRequestId]
      );
    }

    await insertAuditLog(client, {
      actorUserId: auth.actor.sub,
      actionType: 'PAYMENT_RECEIPT_UPLOADED',
      entityType: 'payment_receipt',
      entityId: result.rows[0].id,
      newData: result.rows[0]
    });

    await insertOutboxEvent(client, {
      aggregateType: 'payment_receipt',
      aggregateId: result.rows[0].id,
      eventType: 'payment_receipt.uploaded',
      payload: result.rows[0],
      idempotencyKey: `payment_receipt.uploaded:${result.rows[0].id}`
    });

    await client.query('COMMIT');
    return c.json(result.rows[0], 201);
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'No fue posible registrar el comprobante';
    return c.json({ message }, 400);
  } finally {
    client.release();
  }
});

paymentReceiptRoutes.get('/:id', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await pool.query('SELECT * FROM payment_receipts WHERE id = $1', [c.req.param('id')]);
  if (!result.rows[0]) {
    return c.json({ message: 'Comprobante no encontrado' }, 404);
  }

  return c.json(result.rows[0]);
});

paymentReceiptRoutes.get('/:id/file', async (c) => {
  const result = await pool.query('SELECT file_url, file_type FROM payment_receipts WHERE id = $1', [c.req.param('id')]);
  if (!result.rows[0]) {
    return c.text('Comprobante no encontrado', 404);
  }

  const fileUrl: string = result.rows[0].file_url;
  if (!fileUrl.startsWith('/uploads/')) {
    return c.redirect(fileUrl);
  }

  const relativePath = fileUrl.replace('/uploads/', '');
  try {
    const buffer = await readStoredUpload(relativePath);
    return new Response(buffer, {
      headers: {
        'Content-Type': getContentTypeFromExtension(result.rows[0].file_type),
        'Cache-Control': 'private, max-age=300'
      }
    });
  } catch {
    return c.text('Archivo no encontrado', 404);
  }
});

paymentReceiptRoutes.patch('/:id/approve', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = reviewReceiptSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido' }, 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM payment_receipts WHERE id = $1', [c.req.param('id')]);
    if (!before.rows[0]) {
      await client.query('ROLLBACK');
      return c.json({ message: 'Comprobante no encontrado' }, 404);
    }
    if (before.rows[0].processing_status === 'APROBADO' && before.rows[0].locked_at) {
      throw new Error('El comprobante aprobado ya no puede modificarse');
    }

    const result = await client.query(
      `
        UPDATE payment_receipts
        SET processing_status = 'APROBADO',
            reviewed_by = $2,
            reviewed_at = now(),
            locked_at = now(),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [c.req.param('id'), auth.actor.sub]
    );

    if (result.rows[0].extension_id) {
      await client.query(
        `
          UPDATE reservation_extensions
          SET status = 'PAYMENT_UNDER_REVIEW'
          WHERE id = $1
            AND status IN ('PENDING_PAYMENT', 'PENDING_REVIEW', 'PAYMENT_UNDER_REVIEW')
        `,
        [result.rows[0].extension_id]
      );
    }

    if (result.rows[0].special_request_id) {
      await client.query(
        `
          UPDATE special_reservation_requests
          SET status = 'PAYMENT_UNDER_REVIEW'
          WHERE id = $1
            AND status IN ('PENDING_PAYMENT', 'PENDING_REVIEW', 'PAYMENT_UNDER_REVIEW')
        `,
        [result.rows[0].special_request_id]
      );
    }

    await insertAuditLog(client, {
      actorUserId: auth.actor.sub,
      actionType: 'PAYMENT_RECEIPT_APPROVED',
      entityType: 'payment_receipt',
      entityId: c.req.param('id'),
      oldData: before.rows[0],
      newData: { ...result.rows[0], comments: parsed.data.comments ?? null }
    });

    await client.query('COMMIT');
    return c.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'No fue posible aprobar el comprobante';
    return c.json({ message }, 400);
  } finally {
    client.release();
  }
});

paymentReceiptRoutes.patch('/:id/reject', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = reviewReceiptSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido' }, 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM payment_receipts WHERE id = $1', [c.req.param('id')]);
    if (!before.rows[0]) {
      await client.query('ROLLBACK');
      return c.json({ message: 'Comprobante no encontrado' }, 404);
    }
    if (before.rows[0].processing_status === 'APROBADO' && before.rows[0].locked_at) {
      throw new Error('El comprobante aprobado ya no puede modificarse');
    }

    const result = await client.query(
      `
        UPDATE payment_receipts
        SET processing_status = 'RECHAZADO',
            reviewed_by = $2,
            reviewed_at = now(),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [c.req.param('id'), auth.actor.sub]
    );

    if (result.rows[0].extension_id) {
      await client.query(
        `
          UPDATE reservation_extensions
          SET status = 'PENDING_PAYMENT'
          WHERE id = $1
            AND status IN ('PENDING_PAYMENT', 'PENDING_REVIEW', 'PAYMENT_UNDER_REVIEW')
        `,
        [result.rows[0].extension_id]
      );
    }

    if (result.rows[0].special_request_id) {
      await client.query(
        `
          UPDATE special_reservation_requests
          SET status = 'PENDING_PAYMENT'
          WHERE id = $1
            AND status IN ('PENDING_PAYMENT', 'PENDING_REVIEW', 'PAYMENT_UNDER_REVIEW')
        `,
        [result.rows[0].special_request_id]
      );
    }

    await insertAuditLog(client, {
      actorUserId: auth.actor.sub,
      actionType: 'PAYMENT_RECEIPT_REJECTED',
      entityType: 'payment_receipt',
      entityId: c.req.param('id'),
      oldData: before.rows[0],
      newData: { ...result.rows[0], comments: parsed.data.comments ?? null }
    });

    await client.query('COMMIT');
    return c.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'No fue posible rechazar el comprobante';
    return c.json({ message }, 400);
  } finally {
    client.release();
  }
});
