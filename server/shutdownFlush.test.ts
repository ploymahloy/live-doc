// @vitest-environment node

import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';

import { createCollabServer, type CollabServerHandle } from './collabServer';
import { shutdownCollab } from './shutdown';
import { MemoryDocumentStore } from './store/memoryStore';
import type { DocumentStore } from './store/types';

class GatedDocumentStore implements DocumentStore {
	readonly memory = new MemoryDocumentStore();
	readonly appendStarted: Promise<void>;
	private readonly gate: Promise<void>;
	private readonly markStarted: () => void;
	readonly release: () => void;

	constructor() {
		let markStarted = () => {};
		this.appendStarted = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		this.markStarted = markStarted;

		let release = () => {};
		this.gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.release = release;
	}

	load(documentName: string): Promise<Uint8Array | null> {
		return this.memory.load(documentName);
	}

	async appendUpdate(documentName: string, update: Uint8Array): Promise<void> {
		this.markStarted();
		await this.gate;
		await this.memory.appendUpdate(documentName, update);
	}

	pendingUpdateCount(documentName: string): Promise<number> {
		return this.memory.pendingUpdateCount(documentName);
	}

	compact(documentName: string): Promise<void> {
		return this.memory.compact(documentName);
	}

	close(): Promise<void> {
		return this.memory.close();
	}
}

const servers: CollabServerHandle[] = [];

afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.destroy()));
});

describe('shutdown flush', () => {
	it('persists an edit that is still in flight when shutdown starts', async () => {
		const store = new GatedDocumentStore();
		const documentName = crypto.randomUUID();
		const collab = createCollabServer({
			store,
			port: 0,
			address: '127.0.0.1',
			quiet: true,
			compactAfterUpdates: 1000
		});
		servers.push(collab);
		await collab.listen();

		const connection = await collab.server.hocuspocus.openDirectConnection(documentName);
		await connection.transact((document) => {
			const text = new Y.XmlText();
			text.insert(0, 'flushed on shutdown');
			document.getXmlFragment('default').insert(0, [text]);
		});
		await store.appendStarted;
		await connection.disconnect();

		let settled = false;
		const done = shutdownCollab({ collab, exit: false, timeoutMs: 5_000 }).then(() => {
			settled = true;
		});

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(settled).toBe(false);

		store.release();
		await done;
		expect(settled).toBe(true);

		const loaded = await store.load(documentName);
		expect(loaded).not.toBeNull();
		const doc = new Y.Doc();
		try {
			Y.applyUpdate(doc, loaded!);
			expect(doc.getXmlFragment('default').toString()).toContain('flushed on shutdown');
		} finally {
			doc.destroy();
		}
	});
});
