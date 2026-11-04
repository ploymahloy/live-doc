import { jwtVerify, SignJWT } from 'jose';

import { isCapabilityRole, type CapabilityRole } from '../../src/lib/capabilityRole';
import { isValidDocumentId } from '../../src/lib/documentId';
import { readPositiveInt } from '../db/pool';

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;

export class UnauthorizedError extends Error {
	readonly reason = 'unauthorized';

	constructor() {
		super('unauthorized');
		this.name = 'UnauthorizedError';
	}
}

export type CapabilityClaims = {
	documentId: string;
	role: CapabilityRole;
};

function signingKey(secret: string): Uint8Array {
	return new TextEncoder().encode(secret);
}

export function readCollabJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
	const secret = env.COLLAB_JWT_SECRET?.trim() ?? '';
	if (secret.length < 32) {
		throw new Error('COLLAB_JWT_SECRET must be at least 32 characters');
	}
	return secret;
}

export function readCapabilityTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
	return readPositiveInt(env.COLLAB_TOKEN_TTL_SECONDS, DEFAULT_TTL_SECONDS);
}

export async function signCapabilityToken(
	secret: string,
	claims: CapabilityClaims,
	ttlSeconds: number
): Promise<string> {
	if (!isValidDocumentId(claims.documentId)) {
		throw new Error('document id must be a UUID');
	}
	if (!isCapabilityRole(claims.role)) {
		throw new Error('invalid capability role');
	}
	if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
		throw new Error('token ttl must be positive');
	}

	return new SignJWT({ documentId: claims.documentId, role: claims.role })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(`${Math.floor(ttlSeconds)}s`)
		.sign(signingKey(secret));
}

export async function verifyCapabilityToken(secret: string, token: string): Promise<CapabilityClaims> {
	const { payload } = await jwtVerify(token, signingKey(secret), { algorithms: ['HS256'] });
	const documentId = payload.documentId;
	const role = payload.role;
	if (typeof documentId !== 'string' || !isValidDocumentId(documentId) || !isCapabilityRole(role)) {
		throw new UnauthorizedError();
	}
	return { documentId, role };
}
