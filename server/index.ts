import { Server } from '@hocuspocus/server';

import {
	awarenessCursorSchema,
	collaboratorIdentityWireSchema,
	warnInvalidAwareness
} from '../src/lib/collaborationMetadataSchemas';

const port = Number(process.env.HOCUSPOCUS_PORT ?? '1234') || 1234;

const server = new Server({
	name: 'live-doc-hocuspocus',
	port,
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
	await server.destroy();
	process.exit(0);
}

process.on('SIGINT', () => {
	void shutdown();
});
process.on('SIGTERM', () => {
	void shutdown();
});
