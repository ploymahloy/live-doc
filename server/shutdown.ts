import type { CollabServerHandle } from './collabServer';
import { readPositiveInt } from './db/pool';

type Stoppable = {
	stop: () => Promise<void>;
};

export type ShutdownCollabOptions = {
	collab: CollabServerHandle | null;
	budgetGuard?: Stoppable | null;
	timeoutMs?: number;
	/** When false, return instead of ending the process. Tests use this. */
	exit?: boolean;
	exitProcess?: (code: number) => void;
};

async function withTimeout(work: Promise<void>, timeoutMs: number): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(new Error(`shutdown flush timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});
	try {
		await Promise.race([work, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

async function compactLoaded(collab: CollabServerHandle): Promise<void> {
	const names = [...collab.server.hocuspocus.documents.keys()];
	for (const name of names) {
		await collab.store.compact(name);
	}
}

/**
 * Stop the budget guard, wait for appends that have already started, compact
 * loaded documents, then close the server and the store. SIGTERM must not
 * exit while those writes are still running.
 */
export async function shutdownCollab(options: ShutdownCollabOptions): Promise<void> {
	const shouldExit = options.exit !== false;
	const exitProcess = options.exitProcess ?? ((code: number) => process.exit(code));
	const timeoutMs = options.timeoutMs ?? readPositiveInt(process.env.SHUTDOWN_FLUSH_TIMEOUT_MS, 10_000);

	const work = async (): Promise<void> => {
		await options.budgetGuard?.stop();
		const collab = options.collab;
		if (!collab) {
			return;
		}
		await collab.flushPendingWrites();
		await compactLoaded(collab);
		await collab.destroy();
		await collab.flushPendingWrites();
		await compactLoaded(collab);
		await collab.store.close();
	};

	try {
		await withTimeout(work(), timeoutMs);
	} catch (error) {
		console.error('[live-doc] Shutdown failed:', error);
		if (shouldExit) {
			exitProcess(1);
			return;
		}
		throw error;
	}

	if (shouldExit) {
		exitProcess(0);
	}
}
