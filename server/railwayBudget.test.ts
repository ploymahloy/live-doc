// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	RAILWAY_CPU_USD_PER_VCPU_SECOND,
	RAILWAY_EGRESS_USD_PER_GB,
	RAILWAY_FREE_PLAN_HARD_LIMIT_USD,
	RAILWAY_MEMORY_USD_PER_GB_SECOND,
	RAILWAY_VOLUME_USD_PER_GB_SECOND,
	RailwayBudgetGuard,
	accrueOfflineVolume,
	addUsage,
	directorySizeBytes,
	estimatedUsageUsd,
	freshLedger,
	parseCgroupCpuUsageSeconds,
	parseProcNetDevTransmitBytes,
	usageSince,
	type ResourceSample
} from './railwayBudget';

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'live-doc-budget-'));
	tempDirs.push(dir);
	return dir;
}

function sample(overrides: Partial<ResourceSample> = {}): ResourceSample {
	return {
		atMs: 0,
		cpuSecondsTotal: 0,
		memoryBytes: 0,
		egressBytesTotal: 0,
		volumeBytes: 0,
		...overrides
	};
}

describe('Railway usage rates', () => {
	it('prices one GB-second of memory and one vCPU-second at the published rates', () => {
		expect(RAILWAY_FREE_PLAN_HARD_LIMIT_USD).toBeLessThan(1);
		expect(
			estimatedUsageUsd({
				cpuSeconds: 1,
				memoryByteSeconds: 1_000_000_000,
				volumeByteSeconds: 1_000_000_000,
				egressBytes: 1_000_000_000
			})
		).toBeCloseTo(
			RAILWAY_CPU_USD_PER_VCPU_SECOND +
				RAILWAY_MEMORY_USD_PER_GB_SECOND +
				RAILWAY_VOLUME_USD_PER_GB_SECOND +
				RAILWAY_EGRESS_USD_PER_GB,
			12
		);
	});

	it('bills the higher memory sample across the interval so a spike is not missed', () => {
		const usd = usageSince(
			sample({ atMs: 0, memoryBytes: 100_000_000 }),
			sample({ atMs: 1_000, memoryBytes: 500_000_000 })
		);
		expect(usd).toBeCloseTo(0.5 * RAILWAY_MEMORY_USD_PER_GB_SECOND, 12);
	});

	it('ignores a counter reset instead of subtracting spend', () => {
		const usd = usageSince(
			sample({ atMs: 0, cpuSecondsTotal: 5, egressBytesTotal: 100 }),
			sample({ atMs: 1_000, cpuSecondsTotal: 1, egressBytesTotal: 40 })
		);
		expect(usd).toBe(0);
	});
});

describe('usage ledger', () => {
	it('drops buckets older than 31 days and keeps the boundary day', () => {
		const ledger = freshLedger();
		const now = Date.parse('2026-10-30T12:00:00.000Z');
		addUsage(ledger, Date.parse('2026-09-28T00:00:00.000Z'), 0.5);
		addUsage(ledger, Date.parse('2026-09-29T00:00:00.000Z'), 0.2);
		const total = addUsage(ledger, now, 0.1);

		expect(total).toBeCloseTo(0.3, 12);
		expect(ledger.buckets.map((bucket) => bucket.day)).toEqual(['2026-09-29', '2026-10-30']);
	});

	it('charges offline volume per day and lets aged days fall out of the window', () => {
		const ledger = freshLedger();
		const start = Date.parse('2026-09-01T00:00:00.000Z');
		const now = Date.parse('2026-10-30T00:00:00.000Z');
		ledger.updatedAt = new Date(start).toISOString();
		ledger.volumeBytes = 1_000_000_000;

		const total = accrueOfflineVolume(ledger, now);
		const elapsedSeconds = (now - start) / 1000;
		const chargedSeconds = 31 * 24 * 60 * 60;

		expect(total).toBeCloseTo(chargedSeconds * RAILWAY_VOLUME_USD_PER_GB_SECOND, 8);
		expect(total).toBeLessThan(elapsedSeconds * RAILWAY_VOLUME_USD_PER_GB_SECOND);
	});
});

