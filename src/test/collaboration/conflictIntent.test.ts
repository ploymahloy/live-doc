import type { Editor } from '@tiptap/core';
import { describe, it } from 'vitest';

import { expectDocumentsEqual } from '@/test/collaboration/assertConverged';
import {
	type EditorOperation,
	recordConcurrentUpdates
} from '@/test/collaboration/editorOperations';
import { createCollaborationEditor, createDocFromBaseState } from '@/test/collaboration/harness';
import { CollaborationTestClient } from '@/test/collaboration/network/collaborationTestClient';
import { YjsSyncNetwork } from '@/test/collaboration/network/yjsSyncNetwork';
import { expectEditorHtmlEqual } from '@/test/collaboration/snapshotHtml';

type ParagraphRange = {
	from: number;
	to: number;
	insertPos: number;
};

/** Targets the main body paragraph in the seed document (the only `<p>` block). */
function findBodyParagraphRange(editor: Editor): ParagraphRange {
	let from = 0;
	let to = 0;
	let insertPos = 0;
	let found = false;

	editor.state.doc.descendants((node, pos) => {
		if (node.type.name !== 'paragraph') {
			return;
		}
		from = pos + 1;
		to = pos + node.nodeSize - 1;
		insertPos = from + Math.floor((to - from) / 2);
		found = true;
	});

	if (!found) {
		throw new Error('Expected a paragraph in seed document');
	}

	return { from, to, insertPos };
}

function wireUpdateForOp(op: EditorOperation): Uint8Array {
	const updates = recordConcurrentUpdates([op]);
	return updates[0] ?? new Uint8Array();
}

function runConflictScenario(deliverDeleteFirst: boolean): void {
	const probeDoc = createDocFromBaseState();
	const probeEditor = createCollaborationEditor(probeDoc);
	const { from, to, insertPos } = findBodyParagraphRange(probeEditor);
	probeEditor.destroy();
	probeDoc.destroy();

	const insertOp: EditorOperation = { kind: 'insertText', text: 'LAG', pos: insertPos };
	const deleteOp: EditorOperation = { kind: 'deleteRange', from, to };

	const insertUpdate = wireUpdateForOp(insertOp);
	const deleteUpdate = wireUpdateForOp(deleteOp);

	const network = new YjsSyncNetwork();
	const clientA = new CollaborationTestClient(network, 'A');
	const clientB = new CollaborationTestClient(network, 'B');

	try {
		clientA.connect();
		clientB.connect();
		network.drain();

		if (deliverDeleteFirst) {
			network.injectUpdate('B', deleteUpdate);
			network.injectUpdate('A', insertUpdate);
		} else {
			network.injectUpdate('A', insertUpdate);
			network.injectUpdate('B', deleteUpdate);
		}

		network.drain();
		network.resyncAllClients();
		network.drain();

		expectDocumentsEqual(clientA.ydoc, clientB.ydoc);
		expectDocumentsEqual(clientA.ydoc, network.hubDoc);
		// Both editors reflect the same merged CRDT outcome (Yjs may retain lagging inserts as orphaned content).
		expectEditorHtmlEqual(clientA.editor, clientB.editor);
	} finally {
		clientA.destroy();
		clientB.destroy();
		network.destroy();
	}
}

describe('conflict intent (delete vs late insert)', () => {
	it('converges when paragraph delete is delivered before a lagging insert', () => {
		runConflictScenario(true);
	});

	it('converges when insert arrives before paragraph delete', () => {
		runConflictScenario(false);
	});
});
