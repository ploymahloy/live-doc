import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';

import {
	awarenessCursorSchema,
	collaboratorIdentityWireSchema,
	warnInvalidAwareness
} from '../src/lib/collaborationMetadataSchemas';

const port = Number(process.env.PORT ?? process.env.HOCUSPOCUS_PORT ?? '1234') || 1234;
const documentsDir = path.join(process.cwd(), 'data', 'documents');

/** Debounce timers per document name for file writes. */
const storeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const STORE_DEBOUNCE_MS = 2000;

function documentPath(documentName: string): string {
	const safeName = documentName.replace(/[^a-zA-Z0-9_-]/g, '_');
	return path.join(documentsDir, `${safeName}.bin`);
}

async function ensureDocumentsDir(): Promise<void> {
	await mkdir(documentsDir, { recursive: true });
}

async function loadDocumentFromDisk(documentName: string, document: Y.Doc): Promise<void> {
	await ensureDocumentsDir();
	const filePath = documentPath(documentName);
	try {
		const data = await readFile(filePath);
		Y.applyUpdate(document, new Uint8Array(data));
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code !== 'ENOENT') {
			console.error(`[live-doc] Failed to load document "${documentName}":`, err);
		}
	}
}

function scheduleStoreDocument(documentName: string, document: Y.Doc): void {
	const existing = storeTimers.get(documentName);
	if (existing) {
		clearTimeout(existing);
	}

	storeTimers.set(
		documentName,
		setTimeout(() => {
			storeTimers.delete(documentName);
			void (async () => {
				try {
					await ensureDocumentsDir();
					const state = Y.encodeStateAsUpdate(document);
					await writeFile(documentPath(documentName), Buffer.from(state));
				} catch (error) {
					console.error(`[live-doc] Failed to store document "${documentName}":`, error);
				}
			})();
		}, STORE_DEBOUNCE_MS)
	);
}

const server = new Server({
	name: 'live-doc-hocuspocus',
	port,
	async onLoadDocument({ documentName, document }) {
		await loadDocumentFromDisk(documentName, document);
	},
	async onStoreDocument({ documentName, document }) {
		scheduleStoreDocument(documentName, document);
	},
	async onAwarenessUpdate({ states }) {
		for (const state of states) {
			const clientId = typeof state.clientId === 'number' ? state.clientId : -1;

			if (state.user != null) {
				const result = collaboratorIdentityWireSchema.safeParse(state.user);
				if (!result.success) {
					warnInvalidAwareness('user', clientId, result.error.issues);
				}
			}

			if (state.cursor != null) {
				const result = awarenessCursorSchema.safeParse(state.cursor);
				if (!result.success) {
					warnInvalidAwareness('cursor', clientId, result.error.issues);
				}
			}
		}
	}
});

void server.listen();

async function shutdown(): Promise<void> {
	for (const timer of storeTimers.values()) {
		clearTimeout(timer);
	}
	storeTimers.clear();
	await server.destroy();
	process.exit(0);
}

process.on('SIGINT', () => {
	void shutdown();
});
process.on('SIGTERM', () => {
	void shutdown();
});
