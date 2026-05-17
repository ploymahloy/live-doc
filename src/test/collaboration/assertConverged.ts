import type * as Y from 'yjs';

import { snapshotDocument, snapshotsAreEqual, type DocumentSnapshot } from '@/test/collaboration/harness';

export function expectDocumentsEqual(docA: Y.Doc, docB: Y.Doc): void {
	const snapshotA = snapshotDocument(docA);
	const snapshotB = snapshotDocument(docB);

	if (!snapshotsAreEqual(snapshotA, snapshotB)) {
		throw new Error(formatSnapshotMismatch(snapshotA, snapshotB));
	}
}

export function expectSnapshotUnchanged(before: DocumentSnapshot, after: DocumentSnapshot): void {
	if (!snapshotsAreEqual(before, after)) {
		throw new Error(formatSnapshotMismatch(before, after));
	}
}

function formatSnapshotMismatch(a: DocumentSnapshot, b: DocumentSnapshot): string {
	return [
		'Documents did not converge to the same state.',
		`stateUpdate lengths: ${a.stateUpdate.length} vs ${b.stateUpdate.length}`
	].join('\n');
}
