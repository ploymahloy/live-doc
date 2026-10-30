import type { Pool, PoolClient } from 'pg';

import { mergeSnapshotAndUpdates } from './mergeState';
import type { DocumentStore } from './types';

type SnapshotRow = {
	state: Buffer;
	up_to_update_id: string | number;
};

type UpdateRow = {
	id: string | number;
	update: Buffer;
};

type IdRow = {
	id: string | number;
};

function readId(value: string | number): number {
	const id = typeof value === 'number' ? value : Number(value);
	if (!Number.isSafeInteger(id)) {
		throw new Error(`Unexpected document row id: ${String(value)}`);
	}
	return id;
}

function toBytes(value: Buffer): Uint8Array {
	return new Uint8Array(value);
}

async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await fn(client);
		await client.query('COMMIT');
		return result;
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

export class PostgresDocumentStore implements DocumentStore {
	constructor(private readonly pool: Pool) {}

	async load(documentName: string): Promise<Uint8Array | null> {
		return withTransaction(this.pool, async (client) => {
			const locked = await client.query('SELECT id FROM documents WHERE id = $1 FOR SHARE', [documentName]);
			if (!locked.rowCount) {
				return null;
			}

			const snapshotResult = await client.query<SnapshotRow>(
				`SELECT state, up_to_update_id
				 FROM document_snapshots
				 WHERE document_id = $1
				 ORDER BY id DESC
				 LIMIT 1`,
				[documentName]
			);
			const snapshot = snapshotResult.rows[0];
			const upTo = snapshot ? readId(snapshot.up_to_update_id) : 0;
			const updatesResult = await client.query<UpdateRow>(
				`SELECT id, update
				 FROM document_updates
				 WHERE document_id = $1 AND id > $2
				 ORDER BY id ASC`,
				[documentName, upTo]
			);
			if (!snapshot && updatesResult.rows.length === 0) {
				return null;
			}

			return mergeSnapshotAndUpdates(
				snapshot ? toBytes(snapshot.state) : null,
				updatesResult.rows.map((row) => toBytes(row.update))
			);
		});
	}

	async appendUpdate(documentName: string, update: Uint8Array): Promise<void> {
		if (update.byteLength === 0) {
			return;
		}

		await withTransaction(this.pool, async (client) => {
			await client.query(
				`INSERT INTO documents (id) VALUES ($1)
				 ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
				[documentName]
			);
			await client.query('INSERT INTO document_updates (document_id, update) VALUES ($1, $2)', [
				documentName,
				Buffer.from(update)
			]);
		});
	}

	async pendingUpdateCount(documentName: string): Promise<number> {
		const result = await this.pool.query<{ count: string }>(
			`SELECT COUNT(*)::int AS count
			 FROM document_updates
			 WHERE document_id = $1
			   AND id > COALESCE(
			     (SELECT up_to_update_id
			      FROM document_snapshots
			      WHERE document_id = $1
			      ORDER BY id DESC
			      LIMIT 1),
			     0
			   )`,
			[documentName]
		);
		return Number(result.rows[0]?.count ?? 0);
	}

	async compact(documentName: string): Promise<void> {
		await withTransaction(this.pool, async (client) => {
			const locked = await client.query('SELECT id FROM documents WHERE id = $1 FOR UPDATE', [documentName]);
			if (!locked.rowCount) {
				return;
			}

			const snapshotResult = await client.query<SnapshotRow>(
				`SELECT state, up_to_update_id
				 FROM document_snapshots
				 WHERE document_id = $1
				 ORDER BY id DESC
				 LIMIT 1`,
				[documentName]
			);
			const snapshot = snapshotResult.rows[0];
			const upTo = snapshot ? readId(snapshot.up_to_update_id) : 0;
			const updatesResult = await client.query<UpdateRow>(
				`SELECT id, update
				 FROM document_updates
				 WHERE document_id = $1 AND id > $2
				 ORDER BY id ASC`,
				[documentName, upTo]
			);
			if (updatesResult.rows.length === 0) {
				return;
			}

			const merged = mergeSnapshotAndUpdates(
				snapshot ? toBytes(snapshot.state) : null,
				updatesResult.rows.map((row) => toBytes(row.update))
			);
			const newUpTo = readId(updatesResult.rows[updatesResult.rows.length - 1]!.id);
			const inserted = await client.query<IdRow>(
				`INSERT INTO document_snapshots (document_id, state, up_to_update_id)
				 VALUES ($1, $2, $3)
				 RETURNING id`,
				[documentName, Buffer.from(merged), newUpTo]
			);
			const snapshotId = readId(inserted.rows[0]!.id);

			await client.query('DELETE FROM document_updates WHERE document_id = $1 AND id <= $2', [
				documentName,
				newUpTo
			]);
			await client.query('DELETE FROM document_snapshots WHERE document_id = $1 AND id <> $2', [
				documentName,
				snapshotId
			]);
		});
	}

	async close(): Promise<void> {
		await this.pool.end();
	}
}
