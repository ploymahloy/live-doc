import { createDocumentId, isValidDocumentId } from '../src/lib/documentId';
import {
	signCapabilityToken,
	verifyCapabilityToken,
	type CapabilityClaims
} from './auth/capabilityToken';
import type { DocumentStore } from './store/types';

export class DocumentAccessError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'DocumentAccessError';
	}
}

export type ShareRole = 'editor' | 'viewer';

export async function createDocumentAccess(
	store: DocumentStore,
	secret: string,
	ttlSeconds: number
): Promise<CapabilityClaims & { token: string }> {
	const documentId = createDocumentId();
	await store.ensureDocument(documentId);
	const token = await signCapabilityToken(secret, { documentId, role: 'owner' }, ttlSeconds);
	return { documentId, role: 'owner', token };
}

export async function shareDocumentAccess(input: {
	store: DocumentStore;
	secret: string;
	ttlSeconds: number;
	documentId: string;
	actorToken: string;
	role: ShareRole;
}): Promise<{ token: string; role: ShareRole }> {
	if (input.role !== 'editor' && input.role !== 'viewer') {
		throw new DocumentAccessError(400, 'role must be editor or viewer');
	}
	if (!isValidDocumentId(input.documentId)) {
		throw new DocumentAccessError(404, 'document not found');
	}

	let actor: CapabilityClaims;
	try {
		actor = await verifyCapabilityToken(input.secret, input.actorToken);
	} catch {
		throw new DocumentAccessError(401, 'unauthorized');
	}

	if (actor.documentId !== input.documentId || actor.role === 'viewer') {
		throw new DocumentAccessError(403, 'unauthorized');
	}
	if (!(await input.store.hasDocument(input.documentId))) {
		throw new DocumentAccessError(404, 'document not found');
	}

	const token = await signCapabilityToken(
		input.secret,
		{ documentId: input.documentId, role: input.role },
		input.ttlSeconds
	);
	return { token, role: input.role };
}

export function accessErrorResponse(error: unknown): Response {
	if (error instanceof DocumentAccessError) {
		return Response.json({ error: error.message }, { status: error.status });
	}

	const message = error instanceof Error ? error.message : 'request failed';
	if (message.includes('COLLAB_JWT_SECRET') || message.includes('DATABASE_URL')) {
		return Response.json({ error: message }, { status: 503 });
	}

	console.error('[live-doc] document access failed:', error);
	return Response.json({ error: 'request failed' }, { status: 500 });
}
