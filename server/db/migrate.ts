import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pool, PoolClient } from 'pg';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function withTransaction<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
	await client.query('BEGIN');
	try {
		const result = await fn();
		await client.query('COMMIT');
		return result;
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	}
}

/** Apply pending SQL files in filename order. Safe to run on every boot. */
export async function migrate(pool: Pool): Promise<void> {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			id text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)
	`);

	const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
	for (const file of files) {
		const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file]);
		if (applied.rowCount) {
			continue;
		}

		const sql = await readFile(path.join(migrationsDir, file), 'utf8');
		const client = await pool.connect();
		try {
			await withTransaction(client, async () => {
				await client.query(sql);
				await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
			});
		} finally {
			client.release();
		}
	}
}
