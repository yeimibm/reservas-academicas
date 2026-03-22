import type { PoolClient } from '../db.js';

function padSequence(value: number) {
  return String(value).padStart(3, '0');
}

export function buildFacultyPrefix(name: string) {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();

  const base = normalized.slice(0, 3);
  return (base || 'FAC').padEnd(3, 'X');
}

async function lockCodeNamespace(client: PoolClient, namespace: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [namespace]);
}

export async function generateSpaceCode(client: PoolClient) {
  await lockCodeNamespace(client, 'spaces:salon-code');

  const result = await client.query<{
    next_value: number;
  }>(
    `
      SELECT COALESCE(MAX((regexp_match(code, '^salon-([0-9]+)$'))[1]::int), 0) + 1 AS next_value
      FROM spaces
      WHERE code ~ '^salon-[0-9]+$'
    `
  );

  return `salon-${padSequence(result.rows[0]?.next_value ?? 1)}`;
}

export async function generateFacultyCode(client: PoolClient, name: string) {
  const prefix = buildFacultyPrefix(name);
  await lockCodeNamespace(client, `faculties:${prefix}`);

  const result = await client.query<{
    next_value: number;
  }>(
    `
      SELECT COALESCE(MAX((regexp_match(code, '^' || $1 || '-([0-9]+)$'))[1]::int), 0) + 1 AS next_value
      FROM faculties
      WHERE code ~ ('^' || $1 || '-[0-9]+$')
    `,
    [prefix]
  );

  return `${prefix}-${padSequence(result.rows[0]?.next_value ?? 1)}`;
}
