import { WebSocketStatus } from '@hocuspocus/provider';
import { describe, expect, it } from 'vitest';

import { deriveConnectionStatus } from '@/lib/connectionStatus';

describe('deriveConnectionStatus', () => {
	it('stays connecting until the first successful connection', () => {
		expect(
			deriveConnectionStatus({
				socketStatus: WebSocketStatus.Connecting,
				hasConnectedOnce: false,
				offlineDelayElapsed: false
			})
		).toBe('connecting');
		expect(
			deriveConnectionStatus({
				socketStatus: WebSocketStatus.Disconnected,
				hasConnectedOnce: false,
				offlineDelayElapsed: true
			})
		).toBe('offline');
	});

	it('shows reconnecting after a drop until the offline delay elapses', () => {
		expect(
			deriveConnectionStatus({
				socketStatus: WebSocketStatus.Disconnected,
				hasConnectedOnce: true,
				offlineDelayElapsed: false
			})
		).toBe('reconnecting');
		expect(
			deriveConnectionStatus({
				socketStatus: WebSocketStatus.Connecting,
				hasConnectedOnce: true,
				offlineDelayElapsed: false
			})
		).toBe('reconnecting');
	});

	it('shows offline once the delay has elapsed and connected when the socket returns', () => {
		expect(
			deriveConnectionStatus({
				socketStatus: WebSocketStatus.Connecting,
				hasConnectedOnce: true,
				offlineDelayElapsed: true
			})
		).toBe('offline');
		expect(
			deriveConnectionStatus({
				socketStatus: WebSocketStatus.Connected,
				hasConnectedOnce: true,
				offlineDelayElapsed: true
			})
		).toBe('connected');
	});
});
