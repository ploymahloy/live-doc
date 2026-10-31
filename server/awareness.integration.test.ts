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

describe('awareness relay', () => {
	it('does not relay invalid user or cursor fields', async () => {
		const store = new MemoryDocumentStore();
		const documentName = crypto.randomUUID();
		await store.ensureDocument(documentName);
		const handle = createCollabServer({
			store,
			port: 0,
			address: '127.0.0.1',
			quiet: true,
			auth: { secret: SECRET }
		});
		servers.push(handle);
		await handle.listen();
		const url = `ws://127.0.0.1:${listenPort(handle)}`;
		const token = await signCapabilityToken(SECRET, { documentId: documentName, role: 'editor' }, 60);

		const senderDoc = new Y.Doc();
		const peerDoc = new Y.Doc();
		const sender = createCollaborationProvider({ url, name: documentName, document: senderDoc, token });
		const peer = createCollaborationProvider({ url, name: documentName, document: peerDoc, token });
		try {
			await waitFor(sender.provider, 'synced', 2_000);
			await waitFor(peer.provider, 'synced', 2_000);

			sender.provider.setAwarenessField('cursor', { anchor: 'nope' });
			sender.provider.setAwarenessField('user', {
				name: 'n'.repeat(200),
				color: '#abcdef',
				bio: 'secret'
			});

			const relayed = await waitForBoundedUser(peer.provider, 2_000);
			expect(relayed.user).toEqual({ name: 'n'.repeat(80), color: '#abcdef' });
			expect(relayed.cursor).toBeUndefined();
			expect(JSON.stringify(relayed)).not.toContain('secret');
		} finally {
			closeProvider(sender);
			closeProvider(peer);
			senderDoc.destroy();
			peerDoc.destroy();
		}
	});
});

async function waitForBoundedUser(provider: HocuspocusProvider, timeoutMs: number): Promise<Record<string, unknown>> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		for (const state of provider.awareness?.getStates().values() ?? []) {
			const name = state.user?.name;
			if (typeof name === 'string' && name.length === 80 && name === 'n'.repeat(80)) {
				return state as Record<string, unknown>;
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error('peer received the unsanitized awareness state or no awareness at all');
}
