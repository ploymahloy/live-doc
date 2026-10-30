import * as Y from 'yjs';

/** Apply a snapshot and later updates, returning one state update. */
export function mergeSnapshotAndUpdates(
	snapshot: Uint8Array | null,
	updates: readonly Uint8Array[]
): Uint8Array {
	const doc = new Y.Doc();
	try {
		if (snapshot && snapshot.byteLength > 0) {
			Y.applyUpdate(doc, snapshot);
		}
		for (const update of updates) {
			if (update.byteLength > 0) {
				Y.applyUpdate(doc, update);
			}
		}
		return Y.encodeStateAsUpdate(doc);
	} finally {
		doc.destroy();
	}
}
