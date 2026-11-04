// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { MessageRateLimiter } from './limits';

describe('message rate limiter', () => {
	it('allows a burst up to the cap, then another after the window', () => {
		const limiter = new MessageRateLimiter(2, 1_000);

		expect(limiter.allow('socket', 0)).toBe(true);
		expect(limiter.allow('socket', 10)).toBe(true);
		expect(limiter.allow('socket', 20)).toBe(false);
		expect(limiter.allow('other', 20)).toBe(true);
		expect(limiter.allow('socket', 1_001)).toBe(true);
	});
});
