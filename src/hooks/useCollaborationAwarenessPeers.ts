'use client';

import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Awareness } from 'y-protocols/awareness';
import { useSyncExternalStore } from 'react';

import {
	collaboratorIdentityFromAwarenessUser,
	type CollaboratorIdentity
} from '@/lib/collaboratorIdentity';

const EMPTY_PEERS: CollaboratorIdentity[] = [];

/** Cached peer list reference per Awareness instance until membership changes (useSyncExternalStore requires stable snapshots). */
const peersSnapshotCache = new WeakMap<Awareness, { signature: string; peers: CollaboratorIdentity[] }>();

function collectPeersFromAwareness(awareness: Awareness): CollaboratorIdentity[] {
	const seen = new Set<string>();
	const out: CollaboratorIdentity[] = [];

	for (const state of awareness.getStates().values()) {
		const id = collaboratorIdentityFromAwarenessUser(state.user);
		if (!id) {
			continue;
		}
		const dedupeKey = `${id.name}\0${id.color}`;
		if (seen.has(dedupeKey)) {
			continue;
		}
		seen.add(dedupeKey);
		out.push(id);
	}

	out.sort((a, b) => a.name.localeCompare(b.name));

	const signature = out.map((p) => `${p.name}\0${p.color}`).join('\n');
	const prev = peersSnapshotCache.get(awareness);
	if (prev && prev.signature === signature) {
		return prev.peers;
	}
	peersSnapshotCache.set(awareness, { signature, peers: out });
	return out;
}

export function useCollaborationAwarenessPeers(provider: HocuspocusProvider | null): CollaboratorIdentity[] {
	const awareness = provider?.awareness ?? null;

	return useSyncExternalStore(
		(callback) => {
			if (!awareness) {
				return (): void => {};
			}

			awareness.on('change', callback);
			return (): void => {
				awareness.off('change', callback);
			};
		},
		(): CollaboratorIdentity[] => (!awareness ? EMPTY_PEERS : collectPeersFromAwareness(awareness)),
		(): CollaboratorIdentity[] => EMPTY_PEERS
	);
}
