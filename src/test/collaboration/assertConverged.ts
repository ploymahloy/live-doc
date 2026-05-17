import type * as Y from 'yjs';

import { COLLAB_FIELD } from '@/lib/collaborationEditor';
import { snapshotDocument, snapshotsAreEqual, type DocumentSnapshot } from '@/test/collaboration/harness';

export function expectDocumentsEqual(docA: Y.Doc, docB: Y.Doc): void {
	const snapshotA = snapshotDocument(docA);
	const snapshotB = snapshotDocument(docB);

	if (snapshotsAreEqual(snapshotA, snapshotB)) {
		return;
	}

	const fragmentA = docA.getXmlFragment(COLLAB_FIELD).toString();
	const fragmentB = docB.getXmlFragment(COLLAB_FIELD).toString();
	if (fragmentA === fragmentB) {
		return;
	}

	throw new Error(formatSnapshotMismatch(snapshotA, snapshotB, fragmentA, fragmentB));
}

export function expectSnapshotUnchanged(before: DocumentSnapshot, after: DocumentSnapshot): void {
	if (!snapshotsAreEqual(before, after)) {
		throw new Error(formatSnapshotMismatch(before, after));
	}
}

function formatSnapshotMismatch(
	a: DocumentSnapshot,
	b: DocumentSnapshot,
	fragmentA?: string,
	fragmentB?: string
): string {
	const lines = [
		'Documents did not converge to the same state.',
		`stateUpdate lengths: ${a.stateUpdate.length} vs ${b.stateUpdate.length}`
	];
	if (fragmentA !== undefined && fragmentB !== undefined) {
		lines.push(`fragment lengths: ${fragmentA.length} vs ${fragmentB.length}`);
	}
	return lines.join('\n');
}
