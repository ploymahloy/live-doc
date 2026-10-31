// @vitest-environment node

import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import {
	readCollabJwtSecret,
	signCapabilityToken,
	verifyCapabilityToken
} from './capabilityToken';

const SECRET = 'test-collab-jwt-secret-32chars-min';

describe('capability tokens', () => {
	it('round-trips document id and role', async () => {
		const documentId = crypto.randomUUID();
		const token = await signCapabilityToken(SECRET, { documentId, role: 'editor' }, 60);
		await expect(verifyCapabilityToken(SECRET, token)).resolves.toEqual({ documentId, role: 'editor' });
	});

	it('rejects a bad signature, an expired token, and a short secret', async () => {
		const documentId = crypto.randomUUID();
		const token = await signCapabilityToken(SECRET, { documentId, role: 'owner' }, 60);
		await expect(verifyCapabilityToken('another-collab-jwt-secret-32chars', token)).rejects.toThrow();

		const expired = await new SignJWT({ documentId, role: 'owner' })
			.setProtectedHeader({ alg: 'HS256' })
			.setExpirationTime(Math.floor(Date.now() / 1000) - 10)
			.sign(new TextEncoder().encode(SECRET));
		await expect(verifyCapabilityToken(SECRET, expired)).rejects.toThrow();

		expect(() => readCollabJwtSecret({ COLLAB_JWT_SECRET: 'too-short' })).toThrow(/COLLAB_JWT_SECRET/);
	});
});
