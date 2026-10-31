// @vitest-environment node

import type { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';

import { createCollaborationProvider } from '@/lib/collaborationSocket';

import { createCollabServer, type CollabServerHandle } from './collabServer';
import type { CollabLimits } from './limits';
import { MemoryDocumentStore } from './store/memoryStore';

const servers: CollabServerHandle[] = [];
const HOLD_RETRY = {
	delay: 30_000,
	initialDelay: 0,
	minDelay: 30_000,
	maxDelay: 30_000
} as const;

afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.destroy()));
});

type OpenedProvider = ReturnType<typeof createCollaborationProvider>;

function listenPort(handle: CollabServerHandle): number {
	const address = handle.server.address;
	if (!address || typeof address === 'string' || !address.port) {
		throw new Error('collab server did not bind a port');
	}
	return address.port;
}

async function startedServer(
	store: MemoryDocumentStore,
	limits?: Partial<CollabLimits>
): Promise<{ handle: CollabServerHandle; url: string }> {
	const handle = createCollabServer({
		store,
		port: 0,
		address: '127.0.0.1',
		quiet: true,
		...(limits ? { limits } : {})
	});
	servers.push(handle);
	await handle.listen();
	return { handle, url: `ws://127.0.0.1:${listenPort(handle)}` };
}

function waitFor(provider: HocuspocusProvider, event: string, timeoutMs: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
		provider.on(event, () => {
			clearTimeout(timer);
			resolve();
		});
	});
}

function closeProvider(opened: OpenedProvider): void {
	opened.provider.destroy();
	opened.socket.destroy();
}

async function openDocument(store: MemoryDocumentStore): Promise<string> {
	const documentName = crypto.randomUUID();
	await store.ensureDocument(documentName);
	return documentName;
}

describe('collaboration limits', () => {
	it('refuses a room that is not an existing UUID document', async () => {
		const store = new MemoryDocumentStore();
		const { url } = await startedServer(store);
		const missing = crypto.randomUUID();
		const cases = ['not-a-uuid', missing];

		for (const name of cases) {
			const doc = new Y.Doc();
			const opened = createCollaborationProvider({
				url,
				name,
				document: doc,
				socket: HOLD_RETRY
			});
			try {
				await waitFor(opened.provider, 'authenticationFailed', 2_000);
			} finally {
				closeProvider(opened);
				doc.destroy();
			}
		}
	});

	it('cuts off a second connection once the document is full', async () => {
		const store = new MemoryDocumentStore();
		const documentName = await openDocument(store);
		const { handle, url } = await startedServer(store, { maxConnectionsPerDocument: 1 });
		const firstDoc = new Y.Doc();
		const secondDoc = new Y.Doc();
		const first = createCollaborationProvider({ url, name: documentName, document: firstDoc });
		let second: OpenedProvider | undefined;
		try {
			await waitFor(first.provider, 'synced', 2_000);
			second = createCollaborationProvider({
				url,
				name: documentName,
				document: secondDoc,
				socket: HOLD_RETRY
			});
			await waitFor(second.provider, 'disconnect', 2_000);
			expect(await waitForConnectionCount(handle, documentName, 1, 1_000)).toBe(1);
		} finally {
			if (second) {
				closeProvider(second);
			}
			closeProvider(first);
			firstDoc.destroy();
			secondDoc.destroy();
		}
	});

	it('cuts off a second connection from the same IP', async () => {
		const store = new MemoryDocumentStore();
		const firstName = await openDocument(store);
		const secondName = await openDocument(store);
		const { handle, url } = await startedServer(store, {
			maxConnectionsPerIp: 1,
			maxConnectionsPerDocument: 5
		});
		const firstDoc = new Y.Doc();
		const secondDoc = new Y.Doc();
		const first = createCollaborationProvider({ url, name: firstName, document: firstDoc });
		let second: OpenedProvider | undefined;
		try {
			await waitFor(first.provider, 'synced', 2_000);
			second = createCollaborationProvider({
				url,
				name: secondName,
				document: secondDoc,
				socket: HOLD_RETRY
			});
			await waitFor(second.provider, 'disconnect', 2_000);
			expect(await waitForConnectionCount(handle, firstName, 1, 1_000)).toBe(1);
		} finally {
			if (second) {
				closeProvider(second);
			}
			closeProvider(first);
			firstDoc.destroy();
			secondDoc.destroy();
		}
	});

	it('cuts off a client that sends too many messages', async () => {
		const store = new MemoryDocumentStore();
		const documentName = await openDocument(store);
		const { url } = await startedServer(store, { maxMessagesPerWindow: 4, messageWindowMs: 60_000 });
		const doc = new Y.Doc();
		let cutOff = false;
		const opened = createCollaborationProvider({
			url,
			name: documentName,
			document: doc,
			socket: HOLD_RETRY,
			onDisconnect: () => {
				cutOff = true;
			}
		});
		try {
			const started = Date.now();
			while (!cutOff && Date.now() - started < 2_000) {
				doc.transact(() => {
					doc.getText('body').insert(0, 'x');
				});
				await new Promise((resolve) => setTimeout(resolve, 15));
			}
			expect(cutOff).toBe(true);
		} finally {
			closeProvider(opened);
			doc.destroy();
		}
	});

	it('cuts off a client that exceeds the document size or payload size', async () => {
		const store = new MemoryDocumentStore();
		const documentName = await openDocument(store);
		const { handle, url } = await startedServer(store, {
			maxDocumentBytes: 500,
			maxWebsocketPayloadBytes: 1024 * 1024
		});
		const doc = new Y.Doc();
		const opened = createCollaborationProvider({
			url,
			name: documentName,
			document: doc,
			socket: HOLD_RETRY
		});
		try {
			await waitFor(opened.provider, 'synced', 2_000);
			const huge = 'Z'.repeat(4_000);
			doc.getText('body').insert(0, huge);
			await waitFor(opened.provider, 'disconnect', 2_000);
			expect(handle.server.hocuspocus.documents.get(documentName)?.getText('body').toString() ?? '').not.toContain(
				huge
			);
		} finally {
			closeProvider(opened);
			doc.destroy();
		}
	});

	it('cuts off a client that exceeds the websocket payload size', async () => {
		const store = new MemoryDocumentStore();
		const documentName = await openDocument(store);
		const { handle, url } = await startedServer(store, {
			maxDocumentBytes: 5_000_000,
			maxWebsocketPayloadBytes: 800
		});
		const doc = new Y.Doc();
		const opened = createCollaborationProvider({
			url,
			name: documentName,
			document: doc,
			socket: HOLD_RETRY
		});
		try {
			await waitFor(opened.provider, 'synced', 2_000);
			const huge = 'P'.repeat(4_000);
			doc.getText('body').insert(0, huge);
			await waitFor(opened.provider, 'disconnect', 2_000);
			expect(handle.server.hocuspocus.documents.get(documentName)?.getText('body').toString() ?? '').not.toContain(
				huge
			);
		} finally {
			closeProvider(opened);
			doc.destroy();
		}
	});
});

async function waitForConnectionCount(
	handle: CollabServerHandle,
	documentName: string,
	expected: number,
	timeoutMs: number
): Promise<number> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const count = handle.server.hocuspocus.documents.get(documentName)?.getConnectionsCount() ?? 0;
		if (count === expected) {
			return count;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	return handle.server.hocuspocus.documents.get(documentName)?.getConnectionsCount() ?? 0;
}