describe('host metric parsers', () => {
	it('sums transmit bytes and skips loopback', () => {
		const text = [
			'Inter-|   Receive                                                |  Transmit',
			' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed',
			'    lo: 10 0 0 0 0 0 0 0 999 0 0 0 0 0 0 0',
			'  eth0: 1 0 0 0 0 0 0 0 50 0 0 0 0 0 0 0'
		].join('\n');

		expect(parseProcNetDevTransmitBytes(text)).toBe(50);
	});

	it('reads cgroup CPU usage in seconds', () => {
		expect(parseCgroupCpuUsageSeconds('usage_usec 2500000\nuser_usec 2000000\n')).toBeCloseTo(2.5, 12);
		expect(parseCgroupCpuUsageSeconds('user_usec 1\n')).toBeNull();
	});

	it('sums file bytes under a directory', async () => {
		const root = await tempDir();
		await mkdir(path.join(root, 'documents'));
		await writeFile(path.join(root, 'documents', 'a.bin'), Buffer.alloc(10));
		await writeFile(path.join(root, 'railway-usage.json'), Buffer.alloc(4));

		expect(await directorySizeBytes(root)).toBe(14);
	});
});

describe('RailwayBudgetGuard', () => {
	it('does nothing outside Railway', async () => {
		const guard = new RailwayBudgetGuard({
			railway: false,
			ledgerPath: null
		});

		await expect(guard.boot()).resolves.toEqual({ exceeded: false, totalUsd: 0 });
	});

	it('refuses to start on Railway when the usage volume is missing', async () => {
		const messages: string[] = [];
		const guard = new RailwayBudgetGuard({
			railway: true,
			ledgerPath: null,
			log: (message) => messages.push(message)
		});

		const boot = await guard.boot();

		expect(boot.exceeded).toBe(true);
		expect(messages[0]).toContain('without a volume');
	});

	it('stops once estimated spend reaches the hard limit and stays stopped after a restart', async () => {
		const root = await tempDir();
		const ledgerPath = path.join(root, 'railway-usage.json');
		const script = [
			sample({ atMs: 0, memoryBytes: 100_000_000 }),
			sample({ atMs: 1_000, cpuSecondsTotal: 1, memoryBytes: 100_000_000 })
		];
		let cursor = 0;
		const logs: string[] = [];
		let exceeded = 0;

		const guard = new RailwayBudgetGuard({
			railway: true,
			ledgerPath,
			limitUsd: 0.000001,
			now: () => script[Math.min(cursor, script.length - 1)].atMs,
			sample: async () => {
				const current = script[Math.min(cursor, script.length - 1)];
				cursor += 1;
				return current;
			},
			onExceeded: () => {
				exceeded += 1;
			},
			log: (message) => logs.push(message)
		});

		const firstBoot = await guard.boot();
		expect(firstBoot.exceeded).toBe(false);
		await guard.check();

		expect(exceeded).toBe(1);
		expect(logs.some((message) => message.includes('hard limit reached'))).toBe(true);
		const persisted = JSON.parse(await readFile(ledgerPath, 'utf8')) as { buckets: { usd: number }[] };
		expect(persisted.buckets.reduce((sum, bucket) => sum + bucket.usd, 0)).toBeGreaterThan(0.000001);

		const restarted = new RailwayBudgetGuard({
			railway: true,
			ledgerPath,
			limitUsd: 0.000001,
			now: () => 2_000,
			sample: async () => sample({ atMs: 2_000 }),
			log: () => {}
		});

		await expect(restarted.boot()).resolves.toMatchObject({ exceeded: true });
	});

	it('refuses to start when the ledger cannot be parsed', async () => {
		const root = await tempDir();
		const ledgerPath = path.join(root, 'railway-usage.json');
		await writeFile(ledgerPath, '{not json');

		const guard = new RailwayBudgetGuard({
			railway: true,
			ledgerPath,
			log: () => {}
		});

		await expect(guard.boot()).resolves.toMatchObject({ exceeded: true });
		expect(await readFile(ledgerPath, 'utf8')).toBe('{not json');
	});
});
