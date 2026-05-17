import * as Y from 'yjs';

import { getCollaborationBaseState, snapshotDocument } from '@/test/collaboration/harness';

/** Max encoded state size relative to base document (guards runaway struct growth). */
const MAX_STATE_SIZE_MULTIPLIER = 50;

export function expectDocumentHealthy(doc: Y.Doc): void {
	const snapshot = snapshotDocument(doc);
	if (snapshot.stateUpdate.length === 0) {
		throw new Error('Document snapshot is empty');
	}

	const baseSize = getCollaborationBaseState().byteLength;
	const maxSize = baseSize * MAX_STATE_SIZE_MULTIPLIER;
	if (snapshot.stateUpdate.byteLength > maxSize) {
		throw new Error(
			`Document state size ${snapshot.stateUpdate.byteLength} exceeds bound ${maxSize} (${MAX_STATE_SIZE_MULTIPLIER}x base)`
		);
	}
}
