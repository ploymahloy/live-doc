'use client';

import { useEffect, useState } from 'react';
import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

/** IndexedDB key and default Hocuspocus room name; keep them aligned. */
export const DEFAULT_COLLABORATION_DOCUMENT_NAME = 'live-doc';

export type CollaborationOptions = {
	documentName?: string;
	/** Defaults to `documentName` so local cache matches the synced room. */
	indexedDbName?: string;
	wsUrl?: string;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

function mapWebSocketStatus(status: WebSocketStatus): ConnectionStatus {
	switch (status) {
		case WebSocketStatus.Connected:
			return 'connected';
		case WebSocketStatus.Connecting:
			return 'connecting';
		default:
			return 'disconnected';
	}
}

export function useCollaboration(options: CollaborationOptions = {}) {
	const documentName = options.documentName ?? DEFAULT_COLLABORATION_DOCUMENT_NAME;
	const indexedDbName = options.indexedDbName ?? documentName;
	const wsUrl =
		options.wsUrl ??
		process.env.NEXT_PUBLIC_HOCUSPOCUS_URL ??
		'ws://127.0.0.1:1234';

	const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
	const [ready, setReady] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
	const [error, setError] = useState<string | undefined>();

	useEffect(() => {
		let cancelled = false;
		const doc = new Y.Doc();
		const persistence = new IndexeddbPersistence(indexedDbName, doc);

		const provider = new HocuspocusProvider({
			url: wsUrl,
			name: documentName,
			document: doc,
			onStatus: ({ status }) => {
				if (!cancelled) {
					setConnectionStatus(mapWebSocketStatus(status));
				}
			},
			onDisconnect: ({ event }) => {
				if (!cancelled && event.reason) {
					setError(event.reason);
				}
			}
		});

		const onIdbSynced = () => {
			if (!cancelled) {
				setYdoc(doc);
				setReady(true);
			}
		};

		persistence.on('synced', onIdbSynced);

		return () => {
			cancelled = true;
			persistence.off('synced', onIdbSynced);
			provider.destroy();
			void persistence.destroy();
			doc.destroy();
			setYdoc(null);
			setReady(false);
			setConnectionStatus('disconnected');
			setError(undefined);
		};
	}, [documentName, indexedDbName, wsUrl]);

	return { ydoc, ready, connectionStatus, error };
}
