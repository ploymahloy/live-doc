// @vitest-environment node

import 'fake-indexeddb/auto';

import { IndexeddbPersistence, storeState } from 'y-indexeddb';
import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';

import { createCollaborationProvider } from '@/lib/collaborationSocket';
import { createCollabServer, type CollabServerHandle } from '../../../server/collabServer';
import { MemoryDocumentStore } from '../../../server/store/memoryStore';

const OFFLINE_TEXT = 'saved offline';
const servers: CollabServerHandle[] = [];

afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.destroy()));
});

async function reservePort(): Promise<number> {
	const server = createCollabServer({
		store: new MemoryDocumentStore(),
		port: 0,
		address: '127.0.0.1',
		quiet: true
	});
	await server.listen();
	const port = server.server.address.port;
	await server.destroy();
	return port;
}

describe('offline IndexedDB reconnect', () => {
	it('syncs edits made while the server is down after it returns', async () => {
		const documentName = crypto.randomUUID();
		const port = await reservePort();
		const url = `ws://127.0.0.1:${port}`;

		const local = new Y.Doc();
		const persistence = new IndexeddbPersistence(documentName, local);
		await persistence.whenSynced;
		local.getText('offline').insert(0, OFFLINE_TEXT);
		await storeState(persistence, true);
		await persistence.destroy();
		local.destroy();

		const doc = new Y.Doc();
		const restored = new IndexeddbPersistence(documentName, doc);
		await restored.whenSynced;
		expect(doc.getText('offline').toString()).toBe(OFFLINE_TEXT);

		const { provider, socket } = createCollaborationProvider({
			url,
			name: documentName,
			document: doc,
			socket: {
				delay: 20,
				initialDelay: 0,
				minDelay: 10,
				maxDelay: 40
			}
		});

		const store = new MemoryDocumentStore();
		await store.ensureDocument(documentName);
		try {
			await new Promise((resolve) => setTimeout(resolve, 80));

			const server = createCollabServer({
				store,
				port,
				address: '127.0.0.1',
				quiet: true
			});
			servers.push(server);
			await server.listen();

			const synced = await waitForServerText(server, documentName, 1_500);
			expect(synced).toBe(OFFLINE_TEXT);
		} finally {
			provider.destroy();
			socket.destroy();
			await restored.destroy();
			doc.destroy();
		}
	});
});

async function waitForServerText(server: CollabServerHandle, documentName: string, timeoutMs: number): Promise<string> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const loaded = server.server.hocuspocus.documents.get(documentName);
		const text = loaded?.getText('offline').toString() ?? '';
		if (text === OFFLINE_TEXT) {
			return text;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	return server.server.hocuspocus.documents.get(documentName)?.getText('offline').toString() ?? '';
}
