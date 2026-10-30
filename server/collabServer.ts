import { Server } from '@hocuspocus/server';

import {
	awarenessCursorSchema,
	collaboratorIdentityWireSchema,
	warnInvalidAwareness
} from '../src/lib/collaborationMetadataSchemas';
import type { DocumentStore } from './store/types';

export type CollabServerOptions = {
	store: DocumentStore;
	port: number;
	address?: string;
	compactAfterUpdates?: number;
	quiet?: boolean;
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
		...(options.address ? { address: options.address } : {}),
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
		async onAwarenessUpdate({ states }) {
			for (const state of states) {
				const clientId = typeof state.clientId === 'number' ? state.clientId : -1;

				if (state.user != null) {
					const result = collaboratorIdentityWireSchema.safeParse(state.user);
					if (!result.success) {
						warnInvalidAwareness('user', clientId, result.error.issues);
					}
				}

				if (state.cursor != null) {
					const result = awarenessCursorSchema.safeParse(state.cursor);
					if (!result.success) {
						warnInvalidAwareness('cursor', clientId, result.error.issues);
					}
				}
			}
		}
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
