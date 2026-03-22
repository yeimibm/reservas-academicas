import { createChannel } from '../mq.js';
import { pool } from '../db.js';
import { extractReceiptDataFromImage } from '../modules/anthropic/client.js';
import { readStoredUpload } from '../lib/upload-storage.js';

async function logTechnical(level: 'INFO' | 'ERROR', source: string, message: string, context: Record<string, unknown> = {}) {
  await pool.query(
    `
      INSERT INTO technical_logs (level, source, message, context_json)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [level, source, message, JSON.stringify(context)]
  );
}

async function publishPendingEvents() {
  const client = await pool.connect();
  const channel = await createChannel();

  try {
    await channel.assertExchange('academic.events', 'topic', { durable: true });
    await client.query('BEGIN');

    const result = await client.query(
      `
        SELECT id, event_type, payload_json
        FROM outbox_events
        WHERE status = 'PENDING'
        ORDER BY created_at
        LIMIT 20
        FOR UPDATE SKIP LOCKED
      `
    );

    for (const row of result.rows) {
      channel.publish(
        'academic.events',
        row.event_type,
        Buffer.from(JSON.stringify(row.payload_json)),
        { persistent: true, messageId: row.id }
      );

      await client.query(
        `
          UPDATE outbox_events
          SET status = 'PUBLISHED',
              published_at = now()
          WHERE id = $1
        `,
        [row.id]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Error desconocido';
    await logTechnical('ERROR', 'outbox-worker', message);
  } finally {
    client.release();
    await channel.close();
  }
}

function extractTextContent(response: Awaited<ReturnType<typeof extractReceiptDataFromImage>>) {
  return response.content
    .map((item) => ('text' in item ? item.text : ''))
    .filter(Boolean)
    .join('\n');
}

function parseAiJson(text: string) {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  const raw = firstBrace >= 0 && lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1) : text;
  return JSON.parse(raw) as {
    payer_name?: string;
    receiver_name?: string;
    bank_name?: string;
    payment_date?: string;
    payment_time?: string;
    amount?: string | number;
    deposit_number?: string;
    summary?: string;
    confidence?: string | number;
  };
}

function normalizeNumericValue(value: string | number | null | undefined) {
  if (value == null) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const cleaned = raw
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '')
    .trim();

  return cleaned || null;
}

function normalizeDateValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const isoMatch = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const slashMatch = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const dashMatch = raw.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dashMatch) {
    const [, day, month, year] = dashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

async function processReceiptUploaded(messageBuffer: Buffer) {
  const payload = JSON.parse(messageBuffer.toString()) as {
    id: string;
    file_url: string;
    file_type: 'png' | 'jpg' | 'jpeg' | 'pdf';
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const receiptResult = await client.query('SELECT * FROM payment_receipts WHERE id = $1 FOR UPDATE', [payload.id]);
    const receipt = receiptResult.rows[0];
    if (!receipt) {
      await client.query('ROLLBACK');
      return;
    }

    if (payload.file_type === 'pdf') {
      await client.query(
        `
        UPDATE payment_receipts
        SET processing_status = 'POR_REVISAR',
            ai_extracted_json = jsonb_build_object(
              'summary', 'PDF recibido. Conversion de primera pagina a imagen pendiente en esta iteracion.',
              'status', 'manual_review_required'
              ),
            reviewed_by = null,
            reviewed_at = null,
            locked_at = null,
              updated_at = now()
          WHERE id = $1
        `,
        [payload.id]
      );

      await client.query('COMMIT');
      await logTechnical('INFO', 'receipt-processor', 'Comprobante PDF enviado a revision manual', {
        receiptId: payload.id
      });
      return;
    }

    if (!payload.file_url.startsWith('/uploads/')) {
      await client.query(
        `
        UPDATE payment_receipts
        SET processing_status = 'POR_REVISAR',
            ai_extracted_json = jsonb_build_object(
              'summary', 'Comprobante registrado por URL externa. Revision manual requerida.'
              ),
            reviewed_by = null,
            reviewed_at = null,
            locked_at = null,
              updated_at = now()
          WHERE id = $1
        `,
        [payload.id]
      );
      await client.query('COMMIT');
      return;
    }

    const relativePath = payload.file_url.replace('/uploads/', '');
    const buffer = await readStoredUpload(relativePath);
    const mediaType = payload.file_type === 'png' ? 'image/png' : 'image/jpeg';
    const response = await extractReceiptDataFromImage({
      mediaType,
      base64Data: buffer.toString('base64')
    });
    const text = extractTextContent(response);
    const extracted = parseAiJson(text);
    const normalizedConfidence = normalizeNumericValue(extracted.confidence);
    const normalizedAmount = normalizeNumericValue(extracted.amount);
    const normalizedPaymentDate = normalizeDateValue(extracted.payment_date);

    await client.query(
      `
        UPDATE payment_receipts
        SET processing_status = 'POR_REVISAR',
            ai_extracted_json = $2::jsonb,
            ai_confidence = $3,
            payer_name = COALESCE($4, payer_name),
            receiver_name = COALESCE($5, receiver_name),
            bank_name = COALESCE($6, bank_name),
            payment_date = COALESCE(NULLIF($7, '')::date, payment_date),
            amount = COALESCE(NULLIF($8, '')::numeric, amount),
            reviewed_by = null,
            reviewed_at = null,
            locked_at = null,
            updated_at = now()
        WHERE id = $1
      `,
      [
        payload.id,
        JSON.stringify(extracted),
        normalizedConfidence ? Number(normalizedConfidence) : null,
        extracted.payer_name ?? null,
        extracted.receiver_name ?? null,
        extracted.bank_name ?? null,
        normalizedPaymentDate ?? '',
        normalizedAmount ?? ''
      ]
    );

    await client.query('COMMIT');
    await logTechnical('INFO', 'receipt-processor', 'Comprobante procesado por IA', {
      receiptId: payload.id
    });
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Error procesando comprobante';
    await pool.query(
      `
        UPDATE payment_receipts
        SET processing_status = 'ERROR_PROCESAMIENTO',
            updated_at = now()
        WHERE id = $1
      `,
      [payload.id]
    );
    await logTechnical('ERROR', 'receipt-processor', message, {
      receiptId: payload.id
    });
  } finally {
    client.release();
  }
}

async function startReceiptConsumer() {
  const channel = await createChannel();
  await channel.assertExchange('academic.events', 'topic', { durable: true });
  await channel.assertQueue('academic.payment-receipts', { durable: true });
  await channel.bindQueue('academic.payment-receipts', 'academic.events', 'payment_receipt.uploaded');
  await channel.consume('academic.payment-receipts', async (message: { content: Buffer } | null) => {
    if (!message) {
      return;
    }

    try {
      await processReceiptUploaded(message.content);
      channel.ack(message);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido en consumidor';
      await logTechnical('ERROR', 'receipt-consumer', errorMessage);
      channel.nack(message, false, false);
    }
  });
}

async function main() {
  console.log('Outbox worker iniciado');

  await startReceiptConsumer();

  setInterval(() => {
    publishPendingEvents().catch((error) => {
      console.error('Error publicando eventos', error);
    });
  }, 5000);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
