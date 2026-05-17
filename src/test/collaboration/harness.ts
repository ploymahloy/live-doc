import { Editor } from '@tiptap/core';
import { Random } from 'fast-check';
import { xorshift128plus } from 'pure-rand/generator/xorshift128plus';
import * as Y from 'yjs';

import {
	getCollaborationEditorExtensions,
	INITIAL_COLLABORATION_HTML,
	seedCollaborationFragmentIfEmpty
} from '@/lib/collaborationEditor';

export type DocumentSnapshot = {
	stateUpdate: Uint8Array;
};

let cachedBaseState: Uint8Array | undefined;

/** Shared starting document (initial HTML seeded into the Y fragment). */
export function getCollaborationBaseState(): Uint8Array {
	if (cachedBaseState) {
		return cachedBaseState;
	}

	const ydoc = new Y.Doc();
	const editor = new Editor({
		extensions: getCollaborationEditorExtensions(ydoc),
		content: INITIAL_COLLABORATION_HTML
	});
	seedCollaborationFragmentIfEmpty(ydoc, html => {
		editor.commands.setContent(html);
	});
	editor.destroy();
	cachedBaseState = Y.encodeStateAsUpdate(ydoc);
	ydoc.destroy();
	return cachedBaseState;
}

export function createCollaborationEditor(ydoc: Y.Doc): Editor {
	const editor = new Editor({
		extensions: getCollaborationEditorExtensions(ydoc),
		content: INITIAL_COLLABORATION_HTML
	});

	seedCollaborationFragmentIfEmpty(ydoc, html => {
		editor.commands.setContent(html);
	});

	return editor;
}

export function createDocFromBaseState(): Y.Doc {
	const doc = new Y.Doc();
	Y.applyUpdate(doc, getCollaborationBaseState());
	return doc;
}

export function captureUpdates(ydoc: Y.Doc, fn: () => void): Uint8Array[] {
	const updates: Uint8Array[] = [];
	const onUpdate = (update: Uint8Array) => {
		updates.push(update);
	};

	ydoc.on('update', onUpdate);
	try {
		fn();
	} finally {
		ydoc.off('update', onUpdate);
	}

	return updates;
}

export function mergeCapturedUpdates(updates: readonly Uint8Array[]): Uint8Array {
	if (updates.length === 0) {
		return new Uint8Array();
	}

	if (updates.length === 1) {
		return updates[0]!;
	}

	return Y.mergeUpdates(updates as Uint8Array[]);
}

export function applyUpdates(doc: Y.Doc, updates: readonly Uint8Array[]): void {
	for (const update of updates) {
		if (update.length > 0) {
			Y.applyUpdate(doc, update);
		}
	}
}

export function shuffleUpdatesWithSeed(updates: readonly Uint8Array[], seed: number): Uint8Array[] {
	return shuffleUpdates(updates, new Random(xorshift128plus(seed)));
}

export function shuffleUpdates(updates: readonly Uint8Array[], rng: Random): Uint8Array[] {
	const shuffled = [...updates];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = rng.nextInt(0, i);
		[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
	}
	return shuffled;
}

export function snapshotDocument(ydoc: Y.Doc): DocumentSnapshot {
	return {
		stateUpdate: Y.encodeStateAsUpdate(ydoc)
	};
}

export function updatesAreEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}

export function snapshotsAreEqual(a: DocumentSnapshot, b: DocumentSnapshot): boolean {
	return updatesAreEqual(a.stateUpdate, b.stateUpdate);
}
