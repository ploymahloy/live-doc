import { mkdir, readFile, rename, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Published Railway usage rates: https://railway.com/pricing
 * Per-second compute rates are what billing actually uses.
 */
export const RAILWAY_MEMORY_USD_PER_GB_SECOND = 0.00000386;
export const RAILWAY_CPU_USD_PER_VCPU_SECOND = 0.00000772;
export const RAILWAY_VOLUME_USD_PER_GB_SECOND = 0.00000006;
export const RAILWAY_EGRESS_USD_PER_GB = 0.05;

const BYTES_PER_GB = 1_000_000_000;

/**
 * Free-plan credit is $1 per billing cycle. Railway will not accept a
 * workspace hard limit below $10, so this process enforces a lower one.
 * Stop at $0.90. The remaining $0.10 covers meter lag versus Railway.
 * Billing cycles are at most 31 days, so the ledger uses that window:
 * any 31-day period of estimated spend stays at or under the cap.
 */
export const RAILWAY_FREE_PLAN_HARD_LIMIT_USD = 0.9;
export const USAGE_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
const SAMPLE_INTERVAL_MS = 30_000;

export type UsageBucket = {
	day: string;
	usd: number;
};

export type UsageLedger = {
	version: 1;
	updatedAt: string | null;
	volumeBytes: number;
	buckets: UsageBucket[];
};

export type ResourceSample = {
	atMs: number;
	cpuSecondsTotal: number;
	memoryBytes: number;
	egressBytesTotal: number;
	volumeBytes: number;
};

export type UsageUsdInput = {
	cpuSeconds: number;
	memoryByteSeconds: number;
	volumeByteSeconds: number;
	egressBytes: number;
};

export function freshLedger(): UsageLedger {
	return {
		version: 1,
		updatedAt: null,
		volumeBytes: 0,
		buckets: []
	};
}

export function isRailwayRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
	return Boolean(env.RAILWAY_ENVIRONMENT_ID || env.RAILWAY_PROJECT_ID);
}

export function railwayLedgerPath(env: NodeJS.ProcessEnv = process.env): string | null {
	const mount = env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
	if (!mount) {
		return null;
	}
	return path.join(mount, 'railway-usage.json');
}

export function estimatedUsageUsd(input: UsageUsdInput): number {
	return (
		input.cpuSeconds * RAILWAY_CPU_USD_PER_VCPU_SECOND +
		(input.memoryByteSeconds / BYTES_PER_GB) * RAILWAY_MEMORY_USD_PER_GB_SECOND +
		(input.volumeByteSeconds / BYTES_PER_GB) * RAILWAY_VOLUME_USD_PER_GB_SECOND +
		(input.egressBytes / BYTES_PER_GB) * RAILWAY_EGRESS_USD_PER_GB
	);
}

export function usageSince(previous: ResourceSample, next: ResourceSample): number {
	const elapsedSeconds = Math.max(0, (next.atMs - previous.atMs) / 1000);
	return estimatedUsageUsd({
		cpuSeconds: Math.max(0, next.cpuSecondsTotal - previous.cpuSecondsTotal),
		memoryByteSeconds: Math.max(previous.memoryBytes, next.memoryBytes) * elapsedSeconds,
		volumeByteSeconds: Math.max(previous.volumeBytes, next.volumeBytes) * elapsedSeconds,
		egressBytes: Math.max(0, next.egressBytesTotal - previous.egressBytesTotal)
	});
}

export function windowStartDay(nowMs: number): string {
	return new Date(nowMs - USAGE_WINDOW_MS).toISOString().slice(0, 10);
}

export function pruneLedger(ledger: UsageLedger, nowMs: number): void {
	const start = windowStartDay(nowMs);
	ledger.buckets = ledger.buckets.filter((bucket) => bucket.day >= start);
}

export function windowTotalUsd(ledger: UsageLedger, nowMs: number): number {
	pruneLedger(ledger, nowMs);
	return ledger.buckets.reduce((sum, bucket) => sum + bucket.usd, 0);
}

export function addUsage(
	ledger: UsageLedger,
	nowMs: number,
	usd: number,
	volumeBytes?: number
): number {
	if (usd > 0) {
		const day = new Date(nowMs).toISOString().slice(0, 10);
		const existing = ledger.buckets.find((bucket) => bucket.day === day);
		if (existing) {
			existing.usd += usd;
		} else {
			ledger.buckets.push({ day, usd });
		}
	}
	if (volumeBytes != null) {
		ledger.volumeBytes = volumeBytes;
	}
	ledger.updatedAt = new Date(nowMs).toISOString();
	return windowTotalUsd(ledger, nowMs);
}

