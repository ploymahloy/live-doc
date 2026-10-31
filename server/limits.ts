import { readPositiveInt } from './db/pool';

export type CollabLimits = {
	maxDocumentBytes: number;
	maxConnectionsPerDocument: number;
	maxConnectionsPerIp: number;
	maxMessagesPerWindow: number;
	messageWindowMs: number;
	maxWebsocketPayloadBytes: number;
};

export const DEFAULT_COLLAB_LIMITS: CollabLimits = {
	maxDocumentBytes: 2_000_000,
	maxConnectionsPerDocument: 50,
	maxConnectionsPerIp: 20,
	maxMessagesPerWindow: 120,
	messageWindowMs: 10_000,
	maxWebsocketPayloadBytes: 1024 * 1024
};

export function readCollabLimits(env: NodeJS.ProcessEnv = process.env): CollabLimits {
	return {
		maxDocumentBytes: readPositiveInt(env.COLLAB_MAX_DOCUMENT_BYTES, DEFAULT_COLLAB_LIMITS.maxDocumentBytes),
		maxConnectionsPerDocument: readPositiveInt(
			env.COLLAB_MAX_CONNECTIONS_PER_DOCUMENT,
			DEFAULT_COLLAB_LIMITS.maxConnectionsPerDocument
		),
		maxConnectionsPerIp: readPositiveInt(
			env.COLLAB_MAX_CONNECTIONS_PER_IP,
			DEFAULT_COLLAB_LIMITS.maxConnectionsPerIp
		),
		maxMessagesPerWindow: readPositiveInt(
			env.COLLAB_MAX_MESSAGES_PER_WINDOW,
			DEFAULT_COLLAB_LIMITS.maxMessagesPerWindow
		),
		messageWindowMs: readPositiveInt(env.COLLAB_MESSAGE_WINDOW_MS, DEFAULT_COLLAB_LIMITS.messageWindowMs),
		maxWebsocketPayloadBytes: readPositiveInt(
			env.COLLAB_MAX_WEBSOCKET_PAYLOAD_BYTES,
			DEFAULT_COLLAB_LIMITS.maxWebsocketPayloadBytes
		)
	};
}

/** Thrown from hooks that should refuse the connection. `reason` is sent to the client. */
export class ConnectionLimitError extends Error {
	readonly code = 4008;
	readonly reason: string;

	constructor(reason: string) {
		super(reason);
		this.name = 'ConnectionLimitError';
		this.reason = reason;
	}
}

export function clientIp(request: Request): string {
	const forwarded = request.headers.get('x-forwarded-for');
	const first = forwarded?.split(',')[0]?.trim();
	return first || 'unknown';
}

type ClosableSocket = {
	webSocket?: {
		close(code?: number, reason?: string): void;
	};
};

/** Close the underlying socket. A protocol-level close leaves the WebSocket open. */
export function closeCollabSocket(connection: ClosableSocket, reason: string): void {
	try {
		connection.webSocket?.close(4008, reason);
	} catch {
		// The socket may already be closing.
	}
}

export class MessageRateLimiter {
	private readonly stamps = new Map<string, number[]>();

	constructor(
		private readonly maxMessages: number,
		private readonly windowMs: number
	) {}

	allow(socketId: string, now = Date.now()): boolean {
		const recent = (this.stamps.get(socketId) ?? []).filter((stamp) => now - stamp < this.windowMs);
		if (recent.length >= this.maxMessages) {
			this.stamps.set(socketId, recent);
			return false;
		}
		recent.push(now);
		this.stamps.set(socketId, recent);
		return true;
	}

	forget(socketId: string): void {
		this.stamps.delete(socketId);
	}
}
