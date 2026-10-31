import { WebSocketStatus } from '@hocuspocus/provider';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export function deriveConnectionStatus(input: {
	socketStatus: WebSocketStatus;
	hasConnectedOnce: boolean;
	offlineDelayElapsed: boolean;
}): ConnectionStatus {
	if (input.socketStatus === WebSocketStatus.Connected) {
		return 'connected';
	}

	if (!input.hasConnectedOnce) {
		if (input.offlineDelayElapsed && input.socketStatus === WebSocketStatus.Disconnected) {
			return 'offline';
		}
		return 'connecting';
	}

	if (input.offlineDelayElapsed) {
		return 'offline';
	}

	return 'reconnecting';
}
