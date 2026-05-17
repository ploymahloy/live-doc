import * as fc from 'fast-check';
import { describe, it } from 'vitest';

import { expectDocumentsEqual } from '@/test/collaboration/assertConverged';
import { expectDocumentHealthy } from '@/test/collaboration/documentHealth';
import {
	editorOperationsArbitrary,
	recordSequentialUpdates,
	sampleEditorOperations,
	type TaggedEditorOperation
} from '@/test/collaboration/editorOperations';
import { applyUpdates, createDocFromBaseState } from '@/test/collaboration/harness';
import { CollaborationTestClient } from '@/test/collaboration/network/collaborationTestClient';
import { DeferredMessageQueue } from '@/test/collaboration/network/deferredMessageQueue';
import { YjsSyncNetwork } from '@/test/collaboration/network/yjsSyncNetwork';

const PROPERTY_RUNS = 50;

function sequentialOracle(ops: readonly TaggedEditorOperation[] | ReturnType<typeof sampleEditorOperations>) {
	const doc = createDocFromBaseState();
	const updates = recordSequentialUpdates(ops);
	applyUpdates(doc, updates);
	return doc;
}

describe('network chaos', () => {
	it('delayed and shuffled delivery still converges', () => {
		fc.assert(
			fc.property(editorOperationsArbitrary, fc.integer(), fc.integer({ min: 0, max: 80 }), (ops, seed, baseDelay) => {
				fc.pre(ops.length > 0);

				const queue = new DeferredMessageQueue({ baseDelayMs: baseDelay, jitterMs: 40 });
				const network = new YjsSyncNetwork({ queue });
				network.configureDelivery({ baseDelayMs: baseDelay, jitterMs: 40 });

				const clientA = new CollaborationTestClient(network, 'A');
				const clientB = new CollaborationTestClient(network, 'B');

				try {
					clientA.connect();
					clientB.connect();
					network.drain();

					network.partition('B');
					clientA.applyOps(ops);
					network.messageQueue.reorderPending();
					clientB.reconnect();
					network.drain();

					const oracle = sequentialOracle(ops);
					expectDocumentsEqual(clientA.ydoc, clientB.ydoc);
					expectDocumentsEqual(clientA.ydoc, oracle);
					expectDocumentHealthy(clientA.ydoc);
					oracle.destroy();
				} finally {
					clientA.destroy();
					clientB.destroy();
					network.destroy();
				}

				return true;
			}),
			{ numRuns: PROPERTY_RUNS }
		);
	});

	it('mid-stream partition and heal converges', () => {
		fc.assert(
			fc.property(fc.integer({ min: 10, max: 30 }), fc.integer(), (opCount, seed) => {
				const opsA = sampleEditorOperations(opCount, seed).map(op => ({ ...op, clientId: 0 as const }));
				const opsB = sampleEditorOperations(opCount, seed + 1).map(op => ({ ...op, clientId: 1 as const }));
				const firstHalf = Math.floor(opCount / 2);
				const opsAFirst = opsA.slice(0, firstHalf);
				const opsASecond = opsA.slice(firstHalf);
				const opsBFirst = opsB.slice(0, firstHalf);
				const opsBSecond = opsB.slice(firstHalf);

				const network = new YjsSyncNetwork();
				const clientA = new CollaborationTestClient(network, 'A');
				const clientB = new CollaborationTestClient(network, 'B');

				try {
					clientA.connect();
					clientB.connect();

					clientA.applyOps(opsAFirst);
					clientB.applyOps(opsBFirst);
					network.drain();

					network.partition('A');
					clientA.applyOps(opsASecond);
					clientB.applyOps(opsBSecond);

					clientA.reconnect();
					network.drain();
					clientB.reconnect();
					network.resyncAllClients();
					network.drain();

					expectDocumentsEqual(clientA.ydoc, clientB.ydoc);
					expectDocumentsEqual(clientA.ydoc, network.hubDoc);
					expectDocumentHealthy(clientA.ydoc);
				} finally {
					clientA.destroy();
					clientB.destroy();
					network.destroy();
				}

				return true;
			}),
			{ numRuns: PROPERTY_RUNS }
		);
	});
});
