import type { Awareness } from 'y-protocols/awareness';

import { awarenessCursorSchema, collaboratorIdentityWireSchema } from '../src/lib/collaborationMetadataSchemas';

const MAX_NAME_LENGTH = 80;
const MAX_FIELD_JSON_LENGTH = 2048;
const installed = new WeakSet<Awareness>();

function jsonLength(value: unknown): number {
	try {
		return JSON.stringify(value)?.length ?? Number.POSITIVE_INFINITY;
	} catch {
		return Number.POSITIVE_INFINITY;
	}
}

function boundUser(value: unknown): { name: string; color: string } | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const record = value as Record<string, unknown>;
	const name = typeof record.name === 'string' ? record.name.trim().slice(0, MAX_NAME_LENGTH) : '';
	const color = typeof record.color === 'string' ? record.color : '';
	const parsed = collaboratorIdentityWireSchema.safeParse({ name, color });
	return parsed.success ? parsed.data : undefined;
}

function boundCursor(value: unknown): unknown {
	if (jsonLength(value) > MAX_FIELD_JSON_LENGTH) {
		return undefined;
	}
	const parsed = awarenessCursorSchema.safeParse(value);
	return parsed.success ? parsed.data : undefined;
}

/** Return a state that is safe to broadcast. Invalid user or cursor fields are removed. */
export function sanitizeAwarenessState(state: Record<string, unknown>): Record<string, unknown> {
	const next: Record<string, unknown> = { ...state };

	if ('user' in next) {
		const user = boundUser(next.user);
		if (user) {
			next.user = user;
		} else {
			delete next.user;
		}
	}

	if ('cursor' in next && next.cursor != null) {
		const cursor = boundCursor(next.cursor);
		if (cursor) {
			next.cursor = cursor;
		} else {
			delete next.cursor;
		}
	}

	for (const [key, value] of Object.entries(next)) {
		if (key === 'user' || key === 'cursor') {
			continue;
		}
		if (jsonLength(value) > MAX_FIELD_JSON_LENGTH) {
			delete next[key];
		}
	}

	return next;
}

function sanitizeAwareness(awareness: Awareness): void {
	for (const [clientId, state] of awareness.getStates()) {
		if (!state || typeof state !== 'object') {
			continue;
		}
		const next = sanitizeAwarenessState(state);
		if (JSON.stringify(state) !== JSON.stringify(next)) {
			awareness.states.set(clientId, next);
		}
	}
}

/**
 * Strip invalid presence before Hocuspocus broadcasts it.
 * The server registers its broadcast listener before hooks run, so this wraps `emit`.
 */
export function installAwarenessSanitizer(awareness: Awareness): void {
	if (installed.has(awareness)) {
		return;
	}
	installed.add(awareness);
	const original = awareness.emit.bind(awareness);
	awareness.emit = ((name: string, args: Array<unknown>) => {
		if (name === 'update' || name === 'change') {
			sanitizeAwareness(awareness);
		}
		return original(name, args);
	}) as Awareness['emit'];
}
