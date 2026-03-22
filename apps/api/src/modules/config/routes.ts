import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../../db.js';
import { insertAuditLog } from '../../lib/audit.js';
import { requireContextActor } from '../../lib/http.js';

const updateConfigSchema = z.object({
  items: z.array(
    z.object({
      key: z.string().min(1),
      value: z.any(),
      description: z.string().optional()
    })
  )
});

export const configRoutes = new Hono();

configRoutes.get('/', async (c) => {
  const result = await pool.query(
    'SELECT config_key, config_value, description, updated_at FROM config ORDER BY config_key'
  );

  return c.json({
    items: result.rows
  });
});

configRoutes.patch('/', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = updateConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido', issues: parsed.error.flatten() }, 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of parsed.data.items) {
      await client.query(
        `
          INSERT INTO config (config_key, config_value, description, updated_by, updated_at)
          VALUES ($1, $2::jsonb, $3, $4, now())
          ON CONFLICT (config_key)
          DO UPDATE SET
            config_value = EXCLUDED.config_value,
            description = COALESCE(EXCLUDED.description, config.description),
            updated_by = EXCLUDED.updated_by,
            updated_at = now()
        `,
        [item.key, JSON.stringify(item.value), item.description ?? null, auth.actor.sub]
      );
    }

    await insertAuditLog(client, {
      actorUserId: auth.actor.sub,
      actionType: 'CONFIG_UPDATED',
      entityType: 'config',
      entityId: auth.actor.sub,
      newData: parsed.data.items
    });

    await client.query('COMMIT');

    const result = await pool.query(
      'SELECT config_key, config_value, description, updated_at FROM config ORDER BY config_key'
    );

    return c.json({ items: result.rows });
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'No fue posible actualizar la configuracion';
    return c.json({ message }, 400);
  } finally {
    client.release();
  }
});
