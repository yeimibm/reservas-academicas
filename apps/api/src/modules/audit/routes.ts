import { Hono } from 'hono';
import { pool } from '../../db.js';
import { requireContextActor } from '../../lib/http.js';

export const auditRoutes = new Hono();

auditRoutes.get('/audit-logs', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await pool.query(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200'
  );

  return c.json({ items: result.rows });
});

auditRoutes.get('/technical-logs', async (c) => {
  const auth = requireContextActor(c);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await pool.query(
    'SELECT * FROM technical_logs ORDER BY created_at DESC LIMIT 200'
  );

  return c.json({ items: result.rows });
});
