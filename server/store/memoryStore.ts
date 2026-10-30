import { mergeSnapshotAndUpdates } from './mergeState';
import type { DocumentStore } from './types';

type SnapshotRow = {
	state: Uint8Array;
	upToUpdateId: number;
};

type UpdateRow = {
	id: number;
	update: Uint8Array;
};

type DocumentLog = {
	snapshot: SnapshotRow | null;
	updates: UpdateRow[];
	nextId: number;
};

function copyBytes(update: Uint8Array): Uint8Array {
	const copy = new Uint8Array(update.byteLength);
	copy.set(update);
	return copy;
}

/**
 * In-memory store for tests. Compact computes the next snapshot before
 * swapping it in, so a throw leaves the previous log intact.
 */
export class MemoryDocumentStore implements DocumentStore {
	/** Replaced in tests to force compact to fail before the swap. */
	mergeState: (snapshot: Uint8Array | null, updates: readonly Uint8Array[]) => Uint8Array =
		mergeSnapshotAndUpdates;

	private readonly documents = new Map<string, DocumentLog>();
	private readonly tails = new Map<string, Promise<unknown>>();

	async load(documentName: string): Promise<Uint8Array | null> {
		return this.exclusive(documentName, () => this.read(documentName));
	}

	async appendUpdate(documentName: string, update: Uint8Array): Promise<void> {
		if (update.byteLength === 0) {
			return;
		}
		const bytes = copyBytes(update);
		await this.exclusive(documentName, () => {
			const log = this.logFor(documentName);
			log.updates.push({ id: log.nextId, update: bytes });
			log.nextId += 1;
		});
	}

	async pendingUpdateCount(documentName: string): Promise<number> {
		return this.exclusive(documentName, () => this.documents.get(documentName)?.updates.length ?? 0);
	}

	async compact(documentName: string): Promise<void> {
		await this.exclusive(documentName, () => {
			const log = this.documents.get(documentName);
			if (!log || log.updates.length === 0) {
				return;
			}

			const state = this.mergeState(
				log.snapshot?.state ?? null,
				log.updates.map((row) => row.update)
			);
			const upToUpdateId = log.updates[log.updates.length - 1]!.id;
			log.snapshot = { state, upToUpdateId };
			log.updates = [];
		});
	}

	async close(): Promise<void> {
		this.tails.clear();
	}

	private read(documentName: string): Uint8Array | null {
		const log = this.documents.get(documentName);
		if (!log || (!log.snapshot && log.updates.length === 0)) {
			return null;
		}
		return mergeSnapshotAndUpdates(
			log.snapshot?.state ?? null,
			log.updates.map((row) => row.update)
		);
	}

	private logFor(documentName: string): DocumentLog {
		let log = this.documents.get(documentName);
		if (!log) {
			log = { snapshot: null, updates: [], nextId: 1 };
			this.documents.set(documentName, log);
		}
		return log;
	}

	private async exclusive<T>(documentName: string, fn: () => Promise<T> | T): Promise<T> {
		const previous = this.tails.get(documentName) ?? Promise.resolve();
		const run = previous.catch(() => undefined).then(() => fn());
		this.tails.set(documentName, run);
		try {
			return await run;
		} finally {
			if (this.tails.get(documentName) === run) {
				this.tails.delete(documentName);
			}
		}
	}
}
