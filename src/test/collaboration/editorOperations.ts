import type { Editor } from '@tiptap/core';
import * as fc from 'fast-check';
import * as Y from 'yjs';

import {
	captureUpdates,
	createCollaborationEditor,
	createDocFromBaseState,
	getCollaborationBaseState,
	mergeCapturedUpdates
} from '@/test/collaboration/harness';

export type ClientId = 0 | 1;

export type EditorOperation =
	| { kind: 'insertText'; text: string; pos: number }
	| { kind: 'deleteRange'; from: number; to: number }
	| { kind: 'toggleBold' }
	| { kind: 'toggleItalic' }
	| { kind: 'setHeading'; level: 1 | 2 | 3 | null }
	| { kind: 'toggleCodeBlock' };

export type TaggedEditorOperation = EditorOperation & { clientId: ClientId };

type ReferenceModel = {
	text: string;
};

function clampPos(model: ReferenceModel, pos: number): number {
	if (model.text.length === 0) {
		return 0;
	}
	return Math.max(0, Math.min(pos, model.text.length));
}

function runReference(model: ReferenceModel, op: EditorOperation): boolean {
	switch (op.kind) {
		case 'insertText': {
			const pos = clampPos(model, op.pos);
			model.text = model.text.slice(0, pos) + op.text + model.text.slice(pos);
			return true;
		}
		case 'deleteRange': {
			const from = clampPos(model, op.from);
			const to = clampPos(model, op.to);
			if (from >= to) {
				return false;
			}
			model.text = model.text.slice(0, from) + model.text.slice(to);
			return true;
		}
		case 'toggleBold':
		case 'toggleItalic':
		case 'setHeading':
		case 'toggleCodeBlock':
			return true;
		default:
			return false;
	}
}

function pickOperation(gen: fc.GeneratorValue, model: ReferenceModel): EditorOperation {
	const kind = gen(fc.integer, { min: 0, max: 5 });
	switch (kind) {
		case 0: {
			const text = gen(fc.stringMatching, /^[a-zA-Z0-9]{1,20}$/);
			const pos = model.text.length === 0 ? 0 : gen(fc.integer, { min: 0, max: model.text.length });
			return { kind: 'insertText', text, pos };
		}
		case 1: {
			if (model.text.length < 2) {
				return { kind: 'toggleBold' };
			}
			const from = gen(fc.integer, { min: 0, max: model.text.length - 1 });
			const to = gen(fc.integer, { min: from + 1, max: model.text.length });
			return { kind: 'deleteRange', from, to };
		}
		case 2:
			return { kind: 'toggleBold' };
		case 3:
			return { kind: 'toggleItalic' };
		case 4: {
			const level = gen(fc.constantFrom, 1, 2, 3, null);
			return { kind: 'setHeading', level };
		}
		default:
			return { kind: 'toggleCodeBlock' };
	}
}

function generateOperations(gen: fc.GeneratorValue, count: number): EditorOperation[] {
	const model: ReferenceModel = { text: '' };
	const ops: EditorOperation[] = [];

	for (let i = 0; i < count; i++) {
		const op = pickOperation(gen, model);
		if (runReference(model, op)) {
			ops.push(op);
		}
	}

	return ops;
}

export function applyEditorOperation(editor: Editor, op: EditorOperation): boolean {
	const size = editor.state.doc.content.size;
	const clampEditorPos = (pos: number) => Math.max(0, Math.min(pos, size));

	switch (op.kind) {
		case 'insertText': {
			const pos = clampEditorPos(op.pos);
			return editor.chain().focus().insertContentAt(pos, op.text).run();
		}
		case 'deleteRange': {
			const from = clampEditorPos(op.from);
			const to = clampEditorPos(op.to);
			if (from >= to) {
				return false;
			}
			return editor.chain().focus().deleteRange({ from, to }).run();
		}
		case 'toggleBold':
			return editor.chain().focus().toggleBold().run();
		case 'toggleItalic':
			return editor.chain().focus().toggleItalic().run();
		case 'setHeading': {
			if (op.level === null) {
				return editor.chain().focus().setParagraph().run();
			}
			return editor.chain().focus().toggleHeading({ level: op.level }).run();
		}
		case 'toggleCodeBlock':
			return editor.chain().focus().toggleCodeBlock().run();
		default:
			return false;
	}
}

