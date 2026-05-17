import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

import { getCollaborationBaseState } from '@/test/collaboration/harness';

import {
	DeferredMessageQueue,
	type DeferredMessageQueueConfig,
	type DeliveryOptions,
	type QueuedMessage
} from '@/test/collaboration/network/deferredMessageQueue';

export const NETWORK_ORIGIN = Symbol('yjs-sync-network');

export const SERVER_TARGET = '__server__';

export type NetworkClientId = string;

type ClientState = {
	doc: Y.Doc;
	partitioned: boolean;
};

export type YjsSyncNetworkOptions = {
	initialState?: Uint8Array;
	queue?: DeferredMessageQueue;
};

/**
 * Hub-and-spoke Yjs sync: a server doc merges client updates and relays deltas.
 * Reconnect uses state-vector exchange (same merge model as Hocuspocus catch-up).
 */
export class YjsSyncNetwork {
	private readonly serverDoc: Y.Doc;
	private readonly clients = new Map<NetworkClientId, ClientState>();
	private readonly queue: DeferredMessageQueue;
	private immediateDelivery = false;

	constructor(options: YjsSyncNetworkOptions = {}) {
		this.serverDoc = new Y.Doc();
		Y.applyUpdate(this.serverDoc, options.initialState ?? getCollaborationBaseState(), NETWORK_ORIGIN);
		this.queue = options.queue ?? new DeferredMessageQueue();
	}

	get hubDoc(): Y.Doc {
		return this.serverDoc;
	}

	get messageQueue(): DeferredMessageQueue {
		return this.queue;
	}

	configureDelivery(config: Partial<DeferredMessageQueueConfig>): void {
		this.queue.configure(config);
	}

	setImmediateDelivery(immediate: boolean): void {
		this.immediateDelivery = immediate;
	}

	registerClient(clientId: NetworkClientId, doc: Y.Doc): void {
		if (this.clients.has(clientId)) {
			throw new Error(`Client ${clientId} is already registered`);
		}

		this.clients.set(clientId, { doc, partitioned: false });

		doc.on('update', (update: Uint8Array, origin: unknown) => {
			if (origin === NETWORK_ORIGIN || update.length === 0) {
				return;
			}
			const state = this.clients.get(clientId);
			if (!state || state.partitioned) {
				return;
			}
			this.injectUpdate(clientId, update);
		});
	}

	unregisterClient(clientId: NetworkClientId): void {
		this.clients.delete(clientId);
	}

	connect(clientId: NetworkClientId): void {
		this.requireClient(clientId).partitioned = false;
		this.mergeClientWithServer(clientId);
	}

	partition(clientId: NetworkClientId): void {
		this.requireClient(clientId).partitioned = true;
	}

	reconnect(clientId: NetworkClientId): void {
		this.connect(clientId);
	}

	resyncAllClients(): void {
		this.setImmediateDelivery(true);
		try {
			for (const clientId of this.clients.keys()) {
				this.requireClient(clientId).partitioned = false;
				this.mergeClientWithServer(clientId);
			}
		} finally {
			this.setImmediateDelivery(false);
		}
	}

	isPartitioned(clientId: NetworkClientId): boolean {
		return this.requireClient(clientId).partitioned;
	}

	getClientDoc(clientId: NetworkClientId): Y.Doc {
		return this.requireClient(clientId).doc;
	}

	injectUpdate(clientId: NetworkClientId, update: Uint8Array, options?: DeliveryOptions): void {
		if (update.length === 0) {
			return;
		}
		this.routeMessage({ from: clientId, to: SERVER_TARGET, payload: update }, options);
	}

	private requireClient(clientId: NetworkClientId): ClientState {
		const state = this.clients.get(clientId);
		if (!state) {
			throw new Error(`Unknown client: ${clientId}`);
		}
		return state;
	}

