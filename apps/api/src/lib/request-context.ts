import type { Context } from 'hono';
import { withTransaction, type PoolClient } from '../db.js';
import { getActorFromContext, type Actor } from './http.js';

export function getRequiredContextActor(c: Context): Actor {
  const actor = getActorFromContext(c);
  if (!actor) {
    throw new Error('No autenticado en contexto');
  }

  return actor;
}

export async function withActorTransaction<T>(
  c: Context,
  handler: (input: { actor: Actor; client: PoolClient }) => Promise<T>
) {
  const actor = getRequiredContextActor(c);
  return withTransaction((client) => handler({ actor, client }));
}
