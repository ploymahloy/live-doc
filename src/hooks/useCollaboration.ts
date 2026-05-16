'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { parseCollaboratorIdentityForWire } from '@/lib/collaborationMetadataSchemas';
import { getSessionCollaboratorIdentity } from '@/lib/collaboratorIdentity';
import { installAwarenessCursorThrottle } from '@/lib/throttleAwarenessCursorBroadcast';

/** IndexedDB key and default Hocuspocus room name; keep them aligned. */
export const DEFAULT_COLLABORATION_DOCUMENT_NAME = 'live-doc';

export type CollaborationOptions = {
	documentName?: string;
	/** Defaults to `documentName` so local cache matches the synced room. */
	indexedDbName?: string;
	wsUrl?: string;
	/** Bump to tear down and recreate Y.Doc, IndexedDB persistence, and Hocuspocus provider. */
	sessionKey?: number;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/** Delay before showing offline in the UI; absorbs Strict Mode and brief socket churn. */
const DISCONNECT_DISPLAY_DELAY_MS = 300;

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
	const wsUrl = options.wsUrl ?? process.env.NEXT_PUBLIC_HOCUSPOCUS_URL ?? 'ws://127.0.0.1:1234';
	const sessionKey = options.sessionKey ?? 0;

	const collaborator = useMemo(() => getSessionCollaboratorIdentity(), []);

	const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
	const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
	const [ready, setReady] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
	const [displayConnectionStatus, setDisplayConnectionStatus] = useState<ConnectionStatus>('connecting');
	const [error, setError] = useState<string | undefined>();
	const disconnectDisplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let cancelled = false;
		const doc = new Y.Doc();
		const persistence = new IndexeddbPersistence(indexedDbName, doc);

		const clearDisconnectDisplayTimer = () => {
			if (disconnectDisplayTimerRef.current) {
				clearTimeout(disconnectDisplayTimerRef.current);
				disconnectDisplayTimerRef.current = null;
			}
		};

		const hp = new HocuspocusProvider({
			url: wsUrl,
			name: documentName,
			document: doc,
			// @ts-expect-error Provider typings omit websocket-layer options; runtime passes them to HocuspocusProviderWebsocket.
			maxAttempts: 1,
			onStatus: ({ status }) => {
				if (cancelled) {
					return;
				}
				const next = mapWebSocketStatus(status);
				setConnectionStatus(next);
				if (next === 'connected' || next === 'connecting') {
					clearDisconnectDisplayTimer();
					setDisplayConnectionStatus(next);
					setError(undefined);
				} else {
					clearDisconnectDisplayTimer();
					disconnectDisplayTimerRef.current = setTimeout(() => {
						disconnectDisplayTimerRef.current = null;
						if (!cancelled) {
							setDisplayConnectionStatus('disconnected');
						}
					}, DISCONNECT_DISPLAY_DELAY_MS);
				}
			},
			onDisconnect: ({ event }) => {
				if (!cancelled && event.reason) {
					setError(event.reason);
				}
			}
		});

		const uninstallAwarenessCursorThrottle = hp.awareness ?
			installAwarenessCursorThrottle(hp.awareness)
		:	(): void => {};

		hp.setAwarenessField('user', parseCollaboratorIdentityForWire(collaborator));
		setProvider(hp);

		const onIdbSynced = () => {
			if (!cancelled) {
				setYdoc(doc);
				setReady(true);
			}
		};

		persistence.on('synced', onIdbSynced);

		return () => {
			cancelled = true;
			clearDisconnectDisplayTimer();
			persistence.off('synced', onIdbSynced);
			setProvider(null);
			uninstallAwarenessCursorThrottle();
			hp.destroy();
			void persistence.destroy();
			doc.destroy();
			setYdoc(null);
			setReady(false);
			setConnectionStatus('disconnected');
			setError(undefined);
		};
	}, [collaborator, documentName, indexedDbName, sessionKey, wsUrl]);

	return { ydoc, provider, collaborator, ready, connectionStatus, displayConnectionStatus, error };
}
