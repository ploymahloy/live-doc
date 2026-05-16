import type { Awareness } from 'y-protocols/awareness';
import { parseAwarenessCursorForWire } from '@/lib/collaborationMetadataSchemas';

/** Matches `cursorStateField` default in `@tiptap/y-tiptap` `yCursorPlugin`. */
const CURSOR_FIELD = 'cursor';

/**
 * Limits outbound awareness updates for the collaborative cursor to at most once per animation frame,
 * reducing WebSocket traffic from rapid selection changes while leaving other awareness fields untouched.
 *
 * Clears (`value === null`) stay synchronous so blur/teardown removes the caret immediately.
 */
export function installAwarenessCursorThrottle(awareness: Awareness): () => void {
	const scheduleFrame =
		typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame.bind(globalThis) : null;

	if (!scheduleFrame || typeof globalThis.cancelAnimationFrame !== 'function') {
		return (): void => {};
	}

	const cancelFrame = globalThis.cancelAnimationFrame.bind(globalThis);
	const originalSetLocalStateField = awareness.setLocalStateField.bind(awareness);

	let rafId: number | null = null;
	let queuedCursor: unknown;

	function broadcastCursor(value: unknown): void {
		try {
			originalSetLocalStateField(CURSOR_FIELD, parseAwarenessCursorForWire(value));
		} catch {
			// Skip malformed cursor payloads rather than broadcasting garbage.
		}
	}

	function flushQueuedCursor(): void {
		rafId = null;
		const payload = queuedCursor;
		if (payload !== undefined) {
			queuedCursor = undefined;
			broadcastCursor(payload);
		}
	}

	awareness.setLocalStateField = (field: string, value: unknown): void => {
		if (field !== CURSOR_FIELD) {
			originalSetLocalStateField(field, value);
			return;
		}

		if (value === null) {
			if (rafId !== null) {
				cancelFrame(rafId);
				rafId = null;
			}
			queuedCursor = undefined;
			originalSetLocalStateField(field, null);
			return;
		}

		try {
			parseAwarenessCursorForWire(value);
		} catch {
			return;
		}

		queuedCursor = value;
		if (rafId !== null) {
			return;
		}
		rafId = scheduleFrame(flushQueuedCursor);
	};

	return (): void => {
		if (rafId !== null) {
			cancelFrame(rafId);
			rafId = null;
		}
		queuedCursor = undefined;
		awareness.setLocalStateField = originalSetLocalStateField;
	};
}
