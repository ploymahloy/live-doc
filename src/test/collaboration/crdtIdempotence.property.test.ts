import * as fc from 'fast-check';
import * as Y from 'yjs';
import { describe, it } from 'vitest';

import { expectSnapshotUnchanged } from '@/test/collaboration/assertConverged';
import { editorOperationsArbitrary, recordSequentialUpdates } from '@/test/collaboration/editorOperations';
import {
	applyUpdates,
	createDocFromBaseState,
	getCollaborationBaseState,
	snapshotDocument
} from '@/test/collaboration/harness';

const PROPERTY_RUNS = 100;

describe('CRDT idempotence', () => {
	it('re-applying the full update log does not change document state', () => {
		fc.assert(
			fc.property(editorOperationsArbitrary, ops => {
				const updates = recordSequentialUpdates(ops);
				fc.pre(updates.length > 0);

				const doc = createDocFromBaseState();
				applyUpdates(doc, updates);
				const before = snapshotDocument(doc);

				applyUpdates(doc, updates);
				const after = snapshotDocument(doc);

				expectSnapshotUnchanged(before, after);
				doc.destroy();
				return true;
			}),
			{ numRuns: PROPERTY_RUNS }
		);
	});

	it('re-applying each update twice does not change document state', () => {
		fc.assert(
			fc.property(editorOperationsArbitrary, ops => {
				const updates = recordSequentialUpdates(ops);
				fc.pre(updates.length > 0);

				const doc = createDocFromBaseState();

				for (const update of updates) {
					Y.applyUpdate(doc, update);
					const before = snapshotDocument(doc);

					Y.applyUpdate(doc, update);
					const after = snapshotDocument(doc);

					expectSnapshotUnchanged(before, after);
				}

				doc.destroy();
				return true;
			}),
			{ numRuns: PROPERTY_RUNS }
		);
	});

	it('burst duplicate delivery of a single update is a no-op', () => {
		fc.assert(
			fc.property(editorOperationsArbitrary, fc.integer({ min: 2, max: 5 }), (ops, duplicateCount) => {
				const updates = recordSequentialUpdates(ops);
				fc.pre(updates.length > 0);

				const doc = createDocFromBaseState();

				for (const update of updates) {
					Y.applyUpdate(doc, update);
					const before = snapshotDocument(doc);

					for (let i = 0; i < duplicateCount; i++) {
						Y.applyUpdate(doc, update);
					}

					const after = snapshotDocument(doc);
					expectSnapshotUnchanged(before, after);
				}

				doc.destroy();
				return true;
			}),
			{ numRuns: PROPERTY_RUNS }
		);
	});

	it('re-applying the base state snapshot is a no-op', () => {
		const doc = new Y.Doc();
		Y.applyUpdate(doc, getCollaborationBaseState());
		const before = snapshotDocument(doc);

		Y.applyUpdate(doc, getCollaborationBaseState());
		const after = snapshotDocument(doc);

		expectSnapshotUnchanged(before, after);
		doc.destroy();
	});
});
