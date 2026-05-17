import type { Editor } from '@tiptap/core';
import * as Y from 'yjs';

import { applyEditorOperation, type EditorOperation } from '@/test/collaboration/editorOperations';
import { createCollaborationEditor, createDocFromBaseState } from '@/test/collaboration/harness';

import { YjsSyncNetwork, type NetworkClientId } from '@/test/collaboration/network/yjsSyncNetwork';

export class CollaborationTestClient {
	readonly clientId: NetworkClientId;
	readonly ydoc: Y.Doc;
	readonly editor: Editor;

	constructor(
		private readonly network: YjsSyncNetwork,
		clientId: NetworkClientId,
		ydoc: Y.Doc = createDocFromBaseState()
	) {
		this.clientId = clientId;
		this.ydoc = ydoc;
		this.editor = createCollaborationEditor(ydoc);
		this.network.registerClient(clientId, ydoc);
	}

	connect(): void {
		this.network.connect(this.clientId);
	}

	partition(): void {
		this.network.partition(this.clientId);
	}

	reconnect(): void {
		this.network.reconnect(this.clientId);
	}

	applyOps(ops: readonly EditorOperation[]): void {
		for (const op of ops) {
			applyEditorOperation(this.editor, op);
		}
	}

	destroy(): void {
		this.editor.destroy();
		this.network.unregisterClient(this.clientId);
		this.ydoc.destroy();
	}
}
