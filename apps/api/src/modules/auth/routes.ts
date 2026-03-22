import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../../db.js';
import { authMiddleware, getActorFromContext } from '../../lib/http.js';
import { signAccessToken, verifyPassword } from '../../lib/security.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const authRoutes = new Hono();

authRoutes.post('/login', async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ message: 'Credenciales invalidas' }, 400);
  }

  const result = await pool.query(
    `
      SELECT id, email, password_hash, user_type, status, first_name, last_name
      FROM users
      WHERE email = $1
    `,
    [parsed.data.email]
  );

  const user = result.rows[0];
  if (!user || user.status !== 'ACTIVE' || !verifyPassword(parsed.data.password, user.password_hash)) {
    return c.json({ message: 'Correo o contrasena incorrectos' }, 401);
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    userType: user.user_type
  });

  return c.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      userType: user.user_type
    }
  });
});

authRoutes.post('/logout', async (c) => {
  return c.json({ message: 'Logout registrado en cliente. Implementar blacklist si luego se requiere.' });
});

authRoutes.use('/me', authMiddleware);

authRoutes.get('/me', async (c) => {
  const actor = getActorFromContext(c);
  if (!actor) {
    return c.json({ message: 'No autenticado' }, 401);
  }

  const result = await pool.query(
    `
      SELECT id, email, first_name, last_name, user_type, status, created_at, updated_at
      FROM users
      WHERE id = $1
    `,
    [actor.sub]
  );

  if (!result.rows[0]) {
    return c.json({ message: 'Usuario no encontrado' }, 404);
  }

  return c.json(result.rows[0]);
});
