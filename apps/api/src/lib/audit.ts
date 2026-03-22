import type { PoolClient } from 'pg';

export async function insertAuditLog(
  client: PoolClient,
  input: {
    actorUserId?: string | null;
    actionType: string;
    entityType: string;
    entityId: string;
    oldData?: unknown;
    newData?: unknown;
  }
) {
  await client.query(
    `
      INSERT INTO audit_logs (
        actor_user_id, action_type, entity_type, entity_id, old_data_json, new_data_json
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
    `,
    [
      input.actorUserId ?? null,
      input.actionType,
      input.entityType,
      input.entityId,
      input.oldData ? JSON.stringify(input.oldData) : null,
      input.newData ? JSON.stringify(input.newData) : null
    ]
  );
}

export async function insertOutboxEvent(
  client: PoolClient,
  input: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: unknown;
    idempotencyKey: string;
  }
) {
  await client.query(
    `
      INSERT INTO outbox_events (
        aggregate_type, aggregate_id, event_type, payload_json, idempotency_key
      )
      VALUES ($1, $2, $3, $4::jsonb, $5)
    `,
    [
      input.aggregateType,
      input.aggregateId,
      input.eventType,
      JSON.stringify(input.payload),
      input.idempotencyKey
    ]
  );
}