function startOfUtcDay(ms: number): number {
	return Date.parse(`${new Date(ms).toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/** Volume keeps billing while the container sleeps. Attribute that gap per UTC day. */
export function accrueOfflineVolume(ledger: UsageLedger, nowMs: number): number {
	const startMs = ledger.updatedAt == null ? Number.NaN : Date.parse(ledger.updatedAt);
	if (ledger.updatedAt == null || Number.isNaN(startMs) || nowMs <= startMs || ledger.volumeBytes <= 0) {
		ledger.updatedAt = new Date(nowMs).toISOString();
		return windowTotalUsd(ledger, nowMs);
	}

	let cursor = startMs;
	while (cursor < nowMs) {
		const nextMidnight = startOfUtcDay(cursor) + 24 * 60 * 60 * 1000;
		const segmentEnd = Math.min(nowMs, nextMidnight);
		if (segmentEnd <= cursor) {
			break;
		}
		const usd = estimatedUsageUsd({
			cpuSeconds: 0,
			memoryByteSeconds: 0,
			volumeByteSeconds: ledger.volumeBytes * ((segmentEnd - cursor) / 1000),
			egressBytes: 0
		});
		addUsage(ledger, cursor, usd);
		cursor = segmentEnd;
	}
	ledger.updatedAt = new Date(nowMs).toISOString();
	return windowTotalUsd(ledger, nowMs);
}

export function parseProcNetDevTransmitBytes(text: string): number {
	let total = 0;
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed.includes(':')) {
			continue;
		}
		const colon = trimmed.indexOf(':');
		const iface = trimmed.slice(0, colon).trim();
		if (iface === 'lo') {
			continue;
		}
		const fields = trimmed
			.slice(colon + 1)
			.trim()
			.split(/\s+/);
		const txBytes = Number(fields[8]);
		if (Number.isFinite(txBytes) && txBytes > 0) {
			total += txBytes;
		}
	}
	return total;
}

export function parseCgroupCpuUsageSeconds(text: string): number | null {
	const match = text.match(/^usage_usec\s+(\d+)/m);
	if (!match) {
		return null;
	}
	return Number(match[1]) / 1_000_000;
}

function isUsageLedger(value: unknown): value is UsageLedger {
	if (value == null || typeof value !== 'object') {
		return false;
	}
	const record = value as Record<string, unknown>;
	if (record.version !== 1) {
		return false;
	}
	if (record.updatedAt != null) {
		if (typeof record.updatedAt !== 'string' || Number.isNaN(Date.parse(record.updatedAt))) {
			return false;
		}
	}
	if (typeof record.volumeBytes !== 'number' || !Number.isFinite(record.volumeBytes) || record.volumeBytes < 0) {
		return false;
	}
	if (!Array.isArray(record.buckets)) {
		return false;
	}
	return record.buckets.every((bucket: unknown) => {
		if (bucket == null || typeof bucket !== 'object') {
			return false;
		}
		const entry = bucket as Record<string, unknown>;
		return (
			typeof entry.day === 'string' &&
			/^\d{4}-\d{2}-\d{2}$/.test(entry.day) &&
			typeof entry.usd === 'number' &&
			Number.isFinite(entry.usd) &&
			entry.usd >= 0
		);
	});
}

async function loadLedger(ledgerPath: string): Promise<UsageLedger | 'corrupt'> {
	try {
		const raw = await readFile(ledgerPath, 'utf8');
		const parsed: unknown = JSON.parse(raw);
		return isUsageLedger(parsed) ? parsed : 'corrupt';
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === 'ENOENT') {
			return freshLedger();
		}
		if (error instanceof SyntaxError) {
			return 'corrupt';
		}
		throw error;
	}
}

async function saveLedger(ledgerPath: string, ledger: UsageLedger): Promise<void> {
	await mkdir(path.dirname(ledgerPath), { recursive: true });
	const tmp = `${ledgerPath}.${process.pid}.tmp`;
	await writeFile(tmp, JSON.stringify(ledger));
	await rename(tmp, ledgerPath);
}

export async function directorySizeBytes(root: string): Promise<number> {
	let total = 0;
	const stack = [root];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			break;
		}
		let entries;
		try {
			entries = await readdir(current, { withFileTypes: true });
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
				continue;
			}
			throw error;
		}
		for (const entry of entries) {
			if (entry.isSymbolicLink()) {
				continue;
			}
			const fullPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(fullPath);
				continue;
			}
			if (!entry.isFile()) {
				continue;
			}
			try {
				const info = await stat(fullPath);
				total += info.size;
			} catch (error) {
				const err = error as NodeJS.ErrnoException;
				if (err.code !== 'ENOENT') {
					throw error;
				}
			}
		}
	}
	return total;
}

async function readFirstFile(paths: string[]): Promise<string | null> {
	for (const filePath of paths) {
		try {
			return await readFile(filePath, 'utf8');
		} catch {
			continue;
		}
	}
	return null;
}

export async function readResourceSample(volumeRoot: string, atMs = Date.now()): Promise<ResourceSample> {
	const cpuText = await readFirstFile(['/sys/fs/cgroup/cpu.stat']);
	const parsedCpu = cpuText == null ? null : parseCgroupCpuUsageSeconds(cpuText);
	const processCpu = process.cpuUsage();
	const cpuSecondsTotal =
		parsedCpu ?? (processCpu.user + processCpu.system) / 1_000_000;

	const memoryText = await readFirstFile([
		'/sys/fs/cgroup/memory.current',
		'/sys/fs/cgroup/memory/memory.usage_in_bytes'
	]);
	const parsedMemory = memoryText == null ? Number.NaN : Number(memoryText.trim());
	const memoryBytes = Number.isFinite(parsedMemory) && parsedMemory > 0
		? parsedMemory
		: process.memoryUsage().rss;

	const netText = await readFirstFile(['/proc/net/dev']);
	const egressBytesTotal = netText == null ? 0 : parseProcNetDevTransmitBytes(netText);

	return {
		atMs,
		cpuSecondsTotal,
		memoryBytes,
		egressBytesTotal,
		volumeBytes: await directorySizeBytes(volumeRoot)
	};
}

export type BudgetBoot = {
	exceeded: boolean;
	totalUsd: number;
};

export type RailwayBudgetGuardOptions = {
	railway: boolean;
	ledgerPath: string | null;
	limitUsd?: number;
	now?: () => number;
	sample?: () => Promise<ResourceSample>;
	sampleIntervalMs?: number;
	onExceeded?: (totalUsd: number) => void | Promise<void>;
	log?: (message: string) => void;
};

export class RailwayBudgetGuard {
	private readonly railway: boolean;
	private readonly ledgerPath: string | null;
	private readonly limitUsd: number;
	private readonly now: () => number;
	private readonly sample: () => Promise<ResourceSample>;
	private readonly sampleIntervalMs: number;
	private readonly onExceeded: (totalUsd: number) => void | Promise<void>;
	private readonly log: (message: string) => void;
	private ledger: UsageLedger = freshLedger();
	private previous: ResourceSample | null = null;
	private bootResult: BudgetBoot | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private ticking = false;
	private stopped = false;
	private lastTotal = 0;
	private readonly loggedSteps = new Set<number>();

	constructor(options: RailwayBudgetGuardOptions) {
		this.railway = options.railway;
		this.ledgerPath = options.ledgerPath;
		this.limitUsd = options.limitUsd ?? RAILWAY_FREE_PLAN_HARD_LIMIT_USD;
		this.now = options.now ?? (() => Date.now());
		this.sample = options.sample ?? (async () => readResourceSample(path.dirname(options.ledgerPath ?? '.')));
		this.sampleIntervalMs = options.sampleIntervalMs ?? SAMPLE_INTERVAL_MS;
		this.onExceeded = options.onExceeded ?? (() => {});
		this.log = options.log ?? ((message) => console.log(message));
	}

	async boot(): Promise<BudgetBoot> {
		if (this.bootResult) {
			return this.bootResult;
		}
		if (!this.railway) {
			this.bootResult = { exceeded: false, totalUsd: 0 };
			return this.bootResult;
		}
		if (!this.ledgerPath) {
			this.log(
				'[live-doc] Refusing to start on Railway without a volume. Mount a volume at /data so the $1 free-plan hard limit survives sleep and restarts, then redeploy.'
			);
			this.bootResult = { exceeded: true, totalUsd: Number.POSITIVE_INFINITY };
			return this.bootResult;
		}

		try {
			const loaded = await loadLedger(this.ledgerPath);
			if (loaded === 'corrupt') {
				this.log(
					'[live-doc] Refusing to start because the Railway usage ledger is unreadable. Delete the volume file railway-usage.json only if you intend to reset the $1 cap.'
				);
				this.bootResult = { exceeded: true, totalUsd: Number.POSITIVE_INFINITY };
				return this.bootResult;
			}
			this.ledger = loaded;
			const sample = await this.takeSample();
			this.ledger.volumeBytes = Math.max(this.ledger.volumeBytes, sample.volumeBytes);
			const total = accrueOfflineVolume(this.ledger, sample.atMs);
			this.ledger.volumeBytes = sample.volumeBytes;
			this.ledger.updatedAt = new Date(sample.atMs).toISOString();
			await saveLedger(this.ledgerPath, this.ledger);
			this.previous = sample;
			this.lastTotal = total;
			this.bootResult = { exceeded: total >= this.limitUsd, totalUsd: total };
			if (this.bootResult.exceeded) {
				this.logExceeded(total);
			} else {
				this.log(
					`[live-doc] Railway free-plan estimate for the last 31 days is $${total.toFixed(4)}. This process stops at $${this.limitUsd.toFixed(2)} so usage stays under the $1 credit.`
				);
			}
			return this.bootResult;
		} catch (error) {
			this.log(
				`[live-doc] Refusing to start because the Railway usage ledger could not be read (${error instanceof Error ? error.message : String(error)}).`
			);
			this.bootResult = { exceeded: true, totalUsd: Number.POSITIVE_INFINITY };
			return this.bootResult;
		}
	}

	start(): void {
		if (!this.railway || this.bootResult?.exceeded || this.timer) {
			return;
		}
		this.timer = setInterval(() => {
			void this.check();
		}, this.sampleIntervalMs);
		this.timer.unref?.();
	}

	async check(): Promise<void> {
		await this.tick();
	}

	async stop(): Promise<void> {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		if (this.ticking || this.stopped || !this.railway || !this.bootResult || this.bootResult.exceeded) {
			this.stopped = true;
			return;
		}
		this.stopped = true;
		try {
			await this.record(false);
		} catch (error) {
			this.log(
				`[live-doc] Failed to record final Railway usage (${error instanceof Error ? error.message : String(error)}).`
			);
		}
	}

	private async tick(): Promise<void> {
		if (this.stopped || this.ticking) {
			return;
		}
		this.ticking = true;
		try {
			await this.record(true);
		} catch (error) {
			this.stopped = true;
			if (this.timer) {
				clearInterval(this.timer);
				this.timer = null;
			}
			this.log(
				`[live-doc] Usage cap check failed; stopping so spend cannot go unmetered (${error instanceof Error ? error.message : String(error)}).`
			);
			await this.onExceeded(this.lastTotal);
		} finally {
			this.ticking = false;
		}
	}

	private async takeSample(): Promise<ResourceSample> {
		const atMs = this.now();
		const sampled = await this.sample();
		return { ...sampled, atMs };
	}

	private async record(enforce: boolean): Promise<void> {
		if (!this.ledgerPath) {
			return;
		}
		const sample = await this.takeSample();
		const usd = this.previous ? usageSince(this.previous, sample) : 0;
		this.previous = sample;
		const total = addUsage(this.ledger, sample.atMs, usd, sample.volumeBytes);
		this.lastTotal = total;
		await saveLedger(this.ledgerPath, this.ledger);
		this.logProgress(total);
		if (enforce && total >= this.limitUsd) {
			this.stopped = true;
			if (this.timer) {
				clearInterval(this.timer);
				this.timer = null;
			}
			this.logExceeded(total);
			await this.onExceeded(total);
		}
	}

	private logProgress(total: number): void {
		for (const step of [0.5, 0.75]) {
			if (total >= this.limitUsd * step && !this.loggedSteps.has(step)) {
				this.loggedSteps.add(step);
				this.log(
					`[live-doc] Railway usage estimate $${total.toFixed(4)} has passed ${Math.round(step * 100)}% of the $${this.limitUsd.toFixed(2)} cap.`
				);
			}
		}
	}

	private logExceeded(totalUsd: number): void {
		this.log(
			`[live-doc] Railway free-plan hard limit reached (estimated $${totalUsd.toFixed(4)} of $${this.limitUsd.toFixed(2)}). Stopping so this service stays under the $1 monthly credit.`
		);
	}
}

export function createRailwayBudgetGuard(
	options: Partial<RailwayBudgetGuardOptions> & { env?: NodeJS.ProcessEnv } = {}
): RailwayBudgetGuard {
	const { env = process.env, ...rest } = options;
	return new RailwayBudgetGuard({
		...rest,
		railway: rest.railway ?? isRailwayRuntime(env),
		ledgerPath: rest.ledgerPath === undefined ? railwayLedgerPath(env) : rest.ledgerPath
	});
}