export const editorOperationsArbitrary: fc.Arbitrary<EditorOperation[]> = fc
	.integer({ min: 50, max: 200 })
	.chain(count => fc.gen().map(gen => generateOperations(gen, count)));

export const editorOperationsCountArbitrary = (count: number): fc.Arbitrary<EditorOperation[]> =>
	fc.gen().map(gen => generateOperations(gen, count));

export function sampleEditorOperations(count: number, seed: number): EditorOperation[] {
	return fc.sample(editorOperationsCountArbitrary(count), { seed, numRuns: 1 })[0] ?? [];
}

export const taggedEditorOperationsArbitrary: fc.Arbitrary<TaggedEditorOperation[]> = editorOperationsArbitrary.chain(
	ops =>
		fc.gen().map(gen =>
			ops.map(op => ({
				...op,
				clientId: gen(fc.constantFrom, 0, 1) as ClientId
			}))
		)
);

/** One Yjs update per op, each computed from the same base document (concurrent edits). */
export function recordConcurrentUpdates(ops: readonly EditorOperation[]): Uint8Array[] {
	const baseState = getCollaborationBaseState();
	const updates: Uint8Array[] = [];

	for (const op of ops) {
		const doc = new Y.Doc();
		Y.applyUpdate(doc, baseState);
		const editor = createCollaborationEditor(doc);
		const captured = captureUpdates(doc, () => {
			applyEditorOperation(editor, op);
		});
		editor.destroy();
		doc.destroy();

		const merged = mergeCapturedUpdates(captured);
		if (merged.length > 0) {
			updates.push(merged);
		}
	}

	return updates;
}

export function recordSequentialUpdates(ops: readonly EditorOperation[]): Uint8Array[] {
	const ydoc = new Y.Doc();
	Y.applyUpdate(ydoc, getCollaborationBaseState());
	const editor = createCollaborationEditor(ydoc);
	const updates: Uint8Array[] = [];

	const onUpdate = (update: Uint8Array) => {
		updates.push(update);
	};
	ydoc.on('update', onUpdate);

	try {
		for (const op of ops) {
			applyEditorOperation(editor, op);
		}
	} finally {
		ydoc.off('update', onUpdate);
		editor.destroy();
		ydoc.destroy();
	}

	return updates;
}

export type TwoReplicaDeltas = {
	deltaFromA: Uint8Array;
	deltaFromB: Uint8Array;
};

/** Each client edits locally; deltas are encoded relative to the shared base state vector. */
export function buildTwoReplicaDeltas(ops: readonly TaggedEditorOperation[]): TwoReplicaDeltas {
	const docA = createDocFromBaseState();
	const docB = createDocFromBaseState();
	const editorA = createCollaborationEditor(docA);
	const editorB = createCollaborationEditor(docB);

	try {
		for (const op of ops) {
			if (op.clientId === 0) {
				applyEditorOperation(editorA, op);
			} else {
				applyEditorOperation(editorB, op);
			}
		}
	} finally {
		editorA.destroy();
		editorB.destroy();
	}

	const baseDoc = new Y.Doc();
	Y.applyUpdate(baseDoc, getCollaborationBaseState());
	const baseVector = Y.encodeStateVector(baseDoc);

	const deltaFromA = Y.encodeStateAsUpdate(docA, baseVector);
	const deltaFromB = Y.encodeStateAsUpdate(docB, baseVector);

	docA.destroy();
	docB.destroy();
	baseDoc.destroy();

	return { deltaFromA, deltaFromB };
}

export function mergeReplicaDeltas(deltaFromA: Uint8Array, deltaFromB: Uint8Array, applyAFirst: boolean): Y.Doc {
	const doc = createDocFromBaseState();

	if (applyAFirst) {
		if (deltaFromA.length > 0) {
			Y.applyUpdate(doc, deltaFromA);
		}
		if (deltaFromB.length > 0) {
			Y.applyUpdate(doc, deltaFromB);
		}
	} else {
		if (deltaFromB.length > 0) {
			Y.applyUpdate(doc, deltaFromB);
		}
		if (deltaFromA.length > 0) {
			Y.applyUpdate(doc, deltaFromA);
		}
	}

	return doc;
}
