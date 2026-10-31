// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { verifyCapabilityToken } from './auth/capabilityToken';
import { createDocumentAccess, shareDocumentAccess } from './documents';
import { MemoryDocumentStore } from './store/memoryStore';

const SECRET = 'test-collab-jwt-secret-32chars-min';

describe('document access', () => {
	it('creates a document and an owner token', async () => {
		const store = new MemoryDocumentStore();
		const created = await createDocumentAccess(store, SECRET, 60);

		expect(await store.hasDocument(created.documentId)).toBe(true);
		await expect(verifyCapabilityToken(SECRET, created.token)).resolves.toEqual({
			documentId: created.documentId,
			role: 'owner'
		});
	});

	it('lets an owner mint a viewer token and refuses viewers and strangers', async () => {
		const store = new MemoryDocumentStore();
		const created = await createDocumentAccess(store, SECRET, 60);

		const shared = await shareDocumentAccess({
			store,
			secret: SECRET,
			ttlSeconds: 60,
			documentId: created.documentId,
			actorToken: created.token,
			role: 'viewer'
		});
		await expect(verifyCapabilityToken(SECRET, shared.token)).resolves.toMatchObject({ role: 'viewer' });

		await expect(
			shareDocumentAccess({
				store,
				secret: SECRET,
				ttlSeconds: 60,
				documentId: created.documentId,
				actorToken: shared.token,
				role: 'editor'
			})
		).rejects.toMatchObject({ status: 403 });

		const other = await createDocumentAccess(store, SECRET, 60);
		await expect(
			shareDocumentAccess({
				store,
				secret: SECRET,
				ttlSeconds: 60,
				documentId: created.documentId,
				actorToken: other.token,
				role: 'editor'
			})
		).rejects.toMatchObject({ status: 403 });
	});
});
