import { Hono } from 'hono';
import { pool } from '../../db.js';

export const healthRoutes = new Hono();

healthRoutes.get('/', async (c) => {
  const db = await pool.query('SELECT now() AS now');

  return c.json({
    ok: true,
    service: 'academic-api',
    dbTime: db.rows[0]?.now ?? null
  });
});
