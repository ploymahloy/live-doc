import { Server, type Hocuspocus } from '@hocuspocus/server';
import * as Y from 'yjs';

import { isValidDocumentId } from '../src/lib/documentId';
import { installAwarenessSanitizer } from './awarenessGuard';
import { UnauthorizedError, verifyCapabilityToken } from './auth/capabilityToken';
import {
	clientIp,
	closeCollabSocket,
	ConnectionLimitError,
	DEFAULT_COLLAB_LIMITS,
	MessageRateLimiter,
	type CollabLimits
} from './limits';
import type { DocumentStore } from './store/types';

export type CollabServerOptions = {
	store: DocumentStore;
	port: number;
	address?: string;
	compactAfterUpdates?: number;
	quiet?: boolean;
	/** When set, connections must present a capability token for this document. */
	auth?: {
		secret: string;
	};
	limits?: Partial<CollabLimits>;
};

export type CollabServerHandle = {
	server: Server;
	store: DocumentStore;
	listen(): Promise<void>;
	destroy(): Promise<void>;
	/** Resolves when appends started so far have finished. Does not start new work. */
	flushPendingWrites(): Promise<void>;
};

export function createCollabServer(options: CollabServerOptions): CollabServerHandle {
	const compactAfterUpdates = options.compactAfterUpdates ?? 100;
	const limits: CollabLimits = { ...DEFAULT_COLLAB_LIMITS, ...options.limits };
	const messageRates = new MessageRateLimiter(limits.maxMessagesPerWindow, limits.messageWindowMs);
	const inFlight = new Set<Promise<void>>();

	const track = (write: Promise<void>): void => {
		inFlight.add(write);
		void write.finally(() => {
			inFlight.delete(write);
		});
	};

	const server = new Server({
		name: 'live-doc-hocuspocus',
		port: options.port,
		stopOnSignals: false,
		quiet: options.quiet ?? false,
		websocketOptions: { maxPayload: limits.maxWebsocketPayloadBytes },
		...(options.address ? { address: options.address } : {}),
		async onConnect({ documentName }) {
			if (!isValidDocumentId(documentName) || !(await options.store.hasDocument(documentName))) {
				throw new ConnectionLimitError('document not found');
			}
		},
		async onLoadDocument({ documentName }) {
			const state = await options.store.load(documentName);
			return state ?? undefined;
		},
		async onChange({ documentName, update }) {
			if (update.byteLength === 0) {
				return;
			}

			const write = (async () => {
				await options.store.appendUpdate(documentName, update);
				if (compactAfterUpdates <= 0) {
					return;
				}
				const pending = await options.store.pendingUpdateCount(documentName);
				if (pending >= compactAfterUpdates) {
					await options.store.compact(documentName);
				}
			})();

			track(write);
			// Hocuspocus does not await this hook. Swallow the rejection here so it is logged,
			// while `write` itself still rejects for flushPendingWrites.
			await write.catch((error: unknown) => {
				console.error(`[live-doc] Failed to persist document "${documentName}":`, error);
			});
		},
		async onStoreDocument() {
			// Persistence happens in onChange. This hook stays so Hocuspocus can unload the document.
		},
		async beforeUnloadDocument({ documentName }) {
			await options.store.compact(documentName);
		},
		async beforeHandleMessage({ update, socketId, connection }) {
			if (update.byteLength > limits.maxWebsocketPayloadBytes || !messageRates.allow(socketId)) {
				const reason = update.byteLength > limits.maxWebsocketPayloadBytes ? 'payload too large' : 'rate limit exceeded';
				closeCollabSocket(connection, reason);
				throw new ConnectionLimitError(reason);
			}
		},
		async beforeSync({ document, type, payload, connection }) {
			// Sync step 1 only asks for state. Empty updates are two bytes.
			if (type === 0 || payload.byteLength <= 2) {
				return;
			}
			const size = Y.encodeStateAsUpdate(document).byteLength;
			if (size + payload.byteLength > limits.maxDocumentBytes) {
				closeCollabSocket(connection, 'document too large');
				throw new ConnectionLimitError('document too large');
			}
		},
		async connected({ documentName, instance, connection, request }) {
			const room = instance.documents.get(documentName);
			const roomCount = room?.getConnectionsCount() ?? 0;
			const ipCount = countConnectionsForIp(instance, clientIp(request));
			if (roomCount > limits.maxConnectionsPerDocument || ipCount > limits.maxConnectionsPerIp) {
				closeCollabSocket(connection, 'too many connections');
			}
		},
		async onDisconnect({ socketId }) {
			messageRates.forget(socketId);
		},
		async afterLoadDocument({ document }) {
			installAwarenessSanitizer(document.awareness);
		},
		...(options.auth
			? {
					async onAuthenticate({
						token,
						documentName,
						connectionConfig
					}: {
						token: string;
						documentName: string;
						connectionConfig: { readOnly: boolean };
					}) {
						try {
							const claims = await verifyCapabilityToken(options.auth!.secret, token);
							if (claims.documentId !== documentName) {
								throw new UnauthorizedError();
							}
							if (claims.role === 'viewer') {
								connectionConfig.readOnly = true;
							}
							return { role: claims.role, documentId: claims.documentId };
						} catch (error) {
							if (error instanceof UnauthorizedError) {
								throw error;
							}
							throw new UnauthorizedError();
						}
					}
				}
			: {})
	});

	return {
		server,
		store: options.store,
		listen: async () => {
			await server.listen();
		},
		destroy: () => server.destroy(),
		flushPendingWrites: async () => {
			while (inFlight.size > 0) {
				await Promise.all([...inFlight]);
			}
		}
	};
}

function countConnectionsForIp(instance: Hocuspocus, ip: string): number {
	let count = 0;
	for (const document of instance.documents.values()) {
		for (const connection of document.getConnections()) {
			if (clientIp(connection.request) === ip) {
				count += 1;
			}
		}
	}
	return count;
}
