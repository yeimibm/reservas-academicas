import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;
export type PoolClient = pg.PoolClient;

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export async function withTransaction<T>(handler: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
