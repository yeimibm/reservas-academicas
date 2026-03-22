import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../../db.js';
import { insertAuditLog, insertOutboxEvent } from '../../lib/audit.js';
import { requireContextActor } from '../../lib/http.js';
import { withActorTransaction } from '../../lib/request-context.js';
import { hashPassword } from '../../lib/security.js';

const createUserSchema = z.object({
  firstName: z.string().min(2).max(100),
  lastName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6),
  userType: z.enum(['STUDENT', 'TEACHER', 'DIRECTION']),
  facultyId: z.string().uuid().optional(),
  studentCode: z.string().max(50).optional(),
  teacherCode: z.string().max(50).optional()
});

const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
});

export const userRoutes = new Hono();

userRoutes.post('/', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido', issues: parsed.error.flatten() }, 400);
  }

  try {
    const user = await withActorTransaction(c, async ({ actor, client }) => {
      const userResult = await client.query(
      `
        INSERT INTO users (first_name, last_name, email, password_hash, user_type)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, first_name, last_name, email, user_type, status, created_at
      `,
      [
        parsed.data.firstName,
        parsed.data.lastName,
        parsed.data.email,
        hashPassword(parsed.data.password),
        parsed.data.userType
      ]
    );

      const user = userResult.rows[0];

      if (parsed.data.userType === 'STUDENT') {
        await client.query(
          `
            INSERT INTO student_profiles (user_id, faculty_id, student_code)
            VALUES ($1, $2, $3)
          `,
          [user.id, parsed.data.facultyId, parsed.data.studentCode]
        );
      }

      if (parsed.data.userType === 'TEACHER') {
        await client.query(
          `
            INSERT INTO teacher_profiles (user_id, faculty_id, teacher_code)
            VALUES ($1, $2, $3)
          `,
          [user.id, parsed.data.facultyId ?? null, parsed.data.teacherCode]
        );
      }

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'USER_CREATED',
        entityType: 'user',
        entityId: user.id,
        newData: user
      });

      await insertOutboxEvent(client, {
        aggregateType: 'user',
        aggregateId: user.id,
        eventType: 'user.created',
        payload: user,
        idempotencyKey: `user.created:${user.id}`
      });

      return user;
    });

    return c.json(user, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible crear el usuario';
    return c.json({ message }, 400);
  }
});

userRoutes.get('/:id', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  if (auth.actor.userType !== 'DIRECTION' && auth.actor.sub !== c.req.param('id')) {
    return c.json({ message: 'No autorizado para ver este usuario' }, 403);
  }

  const result = await pool.query(
    `
      SELECT id, first_name, last_name, email, user_type, status, created_at, updated_at
      FROM users
      WHERE id = $1
    `,
    [c.req.param('id')]
  );

  if (!result.rows[0]) {
    return c.json({ message: 'Usuario no encontrado' }, 404);
  }

  return c.json(result.rows[0]);
});

userRoutes.patch('/:id/status', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json();
  const parsed = updateUserStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Payload invalido' }, 400);
  }

  try {
    const updated = await withActorTransaction(c, async ({ actor, client }) => {
      const before = await client.query('SELECT * FROM users WHERE id = $1', [c.req.param('id')]);
      if (!before.rows[0]) {
        throw new Error('Usuario no encontrado');
      }

      const updated = await client.query(
        `
          UPDATE users
          SET status = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, first_name, last_name, email, user_type, status, updated_at
        `,
        [c.req.param('id'), parsed.data.status]
      );

      await insertAuditLog(client, {
        actorUserId: actor.sub,
        actionType: 'USER_STATUS_UPDATED',
        entityType: 'user',
        entityId: c.req.param('id'),
        oldData: before.rows[0],
        newData: updated.rows[0]
      });

      return updated.rows[0];
    });

    return c.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible actualizar el usuario';
    return c.json({ message }, message === 'Usuario no encontrado' ? 404 : 400);
  }
});
