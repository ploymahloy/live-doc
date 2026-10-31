import * as fc from 'fast-check';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import {
	applyEditorOperation,
	editorOperationsArbitrary,
	type EditorOperation
} from '@/test/collaboration/editorOperations';
import { createCollaborationEditor, getCollaborationBaseState } from '@/test/collaboration/harness';

import { MemoryDocumentStore } from './memoryStore';

const PROPERTY_RUNS = 100;

function fragmentOf(state: Uint8Array): string {
	const doc = new Y.Doc();
	try {
		Y.applyUpdate(doc, state);
		return doc.getXmlFragment('default').toString();
	} finally {
		doc.destroy();
	}
}

function sessionFromOps(ops: readonly EditorOperation[]): {
	initial: Uint8Array;
	updates: Uint8Array[];
	final: Uint8Array;
} {
	const ydoc = new Y.Doc();
	Y.applyUpdate(ydoc, getCollaborationBaseState());
	const editor = createCollaborationEditor(ydoc);
	const initial = Y.encodeStateAsUpdate(ydoc);
	const updates: Uint8Array[] = [];
	const onUpdate = (update: Uint8Array) => {
		updates.push(new Uint8Array(update));
	};
	ydoc.on('update', onUpdate);
	try {
		for (const op of ops) {
			applyEditorOperation(editor, op);
		}
		return { initial, updates, final: Y.encodeStateAsUpdate(ydoc) };
	} finally {
		ydoc.off('update', onUpdate);
		editor.destroy();
		ydoc.destroy();
	}
}

describe('MemoryDocumentStore', () => {
	it('replays random updates through compact without changing content', async () => {
		await fc.assert(
			fc.asyncProperty(editorOperationsArbitrary, async (ops) => {
				const session = sessionFromOps(ops);
				fc.pre(session.updates.length > 0);

				const store = new MemoryDocumentStore();
				const name = 'property-doc';
				await store.appendUpdate(name, session.initial);

				const pivot = Math.floor(session.updates.length / 2);
				for (const update of session.updates.slice(0, pivot)) {
					await store.appendUpdate(name, update);
				}
				await store.compact(name);

				for (const update of session.updates.slice(pivot)) {
					await store.appendUpdate(name, update);
				}
				await store.compact(name);

				const loaded = await store.load(name);
				expect(loaded).not.toBeNull();
				expect(fragmentOf(loaded!)).toBe(fragmentOf(session.final));
				expect(await store.pendingUpdateCount(name)).toBe(0);
				expect(await store.pendingUpdateCount(name)).toBe(0);
				await store.close();
			}),
			{ numRuns: PROPERTY_RUNS }
		);
	});

	it('leaves the update log intact when compact throws before commit', async () => {
		const session = sessionFromOps([{ kind: 'insertText', text: 'kept', pos: 0 }]);
		expect(session.updates.length).toBeGreaterThan(0);

		const store = new MemoryDocumentStore();
		const name = 'rollback-doc';
		await store.appendUpdate(name, session.initial);
		for (const update of session.updates) {
			await store.appendUpdate(name, update);
		}
		const pendingBefore = await store.pendingUpdateCount(name);
		store.mergeState = () => {
			throw new Error('compact failed');
		};

		await expect(store.compact(name)).rejects.toThrow('compact failed');

		expect(await store.pendingUpdateCount(name)).toBe(pendingBefore);
		const loaded = await store.load(name);
		expect(loaded).not.toBeNull();
		expect(fragmentOf(loaded!)).toBe(fragmentOf(session.final));
		await store.close();
	});

	it('returns null for an unknown document', async () => {
		const store = new MemoryDocumentStore();
		expect(await store.load('missing')).toBeNull();
		await expect(store.compact('missing')).resolves.toBeUndefined();
		await store.close();
	});
});
