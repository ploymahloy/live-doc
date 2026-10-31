'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { parseCollaboratorIdentityForWire } from '@/lib/collaborationMetadataSchemas';
import { createCollaborationProvider } from '@/lib/collaborationSocket';
import { deriveConnectionStatus, type ConnectionStatus } from '@/lib/connectionStatus';
import {
	getSessionCollaboratorIdentity,
	setSessionCollaboratorIdentity,
	type CollaboratorIdentity
} from '@/lib/collaboratorIdentity';
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

export type { ConnectionStatus };

/** Delay before showing offline in the UI; absorbs Strict Mode and brief socket churn. */
const DISCONNECT_DISPLAY_DELAY_MS = 300;

export function useCollaboration(options: CollaborationOptions = {}) {
	const documentName = options.documentName ?? DEFAULT_COLLABORATION_DOCUMENT_NAME;
	const indexedDbName = options.indexedDbName ?? documentName;
	const wsUrl = options.wsUrl ?? process.env.NEXT_PUBLIC_HOCUSPOCUS_URL ?? 'ws://127.0.0.1:1234';
	const sessionKey = options.sessionKey ?? 0;

	const [collaborator, setCollaborator] = useState<CollaboratorIdentity>(() => getSessionCollaboratorIdentity());
	const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
	const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
	const [ready, setReady] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
	const [displayConnectionStatus, setDisplayConnectionStatus] = useState<ConnectionStatus>('connecting');
	const [error, setError] = useState<string | undefined>();
	const disconnectDisplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const hasConnectedOnceRef = useRef(false);
	const offlineDelayElapsedRef = useRef(false);
	const providerRef = useRef<HocuspocusProvider | null>(null);

	const updateCollaborator = useCallback((identity: CollaboratorIdentity) => {
		const wire = parseCollaboratorIdentityForWire(identity);
		setSessionCollaboratorIdentity(wire);
		setCollaborator(wire);
		providerRef.current?.setAwarenessField('user', wire);
	}, []);

	useEffect(() => {
		let cancelled = false;
		hasConnectedOnceRef.current = false;
		offlineDelayElapsedRef.current = false;
		const doc = new Y.Doc();
		const persistence = new IndexeddbPersistence(indexedDbName, doc);

		const clearDisconnectDisplayTimer = () => {
			if (disconnectDisplayTimerRef.current) {
				clearTimeout(disconnectDisplayTimerRef.current);
				disconnectDisplayTimerRef.current = null;
			}
		};

		const { provider: hp, socket } = createCollaborationProvider({
			url: wsUrl,
			name: documentName,
			document: doc,
			onStatus: ({ status }) => {
				if (cancelled) {
					return;
				}

				if (status === WebSocketStatus.Connected) {
					hasConnectedOnceRef.current = true;
					offlineDelayElapsedRef.current = false;
					clearDisconnectDisplayTimer();
					setConnectionStatus('connected');
					setDisplayConnectionStatus('connected');
					setError(undefined);
					return;
				}

				const next = deriveConnectionStatus({
					socketStatus: status,
					hasConnectedOnce: hasConnectedOnceRef.current,
					offlineDelayElapsed: offlineDelayElapsedRef.current
				});
				setConnectionStatus(next);
				setDisplayConnectionStatus(next);

				if (status !== WebSocketStatus.Disconnected || offlineDelayElapsedRef.current) {
					return;
				}

				clearDisconnectDisplayTimer();
				disconnectDisplayTimerRef.current = setTimeout(() => {
					disconnectDisplayTimerRef.current = null;
					if (cancelled) {
						return;
					}
					offlineDelayElapsedRef.current = true;
					const offline = deriveConnectionStatus({
						socketStatus: WebSocketStatus.Disconnected,
						hasConnectedOnce: hasConnectedOnceRef.current,
						offlineDelayElapsed: true
					});
					setConnectionStatus(offline);
					setDisplayConnectionStatus(offline);
				}, DISCONNECT_DISPLAY_DELAY_MS);
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
		providerRef.current = hp;
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
			providerRef.current = null;
			setProvider(null);
			uninstallAwarenessCursorThrottle();
			hp.destroy();
			socket.destroy();
			void persistence.destroy();
			doc.destroy();
			setYdoc(null);
			setReady(false);
			setConnectionStatus('connecting');
			setDisplayConnectionStatus('connecting');
			setError(undefined);
		};
		// collaborator is read once at provider setup; updates go through updateCollaborator.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [documentName, indexedDbName, sessionKey, wsUrl]);

	return {
		ydoc,
		provider,
		collaborator,
		updateCollaborator,
		ready,
		connectionStatus,
		displayConnectionStatus,
		error
	};
}
