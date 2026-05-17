import { Random } from 'fast-check';
import { xorshift128plus } from 'pure-rand/generator/xorshift128plus';

export type QueuedMessage = {
	deliverAt: number;
	payload: Uint8Array;
	to: string;
	from: string;
};

export type DeliveryOptions = {
	baseDelayMs?: number;
	jitterMs?: number;
};

export type DeferredMessageQueueConfig = {
	baseDelayMs: number;
	jitterMs: number;
	dropRate?: number;
	now?: () => number;
	random?: () => number;
};

export class DeferredMessageQueue {
	private pending: QueuedMessage[] = [];
	private config: DeferredMessageQueueConfig;

	constructor(config: Partial<DeferredMessageQueueConfig> = {}) {
		this.config = {
			baseDelayMs: config.baseDelayMs ?? 0,
			jitterMs: config.jitterMs ?? 0,
			dropRate: config.dropRate ?? 0,
			now: config.now ?? (() => Date.now()),
			random: config.random ?? Math.random
		};
	}

	configure(config: Partial<DeferredMessageQueueConfig>): void {
		this.config = { ...this.config, ...config };
	}

	enqueue(to: string, from: string, payload: Uint8Array, options: DeliveryOptions = {}): void {
		if (this.config.dropRate && this.config.dropRate > 0 && this.config.random!() < this.config.dropRate!) {
			return;
		}

		const baseDelay = options.baseDelayMs ?? this.config.baseDelayMs;
		const jitterMax = options.jitterMs ?? this.config.jitterMs;
		const jitter = jitterMax > 0 ? Math.floor(this.config.random!() * (jitterMax + 1)) : 0;
		const deliverAt = this.config.now!() + baseDelay + jitter;

		this.pending.push({ deliverAt, payload, to, from });
	}

	reorderPending(): void {
		for (let i = this.pending.length - 1; i > 0; i--) {
			const j = Math.floor(this.config.random!() * (i + 1));
			[this.pending[i], this.pending[j]] = [this.pending[j]!, this.pending[i]!];
		}
	}

	shufflePendingWithSeed(seed: number): void {
		const rng = new Random(xorshift128plus(seed));
		for (let i = this.pending.length - 1; i > 0; i--) {
			const j = rng.nextInt(0, i);
			[this.pending[i], this.pending[j]] = [this.pending[j]!, this.pending[i]!];
		}
	}

	flush(now?: number): QueuedMessage[] {
		const currentTime = now ?? this.config.now!();
		const due: QueuedMessage[] = [];
		const remaining: QueuedMessage[] = [];

		for (const message of this.pending) {
			if (message.deliverAt <= currentTime) {
				due.push(message);
			} else {
				remaining.push(message);
			}
		}

		this.pending = remaining;
		return due;
	}

	flushAll(): QueuedMessage[] {
		const due = this.pending;
		this.pending = [];
		return due;
	}

	get pendingCount(): number {
		return this.pending.length;
	}

	get maxDeliverAt(): number {
		if (this.pending.length === 0) {
			return 0;
		}
		return Math.max(...this.pending.map(m => m.deliverAt));
	}
}
