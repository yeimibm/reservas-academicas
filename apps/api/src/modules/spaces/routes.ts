import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../../db.js';
import { insertAuditLog } from '../../lib/audit.js';
import { generateSpaceCode } from '../../lib/code-generator.js';
import { requireContextActor } from '../../lib/http.js';
import { buildDateTime, getSystemConfig, validateWithinSchedule } from '../../lib/reservation-rules.js';

const spaceSchema = z.object({
  name: z.string().min(2).max(150),
  building: z.string().min(1).max(100),
  floor: z.string().min(1).max(20),
  capacity: z.coerce.number().int().positive(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']).default('ACTIVE')
});

const spaceUpdateSchema = z.object({
  name: z.string().min(2).max(150)
});

export const spaceRoutes = new Hono();

spaceRoutes.get('/', async (c) => {
  const result = await pool.query(
    'SELECT id, name, code, building, floor, capacity, status FROM spaces ORDER BY building, code'
  );

  return c.json({ items: result.rows });
});

spaceRoutes.get('/available', async (c) => {
  const date = c.req.query('date');
  const startTime = c.req.query('startTime');
  const endTime = c.req.query('endTime');

  if (!date || !startTime || !endTime) {
    return c.json({ message: 'date, startTime y endTime son obligatorios' }, 400);
  }

  const client = await pool.connect();
  try {
    const config = await getSystemConfig(client);
    const startAt = buildDateTime(date, startTime);
    const endAt = buildDateTime(date, endTime);
    validateWithinSchedule(startAt, endAt, config);

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
      [startAt.toISOString(), endAt.toISOString()]
    );

    return c.json({
      date,
      startTime,
      endTime,
      items: result.rows
    });
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : 'Horario invalido' }, 400);
  } finally {
    client.release();
  }
});

spaceRoutes.get('/:id', async (c) => {
  const result = await pool.query(
    'SELECT id, name, code, building, floor, capacity, status, created_at, updated_at FROM spaces WHERE id = $1',
    [c.req.param('id')]
  );

  if (!result.rows[0]) {
    return c.json({ message: 'Espacio no encontrado' }, 404);
  }

  return c.json(result.rows[0]);
});

spaceRoutes.post('/', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = spaceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido', issues: parsed.error.flatten() }, 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const generatedCode = await generateSpaceCode(client);
    const result = await client.query(
      `
        INSERT INTO spaces (name, code, building, floor, capacity, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        parsed.data.name,
        generatedCode,
        parsed.data.building,
        parsed.data.floor,
        parsed.data.capacity,
        parsed.data.status
      ]
    );

    await insertAuditLog(client, {
      actorUserId: auth.actor.sub,
      actionType: 'SPACE_CREATED',
      entityType: 'space',
      entityId: result.rows[0].id,
      newData: result.rows[0]
    });

    await client.query('COMMIT');
    return c.json(result.rows[0], 201);
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'No fue posible crear el espacio';
    return c.json({ message }, 400);
  } finally {
    client.release();
  }
});

spaceRoutes.patch('/:id', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = spaceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido', issues: parsed.error.flatten() }, 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM spaces WHERE id = $1', [c.req.param('id')]);
    if (!before.rows[0]) {
      await client.query('ROLLBACK');
      return c.json({ message: 'Espacio no encontrado' }, 404);
    }

    const result = await client.query(
      `
        UPDATE spaces
        SET name = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [c.req.param('id'), parsed.data.name]
    );

    await insertAuditLog(client, {
      actorUserId: auth.actor.sub,
      actionType: 'SPACE_UPDATED',
      entityType: 'space',
      entityId: c.req.param('id'),
      oldData: before.rows[0],
      newData: result.rows[0]
    });

    await client.query('COMMIT');
    return c.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'No fue posible actualizar el espacio';
    return c.json({ message }, 400);
  } finally {
    client.release();
  }
});
