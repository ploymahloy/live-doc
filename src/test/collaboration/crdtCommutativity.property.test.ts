import * as fc from 'fast-check';
import { describe, it } from 'vitest';

import { expectDocumentsEqual } from '@/test/collaboration/assertConverged';
import {
	buildTwoReplicaDeltas,
	editorOperationsArbitrary,
	mergeReplicaDeltas,
	recordConcurrentUpdates,
	taggedEditorOperationsArbitrary
} from '@/test/collaboration/editorOperations';
import { applyUpdates, createDocFromBaseState, shuffleUpdatesWithSeed } from '@/test/collaboration/harness';

const PROPERTY_RUNS = 100;

function opsIncludeBothClients(ops: { clientId: 0 | 1 }[]): boolean {
	return ops.some(op => op.clientId === 0) && ops.some(op => op.clientId === 1);
}

describe('CRDT commutativity', () => {
	it('converges when concurrent Yjs updates are applied in permuted order', () => {
		fc.assert(
			fc.property(editorOperationsArbitrary, fc.integer(), (ops, seed) => {
				const updates = recordConcurrentUpdates(ops);
				fc.pre(updates.length > 1);

				const docA = createDocFromBaseState();
				const docB = createDocFromBaseState();

				applyUpdates(docA, updates);

				const shuffled = shuffleUpdatesWithSeed(updates, seed);
				applyUpdates(docB, shuffled);

				expectDocumentsEqual(docA, docB);
				docA.destroy();
				docB.destroy();
				return true;
			}),
			{ numRuns: PROPERTY_RUNS }
		);
	});

	it('two replicas converge when each client delta is applied in either order', () => {
		fc.assert(
			fc.property(taggedEditorOperationsArbitrary, ops => {
				fc.pre(opsIncludeBothClients(ops));

				const { deltaFromA, deltaFromB } = buildTwoReplicaDeltas(ops);
				fc.pre(deltaFromA.length > 0 || deltaFromB.length > 0);

				const mergedAB = mergeReplicaDeltas(deltaFromA, deltaFromB, true);
				const mergedBA = mergeReplicaDeltas(deltaFromA, deltaFromB, false);

				expectDocumentsEqual(mergedAB, mergedBA);
				mergedAB.destroy();
				mergedBA.destroy();

				return true;
			}),
			{ numRuns: PROPERTY_RUNS }
		);
	});
});
