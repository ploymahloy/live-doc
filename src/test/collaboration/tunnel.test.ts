import { describe, expect, it } from 'vitest';

import { expectDocumentsEqual } from '@/test/collaboration/assertConverged';
import { expectDocumentHealthy } from '@/test/collaboration/documentHealth';
import {
	buildTwoReplicaDeltas,
	mergeReplicaDeltas,
	sampleEditorOperations,
	type TaggedEditorOperation
} from '@/test/collaboration/editorOperations';
import { CollaborationTestClient } from '@/test/collaboration/network/collaborationTestClient';
import { YjsSyncNetwork } from '@/test/collaboration/network/yjsSyncNetwork';

const TUNNEL_OP_COUNT = 50;

function buildGroundTruthDoc(opsA: TaggedEditorOperation[], opsB: TaggedEditorOperation[]) {
	const tagged = [...opsA, ...opsB];
	const { deltaFromA, deltaFromB } = buildTwoReplicaDeltas(tagged);
	return mergeReplicaDeltas(deltaFromA, deltaFromB, true);
}

describe('tunnel (deep offline editing)', () => {
	it('reconnects after 50 offline edits per client without losing data', () => {
		const opsA = sampleEditorOperations(TUNNEL_OP_COUNT, 42).map(op => ({ ...op, clientId: 0 as const }));
		const opsB = sampleEditorOperations(TUNNEL_OP_COUNT, 99).map(op => ({ ...op, clientId: 1 as const }));

		const network = new YjsSyncNetwork();
		const clientA = new CollaborationTestClient(network, 'A');
		const clientB = new CollaborationTestClient(network, 'B');

		try {
			clientA.connect();
			clientB.connect();

			network.partition('A');

			clientA.applyOps(opsA);
			clientB.applyOps(opsB);

			expect(network.isPartitioned('A')).toBe(true);
			expect(network.messageQueue.pendingCount).toBeGreaterThan(0);

			clientA.reconnect();
			network.drain();
			clientB.reconnect();
			network.resyncAllClients();
			network.drain();

			const groundTruth = buildGroundTruthDoc(opsA, opsB);

			expectDocumentsEqual(clientA.ydoc, clientB.ydoc);
			expectDocumentsEqual(clientA.ydoc, groundTruth);
			expectDocumentHealthy(clientA.ydoc);
			expectDocumentHealthy(clientB.ydoc);

			groundTruth.destroy();
		} finally {
			clientA.destroy();
			clientB.destroy();
			network.destroy();
		}
	});
});
