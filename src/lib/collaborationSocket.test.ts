// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { COLLABORATION_RECONNECT, createCollaborationSocket } from '@/lib/collaborationSocket';

describe('collaboration reconnect options', () => {
	it('uses unlimited attempts with exponential backoff and jitter', () => {
		expect(COLLABORATION_RECONNECT.maxAttempts).toBe(0);
		expect(COLLABORATION_RECONNECT.factor).toBe(2);
		expect(COLLABORATION_RECONNECT.jitter).toBe(true);

		const socket = createCollaborationSocket('ws://127.0.0.1:9', { autoConnect: false });
		expect(socket.configuration.maxAttempts).toBe(0);
		expect(socket.configuration.factor).toBe(2);
		expect(socket.configuration.jitter).toBe(true);
		expect(socket.configuration.delay).toBe(1000);
		expect(socket.configuration.minDelay).toBe(1000);
		expect(socket.configuration.maxDelay).toBe(30_000);
		socket.destroy();
	});
});
