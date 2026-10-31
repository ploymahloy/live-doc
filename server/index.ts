import { readCollabJwtSecret } from './auth/capabilityToken';
import { createCollabServer, type CollabServerHandle } from './collabServer';
import { migrate } from './db/migrate';
import { createPostgresPool, readPositiveInt } from './db/pool';
import { createRailwayBudgetGuard, type RailwayBudgetGuard } from './railwayBudget';
import { shutdownCollab } from './shutdown';
import { PostgresDocumentStore } from './store/postgresStore';

const port = Number(process.env.PORT ?? process.env.HOCUSPOCUS_PORT ?? '1234') || 1234;

let budgetGuard: RailwayBudgetGuard | null = null;
let collab: CollabServerHandle | null = null;
let shuttingDown = false;

async function shutdown(): Promise<void> {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	await shutdownCollab({ collab, budgetGuard });
}

process.on('SIGINT', () => {
	void shutdown();
});
process.on('SIGTERM', () => {
	void shutdown();
});

async function main(): Promise<void> {
	budgetGuard = createRailwayBudgetGuard({
		onExceeded: () => shutdown()
	});
	const budget = await budgetGuard.boot();
	if (budget.exceeded) {
		// Exit 0 so Railway's on_failure policy does not restart the container
		// into another billing loop. A later wake re-reads the ledger and exits again.
		process.exit(0);
	}
	budgetGuard.start();

	const secret = readCollabJwtSecret();
	const pool = createPostgresPool();
	await migrate(pool);
	const store = new PostgresDocumentStore(pool);
	collab = createCollabServer({
		store,
		port,
		auth: { secret },
		compactAfterUpdates: readPositiveInt(process.env.DOCUMENT_COMPACT_AFTER_UPDATES, 100)
	});
	await collab.listen();
}

void main().catch((error: unknown) => {
	console.error('[live-doc] Failed to start:', error);
	process.exit(1);
});