	private mergeClientWithServer(clientId: NetworkClientId): void {
		const clientDoc = this.requireClient(clientId).doc;
		const serverVectorBefore = Y.encodeStateVector(this.serverDoc);
		const clientVectorBefore = Y.encodeStateVector(clientDoc);

		const serverToClient = Y.encodeStateAsUpdate(this.serverDoc, clientVectorBefore);
		const clientToServer = Y.encodeStateAsUpdate(clientDoc, serverVectorBefore);

		if (serverToClient.length > 0) {
			Y.applyUpdate(clientDoc, serverToClient, NETWORK_ORIGIN);
		}
		if (clientToServer.length > 0) {
			Y.applyUpdate(this.serverDoc, clientToServer, NETWORK_ORIGIN);
			this.broadcastServerDelta(clientId, serverVectorBefore);
		}
	}

	private broadcastServerDelta(fromClientId: NetworkClientId, serverVectorBefore: Uint8Array): void {
		const delta = Y.encodeStateAsUpdate(this.serverDoc, serverVectorBefore);
		if (delta.length === 0) {
			return;
		}

		const wireMessage = wrapUpdate(delta);
		for (const clientId of this.clients.keys()) {
			if (clientId !== fromClientId) {
				this.enqueueToClient(fromClientId, clientId, wireMessage);
			}
		}
	}

	private enqueueToClient(from: string, to: NetworkClientId, payload: Uint8Array, options?: DeliveryOptions): void {
		if (!this.clients.has(to)) {
			return;
		}
		this.routeMessage({ from, to, payload }, options);
	}

	private routeMessage(
		message: Pick<QueuedMessage, 'from' | 'to' | 'payload'>,
		options?: DeliveryOptions
	): void {
		if (this.immediateDelivery) {
			this.dispatch(message);
			return;
		}

		this.queue.enqueue(message.to, message.from, message.payload, options);
	}

	private dispatch(message: Pick<QueuedMessage, 'from' | 'to' | 'payload'>): void {
		if (message.to === SERVER_TARGET) {
			this.handleServerUpdate(message.from, message.payload);
			return;
		}

		this.handleClientUpdate(message.to, message.payload);
	}

	private handleServerUpdate(fromClientId: NetworkClientId, update: Uint8Array): void {
		const serverVectorBefore = Y.encodeStateVector(this.serverDoc);
		Y.applyUpdate(this.serverDoc, update, fromClientId);
		this.broadcastServerDelta(fromClientId, serverVectorBefore);
	}

	private handleClientUpdate(clientId: NetworkClientId, payload: Uint8Array): void {
		if (this.requireClient(clientId).partitioned) {
			return;
		}

		const clientDoc = this.requireClient(clientId).doc;
		Y.applyUpdate(clientDoc, unwrapUpdate(payload), NETWORK_ORIGIN);
	}

	drain(maxRounds = 10_000): void {
		for (let round = 0; round < maxRounds; round++) {
			if (this.queue.pendingCount === 0) {
				return;
			}

			const flushTime = Math.max(Date.now(), this.queue.maxDeliverAt);
			let batch = this.queue.flush(flushTime);
			if (batch.length === 0) {
				batch = this.queue.flushAll();
			}

			if (batch.length === 0) {
				return;
			}

			for (const message of batch) {
				this.dispatch(message);
			}
		}

		throw new Error('YjsSyncNetwork.drain exceeded maxRounds');
	}

	destroy(): void {
		for (const { doc } of this.clients.values()) {
			doc.destroy();
		}
		this.clients.clear();
		this.serverDoc.destroy();
	}
}

function wrapUpdate(update: Uint8Array): Uint8Array {
	const encoder = encoding.createEncoder();
	syncProtocol.writeUpdate(encoder, update);
	return encoding.toUint8Array(encoder);
}

function unwrapUpdate(payload: Uint8Array): Uint8Array {
	const decoder = decoding.createDecoder(payload);
	const messageType = decoding.readVarUint(decoder);
	if (messageType !== syncProtocol.messageYjsUpdate) {
		throw new Error(`Expected Yjs update message, got type ${messageType}`);
	}
	return decoding.readVarUint8Array(decoder);
}
