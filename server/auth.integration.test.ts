// @vitest-environment node

import type { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { afterEach, describe, expect, it } from 'vitest';

import { createCollaborationProvider } from '@/lib/collaborationSocket';

import { signCapabilityToken } from './auth/capabilityToken';
import { createCollabServer, type CollabServerHandle } from './collabServer';
import { MemoryDocumentStore } from './store/memoryStore';

const SECRET = 'test-collab-jwt-secret-32chars-min';
const servers: CollabServerHandle[] = [];

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

async function startedServer(store: MemoryDocumentStore): Promise<{ handle: CollabServerHandle; url: string }> {
	const handle = createCollabServer({
		store,
		port: 0,
		address: '127.0.0.1',
		quiet: true,
		auth: { secret: SECRET }
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

function serverBody(handle: CollabServerHandle, documentName: string): string {
	return handle.server.hocuspocus.documents.get(documentName)?.getText('body').toString() ?? '';
}

async function waitForBody(
	handle: CollabServerHandle,
	documentName: string,
	expected: string,
	timeoutMs: number
): Promise<string> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const text = serverBody(handle, documentName);
		if (text === expected) {
			return text;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	return serverBody(handle, documentName);
}

describe('collaboration auth', () => {
	it('refuses a connection with no token', async () => {
		const store = new MemoryDocumentStore();
		const documentName = crypto.randomUUID();
		await store.ensureDocument(documentName);
		const { url } = await startedServer(store);
		const doc = new Y.Doc();
		const opened = createCollaborationProvider({ url, name: documentName, document: doc });
		try {
			await waitFor(opened.provider, 'authenticationFailed', 2_000);
		} finally {
			closeProvider(opened);
			doc.destroy();
		}
	});

	it('refuses a token for a different document', async () => {
		const store = new MemoryDocumentStore();
		const documentName = crypto.randomUUID();
		const otherName = crypto.randomUUID();
		await store.ensureDocument(documentName);
		await store.ensureDocument(otherName);
		const { url } = await startedServer(store);
		const token = await signCapabilityToken(SECRET, { documentId: otherName, role: 'editor' }, 60);
		const doc = new Y.Doc();
		const opened = createCollaborationProvider({ url, name: documentName, document: doc, token });
		try {
			await waitFor(opened.provider, 'authenticationFailed', 2_000);
		} finally {
			closeProvider(opened);
			doc.destroy();
		}
	});

	it('lets an owner edit and ignores a viewer edit', async () => {
		const store = new MemoryDocumentStore();
		const documentName = crypto.randomUUID();
		await store.ensureDocument(documentName);
		const { handle, url } = await startedServer(store);
		const ownerToken = await signCapabilityToken(SECRET, { documentId: documentName, role: 'owner' }, 60);
		const viewerToken = await signCapabilityToken(SECRET, { documentId: documentName, role: 'viewer' }, 60);

		const ownerDoc = new Y.Doc();
		const viewerDoc = new Y.Doc();
		const owner = createCollaborationProvider({
			url,
			name: documentName,
			document: ownerDoc,
			token: ownerToken
		});
		let viewer: OpenedProvider | undefined;
		try {
			await waitFor(owner.provider, 'synced', 2_000);
			ownerDoc.getText('body').insert(0, 'hello');
			expect(await waitForBody(handle, documentName, 'hello', 2_000)).toBe('hello');

			viewer = createCollaborationProvider({
				url,
				name: documentName,
				document: viewerDoc,
				token: viewerToken
			});
			await waitFor(viewer.provider, 'synced', 2_000);
			const connections = handle.server.hocuspocus.documents.get(documentName)?.getConnections() ?? [];
			expect(connections.find((connection) => connection.context.role === 'viewer')?.readOnly).toBe(true);

			viewerDoc.getText('body').insert(0, 'HACK');
			const started = Date.now();
			while (Date.now() - started < 400) {
				expect(serverBody(handle, documentName)).not.toContain('HACK');
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
			expect(serverBody(handle, documentName)).toBe('hello');
		} finally {
			if (viewer) {
				closeProvider(viewer);
			}
			closeProvider(owner);
			ownerDoc.destroy();
			viewerDoc.destroy();
		}
	});
});

function closeProvider(opened: OpenedProvider): void {
	opened.provider.destroy();
	opened.socket.destroy();
}
