import type { PoolClient } from '../db.js';

export async function ensureApprovedReceiptForExtension(client: PoolClient, extensionId: string, amountToPay: number) {
  if (Number(amountToPay) <= 0) {
    return;
  }

  const result = await client.query(
    `
      SELECT id
      FROM payment_receipts
      WHERE extension_id = $1
        AND processing_status = 'APROBADO'
      ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `,
    [extensionId]
  );

  if (!result.rows[0]) {
    throw new Error('La extension requiere un comprobante aprobado antes de poder aprobarse');
  }
}

export async function ensureApprovedReceiptForSpecialRequest(
  client: PoolClient,
  specialRequestId: string,
  amountToPay: number
) {
  if (Number(amountToPay) <= 0) {
    return;
  }

  const result = await client.query(
    `
      SELECT id
      FROM payment_receipts
      WHERE special_request_id = $1
        AND processing_status = 'APROBADO'
      ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `,
    [specialRequestId]
  );

  if (!result.rows[0]) {
    throw new Error('La solicitud especial requiere un comprobante aprobado antes de poder aprobarse');
  }
}
