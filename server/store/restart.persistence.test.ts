// @vitest-environment node

import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';

import { createCollabServer, type CollabServerHandle } from '../collabServer';
import { MemoryDocumentStore } from './memoryStore';
import { yjsStatesEqual } from './yjsEqual';

const servers: CollabServerHandle[] = [];

afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.destroy()));
});

async function waitForLoad(store: MemoryDocumentStore, documentName: string, timeoutMs: number): Promise<Uint8Array> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const state = await store.load(documentName);
		if (state && state.byteLength > 0) {
			return state;
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`document "${documentName}" was not persisted within ${timeoutMs}ms`);
}

describe('collaboration persistence restart', () => {
	it('keeps an acknowledged edit after the server is destroyed', async () => {
		const store = new MemoryDocumentStore();
		const documentName = crypto.randomUUID();
		const first = createCollabServer({
			store,
			port: 0,
			address: '127.0.0.1',
			quiet: true,
			compactAfterUpdates: 1000
		});
		servers.push(first);
		await first.listen();

		const connection = await first.server.hocuspocus.openDirectConnection(documentName);
		const started = Date.now();
		await connection.transact((document) => {
			const text = new Y.XmlText();
			text.insert(0, 'persisted before restart');
			document.getXmlFragment('default').insert(0, [text]);
		});

		await waitForLoad(store, documentName, 500);
		expect(Date.now() - started).toBeLessThan(500);

		const expected = Y.encodeStateAsUpdate(connection.document!);
		await connection.disconnect();
		await first.destroy();

		const second = createCollabServer({
			store,
			port: 0,
			address: '127.0.0.1',
			quiet: true
		});
		servers.push(second);
		await second.listen();
		const reloaded = await second.server.hocuspocus.openDirectConnection(documentName);
		try {
			const loaded = Y.encodeStateAsUpdate(reloaded.document!);
			expect(yjsStatesEqual(loaded, expected)).toBe(true);
			expect(reloaded.document!.getXmlFragment('default').toString()).toContain('persisted before restart');
		} finally {
			await reloaded.disconnect();
		}
	});
});
