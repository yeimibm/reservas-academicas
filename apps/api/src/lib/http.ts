import type { Context, Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { pool } from '../db.js';
import { verifyAccessToken } from './security.js';

export type Actor = {
  sub: string;
  email: string;
  userType: string;
};

export function getBearerToken(c: Context) {
  const authorization = c.req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice(7);
}

export function setActor(c: Context, actor: Actor) {
  c.set('actor', actor as never);
}

export function getActorFromContext(c: Context) {
  const actor = c.get('actor');
  return (actor ?? null) as Actor | null;
}

export function getActor(c: Context) {
  const actorFromContext = getActorFromContext(c);
  if (actorFromContext) {
    return actorFromContext;
  }

  const token = getBearerToken(c);
  if (!token) {
    return null;
  }

  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

export function requireActor(c: Context) {
  const actor = getActor(c);
  if (!actor) {
    return { ok: false as const, response: c.json({ message: 'No autenticado' }, 401) };
  }

  return { ok: true as const, actor };
}

export function requireContextActor(c: Context) {
  const actor = getActorFromContext(c);
  if (!actor) {
    return { ok: false as const, response: c.json({ message: 'No autenticado en contexto' }, 401) };
  }

  return { ok: true as const, actor };
}

async function authenticateRequest(c: Context) {
  const token = getBearerToken(c);
  if (!token) {
    return { ok: false as const, response: c.json({ message: 'No autenticado' }, 401) };
  }

  let payload: Actor;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return { ok: false as const, response: c.json({ message: 'Token invalido o expirado' }, 401) };
  }

  const result = await pool.query(
    `
      SELECT id, email, user_type, status
      FROM users
      WHERE id = $1
    `,
    [payload.sub]
  );

  const user = result.rows[0];
  if (!user || user.status !== 'ACTIVE') {
    return { ok: false as const, response: c.json({ message: 'Usuario no autorizado o inactivo' }, 401) };
  }

  const actor = {
    sub: user.id,
    email: user.email,
    userType: user.user_type
  };

  setActor(c, actor);

  return { ok: true as const, actor };
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const auth = await authenticateRequest(c);
  if (!auth.ok) {
    return auth.response;
  }
  await next();
};

export function roleMiddleware(allowedRoles: string[]): MiddlewareHandler {
  return async (c, next) => {
    const actor = getActorFromContext(c) ?? getActor(c);
    if (!actor) {
      return c.json({ message: 'No autenticado' }, 401);
    }

    if (!allowedRoles.includes(actor.userType)) {
      return c.json({ message: 'No autorizado para esta operacion' }, 403);
    }

    await next();
  };
}

export type ModulePolicy = {
  path: string | string[];
  methods?: string[];
  roles?: string[];
};

export function applyModulePolicies(app: Hono, policies: ModulePolicy[]) {
  for (const policy of policies) {
    const paths = Array.isArray(policy.path) ? policy.path : [policy.path];

    for (const path of paths) {
      app.use(path, async (c, next) => {
        if (policy.methods && !policy.methods.includes(c.req.method.toUpperCase())) {
          return next();
        }

        const auth = await authenticateRequest(c);
        if (!auth.ok) {
          return auth.response;
        }

        if (policy.roles?.length) {
          const authorization = roleMiddleware(policy.roles);
          return authorization(c, next);
        }

        return next();
      });
    }
  }
}
