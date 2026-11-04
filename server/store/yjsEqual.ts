import * as Y from 'yjs';

/** Yjs encodes "nothing to sync" as a 2-byte empty update, not a zero-length array. */
function isEmptyUpdate(update: Uint8Array): boolean {
	return update.byteLength === 0 || (update.byteLength === 2 && update[0] === 0 && update[1] === 0);
}

export function yjsStatesEqual(left: Uint8Array, right: Uint8Array): boolean {
	const docA = new Y.Doc();
	const docB = new Y.Doc();
	try {
		Y.applyUpdate(docA, left);
		Y.applyUpdate(docB, right);
		return (
			isEmptyUpdate(Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB))) &&
			isEmptyUpdate(Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)))
		);
	} finally {
		docA.destroy();
		docB.destroy();
	}
}
