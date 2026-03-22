import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../../db.js';
import { insertAuditLog } from '../../lib/audit.js';
import { generateFacultyCode } from '../../lib/code-generator.js';
import { requireContextActor } from '../../lib/http.js';

const facultySchema = z.object({
  name: z.string().min(2).max(150),
  status: z.string().default('ACTIVE')
});

const facultyUpdateSchema = z.object({
  name: z.string().min(2).max(150)
});

export const facultyRoutes = new Hono();

facultyRoutes.get('/', async (c) => {
  const result = await pool.query('SELECT * FROM faculties ORDER BY name');
  return c.json({ items: result.rows });
});

facultyRoutes.post('/', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = facultySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido' }, 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const generatedCode = await generateFacultyCode(client, parsed.data.name);
    const result = await client.query(
      `
        INSERT INTO faculties (name, code, status)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [parsed.data.name, generatedCode, parsed.data.status]
    );

    await insertAuditLog(client, {
      actorUserId: auth.actor.sub,
      actionType: 'FACULTY_CREATED',
      entityType: 'faculty',
      entityId: result.rows[0].id,
      newData: result.rows[0]
    });

    await client.query('COMMIT');
    return c.json(result.rows[0], 201);
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'No fue posible crear la facultad';
    return c.json({ message }, 400);
  } finally {
    client.release();
  }
});

facultyRoutes.patch('/:id', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = facultyUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido' }, 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM faculties WHERE id = $1', [c.req.param('id')]);
    if (!before.rows[0]) {
      await client.query('ROLLBACK');
      return c.json({ message: 'Facultad no encontrada' }, 404);
    }

    const result = await client.query(
      `
        UPDATE faculties
        SET name = $2
        WHERE id = $1
        RETURNING *
      `,
      [c.req.param('id'), parsed.data.name]
    );

    await insertAuditLog(client, {
      actorUserId: auth.actor.sub,
      actionType: 'FACULTY_UPDATED',
      entityType: 'faculty',
      entityId: c.req.param('id'),
      oldData: before.rows[0],
      newData: result.rows[0]
    });

    await client.query('COMMIT');
    return c.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'No fue posible actualizar la facultad';
    return c.json({ message }, 400);
  } finally {
    client.release();
  }
});
