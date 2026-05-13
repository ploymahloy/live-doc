import { Server } from '@hocuspocus/server';

const port = Number(process.env.HOCUSPOCUS_PORT ?? '1234') || 1234;

const server = new Server({
	name: 'live-doc-hocuspocus',
	port
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
